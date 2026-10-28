import React from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import type { ToastMessage } from '../types';

interface ToastContainerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-[calc(100vw-2.5rem)] pointer-events-none"
    >
      {toasts.map((toast) => {
        const Icon =
          toast.type === 'success'
            ? CheckCircle2
            : toast.type === 'error'
              ? AlertCircle
              : Info;
        const iconTone =
          toast.type === 'success'
            ? 'text-emerald-400'
            : toast.type === 'error'
              ? 'text-rose-400'
              : 'text-sky-400';

        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto hemo-glass rounded-xl p-4 flex items-start gap-3 shadow-2xl border border-white/12 transition-all duration-150"
          >
            <Icon className={`w-5 h-5 shrink-0 mt-0.5 ${iconTone}`} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-[#F8FAFC] leading-snug">{toast.title}</p>
              {toast.description && (
                <p className="text-xs text-slate-300/85 mt-1 leading-relaxed">
                  {toast.description}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
};
