import React, { useState } from 'react';
import { useApp } from '../../context/AppContext.jsx';
import { useAuth, DEMO_CREDENTIALS } from '../../context/AuthContext.jsx';

export const TopHeader = () => {
  const { 
    cluster, setCluster, 
    environment, setEnvironment, 
    timeRange, setTimeRange,
    setIsAiHypothesisOpen,
    setIsCommandPaletteOpen,
    isMobileSidebarOpen,
    setIsMobileSidebarOpen
  } = useApp();

  const { user, role, switchDemoUser, logout } = useAuth();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);

  const roleBadgeColors = {
    admin: 'bg-[#1558c9]/20 text-[#4c87f4] border-[#1558c9]/50',
    responder: 'bg-[#d4ff24]/10 text-[#d4ff24] border-[#d4ff24]/40',
    viewer: 'bg-[#272a33] text-[#9296A3] border-[#3A3E4D]'
  };

  return (
    <header className="h-14 border-b border-[#272a33] bg-[#030407]/90 backdrop-blur-md px-3 sm:px-4 flex items-center justify-between sticky top-0 z-30 font-mono text-xs">
      {/* Mobile Drawer Trigger & Cluster Selector */}
      <div className="flex min-w-0 items-center gap-1 sm:gap-3">
        <button
          onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
          className="md:hidden p-1.5 rounded text-[#9296A3] hover:text-white hover:bg-[#171920] transition-colors"
          title="Toggle Navigation Menu"
        >
          <span className="material-symbols-outlined text-[20px]">menu</span>
        </button>

        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[#d4ff24] animate-ping" />
          <select 
            value={cluster} 
            onChange={(e) => setCluster(e.target.value)}
            className="max-w-[130px] sm:max-w-none min-w-0 bg-[#101116] border border-[#272a33] rounded px-2 py-1 text-white font-semibold outline-none hover:border-[#3A3E4D] transition-colors cursor-pointer text-xs"
          >
            <option value="prod-k8s-mesh">prod-k8s-mesh (us-east-1)</option>
            <option value="eu-k8s-mesh">eu-k8s-mesh (eu-central-1)</option>
            <option value="staging-k8s">staging-mesh (us-west-2)</option>
          </select>
        </div>

        {/* Environment Pill */}
        <div className="hidden lg:flex items-center bg-[#101116] border border-[#272a33] rounded p-0.5 text-[11px]">
          {(['Production', 'Staging', 'Canary']).map((env) => (
            <button
              key={env}
              onClick={() => setEnvironment(env)}
              className={`px-2 py-0.5 rounded transition-colors ${
                environment === env ? 'bg-[#1558c9] text-white font-bold' : 'text-[#9296A3] hover:text-white'
              }`}
            >
              {env}
            </button>
          ))}
        </div>
      </div>

      {/* Global Search Bar (⌘K) */}
      <div className="flex-1 max-w-xs sm:max-w-md mx-2 sm:mx-4 hidden sm:block">
        <button
          onClick={() => setIsCommandPaletteOpen(true)}
          className="w-full flex items-center justify-between px-3 py-1.5 bg-[#101116] border border-[#272a33] rounded-lg text-[#9296A3] hover:border-[#3A3E4D] hover:text-white transition-all text-xs"
        >
          <div className="flex items-center gap-2 truncate">
            <span className="material-symbols-outlined text-[16px]">search</span>
            <span className="truncate">Search services, metrics, traces, incidents...</span>
          </div>
          <kbd className="hidden md:inline px-1.5 py-0.5 text-[10px] bg-[#171920] border border-[#272a33] rounded text-[#9296A3]">
            ⌘K
          </kbd>
        </button>
      </div>

      {/* Action Controls, AI Status & RBAC User Switcher */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Time Range Selector */}
        <select
          value={timeRange}
          onChange={(e) => setTimeRange(e.target.value)}
          className="bg-[#101116] border border-[#272a33] rounded px-2 py-1 text-[#9296A3] hover:text-white outline-none cursor-pointer text-xs hidden md:block"
        >
          <option value="15m">Last 15m</option>
          <option value="1h">Last 1h</option>
          <option value="6h">Last 6h</option>
          <option value="24h">Last 24h</option>
        </select>

        {/* AI Root-Cause Diagnostic Modal Trigger */}
        <button
          onClick={() => setIsAiHypothesisOpen(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#d4ff24] text-[#030407] font-bold text-xs hover:bg-[#e1ff59] transition-all shadow-md"
          title="Open AI Root-Cause Diagnostic Report"
        >
          <span className="material-symbols-outlined text-[16px]">psychology</span>
          <span className="hidden sm:inline">AI Copilot</span>
        </button>

        {/* RBAC Persona / User Profile Selector */}
        <div className="relative">
          <button
            onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
            className="flex shrink-0 items-center gap-1 p-1 sm:pl-2 bg-[#101116] border border-[#272a33] rounded-lg hover:border-[#3A3E4D] transition-colors"
            title="Switch User / Role"
          >
            <div className="text-left hidden sm:block">
              <div className="text-[11px] font-semibold text-white leading-tight">
                {user?.name || 'Sarah Chen'}
              </div>
              <div className="text-[9px] text-[#9296A3] leading-tight">
                {user?.email || 'sarah.chen@infrapulse.io'}
              </div>
            </div>
            <span className={`px-1.5 py-0.5 text-[9px] font-extrabold uppercase rounded border ${roleBadgeColors[role] || roleBadgeColors.viewer}`}>
              {role}
            </span>
            <span className="material-symbols-outlined text-[16px] text-[#9296A3]">expand_more</span>
          </button>

          {isUserMenuOpen && (
            <div 
              className="absolute right-0 mt-1.5 w-64 bg-[#101116] border border-[#272a33] rounded-lg shadow-2xl p-2 z-50 text-xs"
              onMouseLeave={() => setIsUserMenuOpen(false)}
            >
              <div className="px-2 py-1.5 border-b border-[#272a33] mb-1.5">
                <div className="text-[#9296A3] text-[10px] uppercase font-bold tracking-wider">Active Role Boundary</div>
                <div className="text-white font-semibold flex items-center justify-between mt-1">
                  <span>{user?.name || 'User'}</span>
                  <span className={`px-1.5 py-0.2 rounded text-[9px] uppercase border font-bold ${roleBadgeColors[role]}`}>
                    {role}
                  </span>
                </div>
              </div>

              <div className="px-2 py-1 text-[10px] text-[#9296A3] uppercase font-bold">Quick Persona Switch</div>
              {Object.entries(DEMO_CREDENTIALS).map(([rKey, cred]) => (
                <button
                  key={rKey}
                  onClick={() => {
                    switchDemoUser(rKey);
                    setIsUserMenuOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between transition-colors ${
                    role === rKey ? 'bg-[#1558c9]/20 text-white font-bold' : 'text-[#9296A3] hover:text-white hover:bg-[#171920]'
                  }`}
                >
                  <div>
                    <div>{cred.name}</div>
                    <div className="text-[10px] text-[#606470]">{cred.email}</div>
                  </div>
                  <span className={`text-[9px] uppercase px-1 py-0.5 rounded border ${roleBadgeColors[rKey]}`}>
                    {rKey}
                  </span>
                </button>
              ))}

              <div className="border-t border-[#272a33] mt-2 pt-1.5">
                <button
                  onClick={() => {
                    logout();
                    setIsUserMenuOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 rounded text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">logout</span>
                  <span>Log Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
