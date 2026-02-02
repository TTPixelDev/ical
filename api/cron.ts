import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../lib/mongoose.js';
import ICalUrl from '../models/ICalUrl.js';
import { fetchICalData, processICalData } from '../lib/icalService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 1. Security Check
  // Vercel automatically injects CRON_SECRET into the environment variables for Cron Jobs.
  // We check if the Authorization header matches this secret to secure the endpoint.
  // If CRON_SECRET is not set (e.g. local dev), we allow the request for testing purposes.
  if (process.env.CRON_SECRET) {
    const authHeader = req.headers.authorization;
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    await dbConnect();

    // 2. Fetch all calendars
    const calendars = await ICalUrl.find({});
    
    if (calendars.length === 0) {
      return res.status(200).json({ message: 'No calendars to update.' });
    }

    const timezone = process.env.TIMEZONE || 'Europe/Stockholm';
    const results = {
      total: calendars.length,
      success: 0,
      failed: 0,
      errors: [] as string[]
    };

    // 3. Process updates in parallel
    // We use Promise.allSettled to ensure one failure doesn't stop the others.
    const updates = calendars.map(async (cal) => {
      try {
        const rawData = await fetchICalData(cal.url);
        const processedContent = processICalData(rawData, cal.summary, timezone);

        // Update the document
        cal.icalContent = processedContent;
        cal.lastUpdated = new Date();
        await cal.save();

        return { status: 'fulfilled', id: cal.uniqueId };
      } catch (error: any) {
        console.error(`Failed to update calendar ${cal.uniqueId}:`, error);
        return { 
          status: 'rejected', 
          id: cal.uniqueId, 
          reason: error.message 
        };
      }
    });

    const outcomes = await Promise.allSettled(updates);

    // 4. Summarize results
    outcomes.forEach((outcome) => {
      if (outcome.status === 'fulfilled') {
        results.success++;
      } else {
        results.failed++;
        results.errors.push((outcome as PromiseRejectedResult).reason);
      }
    });

    console.log(`Cron job finished. Success: ${results.success}, Failed: ${results.failed}`);

    return res.status(200).json(results);

  } catch (error: any) {
    console.error('Critical Cron Error:', error);
    return res.status(500).json({ error: 'Internal Server Error', details: error.message });
  }
}