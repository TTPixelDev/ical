export interface ShiftActivitySummary {
  name: string;
  durationMinutes: number;
}

export interface ShiftPreview {
  id: string;
  date: string;
  endDate: string;
  formattedStart: string;
  formattedEnd: string;
  durationMinutes: number;
  durationHoursFormatted: string;
  crossesMidnight: boolean;
  activities: ShiftActivitySummary[];
}

export interface GenerateResponse {
  apiUrl: string;
  webcalUrl: string;
  googleLink: string;
  downloadUrl: string;
  uniqueId: string;
  lastUpdated: string;
  summary: string;
  shiftCount: number;
  totalHours: string;
  previewShifts: ShiftPreview[];
}

export interface PreviewResponse {
  shiftCount: number;
  totalHours: string;
  shifts: ShiftPreview[];
  firstShift?: ShiftPreview;
  lastShift?: ShiftPreview;
}

export interface ApiError {
  error: string;
  details?: string;
}

export interface StoredCalendarSummary {
  uniqueId: string;
  url?: string;
  summary: string;
  shiftCount: number;
  totalHours: string;
  lastUpdated: string;
  isUploadedFile?: boolean;
}
