import type { VercelRequest, VercelResponse } from '@vercel/node';
import dbConnect from '../lib/mongoose.js';
import ICalUrl from '../models/ICalUrl.js';
import { processICalUrl } from '../lib/icalService.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await dbConnect();
    
    const { url, summary = 'Jobb' } = req.body;
    const timezone = process.env.TIMEZONE || 'Europe/Stockholm';

    if (!url) return res.status(400).json({ error: 'URL is required' });

    // Validate URL format roughly
    if (!url.startsWith('http') && !url.startsWith('webcals')) {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    const result = await processICalUrl(url, summary, timezone);

    // Save/Update in DB
    await ICalUrl.findOneAndUpdate(
      { uniqueId: result.uniqueId },
      {
        url,
        summary,
        icalContent: result.icalContent,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );

    // Construct return URLs
    // Note: 'host' header gives the domain (e.g., project.vercel.app)
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['host'];
    
    // We use a query param for simpler serverless routing without rewrite config
    const apiUrl = `${protocol}://${host}/api/calendar?id=${result.uniqueId}`;
    const googleLink = `https://www.google.com/calendar/render?cid=${encodeURIComponent(apiUrl)}`;

    return res.status(200).json({
      apiUrl,
      googleLink,
      uniqueId: result.uniqueId,
      lastUpdated: new Date()
    });

  } catch (error: any) {
    console.error('Generate Error:', error);
    return res.status(500).json({ error: error.message || 'Internal Server Error' });
  }
}