import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';

export const HypothesisModal = () => {
  const { isAiHypothesisOpen, setIsAiHypothesisOpen, rollbackCanary } = useApp();
  const navigate = useNavigate();

  if (!isAiHypothesisOpen) return null;

  return (
    <div className="fixed inset-0 bg-[#030407]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-[#101116] border border-[#3A3E4D] max-w-2xl w-full p-4 rounded-xl shadow-2xl flex flex-col gap-3 font-mono">
        <div className="flex items-center justify-between border-b border-[#272a33] pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[24px] text-[#d4ff24]">psychology</span>
            <h3 className="text-base text-white font-bold tracking-tight">AI Root-Cause Diagnostic Report</h3>
          </div>
          <button 
            onClick={() => setIsAiHypothesisOpen(false)}
            className="p-1 rounded text-[#9296A3] hover:text-white hover:bg-[#171920] transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        <div className="p-3 bg-[#171920] rounded border border-[#272a33] space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono uppercase text-[#9296A3] font-semibold">
              Hypothesis Target: auth-gateway-v2 & payment-service
            </span>
            <span className="text-[11px] text-[#d4ff24] font-mono font-bold">Correlation Confidence: 94.2%</span>
          </div>
          <p className="text-[#e2e2e9] leading-relaxed">
            The sudden p99 latency spike (from 24ms to 412ms) immediately followed Canary Deploy <strong className="text-white font-mono">#1094</strong>. 
            Distributed tracing confirms that 88% of slow traces stall inside the HikariCP database pool acquisition lock, causing cascading gRPC thread starvation to upstream callers like <strong className="text-white font-mono">checkout-api</strong>.
          </p>
        </div>

        <div className="space-y-1.5 text-xs">
          <span className="text-[10px] uppercase text-[#9296A3] font-mono font-semibold">Recommended Remediation:</span>
          <div className="p-3 bg-[#171920] border border-[#272a33] rounded flex items-center justify-between gap-3">
            <div className="flex flex-col">
              <span className="font-semibold text-white">Execute Instant Canary Depromotion</span>
              <span className="text-[11px] text-[#9296A3] font-mono">Roll back traffic from canary-88a2 to stable-9c12 (takes &lt; 4s)</span>
            </div>
            <button 
              onClick={() => {
                rollbackCanary('dep-1094');
                setIsAiHypothesisOpen(false);
                navigate('/deployments');
              }}
              className="px-3 py-1.5 rounded bg-[#d4ff24] text-[#030407] font-semibold text-xs hover:bg-[#e1ff59] transition-all shadow-[0_0_10px_rgba(212,255,36,0.25)] shrink-0"
            >
              Confirm Depromote
            </button>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-[#272a33]">
          <button 
            onClick={() => setIsAiHypothesisOpen(false)}
            className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-[#e2e2e9] text-xs hover:bg-[#22252e] transition-colors"
          >
            Dismiss
          </button>
          <button 
            onClick={() => {
              setIsAiHypothesisOpen(false);
              navigate('/incidents/INC-4921');
            }}
            className="px-3 py-1.5 rounded bg-[#1558c9] text-white text-xs font-semibold hover:bg-[#124ab0] transition-colors flex items-center gap-1"
          >
            <span>Jump to Investigation</span>
            <span className="material-symbols-outlined text-[15px]">open_in_new</span>
          </button>
        </div>
      </div>
    </div>
  );
};

