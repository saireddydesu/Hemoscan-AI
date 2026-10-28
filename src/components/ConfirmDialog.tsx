import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="hemo-glass rounded-2xl max-w-md w-full p-6 border border-white/12">
        <div className="flex items-start justify-between gap-4">
          <h3 id="confirm-dialog-title" className="text-lg font-semibold text-white">
            {title}
          </h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2.5 text-sm text-slate-300 leading-relaxed">{description}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 text-sm font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-colors whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2.5 text-sm font-medium text-white rounded-xl transition-all whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 ${
              destructive
                ? 'hemo-crimson-btn'
                : 'bg-slate-800 hover:bg-slate-700 border border-white/15'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
