import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ isOpen, onClose, title, children }) => {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      {/* Bottom Sheet on Mobile, Centered Modal on Desktop */}
      <div className="bg-zinc-900 rounded-t-xl sm:rounded-xl border-t sm:border border-zinc-800 w-full max-w-md overflow-hidden animate-slide-up max-h-[90vh] flex flex-col shadow-2xl">
        <div className="flex items-center justify-between p-4 border-b border-zinc-800 bg-zinc-900/50 shrink-0">
          <h3 className="text-sm font-bold text-zinc-200 uppercase tracking-wide">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-zinc-800 transition-colors text-zinc-500 hover:text-zinc-300">
            <X size={20} />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
};