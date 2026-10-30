import React from 'react';
import { useApp } from '../../context/AppContext.jsx';

export const SimulationNotice = () => {
  const { resetAllDemoData, backendConnected } = useApp();

  return (
    <div className="w-full bg-[#101116] border-b border-[#272a33] px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-[#9296A3] font-mono z-40">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full bg-[#ffb547] animate-pulse"></span>
        <span className="text-white font-semibold uppercase tracking-wider text-[10px]">Simulation Environment</span>
        <span className="text-[#5A5E6B] hidden sm:inline">|</span>
        <span className="hidden sm:inline">
          Deterministic mock telemetry & Express REST backend. Not connected to live production clusters.
        </span>
      </div>

      <div className="flex items-center gap-3">
        <span className={`text-[10px] flex items-center gap-1 ${backendConnected ? 'text-[#50d890]' : 'text-[#ffb547]'}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
          <span>{backendConnected ? 'REST API Connected (port 5000)' : 'API Proxy Initializing'}</span>
        </span>
        <button
          onClick={resetAllDemoData}
          className="text-[10px] text-[#b1c5ff] hover:underline flex items-center gap-1"
          title="Reset services, incidents, and chaos experiments to initial baseline"
        >
          <span className="material-symbols-outlined text-[13px]">refresh</span>
          <span>Reset Demo State</span>
        </button>
      </div>
    </div>
  );
};

