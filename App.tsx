import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Moon,
  Sun,
  Check,
  Copy,
  Download,
  ExternalLink,
  AlertCircle,
  FileText,
  Link as LinkIcon,
  Upload,
  ChevronDown,
  ChevronUp,
  Sliders,
  Sparkles,
  CalendarDays,
  ShieldCheck,
  Trash2,
  RefreshCw,
  Info
} from 'lucide-react';
import { GenerateResponse, PreviewResponse, ShiftPreview, StoredCalendarSummary } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<'url' | 'raw'>('url');
  const [url, setUrl] = useState('');
  const [rawIcalContent, setRawIcalContent] = useState('');
  const [summary, setSummary] = useState('Jobb');
  const [timezone, setTimezone] = useState('Europe/Stockholm');
  const [maxBreakMinutes, setMaxBreakMinutes] = useState(120);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // States
  const [loading, setLoading] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [expandedShiftId, setExpandedShiftId] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [copyWebcalSuccess, setCopyWebcalSuccess] = useState(false);

  // Saved calendars
  const [savedCalendars, setSavedCalendars] = useState<StoredCalendarSummary[]>([]);

  useEffect(() => {
    fetchSavedCalendars();
  }, []);

  const fetchSavedCalendars = async () => {
    try {
      const res = await fetch('/api/calendars');
      if (res.ok) {
        const data = await res.json();
        setSavedCalendars(data);
      }
    } catch {
      // Ignore background fetch error
    }
  };

  const handleLoadSample = async () => {
    setLoadingSample(true);
    setError(null);
    try {
      const res = await fetch('/api/sample');
      if (!res.ok) throw new Error('Kunde inte läsa in exempelfilen');
      const data = await res.json();
      setRawIcalContent(data.content);
      setActiveTab('raw');
      // Trigger instant preview
      handleQuickPreview(data.content);
    } catch (err: any) {
      setError(err.message || 'Kunde inte läsa in exempelschemat');
    } finally {
      setLoadingSample(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      if (content) {
        setRawIcalContent(content);
        setActiveTab('raw');
        handleQuickPreview(content);
      }
    };
    reader.readAsText(file);
  };

  const handleQuickPreview = async (customContent?: string) => {
    const contentToUse = customContent !== undefined ? customContent : (activeTab === 'url' ? undefined : rawIcalContent);
    const urlToUse = activeTab === 'url' ? url : undefined;

    if (!urlToUse && !contentToUse) {
      setError('Ange en URL eller klistra in schema-data för att förhandsgranska');
      return;
    }

    setLoadingPreview(true);
    setError(null);

    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: urlToUse,
          rawIcalContent: contentToUse,
          summary,
          timezone,
          maxBreakMinutes
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunde inte förhandsgranska schemat');
      setPreview(data);
    } catch (err: any) {
      setError(err.message || 'Ett fel uppstod vid förhandsgranskning');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    const payload = {
      url: activeTab === 'url' ? url.trim() : undefined,
      rawIcalContent: activeTab === 'raw' ? rawIcalContent.trim() : undefined,
      summary: summary.trim() || 'Jobb',
      timezone,
      maxBreakMinutes
    };

    if (!payload.url && !payload.rawIcalContent) {
      setError('Ange antingen en iCal URL eller klistra in innehållet från schemafilen.');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Något gick fel vid generering');
      }

      setResult(data as GenerateResponse);
      fetchSavedCalendars();
    } catch (err: any) {
      setError(err.message || 'Ett oväntat fel inträffade');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string, isWebcal = false) => {
    try {
      await navigator.clipboard.writeText(text);
      if (isWebcal) {
        setCopyWebcalSuccess(true);
        setTimeout(() => setCopyWebcalSuccess(false), 2000);
      } else {
        setCopySuccess(true);
        setTimeout(() => setCopySuccess(false), 2000);
      }
    } catch (err) {
      console.error('Kunde inte kopiera:', err);
    }
  };

  const handleDeleteCalendar = async (id: string) => {
    if (!window.confirm('Är du säker på att du vill ta bort denna sparade kalender?')) return;
    try {
      await fetch(`/api/calendars/${id}`, { method: 'DELETE' });
      fetchSavedCalendars();
      if (result?.uniqueId === id) {
        setResult(null);
      }
    } catch {
      // ignore
    }
  };

  const displayedShifts = result?.previewShifts || preview?.shifts || [];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-8">

        {/* Hero Header */}
        <header className="text-center space-y-4">
          <div className="inline-flex items-center justify-center p-3.5 bg-blue-600 text-white rounded-2xl shadow-lg shadow-blue-500/25 ring-4 ring-blue-100">
            <Calendar className="h-9 w-9" />
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
            iCal Workday Converter
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">
            Slå samman mikrohändelser från schemat till sammanhängande arbetspass.
            Fullt stöd för <strong>nattpass över midnatt (t.ex. 22:15 → 07:15)</strong> utan felaktiga 24-timmars block.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-2 pt-2 text-xs font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full shadow-sm">
              <Moon className="w-3.5 h-3.5 text-indigo-600" />
              Nattpass & Midnattshantering
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full shadow-sm">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              Filter för ledighet & helgdagar
            </span>
            <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-white border border-slate-200 rounded-full shadow-sm">
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              Enhetlig fullstack Express + Vite
            </span>
          </div>
        </header>

        {/* Card for Conversion Form */}
        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200/80 overflow-hidden">
          {/* Tabs */}
          <div className="border-b border-slate-100 bg-slate-50/70 p-2 flex gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'url'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              iCal URL / Länk
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('raw')}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
                activeTab === 'raw'
                  ? 'bg-white text-blue-600 shadow-sm border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/70'
              }`}
            >
              <FileText className="w-4 h-4" />
              Klistra in eller ladda upp fil (.ics)
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-6 sm:p-8 space-y-6">
            {/* Input by URL */}
            {activeTab === 'url' && (
              <div className="space-y-2">
                <label htmlFor="url" className="block text-sm font-semibold text-slate-800">
                  iCal URL (Prenumerationslänk från schema)
                </label>
                <div className="relative">
                  <input
                    id="url"
                    name="url"
                    type="text"
                    required={activeTab === 'url'}
                    placeholder="https://proscheduler.com/.../calendar.ics eller webcals://..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50/50 border border-slate-300 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  Stöder standardkalendrar från proscheduler, Calabrio, Teleopti, Quinyx, Google Calendar m.fl.
                </p>
              </div>
            )}

            {/* Input by Raw Content / File Upload */}
            {activeTab === 'raw' && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label htmlFor="rawIcalContent" className="block text-sm font-semibold text-slate-800">
                    Schema-innehåll (iCalendar / VCALENDAR text)
                  </label>
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors">
                      <Upload className="w-3.5 h-3.5 text-slate-600" />
                      Välj fil från datorn (.ics / .txt)
                      <input
                        type="file"
                        accept=".ics,.txt,text/calendar"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleLoadSample}
                      disabled={loadingSample}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      {loadingSample ? 'Laddar...' : 'Ladda mitt exempel-schema'}
                    </button>
                  </div>
                </div>

                <textarea
                  id="rawIcalContent"
                  name="rawIcalContent"
                  rows={6}
                  required={activeTab === 'raw'}
                  placeholder="Klistra in VCALENDAR-text här (börjar med BEGIN:VCALENDAR...)"
                  value={rawIcalContent}
                  onChange={(e) => setRawIcalContent(e.target.value)}
                  className="w-full px-4 py-3 font-mono text-xs bg-slate-50/50 border border-slate-300 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all resize-y"
                />
              </div>
            )}

            {/* Basic Options */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="summary" className="block text-sm font-semibold text-slate-800 mb-1">
                  Titel på händelse
                </label>
                <input
                  id="summary"
                  name="summary"
                  type="text"
                  placeholder="Jobb"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
                <span className="text-xs text-slate-400 mt-1 block">Visas i din kalender som händelsenamn.</span>
              </div>

              <div>
                <label htmlFor="timezone" className="block text-sm font-semibold text-slate-800 mb-1">
                  Tidszon
                </label>
                <select
                  id="timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50/50 border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                >
                  <option value="Europe/Stockholm">Europe/Stockholm (Sverige UTC+1 / UTC+2)</option>
                  <option value="Europe/Oslo">Europe/Oslo</option>
                  <option value="Europe/Copenhagen">Europe/Copenhagen</option>
                  <option value="Europe/Helsinki">Europe/Helsinki</option>
                  <option value="UTC">UTC (Världstid)</option>
                </select>
                <span className="text-xs text-slate-400 mt-1 block">Hanterar sommartid/vintertid automatiskt.</span>
              </div>
            </div>

            {/* Advanced Settings Toggle */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
              >
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                Avancerade inställningar för pass och pauser
                {showAdvanced ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              {showAdvanced && (
                <div className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-4 animate-fade-in-up">
                  <div>
                    <label htmlFor="maxBreak" className="block text-xs font-semibold text-slate-700 mb-1">
                      Maximal rast/paus inom samma arbetspass (minuter)
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        id="maxBreak"
                        type="number"
                        min="15"
                        max="360"
                        step="15"
                        value={maxBreakMinutes}
                        onChange={(e) => setMaxBreakMinutes(Number(e.target.value) || 120)}
                        className="w-32 px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                      />
                      <span className="text-xs text-slate-500">
                        {Math.floor(maxBreakMinutes / 60)} timmar {maxBreakMinutes % 60} minuter. (Aktiviteter med kortare mellanrum räknas till samma pass).
                      </span>
                    </div>
                  </div>

                  <div className="text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-200">
                    <div className="font-semibold text-slate-800 flex items-center gap-1.5 mb-1">
                      <Info className="w-3.5 h-3.5 text-blue-500" />
                      Automatisk filtrering
                    </div>
                    Händelser märkta som <em>Holiday, Semester, Day off, Ledig, Sick/Sjuk, Care of child/VAB</em> filtreras automatiskt bort så att du endast ser de faktiska arbetspassen i din kalender.
                  </div>
                </div>
              )}
            </div>

            {/* Error Banner */}
            {error && (
              <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-red-800">Ett fel inträffade</h4>
                  <p className="text-xs text-red-700 leading-relaxed">{error}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={loading || (activeTab === 'url' ? !url.trim() : !rawIcalContent.trim())}
                className="flex-1 flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 disabled:bg-slate-300 disabled:cursor-not-allowed transition-all"
              >
                {loading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Beräknar och genererar kalender...
                  </>
                ) : (
                  <>
                    <CalendarDays className="w-4 h-4" />
                    Generera kalenderlänk
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => handleQuickPreview()}
                disabled={loadingPreview || (activeTab === 'url' ? !url.trim() : !rawIcalContent.trim())}
                className="flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl font-semibold text-sm text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                {loadingPreview ? (
                  <RefreshCw className="w-4 h-4 animate-spin text-slate-500" />
                ) : (
                  <Clock className="w-4 h-4 text-slate-600" />
                )}
                Förhandsgranska arbetspass
              </button>
            </div>
          </form>
        </div>

        {/* Results Section */}
        {result && (
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 p-6 sm:p-8 space-y-6 animate-fade-in-up">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-green-100 text-green-700 rounded-xl">
                  <Check className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Kalender genererad!</h3>
                  <p className="text-xs text-slate-500">
                    Hittade {result.shiftCount} arbetspass ({result.totalHours} total schemalagd tid)
                  </p>
                </div>
              </div>
              <span className="text-xs text-slate-400">
                Uppdaterad {new Date(result.lastUpdated).toLocaleTimeString('sv-SE')}
              </span>
            </div>

            {/* Night shift banner confirmation */}
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
              <Moon className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-indigo-900 space-y-1">
                <span className="font-semibold block text-sm text-indigo-950">
                  Korrigerad passberäkning aktiv
                </span>
                <p>
                  Nattpass som sträcker sig över 12-slaget (t.ex. 22:15 → 07:15) beräknas nu som ett enda sammanhållet pass istället för att brytas vid kl 06:00 eller midnatt. Inga konstgjorda dygnet-runt-block (06:30 → 06:30) skapas!
                </p>
              </div>
            </div>

            {/* Links and Subscription Box */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                  1. Din iCal / Webcal Prenumerationslänk
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={result.apiUrl}
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm font-mono text-slate-800 select-all"
                  />
                  <button
                    type="button"
                    onClick={() => copyToClipboard(result.apiUrl, false)}
                    className="p-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl shadow-sm transition-colors"
                    title="Kopiera länk"
                  >
                    {copySuccess ? <Check className="w-5 h-5 text-green-600" /> : <Copy className="w-5 h-5" />}
                  </button>
                </div>
                <p className="text-xs text-slate-500 mt-1.5">
                  Kopiera denna länk och klistra in i din kalenderapp (Google Calendar, Outlook, Apple Calendar) under "Lägg till via URL / Prenumerera".
                </p>
              </div>

              {/* Direct Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <a
                  href={result.googleLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-semibold transition-colors"
                >
                  <ExternalLink className="w-4 h-4" />
                  Lägg till i Google Calendar
                </a>

                <a
                  href={result.webcalUrl}
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Calendar className="w-4 h-4" />
                  Öppna i Apple / Outlook
                </a>

                <a
                  href={result.downloadUrl}
                  download="arbetsschema.ics"
                  className="flex items-center justify-center gap-2 py-3 px-4 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-xl text-xs font-semibold transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Ladda ner .ics-fil
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Shift Inspector / Preview Table */}
        {displayedShifts.length > 0 && (
          <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-200 p-6 sm:p-8 space-y-4 animate-fade-in-up">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-600" />
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  Identifierade arbetspass ({displayedShifts.length} st)
                </h3>
              </div>
              <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1 rounded-full font-medium">
                Klicka på ett pass för att se ingående delar
              </span>
            </div>

            <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto pr-1">
              {displayedShifts.map((shift, idx) => {
                const isExpanded = expandedShiftId === shift.id;
                const startDateObj = new Date(shift.date);
                const weekdayName = startDateObj.toLocaleDateString('sv-SE', { weekday: 'long' });
                const formattedDate = startDateObj.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' });

                return (
                  <div key={shift.id || idx} className="py-3 hover:bg-slate-50/70 rounded-xl transition-colors px-2">
                    <div
                      className="flex items-center justify-between gap-4 cursor-pointer"
                      onClick={() => setExpandedShiftId(isExpanded ? null : shift.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-xl flex items-center justify-center ${
                          shift.crossesMidnight ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {shift.crossesMidnight ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm text-slate-900 capitalize">
                              {weekdayName} {formattedDate}
                            </span>
                            {shift.crossesMidnight && (
                              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800">
                                Nattpass
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-600 font-mono flex items-center gap-1.5 mt-0.5">
                            <span className="font-bold text-slate-800">{shift.formattedStart}</span>
                            <span className="text-slate-400">→</span>
                            <span className="font-bold text-slate-800">{shift.formattedEnd}</span>
                            {shift.crossesMidnight && (
                              <span className="text-slate-400 font-sans text-[11px]">
                                (+1 dag)
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                          {shift.durationHoursFormatted}
                        </span>
                        {isExpanded ? (
                          <ChevronUp className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && shift.activities && shift.activities.length > 0 && (
                      <div className="mt-3 pl-11 pr-2 pt-2 border-t border-slate-100 text-xs text-slate-600 space-y-1.5 animate-fade-in-up">
                        <span className="font-semibold text-slate-700 block">
                          Ingående aktiviteter ({shift.activities.length} block):
                        </span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                          {shift.activities.map((act, actIdx) => (
                            <div key={actIdx} className="flex justify-between items-center bg-slate-100/70 px-2.5 py-1 rounded-md">
                              <span className="truncate pr-2">{act.name}</span>
                              <span className="font-mono text-slate-500 font-medium whitespace-nowrap">
                                {Math.floor(act.durationMinutes / 60) > 0 ? `${Math.floor(act.durationMinutes / 60)}h ` : ''}
                                {act.durationMinutes % 60}m
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Saved Calendars List */}
        {savedCalendars.length > 0 && (
          <div className="bg-white rounded-2xl shadow-md border border-slate-200/80 p-6 space-y-4">
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <Calendar className="w-4 h-4 text-blue-600" />
              Tidigare skapade kalenderlänkar
            </h3>
            <div className="divide-y divide-slate-100">
              {savedCalendars.map((cal) => (
                <div key={cal.uniqueId} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="font-semibold text-sm text-slate-900">{cal.summary}</div>
                    <div className="text-xs text-slate-500">
                      {cal.shiftCount} pass ({cal.totalHours}) • Uppdaterad: {new Date(cal.lastUpdated).toLocaleDateString('sv-SE')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => copyToClipboard(`${window.location.origin}/api/calendar?id=${cal.uniqueId}`)}
                      className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors inline-flex items-center gap-1"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      Kopiera länk
                    </button>
                    <a
                      href={`/api/calendar?id=${cal.uniqueId}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors inline-flex items-center gap-1"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Visa iCal
                    </a>
                    <button
                      type="button"
                      onClick={() => handleDeleteCalendar(cal.uniqueId)}
                      className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                      title="Ta bort"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer info */}
        <footer className="text-center text-xs text-slate-400 space-y-1">
          <p>iCal Workday Converter • Enhetlig Fullstack Express & React Node App</p>
          <p>Korrekt beräkning av nattpass och helgdagar i enlighet med RFC 5545 iCalendar standard.</p>
        </footer>

      </div>
    </div>
  );
}
