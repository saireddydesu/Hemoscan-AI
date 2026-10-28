import React, { useState, useRef, useEffect } from 'react';
import {
  Upload,
  Fingerprint,
  Trash2,
  ScanLine,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  ArrowLeft,
  Sliders,
  Download,
  Bookmark,
  FileImage,
} from 'lucide-react';
import sampleFingerprintImg from '../assets/images/biometric_fingerprint_sample_1793007380732.jpg';
import {
  getDisplayPredictEndpoint,
  runFingerprintPrediction,
  type FlaskIntegrationConfig,
} from '../services/predictionService';
import type { AnalysisRecord } from '../types';

interface FingerprintWorkspaceProps {
  userId: string;
  flaskConfig: FlaskIntegrationConfig;
  backendConnected: boolean;
  standaloneMode?: boolean;
  onAnalysisSuccess: (record: AnalysisRecord) => void;
  onToggleSaveReport: (recordId: string) => void;
  onNavigateDashboard: () => void;
  onNavigateSettings: () => void;
  onNotify: (type: 'success' | 'error' | 'info', title: string, description?: string) => void;
}

type AnalysisStage = 'idle' | 'scanning' | 'result' | 'error';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/x-ms-bmp'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.bmp'];
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const SCAN_PROGRESS_MESSAGES = [
  'Validating biometric image integrity and dermal ridge contrast…',
  'Packaging fingerprint scan as multipart/form-data (field: image)…',
  'Sending image to Render Flask backend POST /predict…',
  'Awaiting neural classification response from deployed model…',
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const FingerprintWorkspace: React.FC<FingerprintWorkspaceProps> = ({
  userId,
  flaskConfig,
  backendConnected,
  standaloneMode = false,
  onAnalysisSuccess,
  onToggleSaveReport,
  onNavigateDashboard,
  onNavigateSettings,
  onNotify,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [stage, setStage] = useState<AnalysisStage>('idle');
  const [progressIndex, setProgressIndex] = useState(0);
  const [activeResult, setActiveResult] = useState<AnalysisRecord | null>(null);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  const [loadingSample, setLoadingSample] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Revoke object URL on unmount or replacement
  useEffect(() => {
    return () => {
      if (previewUrl && previewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Cycle progress messages smoothly while scanning
  useEffect(() => {
    if (stage !== 'scanning') return;
    setProgressIndex(0);
    const interval = setInterval(() => {
      setProgressIndex((prev) =>
        prev < SCAN_PROGRESS_MESSAGES.length - 1 ? prev + 1 : prev
      );
    }, 850);
    return () => clearInterval(interval);
  }, [stage]);

  const validateAndApplyFile = (file: File) => {
    setUploadError(null);
    setPredictionError(null);

    const lowerName = file.name.toLowerCase();
    const validExt = ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext));
    const validMime = ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());

    if (!validExt && !validMime) {
      setUploadError(
        `Unsupported file format (${file.name}). Please upload a JPG, JPEG, PNG, or BMP fingerprint image.`
      );
      onNotify(
        'error',
        'Invalid Image Format',
        'Only JPG, JPEG, PNG, and BMP fingerprint scans are supported.'
      );
      return;
    }

    if (file.size === 0) {
      setUploadError('The selected image file is empty (0 bytes).');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(
        `File exceeds the 10.00 MB limit (${formatFileSize(file.size)}). Please select a smaller scan.`
      );
      onNotify('error', 'File Too Large', 'Maximum supported image size is 10 MB.');
      return;
    }

    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    const objectUrl = URL.createObjectURL(file);
    setSelectedFile(file);
    setPreviewUrl(objectUrl);
    setStage('idle');
    setActiveResult(null);
  };

  const handleLoadSampleScan = async () => {
    setLoadingSample(true);
    setUploadError(null);
    try {
      const response = await fetch(sampleFingerprintImg);
      const blob = await response.blob();
      const sampleFile = new File([blob], 'optical_whorl_scan_01.jpg', {
        type: 'image/jpeg',
      });
      validateAndApplyFile(sampleFile);
      onNotify(
        'info',
        'Sample Fingerprint Image Loaded',
        `Click "Analyze Fingerprint" to submit to ${getDisplayPredictEndpoint(flaskConfig)}.`
      );
    } catch {
      setUploadError('Could not load built-in reference fingerprint image.');
    } finally {
      setLoadingSample(false);
    }
  };

  const handleRemoveImage = () => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadError(null);
    setPredictionError(null);
    setActiveResult(null);
    setStage('idle');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleStartAnalysis = async () => {
    if (!selectedFile || !previewUrl) return;

    setStage('scanning');
    setPredictionError(null);

    const minScanDuration = new Promise((resolve) => setTimeout(resolve, 2200));

    try {
      const [prediction] = await Promise.all([
        runFingerprintPrediction(selectedFile, flaskConfig),
        minScanDuration,
      ]);

      const newRecord: AnalysisRecord = {
        id: `SCAN-${Date.now().toString(36).toUpperCase()}`,
        userId,
        fileName: selectedFile.name,
        fileSizeBytes: selectedFile.size,
        imagePreviewUrl: previewUrl,
        predictedClass: prediction.predictedClass,
        confidence: prediction.confidence,
        classProbabilities: prediction.classProbabilities,
        modelVersion: prediction.modelVersion || 'hemoscan_cnn.keras',
        experimental: true,
        notes:
          prediction.notice ||
          'Experimental research prediction — fingerprint-based blood-group classification is not medically validated. Confirm blood group using a conventional clinical laboratory test.',
        status: 'Completed',
        timestamp: new Date().toISOString(),
        savedReport: true,
      };

      setActiveResult(newRecord);
      setStage('result');
      onAnalysisSuccess(newRecord);
      onNotify(
        'success',
        'Classification Complete',
        `Predicted Class: ${prediction.predictedClass} (${
          prediction.confidence !== null ? `${prediction.confidence.toFixed(1)}%` : 'CNN output'
        })`
      );
    } catch (err) {
      await minScanDuration;
      const errMessage =
        err instanceof Error
          ? err.message
          : 'Unable to communicate with the /api/predict inference backend.';
      setPredictionError(errMessage);
      setStage('error');
      onNotify('error', 'Analysis Failed', 'Backend prediction could not be completed.');
    }
  };

  const handleExportResultJson = () => {
    if (!activeResult) return;
    const exportPayload = {
      reportId: activeResult.id,
      fileName: activeResult.fileName,
      predictedBloodGroup: activeResult.predictedClass,
      confidencePercent: activeResult.confidence,
      classProbabilities: activeResult.classProbabilities,
      modelVersion: activeResult.modelVersion || 'hemoscan_cnn.keras',
      experimental: true,
      medicalDisclaimer:
        activeResult.notes ||
        'Experimental research output — fingerprint-based blood-group prediction is not medically validated. Confirm blood group using a conventional clinical laboratory test.',
      timestamp: activeResult.timestamp,
      platform: 'HemoScan AI — Intelligent Blood Analysis System',
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${activeResult.id.toLowerCase()}_report.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('success', 'Report Downloaded', `Exported ${activeResult.id} as JSON.`);
  };

  return (
    <section className="hemo-glass rounded-2xl p-6 sm:p-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <h2 className="text-xl font-semibold text-white tracking-tight">
            Start New Analysis
          </h2>
          <p className="text-sm text-slate-300/80 mt-1">
            Upload a high-clarity dermal fingerprint scan (JPG, JPEG, PNG, or BMP) for blood group
            classification.
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400 shrink-0">
          <span>Accepted: JPG · JPEG · PNG · BMP</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums">RGB 224×224 · Max 10 MB</span>
        </div>
      </div>

      {/* Clear Experimental & Non-Clinical Research Disclosure */}
      <div className="mt-4 px-4 py-3 rounded-xl bg-amber-950/25 border border-amber-500/20 flex items-start gap-2.5 text-xs text-amber-200/90 leading-relaxed">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p>
          <span className="font-semibold text-amber-100">Experimental Research Disclosure:</span>{' '}
          Fingerprint-based blood-group classification is an academic machine-learning research
          demonstration and is <span className="underline underline-offset-2">not medically validated</span>.
          Never use these results for clinical decisions or transfusions; always confirm blood type
          with a conventional laboratory blood test.
        </p>
      </div>

      {/* Upload Error Alert */}
      {uploadError && (
        <div
          role="alert"
          className="mt-6 p-4 rounded-xl bg-red-950/55 border border-red-500/35 flex items-start gap-3 text-sm text-red-200"
        >
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-100">Upload Validation Error</p>
            <p className="text-xs text-red-200/90 mt-0.5 leading-relaxed">{uploadError}</p>
          </div>
        </div>
      )}

      {/* STAGE 1: IDLE (Dropzone OR Image Preview) */}
      {stage === 'idle' && (
        <div className="mt-6">
          {!selectedFile || !previewUrl ? (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) validateAndApplyFile(dropped);
              }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              role="button"
              tabIndex={0}
              aria-label="Upload fingerprint scan image"
              className={`relative overflow-hidden rounded-2xl border border-dashed p-8 sm:p-12 text-center cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
                isDragging
                  ? 'border-red-500 bg-red-950/25'
                  : 'border-white/15 hover:border-red-500/50 bg-[#080B14]/55 hover:bg-[#0B101D]/75'
              }`}
            >
              {/* Subtle Corner Scan Reticles */}
              <span className="pointer-events-none absolute top-4 left-4 w-5 h-5 border-t-2 border-l-2 border-red-500/45 rounded-tl" />
              <span className="pointer-events-none absolute top-4 right-4 w-5 h-5 border-t-2 border-r-2 border-red-500/45 rounded-tr" />
              <span className="pointer-events-none absolute bottom-4 left-4 w-5 h-5 border-b-2 border-l-2 border-red-500/45 rounded-bl" />
              <span className="pointer-events-none absolute bottom-4 right-4 w-5 h-5 border-b-2 border-r-2 border-red-500/45 rounded-br" />

              <input
                ref={fileInputRef}
                type="file"
                accept=".jpg,.jpeg,.png,.bmp,image/jpeg,image/png,image/bmp"
                onChange={(e) => {
                  const chosen = e.target.files?.[0];
                  if (chosen) validateAndApplyFile(chosen);
                }}
                className="hidden"
              />

              <div className="mx-auto w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-5 shadow-[0_0_32px_rgba(220,38,38,0.18)]">
                <Fingerprint className="w-8 h-8 text-red-400" />
              </div>

              <h3 className="text-base sm:text-lg font-medium text-white">
                Drag and drop fingerprint image here, or{' '}
                <span className="text-red-400 underline underline-offset-4">browse files</span>
              </h3>
              <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto">
                Position single-digit optical or capacitive sensor captures clearly centered for
                ridge feature extraction.
              </p>

              <div
                className="mt-6 flex flex-wrap items-center justify-center gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2.5 text-xs font-medium text-white hemo-crimson-btn rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Select Fingerprint Image</span>
                </button>

                <button
                  type="button"
                  disabled={loadingSample}
                  onClick={handleLoadSampleScan}
                  className="px-4 py-2.5 text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/12 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                >
                  <FileImage className="w-3.5 h-3.5 text-slate-300" />
                  <span>
                    {loadingSample ? 'Loading Sample…' : 'Load Sample Fingerprint Scan'}
                  </span>
                </button>
              </div>
            </div>
          ) : (
            /* Uploaded Fingerprint Preview Ready for Analysis */
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center pt-2">
              <div className="md:col-span-5 flex justify-center">
                <div className="relative w-56 h-56 sm:w-64 sm:h-64 rounded-2xl overflow-hidden border border-white/15 bg-[#05070D] shadow-2xl">
                  <img
                    src={previewUrl}
                    alt={`Uploaded fingerprint preview: ${selectedFile.name}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-white/10 rounded-2xl" />
                </div>
              </div>

              <div className="md:col-span-7 space-y-5">
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">Selected Biometric Frame</p>
                  <h3 className="text-lg font-semibold text-white truncate" title={selectedFile.name}>
                    {selectedFile.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono tabular-nums">
                    <span>{formatFileSize(selectedFile.size)}</span>
                    <span aria-hidden="true">·</span>
                    <span>{selectedFile.type || 'image/png'}</span>
                    <span aria-hidden="true">·</span>
                    <span>
                      {backendConnected
                        ? `Render API Ready (${getDisplayPredictEndpoint(flaskConfig)})`
                        : 'Render API Unverified'}
                    </span>
                  </div>
                </div>

                {!backendConnected && (
                  <p className="text-xs text-amber-300/90 leading-relaxed">
                    Note: Health check has not yet confirmed readiness. Clicking &ldquo;Analyze
                    Fingerprint&rdquo; will send a live request to{' '}
                    <span className="font-mono text-amber-200">
                      {getDisplayPredictEndpoint(flaskConfig)}
                    </span>{' '}
                    and will never fabricate a prediction.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleStartAnalysis}
                    className="px-5 py-3 text-sm font-medium text-white hemo-crimson-btn rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                  >
                    <ScanLine className="w-4 h-4" />
                    <span>Analyze Fingerprint</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="px-4 py-3 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <Trash2 className="w-4 h-4 text-slate-400" />
                    <span>Remove Image</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* STAGE 2: ELEGANT BIOMETRIC SCANNING ANIMATION */}
      {stage === 'scanning' && previewUrl && (
        <div
          role="status"
          aria-live="polite"
          className="mt-8 py-8 flex flex-col items-center justify-center text-center"
        >
          {/* Circular Scanner + Red Laser Sweep + Floating Micro-Particles */}
          <div className="relative w-60 h-60 flex items-center justify-center">
            {/* Outer Rotating Calibration Ring */}
            <svg
              className="absolute inset-0 w-full h-full animate-ring-slow pointer-events-none"
              viewBox="0 0 240 240"
              fill="none"
            >
              <circle
                cx="120"
                cy="120"
                r="114"
                stroke="rgba(220, 38, 38, 0.28)"
                strokeWidth="1.2"
                strokeDasharray="18 10 4 10"
              />
            </svg>

            {/* Counter-Rotating Inner Reticle */}
            <svg
              className="absolute inset-3 w-[calc(100%-1.5rem)] h-[calc(100%-1.5rem)] animate-ring-reverse pointer-events-none"
              viewBox="0 0 216 216"
              fill="none"
            >
              <circle
                cx="108"
                cy="108"
                r="102"
                stroke="rgba(255, 255, 255, 0.14)"
                strokeWidth="1"
                strokeDasharray="36 24"
              />
            </svg>

            {/* Circular Fingerprint Frame with Laser Line */}
            <div className="relative w-44 h-44 rounded-full overflow-hidden border border-red-500/45 bg-[#05070D] shadow-[0_0_48px_rgba(220,38,38,0.28)]">
              <img
                src={previewUrl}
                alt="Scanning fingerprint"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover opacity-80"
              />
              {/* Subtle Red Laser Line */}
              <div className="absolute inset-0 animate-laser-sweep pointer-events-none flex flex-col justify-center">
                <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-red-400 to-transparent shadow-[0_0_16px_3px_rgba(239,68,68,0.85)]" />
                <div className="h-10 w-full bg-gradient-to-b from-red-500/20 to-transparent" />
              </div>
            </div>
          </div>

          <h3 className="mt-7 text-xl font-semibold text-white tracking-tight">
            Analyzing Image…
          </h3>
          <p className="mt-2 text-sm text-slate-300 max-w-md min-h-[1.5rem]">
            {SCAN_PROGRESS_MESSAGES[progressIndex]}
          </p>

          {/* Subtle Step Progress Bar */}
          <div className="mt-5 w-64 h-1 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-red-600 to-rose-400 transition-transform duration-500 origin-left"
              style={{
                transform: `scaleX(${(progressIndex + 1) / SCAN_PROGRESS_MESSAGES.length})`,
              }}
            />
          </div>
        </div>
      )}

      {/* STAGE 3: ACTUAL BACKEND PREDICTION RESULT CARD */}
      {stage === 'result' && activeResult && (
        <div className="mt-7 pt-2">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Uploaded Image Preview */}
            <div className="lg:col-span-4 flex flex-col items-center">
              <div className="relative w-52 h-52 rounded-2xl overflow-hidden border border-emerald-500/30 bg-[#05070D] shadow-xl">
                {activeResult.imagePreviewUrl ? (
                  <img
                    src={activeResult.imagePreviewUrl}
                    alt={`Analyzed scan ${activeResult.fileName}`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Fingerprint className="w-12 h-12 text-slate-500" />
                  </div>
                )}
              </div>
              <p className="mt-3 text-xs text-slate-400 font-mono truncate max-w-[200px]">
                {activeResult.fileName}
              </p>
            </div>

            {/* Prediction Details */}
            <div className="lg:col-span-8 space-y-6">
              <div className="flex flex-wrap items-center gap-2 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span className="font-medium">
                  Live CNN Model Output ({activeResult.modelVersion || 'hemoscan_cnn.keras'})
                </span>
                <span className="text-slate-500" aria-hidden="true">
                  ·
                </span>
                <span className="text-amber-300 font-medium">Experimental · Not Medically Validated</span>
                <span className="text-slate-500" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums text-slate-400">
                  {new Date(activeResult.timestamp).toLocaleString()}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-4 border-y border-white/10">
                <div>
                  <p className="text-xs text-slate-400">Predicted Blood Group Class</p>
                  <p className="mt-1 text-4xl sm:text-5xl font-display font-bold text-white tracking-tight">
                    {activeResult.predictedClass}
                  </p>
                </div>

                <div>
                  <p className="text-xs text-slate-400">Model Confidence</p>
                  {activeResult.confidence !== null && activeResult.confidence !== undefined ? (
                    <div className="mt-1.5 space-y-2">
                      <p className="text-2xl sm:text-3xl font-mono font-semibold tabular-nums text-white">
                        {activeResult.confidence.toFixed(2)}
                        <span className="text-sm text-slate-400 ml-1">%</span>
                      </p>
                      <div className="w-full max-w-[200px] h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-red-600 to-rose-400 origin-left"
                          style={{
                            transform: `scaleX(${Math.min(Math.max(activeResult.confidence / 100, 0), 1)})`,
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-slate-400">
                      Not reported by connected model endpoint
                    </p>
                  )}
                </div>
              </div>

              {/* Optional Class Probability Distribution if Model Provides It */}
              {activeResult.classProbabilities && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-400">Class Probability Distribution</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono tabular-nums">
                    {Object.entries(activeResult.classProbabilities).map(([cls, pct]) => (
                      <div
                        key={cls}
                        className="p-2.5 rounded-lg bg-white/[0.03] border border-white/8 flex items-center justify-between"
                      >
                        <span className="text-slate-300 font-semibold">{cls}</span>
                        <span className="text-slate-400">{pct.toFixed(1)}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeResult.notes && (
                <p className="text-xs text-amber-200/85 bg-amber-950/20 border border-amber-500/20 rounded-xl px-3.5 py-2.5 leading-relaxed">
                  {activeResult.notes}
                </p>
              )}

              {/* Result Action Bar */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="px-4 py-2.5 text-sm font-medium text-white hemo-crimson-btn rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Analyze Another Image</span>
                </button>

                {standaloneMode && (
                  <button
                    type="button"
                    onClick={onNavigateDashboard}
                    className="px-4 py-2.5 text-sm font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/12 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Back to Dashboard</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onToggleSaveReport(activeResult.id);
                    setActiveResult({
                      ...activeResult,
                      savedReport: !activeResult.savedReport,
                    });
                  }}
                  className="px-4 py-2.5 text-sm font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/12 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <Bookmark
                    className={`w-4 h-4 ${
                      activeResult.savedReport ? 'fill-red-400 text-red-400' : 'text-slate-400'
                    }`}
                  />
                  <span>{activeResult.savedReport ? 'Report Saved' : 'Save Report'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportResultJson}
                  className="px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
                >
                  <Download className="w-4 h-4" />
                  <span>Export JSON</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STAGE 4: HONEST BACKEND ERROR & RETRY STATE */}
      {stage === 'error' && (
        <div role="alert" className="mt-7 py-6">
          <div className="max-w-2xl mx-auto p-6 rounded-2xl bg-red-950/35 border border-red-500/30 space-y-4">
            <div className="flex items-start gap-3.5">
              <AlertTriangle className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-white">
                  Backend Prediction Unavailable
                </h3>
                <p className="text-sm text-slate-300 leading-relaxed">
                  HemoScan AI does not fabricate blood group predictions or confidence scores.
                  Verify your Render Flask backend status in Settings, then retry the scan.
                </p>
                {predictionError && (
                  <p className="mt-2 text-xs font-mono text-rose-300/95 bg-black/35 p-3 rounded-lg border border-white/8 break-words">
                    {predictionError}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2 pl-0 sm:pl-9">
              <button
                type="button"
                onClick={handleStartAnalysis}
                className="px-4 py-2.5 text-sm font-medium text-white hemo-crimson-btn rounded-xl inline-flex items-center gap-2 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Retry Analysis</span>
              </button>

              <button
                type="button"
                onClick={onNavigateSettings}
                className="px-4 py-2.5 text-sm font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/12 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <Sliders className="w-4 h-4" />
                <span>Configure Flask Endpoint</span>
              </button>

              <button
                type="button"
                onClick={() => setStage('idle')}
                className="px-4 py-2.5 text-sm font-medium text-slate-300 hover:text-white bg-transparent hover:bg-white/5 rounded-xl inline-flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Image Preview</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
