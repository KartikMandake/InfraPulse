import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';

export const CommandPalette = () => {
  const { isCommandPaletteOpen, setIsCommandPaletteOpen, services, rollbackCanary } = useApp();
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (isCommandPaletteOpen) {
      setQuery('');
    }
  }, [isCommandPaletteOpen]);

  if (!isCommandPaletteOpen) return null;

  const filteredServices = services.filter(s => 
    s.name.toLowerCase().includes(query.toLowerCase()) || 
    s.namespace.toLowerCase().includes(query.toLowerCase())
  );

  const quickNav = [
    { label: 'Active SEV-1 Incident Deep Investigation', path: '/incidents/INC-4921', icon: 'emergency' },
    { label: 'Services Mesh Topology Map', path: '/services', icon: 'hub' },
    { label: 'Deployments Canary Rollbacks', path: '/deployments', icon: 'rocket_launch' },
    { label: 'Runbook Automation Console', path: '/runbooks', icon: 'play_circle' },
    { label: 'Alerts & PagerDuty Center', path: '/alerts', icon: 'notifications_active' },
    { label: 'Distributed Tracing Explorer', path: '/telemetry', icon: 'query_stats' },
  ].filter(item => item.label.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-[#030407]/80 backdrop-blur-sm z-50 flex items-start justify-center pt-20 p-4 font-mono">
      <div 
        className="bg-[#101116] border border-[#3A3E4D] w-full max-w-xl rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-[#272a33] gap-3">
          <span className="material-symbols-outlined text-[20px] text-[#9296A3]">search</span>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search commands, services, or jump to route..."
            autoFocus
            className="w-full bg-transparent text-white text-xs placeholder-[#5A5E6B] outline-none"
          />
          <button
            onClick={() => setIsCommandPaletteOpen(false)}
            className="text-[11px] px-1.5 py-0.5 rounded bg-[#171920] border border-[#272a33] text-[#9296A3] hover:text-white"
          >
            ESC
          </button>
        </div>

        {/* Results List */}
        <div className="max-h-80 overflow-y-auto p-2 space-y-3 text-xs">
          {/* Quick Actions */}
          <div>
            <div className="px-2 py-1 text-[10px] text-[#5A5E6B] uppercase font-bold tracking-wider">
              Navigation & Jump
            </div>
            <div className="space-y-0.5">
              {quickNav.map((action, idx) => (
                <div
                  key={idx}
                  onClick={() => {
                    setIsCommandPaletteOpen(false);
                    navigate(action.path);
                  }}
                  className="flex items-center justify-between px-3 py-2 rounded hover:bg-[#171920] cursor-pointer text-[#e2e2e9] hover:text-white transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="material-symbols-outlined text-[16px] text-[#1558C9]">{action.icon}</span>
                    <span>{action.label}</span>
                  </div>
                  <span className="text-[10px] text-[#5A5E6B]">Jump</span>
                </div>
              ))}
            </div>
          </div>

          {/* Filtered Services */}
          {filteredServices.length > 0 && (
            <div>
              <div className="px-2 py-1 text-[10px] text-[#5A5E6B] uppercase font-bold tracking-wider">
                Services ({filteredServices.length})
              </div>
              <div className="space-y-0.5">
                {filteredServices.slice(0, 5).map(service => (
                  <div
                    key={service.id}
                    onClick={() => {
                      setIsCommandPaletteOpen(false);
                      navigate(`/services/${service.id}`);
                    }}
                    className="flex items-center justify-between px-3 py-2 rounded hover:bg-[#171920] cursor-pointer text-[#e2e2e9] hover:text-white transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className={`w-2 h-2 rounded-full ${
                        service.status === 'nominal' ? 'bg-[#50d890]' :
                        service.status === 'degraded' ? 'bg-[#ffb547]' : 'bg-[#ff5364]'
                      }`} />
                      <span className="font-semibold">{service.name}</span>
                      <span className="text-[10px] text-[#5A5E6B]">({service.namespace})</span>
                    </div>
                    <span className="text-[10px] text-[#9296A3]">{service.latencyP99}ms P99</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quick Canary Rollback Trigger */}
          <div className="p-2 border-t border-[#272a33]">
            <button
              onClick={() => {
                rollbackCanary('dep-1094');
                setIsCommandPaletteOpen(false);
                navigate('/deployments');
              }}
              className="w-full flex items-center justify-between px-3 py-2 rounded bg-[#ff5364]/10 border border-[#ff5364]/30 text-[#ff5364] hover:bg-[#ff5364]/20 transition-colors text-xs font-bold"
            >
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px]">undo</span>
                <span>Emergency Rollback: Canary dep-1094 (payment-service)</span>
              </div>
              <span className="text-[10px] uppercase font-normal">Immediate Action</span>
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="p-2 bg-[#030407] border-t border-[#272a33] text-[10px] text-[#5A5E6B] flex items-center justify-between px-3">
          <span>Navigate with arrows, select with Enter</span>
          <span>InfraPulse Global Command Matrix</span>
        </div>
      </div>
    </div>
  );
};

