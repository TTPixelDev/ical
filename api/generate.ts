import type { VercelRequest, VercelResponse } from '@vercel/node';
import { extractMergedShifts, createSimplifiedICal, generateUniqueId, fetchICalData, formatMinutes } from '../lib/icalService.js';
import { saveCalendar } from '../lib/storage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, rawIcalContent, summary = 'Jobb', timezone = 'Europe/Stockholm', maxBreakMinutes = 120 } = req.body;

    let icalString = rawIcalContent;
    if (!icalString && url) {
      icalString = await fetchICalData(url);
    }

    if (!icalString) {
      return res.status(400).json({ error: 'URL or rawIcalContent is required' });
    }

    const processOpts = {
      summary,
      timezone,
      maxBreakMinutes: Number(maxBreakMinutes) || 120
    };

    const shifts = extractMergedShifts(icalString, processOpts);
    const icalContent = createSimplifiedICal(shifts, processOpts);
    const uniqueId = generateUniqueId(url || icalString.slice(0, 100), summary);

    const totalMinutes = shifts.reduce((acc, s) => acc + s.durationMinutes, 0);

    await saveCalendar({
      uniqueId,
      url: url || undefined,
      summary,
      timezone,
      maxBreakMinutes: processOpts.maxBreakMinutes,
      icalContent,
      shiftCount: shifts.length,
      totalHours: formatMinutes(totalMinutes),
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });

    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    const apiUrl = `${protocol}://${host}/api/calendar?id=${uniqueId}`;
    const cleanHost = (host as string || '').replace(/^https?:\/\//, '');
    const webcalUrl = `webcal://${cleanHost}/api/calendar?id=${uniqueId}`;
    const googleLink = `https://www.google.com/calendar/render?cid=${encodeURIComponent(apiUrl)}`;
    const downloadUrl = `${apiUrl}&download=1`;

    return res.status(200).json({
      apiUrl,
      webcalUrl,
      googleLink,
      downloadUrl,
      uniqueId,
      lastUpdated: new Date().toISOString(),
      shiftCount: shifts.length,
      totalHours: formatMinutes(totalMinutes)
    });
  } catch (error: any) {
    console.error('Generate Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}