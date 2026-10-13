import fs from 'fs';
import path from 'path';

export interface StoredCalendar {
  uniqueId: string;
  url?: string;
  summary: string;
  timezone: string;
  maxBreakMinutes?: number;
  filterKeywords?: string[];
  icalContent: string;
  isUploadedFile?: boolean;
  shiftCount: number;
  totalHours: string;
  lastUpdated: string;
  createdAt: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DATA_FILE = path.join(DATA_DIR, 'calendars.json');

// Memory cache
let inMemoryStore: Map<string, StoredCalendar> = new Map();

function ensureDataFile() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf-8');
    }
  } catch (err) {
    console.warn('Could not initialize local data file, operating in-memory:', err);
  }
}

function loadCalendars(): Map<string, StoredCalendar> {
  ensureDataFile();
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(data || '{}');
      const map = new Map<string, StoredCalendar>();
      for (const [k, v] of Object.entries(parsed)) {
        map.set(k, v as StoredCalendar);
      }
      inMemoryStore = map;
      return map;
    }
  } catch (err) {
    console.error('Error reading calendars.json:', err);
  }
  return inMemoryStore;
}

function saveCalendars(map: Map<string, StoredCalendar>) {
  ensureDataFile();
  try {
    const obj: Record<string, StoredCalendar> = {};
    for (const [k, v] of map.entries()) {
      obj[k] = v;
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(obj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving calendars.json:', err);
  }
}

// Initial load
loadCalendars();

export async function getCalendar(uniqueId: string): Promise<StoredCalendar | null> {
  const store = loadCalendars();
  if (store.has(uniqueId)) {
    return store.get(uniqueId)!;
  }

  // Fallback to MongoDB if configured
  if (process.env.MONGODB_URI) {
    try {
      const { default: dbConnect } = await import('./mongoose.js');
      const { default: ICalUrl } = await import('../models/ICalUrl.js');
      await dbConnect();
      const doc = await ICalUrl.findOne({ uniqueId });
      if (doc) {
        const cal: StoredCalendar = {
          uniqueId: doc.uniqueId,
          url: doc.url,
          summary: doc.summary,
          timezone: 'Europe/Stockholm',
          icalContent: doc.icalContent,
          shiftCount: 0,
          totalHours: '',
          lastUpdated: doc.lastUpdated?.toISOString() || new Date().toISOString(),
          createdAt: doc.createdAt?.toISOString() || new Date().toISOString()
        };
        store.set(uniqueId, cal);
        saveCalendars(store);
        return cal;
      }
    } catch (e) {
      console.warn('MongoDB query fallback error:', e);
    }
  }

  return null;
}

export async function saveCalendar(cal: StoredCalendar): Promise<void> {
  const store = loadCalendars();
  store.set(cal.uniqueId, cal);
  saveCalendars(store);

  // Sync to MongoDB if configured
  if (process.env.MONGODB_URI) {
    try {
      const { default: dbConnect } = await import('./mongoose.js');
      const { default: ICalUrl } = await import('../models/ICalUrl.js');
      await dbConnect();
      await ICalUrl.findOneAndUpdate(
        { uniqueId: cal.uniqueId },
        {
          url: cal.url || 'uploaded-file',
          summary: cal.summary,
          icalContent: cal.icalContent,
          lastUpdated: new Date()
        },
        { upsert: true, new: true }
      );
    } catch (e) {
      console.warn('MongoDB sync error (local storage preserved):', e);
    }
  }
}

export async function listCalendars(): Promise<StoredCalendar[]> {
  const store = loadCalendars();
  return Array.from(store.values()).sort(
    (a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
  );
}

export async function deleteCalendar(uniqueId: string): Promise<boolean> {
  const store = loadCalendars();
  const deleted = store.delete(uniqueId);
  if (deleted) {
    saveCalendars(store);
  }
  return deleted;
}
