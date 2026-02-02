import axios from 'axios';
import ICAL from 'ical.js';
import { DateTime } from 'luxon';
import crypto from 'crypto';

export async function fetchICalData(url: string) {
  try {
    const httpsUrl = url.replace(/^webcals:\/\//, 'https://');
    const response = await axios.get(httpsUrl, {
      headers: { 'User-Agent': 'Calendar-Converter' },
      timeout: 20000 // Shortened for serverless execution limits
    });
    return response.data;
  } catch (error: any) {
    throw new Error(`Could not fetch iCal data: ${error.message}`);
  }
}

export function generateUniqueId(url: string, summary: string = 'Jobb') {
  const hash = crypto.createHash('sha256');
  hash.update(url + summary);
  return hash.digest('hex').slice(0, 16);
}

function getWorkdayAnchor(dateTime: DateTime, timezone: string) {
  const dt = dateTime.setZone(timezone);
  if (dt.hour >= 6) {
    return dt.startOf('day');
  } else {
    return dt.minus({ days: 1 }).startOf('day');
  }
}

function splitEventByWorkdays(startTime: DateTime, endTime: DateTime, timezone: string) {
  const segments = [];
  const currentStart = startTime.setZone(timezone);
  const finalEnd = endTime.setZone(timezone);
  const workdayAnchor = getWorkdayAnchor(currentStart, timezone);

  segments.push({
    start: currentStart,
    end: finalEnd,
    workdayDate: workdayAnchor.toISODate()
  });

  return segments;
}

function shouldFilterEvent(event: any) {
  const summary = (event.summary || '').toLowerCase();
  const description = (event.description || '').toLowerCase();
  
  const filterKeywords = [
    'work reduction', 'holiday', 'loa', 'care of child', 'sick', 'day off'
  ];
  
  return filterKeywords.some(keyword => 
    summary.includes(keyword) || description.includes(keyword)
  );
}

export function processICalData(icalData: string, summary: string = 'Jobb', timezone: string = 'Europe/Stockholm') {
  try {
    const jcalData = ICAL.parse(icalData);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents('vevent');
    
    // Map<WorkdayISOString, { earliestStart, latestEnd }>
    const workdayMap = new Map<string, { earliestStart: DateTime, latestEnd: DateTime }>();
    
    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);
      
      if (shouldFilterEvent(event)) continue;
      
      let startTime, endTime;
      try {
        startTime = DateTime.fromJSDate(event.startDate.toJSDate());
        endTime = DateTime.fromJSDate(event.endDate.toJSDate());
      } catch (error) {
        continue;
      }
      
      const segments = splitEventByWorkdays(startTime, endTime, timezone);
      
      for (const segment of segments) {
        if (!segment.workdayDate) continue;

        const workdayDate = segment.workdayDate;
        
        if (!workdayMap.has(workdayDate)) {
          workdayMap.set(workdayDate, {
            earliestStart: segment.start,
            latestEnd: segment.end
          });
        } else {
          const existing = workdayMap.get(workdayDate)!;
          existing.earliestStart = DateTime.min(existing.earliestStart, segment.start);
          existing.latestEnd = DateTime.max(existing.latestEnd, segment.end);
        }
      }
    }
    
    return createSimplifiedICal(workdayMap, summary, timezone);
    
  } catch (error: any) {
    throw new Error(`Could not process iCal data: ${error.message}`);
  }
}

function createSimplifiedICal(workdayMap: Map<string, { earliestStart: DateTime, latestEnd: DateTime }>, summary: string, timezone: string) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//iCal Converter//Calendar//SV',
    'CALSCALE:GREGORIAN'
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
  
  for (const [workdayDate, times] of workdayMap) {
    const randomHex = crypto.randomBytes(4).toString('hex');
    const uid = `${workdayDate}-${randomHex}`;
    
    const startStr = times.earliestStart.toFormat("yyyyMMdd'T'HHmmss");
    const endStr = times.latestEnd.toFormat("yyyyMMdd'T'HHmmss");
    const stamp = DateTime.now().toUTC().toFormat("yyyyMMdd'T'HHmmss'Z'");
    
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTART;TZID=${timezone}:${startStr}`,
      `DTEND;TZID=${timezone}:${endStr}`,
      `SUMMARY:${summary}`,
      `DTSTAMP:${stamp}`,
      'END:VEVENT'
    );
  }
  
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export async function processICalUrl(url: string, summary: string, timezone: string) {
  const icalData = await fetchICalData(url);
  const processedICal = processICalData(icalData, summary, timezone);
  const uniqueId = generateUniqueId(url, summary);
  
  return { uniqueId, icalContent: processedICal };
}
