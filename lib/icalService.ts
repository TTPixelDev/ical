import axios from 'axios';
import ICAL from 'ical.js';
import { DateTime } from 'luxon';
import crypto from 'crypto';

export interface ProcessOptions {
  summary?: string;
  timezone?: string;
  maxBreakMinutes?: number; // Max gap between micro-tasks to still consider same shift (default 120 mins)
  filterKeywords?: string[];
  includeDetailsInDescription?: boolean;
}

export interface ShiftActivity {
  name: string;
  start: DateTime;
  end: DateTime;
  durationMinutes: number;
  location?: string;
}

export interface MergedShift {
  id: string;
  start: DateTime;
  end: DateTime;
  date: string; // Start date YYYY-MM-DD
  endDate: string; // End date YYYY-MM-DD
  formattedStart: string; // HH:mm
  formattedEnd: string; // HH:mm
  durationMinutes: number; // Elapsed shift time (start to end)
  durationHoursFormatted: string; // e.g. "9h 30m"
  crossesMidnight: boolean;
  activities: ShiftActivity[];
  totalActivitiesCount: number;
}

const DEFAULT_FILTER_KEYWORDS = [
  'holiday',
  'day off',
  'semester',
  'ledig',
  'care of child',
  'vab',
  'sick',
  'sjuk',
  'work reduction',
  'permittering'
];

export async function fetchICalData(url: string): Promise<string> {
  try {
    const cleanUrl = url
      .trim()
      .replace(/^webcals?:\/\//i, 'https://');

    const response = await axios.get(cleanUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; CalendarConverter/2.0)',
        'Accept': 'text/calendar, application/calendar+xml, text/plain, */*'
      },
      timeout: 25000,
      responseType: 'text'
    });

    return response.data;
  } catch (error: any) {
    throw new Error(`Kunde inte hämta iCal-data från URL: ${error.message}`);
  }
}

