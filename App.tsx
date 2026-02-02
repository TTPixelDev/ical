import React, { useState } from 'react';
import { GenerateResponse, ApiError } from './types';
import { LoadingSpinner, CopyIcon, CheckIcon, CalendarIcon, AlertIcon } from './components/Icons';

function App() {
  const [url, setUrl] = useState('');
  const [summary, setSummary] = useState('Jobb');
  const [result, setResult] = useState<GenerateResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Pointing to the Vercel API function
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url, summary }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error((data as ApiError).error || 'Något gick fel vid generering');
      }

      setResult(data as GenerateResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ett okänt fel inträffade');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Kunde inte kopiera:', err);
    }
  };

  return (
    <div className="min-h-screen py-12 px-4 sm:px-6 lg:px-8 flex justify-center items-start">
      <div className="max-w-3xl w-full space-y-8">
        
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg mb-6">
            <CalendarIcon className="h-8 w-8 text-white" />
          </div>
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight">
            iCal Workday Converter
          </h1>
          <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
            Konvertera din komplexa skiftkalender till förenklade arbetsdygn. 
            Automatiskt stöd för 06:00-06:00 dygnshantering.
          </p>
        </div>

        {/* Main Card */}
        <div className="bg-white py-8 px-4 shadow-xl sm:rounded-2xl sm:px-10 border border-slate-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            
            <div>
              <label htmlFor="url" className="block text-sm font-medium text-slate-700">
                iCal URL
              </label>
              <div className="mt-1">
                <input
                  id="url"
                  name="url"
                  type="url"
                  required
                  placeholder="https://example.com/calendar.ics eller webcals://..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="appearance-none block w-full px-3 py-3 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-shadow"
                />
              </div>
            </div>

            <div>
              <label htmlFor="summary" className="block text-sm font-medium text-slate-700">
                Titel på händelse (Valfritt)
              </label>
              <div className="mt-1">
                <input
                  id="summary"
                  name="summary"
                  type="text"
                  placeholder="Jobb"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="appearance-none block w-full px-3 py-3 border border-slate-300 rounded-lg shadow-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-shadow"
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || !url}
                className={`w-full flex justify-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-sm font-medium text-white transition-all
                  ${loading || !url 
                    ? 'bg-blue-400 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500'
                  }`}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <LoadingSpinner className="h-4 w-4" />
                    Genererar...
                  </span>
                ) : (
                  'Generera kalender'
                )}
              </button>
            </div>
          </form>

          {error && (
            <div className="mt-6 rounded-md bg-red-50 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertIcon className="h-5 w-5 text-red-400" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Ett fel uppstod</h3>
                  <div className="mt-2 text-sm text-red-700">
                    <p>{error}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-8 space-y-6 animate-fade-in-up">
              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="px-2 bg-white text-sm text-slate-500">Resultat</span>
                </div>
              </div>

              {/* API URL Result */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  Din nya kalenderlänk
                </label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded text-sm text-slate-800 break-all">
                    {result.apiUrl}
                  </code>
                  <button
                    onClick={() => copyToClipboard(result.apiUrl)}
                    className={`p-2 rounded-md border transition-colors ${
                      copySuccess 
                        ? 'bg-green-50 border-green-200 text-green-600' 
                        : 'bg-white border-slate-300 text-slate-600 hover:bg-slate-50'
                    }`}
                    title="Kopiera länk"
                  >
                    {copySuccess ? <CheckIcon className="h-5 w-5" /> : <CopyIcon className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Google Button */}
              <div className="text-center">
                 <a
                    href={result.googleLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 transition-colors"
                  >
                    <CalendarIcon className="mr-2 h-5 w-5" />
                    Lägg till direkt i Google Calendar
                  </a>
                  <p className="mt-4 text-xs text-slate-400">
                    Senast uppdaterad: {new Date(result.lastUpdated).toLocaleString('sv-SE')}
                  </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info */}
        <div className="text-center text-sm text-slate-500">
          <p>Kalendern uppdateras automatiskt när din kalender-klient efterfrågar data.</p>
        </div>
      </div>
    </div>
  );
}

export default App;
