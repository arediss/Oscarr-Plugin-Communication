import { useRef } from 'react';
import { X } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  message: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'primary';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const CONFIRM_BUTTON: Record<NonNullable<Props['variant']>, string> = {
  danger:  'btn-danger',
  warning: 'btn-warning',
  primary: 'btn-primary',
};

export function ConfirmModal({
  open,
  title,
  message,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  const mouseDownOnBackdropRef = useRef(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => { mouseDownOnBackdropRef.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (busy) return;
        if (e.target !== e.currentTarget) return;
        if (!mouseDownOnBackdropRef.current) return;
        onCancel();
      }}
    >
      <div
        className="card w-full max-w-sm mx-4 p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-base font-bold text-ndp-text">{title}</h3>
          <button
            onClick={() => !busy && onCancel()}
            className="p-1 -mt-1 -mr-1 rounded-lg text-ndp-text-dim hover:text-ndp-text hover:bg-white/5 transition-colors flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-ndp-text-muted mt-2">{message}</p>
        {description && (
          <p className="text-xs text-ndp-text-dim mt-2">{description}</p>
        )}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={() => !busy && onCancel()}
            disabled={busy}
            className="btn-secondary text-sm disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={`${CONFIRM_BUTTON[variant]} text-sm disabled:opacity-50`}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