export function generateUniqueId(seed: string, summary: string = 'Jobb'): string {
  const hash = crypto.createHash('sha256');
  hash.update((seed || 'default') + summary);
  return hash.digest('hex').slice(0, 16);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

export function shouldFilterEvent(summary: string, description: string = '', filterKeywords: string[]): boolean {
  const lowerSummary = (summary || '').toLowerCase();
  const lowerDesc = (description || '').toLowerCase();

  return filterKeywords.some(keyword => {
    const kw = keyword.trim().toLowerCase();
    return kw && (lowerSummary.includes(kw) || lowerDesc.includes(kw));
  });
}

/**
 * Extracts and consolidates micro-events into true continuous shifts (arbetspass).
 * Handles night shifts crossing midnight (e.g. 22:15 -> 07:15) seamlessly.
 */
export function extractMergedShifts(icalData: string, options: ProcessOptions = {}): MergedShift[] {
  const timezone = options.timezone || 'Europe/Stockholm';
  const maxBreakMinutes = options.maxBreakMinutes ?? 120; // 2 hours threshold
  const filterKeywords = options.filterKeywords || DEFAULT_FILTER_KEYWORDS;

  const jcalData = ICAL.parse(icalData);
  const comp = new ICAL.Component(jcalData);
  const vevents = comp.getAllSubcomponents('vevent');

  const rawItems: {
    start: DateTime;
    end: DateTime;
    summary: string;
    description: string;
    location: string;
  }[] = [];

  for (const vevent of vevents) {
    const event = new ICAL.Event(vevent);
    const summary = event.summary || '';
    const description = event.description || '';
    const location = event.location || '';

    if (shouldFilterEvent(summary, description, filterKeywords)) {
      continue;
    }

    let start: DateTime;
    let end: DateTime;

    try {
      start = DateTime.fromJSDate(event.startDate.toJSDate()).setZone(timezone);
      end = DateTime.fromJSDate(event.endDate.toJSDate()).setZone(timezone);
    } catch {
      continue;
    }

    // Ignore 0 or negative duration entries
    if (end <= start) {
      continue;
    }

    rawItems.push({
      start,
      end,
      summary,
      description,
      location
    });
  }

  // Sort chronologically
  rawItems.sort((a, b) => a.start.toMillis() - b.start.toMillis());

  const mergedShifts: MergedShift[] = [];
  let currentShift: MergedShift | null = null;

  for (const item of rawItems) {
    const itemDuration = Math.round(item.end.diff(item.start, 'minutes').minutes);
    const activity: ShiftActivity = {
      name: item.summary,
      start: item.start,
      end: item.end,
      durationMinutes: itemDuration,
      location: item.location
    };

    if (!currentShift) {
      const durationMin = Math.round(item.end.diff(item.start, 'minutes').minutes);
      currentShift = {
        id: `${item.start.toISODate()}-${item.start.toFormat('HHmm')}`,
        start: item.start,
        end: item.end,
        date: item.start.toISODate()!,
        endDate: item.end.toISODate()!,
        formattedStart: item.start.toFormat('HH:mm'),
        formattedEnd: item.end.toFormat('HH:mm'),
        durationMinutes: durationMin,
        durationHoursFormatted: formatMinutes(durationMin),
        crossesMidnight: item.start.toISODate() !== item.end.toISODate(),
        activities: [activity],
        totalActivitiesCount: 1
      };
      continue;
    }

    // Measure time gap between the end of current shift and start of next activity
    const gapMinutes = item.start.diff(currentShift.end, 'minutes').minutes;

    // If the next activity starts during or closely after the current shift (<= maxBreakMinutes),
    // they belong to the SAME shift!
    if (gapMinutes <= maxBreakMinutes && gapMinutes >= -5) {
      // Extend end time if needed
      if (item.end > currentShift.end) {
        currentShift.end = item.end;
        currentShift.endDate = item.end.toISODate()!;
        currentShift.formattedEnd = item.end.toFormat('HH:mm');
        currentShift.crossesMidnight = currentShift.start.toISODate() !== item.end.toISODate();
      }
      currentShift.activities.push(activity);
      currentShift.totalActivitiesCount++;
      currentShift.durationMinutes = Math.round(currentShift.end.diff(currentShift.start, 'minutes').minutes);
      currentShift.durationHoursFormatted = formatMinutes(currentShift.durationMinutes);
    } else {
      // Significant rest period (e.g. 10-16 hours) -> Start a new shift!
      mergedShifts.push(currentShift);
      const durationMin = Math.round(item.end.diff(item.start, 'minutes').minutes);
      currentShift = {
        id: `${item.start.toISODate()}-${item.start.toFormat('HHmm')}`,
        start: item.start,
        end: item.end,
        date: item.start.toISODate()!,
        endDate: item.end.toISODate()!,
        formattedStart: item.start.toFormat('HH:mm'),
        formattedEnd: item.end.toFormat('HH:mm'),
        durationMinutes: durationMin,
        durationHoursFormatted: formatMinutes(durationMin),
        crossesMidnight: item.start.toISODate() !== item.end.toISODate(),
        activities: [activity],
        totalActivitiesCount: 1
      };
    }
  }

  if (currentShift) {
    mergedShifts.push(currentShift);
  }

  return mergedShifts;
}

/**
 * Builds a clean iCalendar (RFC 5545) VCALENDAR string with merged shifts.
 */
export function createSimplifiedICal(shifts: MergedShift[], options: ProcessOptions = {}): string {
  const summary = options.summary || 'Jobb';
  const timezone = options.timezone || 'Europe/Stockholm';
  const includeDetails = options.includeDetailsInDescription ?? true;

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//iCal Workday Converter//Shift Calendar//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${summary}`
  ];

  if (timezone === 'Europe/Stockholm') {
    lines.push(
      'BEGIN:VTIMEZONE',
      'TZID:Europe/Stockholm',
      'BEGIN:DAYLIGHT',
      'TZOFFSETFROM:+0100',
      'TZOFFSETTO:+0200',
      'TZNAME:CEST',
      'DTSTART:19700329T020000',
      'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
      'END:DAYLIGHT',
      'BEGIN:STANDARD',
      'TZOFFSETFROM:+0200',
      'TZOFFSETTO:+0100',
      'TZNAME:CET',
      'DTSTART:19701025T030000',
      'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
      'END:STANDARD',
      'END:VTIMEZONE'
    );
  }

  const nowUTC = DateTime.now().toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");

  for (const shift of shifts) {
    const startStr = shift.start.toFormat("yyyyMMdd'T'HHmmss");
    const endStr = shift.end.toFormat("yyyyMMdd'T'HHmmss");
    const uid = `${shift.date}-${shift.start.toFormat('HHmm')}-${crypto.randomBytes(4).toString('hex')}@workday-converter`;

    // Group activities by name for clean summary in description
    let descriptionText = `Arbetspass: ${shift.formattedStart} - ${shift.formattedEnd} (${shift.durationHoursFormatted})`;
    if (shift.crossesMidnight) {
      descriptionText += ` (slutar ${shift.endDate})`;
    }

    if (includeDetails && shift.activities.length > 0) {
      const activityTotals = new Map<string, number>();
      for (const act of shift.activities) {
        const cleanName = act.name.trim();
        activityTotals.set(cleanName, (activityTotals.get(cleanName) || 0) + act.durationMinutes);
      }

      descriptionText += '\\n\\nAktiviteter i passet:';
      for (const [name, minutes] of activityTotals.entries()) {
        descriptionText += `\\n• ${name}: ${formatMinutes(minutes)}`;
      }
    }

    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;TZID=${timezone}:${startStr}`,
      `DTEND;TZID=${timezone}:${endStr}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${descriptionText}`,
      `DTSTAMP:${nowUTC}`,
      'STATUS:CONFIRMED',
      'TRANSP:OPAQUE',
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export function processICalData(icalData: string, summary: string = 'Jobb', timezone: string = 'Europe/Stockholm', options: Partial<ProcessOptions> = {}) {
  const mergedOptions: ProcessOptions = {
    summary,
    timezone,
    ...options
  };

  const shifts = extractMergedShifts(icalData, mergedOptions);
  const icalContent = createSimplifiedICal(shifts, mergedOptions);

  return {
    icalContent,
    shifts
  };
}

export async function processICalUrl(url: string, summary: string = 'Jobb', timezone: string = 'Europe/Stockholm', options: Partial<ProcessOptions> = {}) {
  const rawData = await fetchICalData(url);
  const result = processICalData(rawData, summary, timezone, options);
  const uniqueId = generateUniqueId(url, summary);

  return {
    uniqueId,
    ...result
  };
}
