import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useApp } from '../../context/AppContext.jsx';

const navItems = [
  { path: '/', label: 'Incident Overview', icon: 'emergency', badge: 'SEV-1' },
  { path: '/system-overview', label: 'System Overview', icon: 'dashboard' },
  { path: '/services', label: 'Services Mesh', icon: 'hub' },
  { path: '/incidents', label: 'Incident Center', icon: 'local_fire_department' },
  { path: '/alerts', label: 'Alerts & Rules', icon: 'notifications_active', badge: '3 firing' },
  { path: '/telemetry', label: 'Telemetry Explorer', icon: 'query_stats' },
  { path: '/deployments', label: 'Deployments & ACA', icon: 'rocket_launch' },
  { path: '/slos', label: 'SLOs & Budgets', icon: 'track_changes' },
  { path: '/runbooks', label: 'Runbook Automation', icon: 'play_circle' },
  { path: '/fault-injection', label: 'Chaos & Fault Lab', icon: 'bolt' },
  { path: '/reports', label: 'Reports & Postmortems', icon: 'description' },
  { path: '/operations', label: 'Operational Intelligence', icon: 'psychology', badge: 'AI' },
  { path: '/integrations', label: 'Integrations', icon: 'extension' },
  { path: '/team', label: 'Team & RBAC', icon: 'group' },
  { path: '/auth', label: 'Agent Onboarding', icon: 'security' },
];

export const Sidebar = () => {
  const { isMobileSidebarOpen, setIsMobileSidebarOpen, incidents, alerts } = useApp();
  const location = useLocation();

  const activeIncidentsCount = incidents.filter(i => i.status !== 'resolved').length;
  const firingAlertsCount = alerts.filter(a => a.state === 'firing').length;

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#101116] border-r border-[#272a33] w-64 select-none font-mono">
      {/* Brand Header */}
      <div className="h-14 flex items-center justify-between px-4 border-b border-[#272a33]">
        <NavLink to="/" className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded bg-[#1558C9] flex items-center justify-center shadow-lg shadow-[#1558C9]/30">
            <span className="material-symbols-outlined text-[18px] text-white">vital_signs</span>
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm tracking-tight text-white">InfraPulse</span>
              <span className="text-[10px] px-1 rounded bg-[#d4ff24] text-[#030407] font-bold">2.4</span>
            </div>
            <span className="text-[9px] text-[#9296A3]">Autonomous Intelligence</span>
          </div>
        </NavLink>

        {/* Mobile close button */}
        <button
          onClick={() => setIsMobileSidebarOpen(false)}
          className="md:hidden text-[#9296A3] hover:text-white"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 text-xs">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path || 
            (item.path !== '/' && location.pathname.startsWith(item.path));

          let dynamicBadge = item.badge;
          if (item.path === '/incidents' && activeIncidentsCount > 0) {
            dynamicBadge = `${activeIncidentsCount} active`;
          } else if (item.path === '/alerts' && firingAlertsCount > 0) {
            dynamicBadge = `${firingAlertsCount} firing`;
          }

          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => setIsMobileSidebarOpen(false)}
              className={({ isActive: linkActive }) =>
                `flex items-center justify-between px-3 py-2 rounded-lg transition-all ${
                  linkActive || isActive
                    ? 'bg-[#171920] text-white font-semibold border-l-2 border-[#1558c9] shadow-sm'
                    : 'text-[#9296A3] hover:text-white hover:bg-[#171920]/60'
                }`
              }
            >
              <div className="flex items-center gap-2.5 truncate">
                <span className={`material-symbols-outlined text-[18px] ${
                  isActive ? 'text-[#1558c9]' : 'text-[#9296A3]'
                }`}>
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </div>

              {dynamicBadge && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase tracking-wider shrink-0 ${
                  dynamicBadge.includes('SEV') || dynamicBadge.includes('firing')
                    ? 'bg-[#ff5364]/20 text-[#ff5364] border border-[#ff5364]/40'
                    : 'bg-[#1558c9]/20 text-[#b1c5ff] border border-[#1558c9]/40'
                }`}>
                  {dynamicBadge}
                </span>
              )}
            </NavLink>
          );
        })}
      </nav>

      {/* Mesh Health Summary */}
      <div className="p-3 border-t border-[#272a33] bg-[#030407]/60">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-[#9296A3]">Mesh Sync Health</span>
          <span className="text-[#50d890] font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#50d890]"></span>
            99.98%
          </span>
        </div>
        <div className="h-1.5 w-full bg-[#171920] rounded-full overflow-hidden">
          <div className="h-full bg-[#1558c9] rounded-full" style={{ width: '92%' }} />
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:block h-screen sticky top-0 shrink-0 z-20">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileSidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div 
            className="fixed inset-0 bg-[#030407]/80 backdrop-blur-sm"
            onClick={() => setIsMobileSidebarOpen(false)}
          />
          <div className="relative z-10 h-full">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

