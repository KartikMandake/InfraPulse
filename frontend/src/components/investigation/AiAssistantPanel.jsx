import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api.js';

const QUICK_QUESTIONS = [
  'Why is this service ranked first?',
  'Which signals support this hypothesis?',
  'What evidence contradicts this hypothesis?',
  'Could the recent deployment be related?',
  'What should I investigate next?'
];

export const AiAssistantPanel = ({ incidentId, topHypothesis, onSelectEvidence }) => {
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [error, setError] = useState(null);
  const chatBottomRef = useRef(null);

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  // Load active conversation history for this incident
  useEffect(() => {
    let isMounted = true;
    const fetchHistory = async () => {
      try {
        const res = await api.getAssistantConversations(incidentId);
        if (isMounted && res.success && res.data?.length > 0) {
          const latestConv = res.data[0];
          setConversationId(latestConv.id);
          const detailRes = await api.getConversationById(latestConv.id);
          if (isMounted && detailRes.success && detailRes.data?.messages) {
            setMessages(detailRes.data.messages);
          }
        }
      } catch (err) {
        console.warn('[AiAssistant] Failed to load previous conversation history:', err.message);
      }
    };
    fetchHistory();
    return () => { isMounted = false; };
  }, [incidentId]);

  const handleSend = async (textToSend) => {
    const text = textToSend || inputMessage;
    if (!text || !text.trim() || isLoading) return;

    setInputMessage('');
    setError(null);

    // Optimistic user message
    const tempUserMsg = {
      id: `temp-${Date.now()}`,
      senderRole: 'user',
      content: text,
      createdAt: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);
    setIsLoading(true);

    try {
      const res = await api.askAssistant(incidentId, {
        message: text,
        conversationId
      });

      if (res.success && res.data) {
        setConversationId(res.data.conversationId);
        setMessages(prev => [...prev.filter(m => m.id !== tempUserMsg.id), tempUserMsg, res.data.message]);
      } else {
        throw new Error(res.error || 'Failed to receive analysis.');
      }
    } catch (err) {
      console.error('[AiAssistant] Query error:', err);
      setError(err.message || 'AI assistant service temporarily unreachable.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-[#101116] border border-[#272a33] rounded-xl flex flex-col h-[580px] shadow-sm font-mono text-xs">
      {/* Assistant Header */}
      <div className="p-3 border-b border-[#272a33] flex items-center justify-between bg-[#171920]/60 rounded-t-xl">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[#1558C9]/20 border border-[#1558C9]/40 flex items-center justify-center text-[#b1c5ff]">
            <span className="material-symbols-outlined text-[16px]">smart_toy</span>
          </div>
          <div>
            <h3 className="font-bold text-white text-xs">AI Investigation Assistant</h3>
            <span className="text-[10px] text-[#9296A3]">Evidence-Grounded Diagnostic Reasoning</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[9px] bg-[#d4ff24]/10 text-[#d4ff24] border border-[#d4ff24]/30 font-bold uppercase">
            RCA Grounded
          </span>
        </div>
      </div>

      {/* Suggested Quick Questions */}
      <div className="p-2 border-b border-[#272a33] bg-[#030407]/40 flex items-center gap-1.5 overflow-x-auto text-[10px]">
        <span className="text-[#9296A3] shrink-0">Inquire:</span>
        {QUICK_QUESTIONS.map((q, idx) => (
          <button
            key={idx}
            disabled={isLoading}
            onClick={() => handleSend(q)}
            className="px-2 py-1 rounded bg-[#171920] border border-[#272a33] text-[#b1c5ff] hover:bg-[#22252e] hover:border-[#1558C9]/50 whitespace-nowrap transition-colors shrink-0"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3.5 bg-[#030407]/20">
        {messages.length === 0 && !isLoading && (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-[#9296A3] space-y-2">
            <span className="material-symbols-outlined text-[32px] text-[#1558C9]/60">chat</span>
            <p className="text-xs text-white font-medium">Ask questions about this incident</p>
            <p className="text-[11px] text-[#9296A3] max-w-sm">
              The AI assistant analyzes deterministic hypotheses, cross-references telemetry, evaluates contradictory signals, and recommends safe diagnostic steps.
            </p>
          </div>
        )}

        {messages.map((msg, i) => {
          const isUser = msg.senderRole === 'user';
          const structured = msg.structuredResponse;

          return (
            <div key={msg.id || i} className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[92%] rounded-xl p-3 border leading-relaxed ${
                isUser
                  ? 'bg-[#1558C9]/20 border-[#1558C9]/40 text-white'
                  : 'bg-[#101116] border-[#272a33] text-[#e2e2e9]'
              }`}>
                {/* Message Header */}
                <div className="flex items-center justify-between text-[10px] text-[#9296A3] mb-1.5 pb-1 border-b border-[#272a33]/60">
                  <span className="font-bold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[12px]">
                      {isUser ? 'person' : 'smart_toy'}
                    </span>
                    {isUser ? 'Responder' : 'InfraPulse Assistant'}
                  </span>
                  <span>{msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                </div>

                {/* Body Content */}
                <p className="text-xs whitespace-pre-wrap">{msg.content}</p>

                {/* Structured Sections for Assistant Replies */}
                {!isUser && structured && (
                  <div className="mt-3 pt-2.5 border-t border-[#272a33] space-y-2.5">
                    {/* Supporting Signals */}
                    {structured.supportingSignals?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-[#50d890] uppercase flex items-center gap-1 mb-1">
                          <span className="material-symbols-outlined text-[12px]">check_circle</span>
                          <span>Supporting Telemetry Signals:</span>
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[#e2e2e9]">
                          {structured.supportingSignals.map((s, idx) => <li key={idx}>{s}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Contradictory Signals */}
                    {structured.contradictorySignals?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-[#ff5364] uppercase flex items-center gap-1 mb-1">
                          <span className="material-symbols-outlined text-[12px]">warning</span>
                          <span>Contradictory / Inhibiting Evidence:</span>
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-[11px] text-[#ffdad6]">
                          {structured.contradictorySignals.map((c, idx) => <li key={idx}>{c}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Diagnostic Uncertainties */}
                    {structured.uncertainties?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-[#ffb547] uppercase flex items-center gap-1 mb-1">
                          <span className="material-symbols-outlined text-[12px]">help_outline</span>
                          <span>Uncertainties & Data Gaps:</span>
                        </span>
                        <ul className="list-disc list-inside space-y-0.5 text-[10px] text-[#9296A3]">
                          {structured.uncertainties.map((u, idx) => <li key={idx}>{u}</li>)}
                        </ul>
                      </div>
                    )}

                    {/* Suggested Diagnostics Cards */}
                    {structured.suggestedDiagnostics?.length > 0 && (
                      <div>
                        <span className="text-[10px] font-bold text-[#d4ff24] uppercase flex items-center gap-1 mb-1.5">
                          <span className="material-symbols-outlined text-[12px]">biotech</span>
                          <span>Suggested Read-Only Diagnostic Checks:</span>
                        </span>
                        <div className="space-y-1.5">
                          {structured.suggestedDiagnostics.map((diag, idx) => (
                            <div key={idx} className="p-2 rounded bg-[#030407] border border-[#272a33] text-[10px] space-y-1">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-white">{diag.action}</span>
                                <span className="px-1.5 py-0.2 rounded bg-[#171920] text-[#b1c5ff] font-mono">{diag.service}</span>
                              </div>
                              <p className="text-[#9296A3]">{diag.reason}</p>
                              <div className="text-[#5A5E6B] italic">Expected gain: {diag.expectedInformationGained}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Evidence References Pills */}
                    {structured.referencedEvidence?.length > 0 && (
                      <div className="pt-1 flex flex-wrap items-center gap-1.5 text-[9px]">
                        <span className="text-[#9296A3]">Referenced Evidence:</span>
                        {structured.referencedEvidence.map((evId, idx) => (
                          <button
                            key={idx}
                            onClick={() => onSelectEvidence && onSelectEvidence(evId)}
                            className="px-1.5 py-0.5 rounded bg-[#1558C9]/20 hover:bg-[#1558C9]/40 border border-[#1558C9]/40 text-[#b1c5ff] font-mono transition-colors"
                            title="Click to view corresponding evidence"
                          >
                            #{evId}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Loading Spinner */}
        {isLoading && (
          <div className="flex items-center gap-2 p-3 bg-[#101116] border border-[#272a33] rounded-xl text-xs text-[#9296A3] w-max">
            <span className="material-symbols-outlined text-[18px] animate-spin text-[#d4ff24]">sync</span>
            <span>Reasoning across deterministic RCA hypotheses and telemetry...</span>
          </div>
        )}

        {/* Error notification */}
        {error && (
          <div className="p-2.5 rounded-lg bg-[#ff5364]/10 border border-[#ff5364]/30 text-[#ff5364] text-xs flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px]">error</span>
              <span>{error}</span>
            </div>
            <button
              onClick={() => handleSend(messages[messages.length - 1]?.content)}
              className="text-[10px] font-bold hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        <div ref={chatBottomRef} />
      </div>

      {/* Input Bar */}
      <div className="p-2.5 border-t border-[#272a33] bg-[#101116] rounded-b-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            placeholder="Ask about this incident or top hypothesis..."
            disabled={isLoading}
            className="flex-1 bg-[#030407] border border-[#272a33] rounded-lg px-3 py-2 text-xs text-white placeholder-[#5A5E6B] focus:outline-none focus:border-[#d4ff24] transition-colors"
          />
          <button
            type="submit"
            disabled={isLoading || !inputMessage.trim()}
            className="px-3 py-2 rounded-lg bg-[#d4ff24] text-[#030407] font-bold text-xs hover:bg-[#e1ff59] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
          >
            <span>Ask</span>
            <span className="material-symbols-outlined text-[14px]">send</span>
          </button>
        </form>
      </div>
    </div>
  );
};

