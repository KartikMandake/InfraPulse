import React from 'react';

export const EmptyState = ({
  icon = 'inbox',
  title = 'No Data Available',
  description = 'No records match the current filter criteria.',
  actionText,
  onAction
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 bg-[#101116] border border-[#272a33] rounded-xl text-center space-y-3">
      <div className="w-12 h-12 rounded-full bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#9296A3]">
        <span className="material-symbols-outlined text-[24px]">{icon}</span>
      </div>
      <div className="space-y-1 max-w-sm">
        <h4 className="text-sm font-bold text-white tracking-tight">{title}</h4>
        <p className="text-xs text-[#9296A3] leading-relaxed">{description}</p>
      </div>
      {actionText && onAction && (
        <button
          onClick={onAction}
          className="mt-2 px-3 py-1.5 rounded bg-[#1558c9] text-white text-xs font-semibold hover:bg-[#124ab0] transition-colors"
        >
          {actionText}
        </button>
      )}
    </div>
  );
};

