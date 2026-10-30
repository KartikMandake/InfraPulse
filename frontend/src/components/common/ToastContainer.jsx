import React from 'react';
import { useApp } from '../../context/AppContext.jsx';

export const ToastContainer = () => {
  const { toasts, removeToast } = useApp();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
      {toasts.map((toast) => {
        const isSuccess = toast.type === 'success';
        const isError = toast.type === 'error';
        const isWarning = toast.type === 'warning';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3 rounded-lg border shadow-xl flex items-start gap-3 backdrop-blur-md transition-all font-mono text-xs ${
              isSuccess ? 'bg-[#101116]/95 border-[#50d890]/50 text-white' :
              isError ? 'bg-[#101116]/95 border-[#ff5364]/50 text-white' :
              isWarning ? 'bg-[#101116]/95 border-[#ffb547]/50 text-white' :
              'bg-[#101116]/95 border-[#1558c9]/50 text-white'
            }`}
          >
            <span className={`material-symbols-outlined text-[18px] shrink-0 ${
              isSuccess ? 'text-[#50d890]' :
              isError ? 'text-[#ff5364]' :
              isWarning ? 'text-[#ffb547]' :
              'text-[#1558c9]'
            }`}>
              {isSuccess ? 'check_circle' : isError ? 'error' : isWarning ? 'warning' : 'info'}
            </span>

            <div className="flex-1 min-w-0">
              <div className="font-bold text-white text-xs truncate">{toast.title}</div>
              {toast.description && (
                <div className="text-[11px] text-[#9296A3] mt-0.5 leading-normal">{toast.description}</div>
              )}
            </div>

            <button
              onClick={() => removeToast(toast.id)}
              className="text-[#5A5E6B] hover:text-white transition-colors shrink-0"
            >
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        );
      })}
    </div>
  );
};

