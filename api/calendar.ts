import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCalendar, saveCalendar } from '../lib/storage.js';
import { fetchICalData, extractMergedShifts, createSimplifiedICal, formatMinutes } from '../lib/icalService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { id } = req.query;

    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID is required' });
    }

    const cal = await getCalendar(id);
    if (!cal) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    let contentToSend = cal.icalContent;

    if (cal.url) {
      const ONE_HOUR = 30 * 60 * 1000;
      if (Date.now() - new Date(cal.lastUpdated).getTime() > ONE_HOUR) {
        try {
          const rawData = await fetchICalData(cal.url);
          const shifts = extractMergedShifts(rawData, {
            summary: cal.summary,
            timezone: cal.timezone,
            maxBreakMinutes: cal.maxBreakMinutes
          });
          contentToSend = createSimplifiedICal(shifts, {
            summary: cal.summary,
            timezone: cal.timezone
          });
          cal.icalContent = contentToSend;
          cal.shiftCount = shifts.length;
          cal.totalHours = formatMinutes(shifts.reduce((acc, s) => acc + s.durationMinutes, 0));
          cal.lastUpdated = new Date().toISOString();
          await saveCalendar(cal);
        } catch (err) {
          console.warn(`Failed to auto-refresh calendar ${id}, serving cached version:`, err);
        }
      }
    }

    const filename = `${cal.summary.toLowerCase().replace(/[^a-z0-9]/gi, '_') || 'arbetsschema'}.ics`;

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.send(contentToSend);
  } catch (error: any) {
    console.error('Calendar Fetch Error:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}