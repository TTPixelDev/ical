import express, { Request, Response } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import {
  fetchICalData,
  extractMergedShifts,
  createSimplifiedICal,
  generateUniqueId,
  formatMinutes
} from './lib/icalService.ts';
import {
  getCalendar,
  saveCalendar,
  listCalendars,
  deleteCalendar,
  StoredCalendar
} from './lib/storage.ts';
import { ShiftPreview } from './types.ts';

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

function mapShiftsToPreview(shifts: any[]): ShiftPreview[] {
  return shifts.map((s) => ({
    id: s.id,
    date: s.date,
    endDate: s.endDate,
    formattedStart: s.formattedStart,
    formattedEnd: s.formattedEnd,
    durationMinutes: s.durationMinutes,
    durationHoursFormatted: s.durationHoursFormatted,
    crossesMidnight: s.crossesMidnight,
    activities: s.activities.map((a: any) => ({
      name: a.name,
      durationMinutes: a.durationMinutes
    }))
  }));
}

// 1. POST /api/generate - generate and store simplified calendar
app.post('/api/generate', async (req: Request, res: Response) => {
  try {
    const {
      url,
      rawIcalContent,
      summary = 'Jobb',
      timezone = 'Europe/Stockholm',
      maxBreakMinutes = 120,
      filterKeywords
    } = req.body;

    let icalString = rawIcalContent;

    if (!icalString && url) {
      if (!url.startsWith('http') && !url.startsWith('webcal')) {
        return res.status(400).json({ error: 'Ogiltigt URL-format. URL måste börja med http://, https:// eller webcal://' });
      }
      icalString = await fetchICalData(url);
    }

    if (!icalString || typeof icalString !== 'string' || !icalString.trim()) {
      return res.status(400).json({ error: 'Varken iCal URL eller filinnehåll angavs' });
    }

    const processOpts = {
      summary: summary || 'Jobb',
      timezone: timezone || 'Europe/Stockholm',
      maxBreakMinutes: Number(maxBreakMinutes) || 120,
      filterKeywords: Array.isArray(filterKeywords) && filterKeywords.length > 0 ? filterKeywords : undefined
    };

    const shifts = extractMergedShifts(icalString, processOpts);

    if (shifts.length === 0) {
      return res.status(400).json({
        error: 'Inga giltiga arbetspass hittades i schemat efter filtrering. Kontrollera att filen innehåller VEVENT-händelser.'
      });
    }

    const simplifiedIcal = createSimplifiedICal(shifts, processOpts);
    const uniqueId = generateUniqueId(url || icalString.slice(0, 200), summary);

    const totalMinutes = shifts.reduce((acc, s) => acc + s.durationMinutes, 0);
    const totalHoursFormatted = formatMinutes(totalMinutes);

    const calendarDoc: StoredCalendar = {
      uniqueId,
      url: url || undefined,
      summary,
      timezone: processOpts.timezone,
      maxBreakMinutes: processOpts.maxBreakMinutes,
      filterKeywords: processOpts.filterKeywords,
      icalContent: simplifiedIcal,
      isUploadedFile: !url,
      shiftCount: shifts.length,
      totalHours: totalHoursFormatted,
      lastUpdated: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    await saveCalendar(calendarDoc);

    const host = req.headers['host'] || `localhost:${PORT}`;
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const baseUrl = `${protocol}://${host}`;

    const apiUrl = `${baseUrl}/api/calendar?id=${uniqueId}`;
    const cleanHost = host.replace(/^https?:\/\//, '');
    const webcalUrl = `webcal://${cleanHost}/api/calendar?id=${uniqueId}`;
    const googleLink = `https://www.google.com/calendar/render?cid=${encodeURIComponent(apiUrl)}`;
    const downloadUrl = `${baseUrl}/api/calendar?id=${uniqueId}&download=1`;

    return res.status(200).json({
      apiUrl,
      webcalUrl,
      googleLink,
      downloadUrl,
      uniqueId,
      lastUpdated: calendarDoc.lastUpdated,
      summary,
      shiftCount: shifts.length,
      totalHours: totalHoursFormatted,
      previewShifts: mapShiftsToPreview(shifts.slice(0, 50))
    });
  } catch (error: any) {
    console.error('Generate Error:', error);
    return res.status(500).json({ error: error.message || 'Ett internt fel uppstod vid generering' });
  }
});

// 2. POST /api/preview - preview shifts without saving
app.post('/api/preview', async (req: Request, res: Response) => {
  try {
    const {
      url,
      rawIcalContent,
      summary = 'Jobb',
      timezone = 'Europe/Stockholm',
      maxBreakMinutes = 120,
      filterKeywords
    } = req.body;

    let icalString = rawIcalContent;

    if (!icalString && url) {
      icalString = await fetchICalData(url);
    }

    if (!icalString || typeof icalString !== 'string' || !icalString.trim()) {
      return res.status(400).json({ error: 'Ingen iCal-data angavs' });
    }

    const processOpts = {
      summary: summary || 'Jobb',
      timezone: timezone || 'Europe/Stockholm',
      maxBreakMinutes: Number(maxBreakMinutes) || 120,
      filterKeywords: Array.isArray(filterKeywords) && filterKeywords.length > 0 ? filterKeywords : undefined
    };

    const shifts = extractMergedShifts(icalString, processOpts);
    const totalMinutes = shifts.reduce((acc, s) => acc + s.durationMinutes, 0);
    const totalHoursFormatted = formatMinutes(totalMinutes);
    const previews = mapShiftsToPreview(shifts);

    return res.status(200).json({
      shiftCount: shifts.length,
      totalHours: totalHoursFormatted,
      shifts: previews,
      firstShift: previews[0],
      lastShift: previews[previews.length - 1]
    });
  } catch (error: any) {
    console.error('Preview Error:', error);
    return res.status(500).json({ error: error.message || 'Kunde inte förhandsgranska iCal-data' });
  }
});

// Helper for serving calendar content
async function serveCalendarContent(id: string, req: Request, res: Response) {
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'ID krävs' });
  }

  const cal = await getCalendar(id);
  if (!cal) {
    return res.status(404).json({ error: 'Kalendern hittades inte eller har löpt ut' });
  }

  let contentToSend = cal.icalContent;

  // If calendar was generated from an active URL and is older than 30 minutes, refresh
  if (cal.url) {
    const ONE_HOUR = 30 * 60 * 1000;
    const isOld = Date.now() - new Date(cal.lastUpdated).getTime() > ONE_HOUR;
    if (isOld) {
      try {
        const rawData = await fetchICalData(cal.url);
        const shifts = extractMergedShifts(rawData, {
          summary: cal.summary,
          timezone: cal.timezone,
          maxBreakMinutes: cal.maxBreakMinutes,
          filterKeywords: cal.filterKeywords
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
      } catch (refreshErr) {
        console.warn(`Failed to auto-refresh calendar ${id}, serving cached version:`, refreshErr);
      }
    }
  }

  const filename = `${cal.summary.toLowerCase().replace(/[^a-z0-9]/gi, '_') || 'arbetsschema'}.ics`;

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  return res.send(contentToSend);
}

// 3. GET /api/calendar - download or subscribe
app.get('/api/calendar', async (req: Request, res: Response) => {
  const idParam = req.query.id;
  const id = Array.isArray(idParam) ? String(idParam[0]) : (idParam ? String(idParam) : '');
  return serveCalendarContent(id, req, res);
});

// 4. GET /api/calendar/:id.ics
app.get('/api/calendar/:id.ics', async (req: Request, res: Response) => {
  const idParam = req.params.id;
  const id = Array.isArray(idParam) ? String(idParam[0]) : (idParam ? String(idParam) : '');
  return serveCalendarContent(id, req, res);
});

// 5. GET /api/sample - returns sample Proscheduler iCal text
app.get('/api/sample', (req: Request, res: Response) => {
  try {
    const samplePath = path.resolve(process.cwd(), 'sample_proscheduler.ics');
    if (fs.existsSync(samplePath)) {
      const content = fs.readFileSync(samplePath, 'utf-8');
      return res.status(200).json({ content });
    }
    return res.status(404).json({ error: 'Exempelfil hittades inte' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 6. GET /api/calendars - list saved calendars
app.get('/api/calendars', async (req: Request, res: Response) => {
  try {
    const list = await listCalendars();
    return res.status(200).json(
      list.map((c) => ({
        uniqueId: c.uniqueId,
        url: c.url,
        summary: c.summary,
        shiftCount: c.shiftCount,
        totalHours: c.totalHours,
        lastUpdated: c.lastUpdated,
        isUploadedFile: c.isUploadedFile
      }))
    );
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. DELETE /api/calendars/:id - delete calendar
app.delete('/api/calendars/:id', async (req: Request, res: Response) => {
  try {
    const idParam = req.params.id;
    const id = Array.isArray(idParam) ? String(idParam[0]) : (idParam ? String(idParam) : '');
    const ok = await deleteCalendar(id);
    return res.status(200).json({ success: ok });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Setup dev Vite middleware or prod static server
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[iCal Converter] Server running at http://0.0.0.0:${PORT} (${isProd ? 'production' : 'development'})`);
  });
}

startServer().catch((err) => {
  console.error('Fatal Server Startup Error:', err);
  process.exit(1);
});
