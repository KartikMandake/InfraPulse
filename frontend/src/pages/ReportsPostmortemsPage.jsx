import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import {copyText} from '../utils/operatorFeedback.js';

export const ReportsPostmortemsPage = () => {
  const { postmortems, addToast } = useApp();
  const [selectedPostId, setSelectedPostId] = useState(postmortems[0]?.id || 'pm-01');
  const [copied, setCopied] = useState(false);
  const [localPostmortems, setLocalPostmortems] = useState(postmortems);

  const report = localPostmortems.find(p => p.id === selectedPostId) || localPostmortems[0] || { preventativeActions: [] };

  const handleCopyMarkdown = async () => {
    const md = `# ${report.title}\n\n**Author:** ${report.author}\n**Date:** ${report.createdAt}\n**Impact Duration:** ${report.impactDuration}\n\n## Root Cause\n${report.rootCause}\n\n## Action Items\n` + 
      report.preventativeActions?.map(a => `- [${a.status}] (${a.priority}) ${a.description} - Owner: ${a.owner}`).join('\n');
    const result=await copyText(md);
    if(!result.ok){setCopied(false);addToast({type:'error',title:'Export could not be copied',description:result.error});return;}
    setCopied(true);
    addToast({
      type: 'success',
      title: 'Postmortem Exported',
      description: 'Markdown draft copied to clipboard.'
    });
    setTimeout(() => setCopied(false), 1500);
  };

  const toggleActionStatus = (actionId) => {
    setLocalPostmortems(prev => prev.map(p => {
      if (p.id !== report.id) return p;
      return {
        ...p,
        preventativeActions: p.preventativeActions.map(a => {
          if (a.id !== actionId) return a;
          const nextStatus = a.status === 'open' ? 'in_progress' : a.status === 'in_progress' ? 'completed' : 'open';
          return { ...a, status: nextStatus };
        })
      };
    }));
    addToast({
      type: 'info',
      title: 'Action Item Status Updated',
      description: `Task ${actionId} marked updated.`
    });
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#1558C9]">
            <span className="material-symbols-outlined text-[20px]">description</span>
          </div>
          <div>
            <h1 className="text-xl text-white font-semibold tracking-tight">Reports & Blameless Postmortems</h1>
            <p className="text-xs text-[#9296A3]">
              Automated timeline reconstruction, causal factor attribution, and prevention action items tracking.
            </p>
          </div>
        </div>

        <button
          onClick={handleCopyMarkdown}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#d4ff24] text-[#030407] font-bold text-xs hover:bg-[#e1ff59] transition-colors"
        >
          <span className="material-symbols-outlined text-[15px]">content_copy</span>
          <span>{copied ? 'Copied Markdown!' : 'Export Postmortem'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 text-xs">
        {/* Reports Navigation (4 cols) */}
        <div className="lg:col-span-4 bg-[#101116] border border-[#272a33] rounded-xl p-3 flex flex-col gap-2">
          <span className="text-[10px] text-[#9296A3] uppercase pb-1 border-b border-[#272a33]">
            Postmortem Drafts ({localPostmortems.length})
          </span>
          {localPostmortems.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedPostId(p.id)}
              className={`p-3 rounded-lg border cursor-pointer flex flex-col gap-1 transition-colors ${
                p.id === report.id ? 'bg-[#171920] border-[#d4ff24]' : 'bg-[#030407] border-[#272a33] hover:border-[#3A3E4D]'
              }`}
            >
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#d4ff24] font-bold">{p.id}</span>
                <span className="text-[#9296A3]">{p.createdAt}</span>
              </div>
              <div className="font-semibold text-white text-xs">{p.title}</div>
              <div className="text-[10px] text-[#5A5E6B] mt-1">{p.author} • Impact: {p.impactDuration}</div>
            </div>
          ))}
        </div>

        {/* Report Content Inspector (8 cols) */}
        <div className="lg:col-span-8 bg-[#101116] border border-[#272a33] rounded-xl p-4 flex flex-col gap-3 shadow-md">
          <div className="border-b border-[#272a33] pb-3">
            <span className="text-xs px-2 py-0.5 rounded bg-[#1558c9]/30 text-[#b1c5ff] font-bold">{report.id}</span>
            <h2 className="text-base font-bold text-white mt-1.5">{report.title}</h2>
            <div className="flex flex-wrap items-center gap-4 text-xs text-[#9296A3] mt-2">
              <span>Author: <strong className="text-white">{report.author}</strong></span>
              <span>•</span>
              <span>Incident: <strong className="text-[#ff5364]">{report.incidentId}</strong></span>
              <span>•</span>
              <span>Impact Duration: <strong className="text-white">{report.impactDuration}</strong></span>
            </div>
          </div>

          {/* Root cause section */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold text-[#d4ff24] uppercase">Root Cause Analysis</h3>
            <p className="p-3 bg-[#030407] border border-[#272a33] rounded-lg text-xs text-[#e2e2e9] leading-relaxed">
              {report.rootCause}
            </p>
          </div>

          {/* Action items */}
          <div className="space-y-1.5">
            <h3 className="text-xs font-bold text-white uppercase">Preventative Action Items (Click badge to cycle status)</h3>
            <div className="space-y-2">
              {report.preventativeActions?.map(act => (
                <div key={act.id} className="p-2.5 rounded bg-[#030407] border border-[#272a33] flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                      act.priority === 'P0' ? 'bg-[#93000a] text-[#ffdad6]' : 'bg-[#171920] text-[#ffb547]'
                    }`}>
                      {act.priority}
                    </span>
                    <span className="text-white">{act.description}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[#9296A3]">
                    <span>Owner: <strong className="text-white">{act.owner}</strong></span>
                    <button
                      onClick={() => toggleActionStatus(act.id)}
                      className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold transition-colors ${
                        act.status === 'completed' ? 'bg-[#50d890]/20 text-[#50d890]' :
                        act.status === 'in_progress' ? 'bg-[#1558c9]/30 text-[#b1c5ff]' : 'bg-[#171920] text-[#9296A3] hover:text-white'
                      }`}
                    >
                      {act.status}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

