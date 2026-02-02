import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../lib/mongoose.js';
import ICalUrl from '../models/ICalUrl.js';
import { fetchICalData, processICalData } from '../lib/icalService.js';

// To ensure data is fresh when Google/Apple fetches it, we try to update on read.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();
    const { id } = req.query;
    
    if (!id || typeof id !== 'string') {
      return res.status(400).json({ error: 'ID is required' });
    }
    
    const icalDoc = await ICalUrl.findOne({ uniqueId: id });
    
    if (!icalDoc) {
      return res.status(404).json({ error: 'Calendar not found' });
    }

    let contentToSend = icalDoc.icalContent;

    // Optional: Attempt to refresh data on-the-fly if it's old (e.g., > 1 hour)
    // This removes the need for a background cron job for active calendars.
    const ONE_HOUR = 60 * 60 * 1000;
    const shouldRefresh = new Date().getTime() - new Date(icalDoc.updatedAt).getTime() > ONE_HOUR;

    if (shouldRefresh) {
      try {
         const timezone = process.env.TIMEZONE || 'Europe/Stockholm';
         const rawData = await fetchICalData(icalDoc.url);
         const processed = processICalData(rawData, icalDoc.summary, timezone);
         
         // Update DB asynchronously (fire and forget for this request to speed up response)
         // Note: In some serverless envs, this might die if function freezes, but usually OK for small updates
         await ICalUrl.findOneAndUpdate(
           { uniqueId: id },
           { icalContent: processed, lastUpdated: new Date() },
           {}
         );
         contentToSend = processed;
      } catch (err) {
         console.warn(`Failed to auto-refresh calendar ${id}, serving cached version.`);
      }
    }

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=calendar.ics');
    res.send(contentToSend);

  } catch (error: any) {
    console.error('Calendar Fetch Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}