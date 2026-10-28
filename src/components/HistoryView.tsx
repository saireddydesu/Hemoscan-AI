import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
  Bookmark,
  Eye,
  Trash2,
  ScanLine,
  CheckCircle2,
  AlertCircle,
  X,
  Fingerprint,
} from 'lucide-react';
import type { AnalysisRecord } from '../types';

interface HistoryViewProps {
  records: AnalysisRecord[];
  loading: boolean;
  compact?: boolean;
  onStartNewAnalysis: () => void;
  onToggleSaveReport: (recordId: string) => void;
  onDeleteRecord?: (recordId: string) => void;
  onViewAllHistory?: () => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  records,
  loading,
  compact = false,
  onStartNewAnalysis,
  onToggleSaveReport,
  onDeleteRecord,
  onViewAllHistory,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'saved'>('all');
  const [inspectedRecord, setInspectedRecord] = useState<AnalysisRecord | null>(null);

  const filteredRecords = useMemo(() => {
    const list = records.filter((rec) => {
      if (filterTab === 'saved' && !rec.savedReport) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        rec.fileName.toLowerCase().includes(q) ||
        rec.predictedClass.toLowerCase().includes(q) ||
        rec.id.toLowerCase().includes(q)
      );
    });
    return compact ? list.slice(0, 5) : list;
  }, [records, filterTab, searchQuery, compact]);

  const handleExportCsv = () => {
    if (filteredRecords.length === 0) return;
    const headers = [
      'Record ID',
      'Timestamp',
      'File Name',
      'Status',
      'Predicted Class',
      'Confidence (%)',
      'Saved Report',
      'Model Version',
      'Experimental Disclaimer',
    ];
    const rows = filteredRecords.map((r) => [
      r.id,
      r.timestamp,
      `"${r.fileName.replace(/"/g, '""')}"`,
      r.status,
      r.predictedClass,
      r.confidence !== null && r.confidence !== undefined ? r.confidence.toFixed(2) : 'N/A',
      r.savedReport ? 'Yes' : 'No',
      r.modelVersion || 'hemoscan_cnn.keras',
      '"Experimental — not medically validated"',
    ]);
    const csvContent = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hemoscan_analysis_records_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="hemo-glass rounded-2xl p-6 sm:p-8">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-semibold text-white tracking-tight">
              {compact ? 'Recent Analysis Activity' : 'Analysis History'}
            </h2>
          </div>
          <p className="text-sm text-slate-300/80 mt-1">
            {compact
              ? 'Latest fingerprint classifications recorded in your workspace.'
              : 'Search, inspect, and export blood group classification records.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!compact && records.length > 0 && (
            <>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter by file or blood group…"
                  aria-label="Filter analysis records"
                  className="hemo-input rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder:text-slate-500 w-56"
                />
              </div>

              <div className="flex items-center gap-1 p-1 rounded-xl bg-white/5 border border-white/8">
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    filterTab === 'all'
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  All Records
                </button>
                <button
                  type="button"
                  onClick={() => setFilterTab('saved')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                    filterTab === 'saved'
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Saved Reports
                </button>
              </div>

              <button
                type="button"
                onClick={handleExportCsv}
                className="px-3.5 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download CSV</span>
              </button>
            </>
          )}

          {compact && records.length > 0 && onViewAllHistory && (
            <button
              type="button"
              onClick={onViewAllHistory}
              className="text-xs font-medium text-red-400 hover:text-red-300 underline-offset-4 hover:underline transition-colors whitespace-nowrap shrink-0"
            >
              View Full History
            </button>
          )}
        </div>
      </div>

      {/* Loading Skeleton State */}
      {loading && (
        <div className="mt-6 space-y-3" aria-busy="true" aria-label="Loading analysis records">
          {[0, 1, 2, 3].map((row) => (
            <div
              key={row}
              className="h-11 rounded-xl bg-white/[0.04] animate-pulse border border-white/5"
            />
          ))}
        </div>
      )}

      {/* Attractive Empty State for New Users */}
      {!loading && records.length === 0 && (
        <div className="py-12 px-4 text-center max-w-md mx-auto">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-center mb-4">
            <Fingerprint className="w-7 h-7 text-slate-400" />
          </div>
          <h3 className="text-base font-semibold text-white">No Analysis Records Yet</h3>
          <p className="mt-2 text-xs sm:text-sm text-slate-400 leading-relaxed">
            Completed fingerprint classifications from your trained CNN model (/api/predict) will
            appear here with timestamps, confidence scores, and exportable reports.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onStartNewAnalysis}
              className="px-4 py-2.5 text-xs font-medium text-white hemo-crimson-btn rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <ScanLine className="w-3.5 h-3.5" />
              <span>Start First Analysis</span>
            </button>
          </div>
        </div>
      )}

      {/* Filtered Empty State */}
      {!loading && records.length > 0 && filteredRecords.length === 0 && (
        <div className="py-10 text-center text-sm text-slate-400">
          No records match your current search or filter criteria.
        </div>
      )}

      {/* High-Density Scientific Data Table */}
      {!loading && filteredRecords.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs font-medium text-slate-400">
                <th className="py-3 pr-4 whitespace-nowrap">Date &amp; Time</th>
                <th className="py-3 px-4 whitespace-nowrap">Fingerprint Sample</th>
                <th className="py-3 px-4 whitespace-nowrap">Status</th>
                <th className="py-3 px-4 whitespace-nowrap">Result</th>
                <th className="py-3 px-4 text-right whitespace-nowrap">Confidence</th>
                <th className="py-3 pl-4 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] text-sm">
              {filteredRecords.map((rec) => {
                const formattedDate = new Date(rec.timestamp).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'short',
                  day: '2-digit',
                });
                const formattedTime = new Date(rec.timestamp).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                });

                return (
                  <tr
                    key={rec.id}
                    className="hover:bg-white/[0.03] transition-colors group"
                  >
                    <td className="py-3.5 pr-4 font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                      <span>{formattedDate}</span>
                      <span className="text-slate-500 mx-1.5">·</span>
                      <span className="text-slate-400">{formattedTime}</span>
                    </td>

                    <td className="py-3.5 px-4 max-w-[240px]">
                      <div className="truncate font-medium text-slate-200" title={rec.fileName}>
                        {rec.fileName}
                      </div>
                      <div className="text-xs font-mono text-slate-500">{rec.id}</div>
                    </td>

                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {rec.status === 'Completed' ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Completed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>Failed</span>
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-4 font-display font-semibold text-white whitespace-nowrap">
                      {rec.predictedClass}
                    </td>

                    <td className="py-3.5 px-4 text-right font-mono tabular-nums text-xs text-slate-300 whitespace-nowrap">
                      {rec.confidence !== null && rec.confidence !== undefined
                        ? `${rec.confidence.toFixed(2)}%`
                        : '—'}
                    </td>

                    <td className="py-3.5 pl-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspectedRecord(rec)}
                          aria-label={`Inspect record ${rec.id}`}
                          title="Inspect Details"
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>

                        <button
                          type="button"
                          onClick={() => onToggleSaveReport(rec.id)}
                          aria-label={rec.savedReport ? 'Unsave report' : 'Save report'}
                          title={rec.savedReport ? 'Saved Report' : 'Mark as Saved Report'}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
                        >
                          <Bookmark
                            className={`w-4 h-4 ${
                              rec.savedReport ? 'fill-red-400 text-red-400' : ''
                            }`}
                          />
                        </button>

                        {onDeleteRecord && !compact && (
                          <button
                            type="button"
                            onClick={() => onDeleteRecord(rec.id)}
                            aria-label={`Delete record ${rec.id}`}
                            title="Delete Record"
                            className="p-1.5 text-slate-400 hover:text-rose-400 rounded-lg hover:bg-white/10 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Record Inspection Modal */}
      {inspectedRecord && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="record-detail-title"
        >
          <div className="hemo-glass rounded-2xl max-w-lg w-full p-6 sm:p-7 border border-white/15">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/10">
              <div>
                <p className="text-xs font-mono text-slate-400">{inspectedRecord.id}</p>
                <h3
                  id="record-detail-title"
                  className="text-lg font-semibold text-white mt-0.5"
                >
                  Classification Report Summary
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectedRecord(null)}
                aria-label="Close inspection dialog"
                className="p-1 text-slate-400 hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4 text-sm">
              <p className="text-xs text-amber-200/90 bg-amber-950/30 border border-amber-500/25 rounded-xl p-3 leading-relaxed">
                Experimental research output — fingerprint-based blood-group prediction is not
                medically validated. Confirm blood group using a conventional laboratory test.
              </p>

              <div className="grid grid-cols-2 gap-4 py-3 border-b border-white/10">
                <div>
                  <p className="text-xs text-slate-400">Predicted Class</p>
                  <p className="text-2xl font-display font-bold text-white mt-0.5">
                    {inspectedRecord.predictedClass}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Model Confidence</p>
                  <p className="text-xl font-mono tabular-nums text-white mt-1">
                    {inspectedRecord.confidence !== null &&
                    inspectedRecord.confidence !== undefined
                      ? `${inspectedRecord.confidence.toFixed(2)}%`
                      : 'Not reported'}
                  </p>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Sample File</span>
                  <span className="font-mono text-slate-200 truncate max-w-[240px]">
                    {inspectedRecord.fileName}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Timestamp</span>
                  <span className="font-mono tabular-nums text-slate-200">
                    {new Date(inspectedRecord.timestamp).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Saved Status</span>
                  <span className="text-slate-200">
                    {inspectedRecord.savedReport ? 'Saved to Reports' : 'Standard Log'}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setInspectedRecord(null)}
                className="px-4 py-2 text-xs font-medium text-white bg-white/10 hover:bg-white/15 rounded-xl transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
