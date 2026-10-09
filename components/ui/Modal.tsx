import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'md' | 'lg';
  /** Long forms opt out of closing on a backdrop tap, so typed values aren't lost. */
  closeOnBackdrop?: boolean;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children, size = 'md', closeOnBackdrop = true }) => {
  const titleId = useId();
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEsc);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEsc);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 animate-fade-in sm:items-center sm:p-4"
      onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) onClose(); }}
    >
      {/* Bottom sheet on phones, centered dialog on larger screens */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line bg-card animate-slide-up sm:rounded-2xl ${size === 'lg' ? 'sm:max-w-xl' : 'sm:max-w-md'}`}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-5 py-3">
          <h3 id={titleId} className="text-base font-medium text-ink">{title}</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 rounded-full p-2 text-ink-3 transition hover:bg-subtle hover:text-ink">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
};
