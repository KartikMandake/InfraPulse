import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { useAuth, DEMO_CREDENTIALS } from '../context/AuthContext';

export const TeamSettingsPage = () => {
  const { user, role, isAdmin, switchDemoUser } = useAuth();
  const [activeTab, setActiveTab] = useState('members');
  const [tokens, setTokens] = useState([
    { id: 'tok_01', name: 'Argo-Rollout-Webhook', prefix: 'ip_live_88a...', created: '2026-10-12', lastUsed: '4m ago' },
    { id: 'tok_02', name: 'Prometheus-Remote-Write', prefix: 'ip_live_41b...', created: '2026-09-01', lastUsed: '1s ago' },
  ]);

  const [members, setMembers] = useState([
    { id: 'usr_admin_001', name: 'Sarah Chen', email: 'sarah.chen@infrapulse.io', role: 'admin', jobTitle: 'Principal SRE', status: 'Online', avatar: 'SC' },
    { id: 'usr_responder_002', name: 'Marcus Vance', email: 'marcus.v@infrapulse.io', role: 'responder', jobTitle: 'Staff SRE', status: 'Online', avatar: 'MV' },
    { id: 'usr_viewer_003', name: 'Alex Ross', email: 'alex.ross@infrapulse.io', role: 'viewer', jobTitle: 'Junior Observability Analyst', status: 'Idle', avatar: 'AR' }
  ]);

  const [auditLogs, setAuditLogs] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState(null);

  // Fetch real team members from backend if admin
  useEffect(() => {
    async function loadMembers() {
      if (!isAdmin) return;
      try {
        const res = await api.getUsers();
        if (res?.data && Array.isArray(res.data)) {
          setMembers(res.data.map(u => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            jobTitle: u.role === 'admin' ? 'Principal SRE / Workspace Admin' : u.role === 'responder' ? 'Incident Commander & SRE' : 'Telemetry Observer',
            status: u.status === 'active' ? 'Online' : 'Offline',
            avatar: u.name.split(' ').map(n => n[0]).join('').toUpperCase()
          })));
        }
      } catch (err) {
        console.warn('[TeamSettings] Users load fallback:', err.message);
      }
    }
    loadMembers();
  }, [isAdmin]);

  // Fetch real immutable audit logs from PostgreSQL
  useEffect(() => {
    async function loadAuditLogs() {
      if (activeTab !== 'audit') return;
      setAuditLoading(true);
      setAuditError(null);
      try {
        const res = await api.getAuditLogs({ limit: 50 });
        setAuditLogs(res?.data || []);
      } catch (err) {
        setAuditError(err.message || 'Access denied or failed to load audit logs.');
      } finally {
        setAuditLoading(false);
      }
    }
    loadAuditLogs();
  }, [activeTab, isAdmin, role]);

  const handleRoleChange = async (memberId, newRole) => {
    if (!isAdmin) return;
    try {
      await api.updateUserRole(memberId, newRole);
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m));
    } catch (err) {
      alert(`Failed to update role: ${err.message}`);
    }
  };

  const generateNewToken = () => {
    const newToken = {
      id: `tok_${Date.now().toString().slice(-4)}`,
      name: `CI-Token-${Math.floor(Math.random() * 900 + 100)}`,
      prefix: `ip_live_${Math.random().toString(36).substring(2, 7)}...`,
      created: 'Just now',
      lastUsed: 'Never'
    };
    setTokens(prev => [newToken, ...prev]);
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#1558C9]">
            <span className="material-symbols-outlined text-[20px]">admin_panel_settings</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl text-white font-semibold tracking-tight">Identity, RBAC & Security Audit</h1>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                role === 'admin' ? 'bg-[#1558c9]/20 text-[#4c87f4] border-[#1558c9]/50' :
                role === 'responder' ? 'bg-[#d4ff24]/10 text-[#d4ff24] border-[#d4ff24]/40' :
                'bg-[#272a33] text-[#9296A3] border-[#3A3E4D]'
              }`}>
                Active Role: {role}
              </span>
            </div>
            <p className="text-xs text-[#9296A3]">
              Role-Based Access Control, persistent PostgreSQL sessions, and immutable security audit logging.
            </p>
          </div>
        </div>

        {/* Quick RBAC Persona Bar */}
        <div className="flex items-center gap-1.5 bg-[#030407] border border-[#272a33] rounded-lg p-1 text-[11px]">
          <span className="text-[#606470] px-1 font-bold">Switch:</span>
          {Object.entries(DEMO_CREDENTIALS).map(([rKey, cred]) => (
            <button
              key={rKey}
              onClick={() => switchDemoUser(rKey)}
              className={`px-2 py-0.5 rounded transition-colors text-[10px] uppercase font-bold ${
                role === rKey
                  ? rKey === 'admin' ? 'bg-[#1558C9] text-white' : rKey === 'responder' ? 'bg-[#d4ff24] text-[#030407]' : 'bg-[#3A3E4D] text-white'
                  : 'text-[#9296A3] hover:text-white'
              }`}
            >
              {rKey}
            </button>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#272a33] text-xs">
        <button
          onClick={() => setActiveTab('members')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'members' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          Team Members & RBAC ({members.length})
        </button>
        <button
          onClick={() => setActiveTab('audit')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
            activeTab === 'audit' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-[14px]">history_edu</span>
          <span>Security Audit Trail</span>
          {!isAdmin && <span className="text-[9px] px-1 py-0.2 rounded bg-red-900/40 text-red-400 border border-red-800">Admin Only</span>}
        </button>
        <button
          onClick={() => setActiveTab('tokens')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'tokens' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          API Service Tokens ({tokens.length})
        </button>
      </div>

      {/* Members & RBAC Tab */}
      {activeTab === 'members' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-3 shadow-md text-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono">
              <thead>
                <tr className="text-[10px] uppercase text-[#9296A3] border-b border-[#272a33]">
                  <th className="py-2 px-3">Name & Email</th>
                  <th className="py-2 px-3">Title</th>
                  <th className="py-2 px-3">RBAC Role</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Role Management</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#272a33]/60">
                {members.map(m => (
                  <tr key={m.email} className="hover:bg-[#171920]">
                    <td className="py-2.5 px-3 flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-[#1558C9] border border-[#3A3E4D] flex items-center justify-center font-bold text-white text-[11px]">
                        {m.avatar}
                      </div>
                      <div>
                        <div className="font-bold text-white">{m.name}</div>
                        <div className="text-[10px] text-[#5A5E6B]">{m.email}</div>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-[#9296A3]">{m.jobTitle}</td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        m.role === 'admin' ? 'bg-[#1558c9]/20 text-[#4c87f4] border border-[#1558c9]/50' :
                        m.role === 'responder' ? 'bg-[#d4ff24]/10 text-[#d4ff24] border border-[#d4ff24]/40' :
                        'bg-[#272a33] text-[#9296A3] border border-[#3A3E4D]'
                      }`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className="flex items-center gap-1.5 text-[11px] text-[#50d890]">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#50d890]" />
                        {m.status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {isAdmin ? (
                        <select
                          value={m.role}
                          onChange={(e) => handleRoleChange(m.id, e.target.value)}
                          className="bg-[#171920] border border-[#272a33] text-white text-[11px] rounded px-2 py-1 outline-none hover:border-[#3A3E4D] cursor-pointer"
                        >
                          <option value="admin">admin</option>
                          <option value="responder">responder</option>
                          <option value="viewer">viewer</option>
                        </select>
                      ) : (
                        <span className="text-[10px] text-[#606470] italic">Admin Only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Security Audit Trail Tab */}
      {activeTab === 'audit' && (
        <div className="space-y-3">
          {!isAdmin ? (
            <div className="p-6 bg-[#101116] border border-red-500/30 rounded-xl text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <span className="material-symbols-outlined text-[24px]">lock</span>
              </div>
              <div>
                <h3 className="text-white font-bold text-sm">RBAC Access Denied (HTTP 403)</h3>
                <p className="text-xs text-[#9296A3] max-w-md mx-auto mt-1">
                  The security audit trail contains sensitive operator actions and is strictly restricted to the <strong className="text-white">admin</strong> role. Your current active role is <strong className="text-[#ff5364] uppercase">{role}</strong>.
                </p>
              </div>
              <button
                onClick={() => switchDemoUser('admin')}
                className="px-3 py-1.5 rounded bg-[#1558C9] hover:bg-[#124ab0] text-white text-xs font-semibold transition-colors"
              >
                Switch to Sarah Chen (Admin)
              </button>
            </div>
          ) : (
            <div className="bg-[#101116] border border-[#272a33] rounded-xl p-3 shadow-md text-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#272a33]">
                <div>
                  <h3 className="font-bold text-white flex items-center gap-2">
                    <span>Immutable PostgreSQL Security Audit Trail</span>
                    <span className="px-1.5 py-0.2 rounded bg-[#50d890]/20 text-[#50d890] text-[10px]">
                      {auditLogs.length} Events Recorded
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#9296A3]">
                    Immutable audit records persisted in database. Passwords, session tokens, and credentials sanitized.
                  </p>
                </div>
              </div>

              {auditLoading ? (
                <div className="py-8 text-center text-[#9296A3]">Loading audit events from PostgreSQL...</div>
              ) : auditError ? (
                <div className="p-3 rounded bg-red-950/30 border border-red-800 text-red-300">{auditError}</div>
              ) : auditLogs.length === 0 ? (
                <div className="py-8 text-center text-[#9296A3]">No audit logs recorded yet.</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left font-mono">
                    <thead>
                      <tr className="text-[10px] uppercase text-[#9296A3] border-b border-[#272a33]">
                        <th className="py-2 px-2.5">Timestamp</th>
                        <th className="py-2 px-2.5">Actor</th>
                        <th className="py-2 px-2.5">Action</th>
                        <th className="py-2 px-2.5">Target</th>
                        <th className="py-2 px-2.5">Outcome</th>
                        <th className="py-2 px-2.5">IP Address</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#272a33]/60 text-[11px]">
                      {auditLogs.map((log) => (
                        <tr key={log.id} className="hover:bg-[#171920]">
                          <td className="py-2 px-2.5 text-[#717684] whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleTimeString()}
                          </td>
                          <td className="py-2 px-2.5 text-white">
                            <div>{log.actorEmail || 'System / Unauth'}</div>
                            {log.actorRole && (
                              <span className="text-[9px] text-[#9296A3] uppercase">{log.actorRole}</span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 font-bold text-[#b1c5ff]">{log.action}</td>
                          <td className="py-2 px-2.5 text-[#9296A3]">{log.resourceType} {log.resourceId ? `(${log.resourceId})` : ''}</td>
                          <td className="py-2 px-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                              log.outcome === 'success' ? 'bg-[#50d890]/20 text-[#50d890]' :
                              log.outcome === 'denied' ? 'bg-amber-500/20 text-amber-300' :
                              'bg-red-500/20 text-red-400'
                            }`}>
                              {log.outcome}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 text-[#5A5E6B] font-mono whitespace-nowrap">
                            {log.ipAddress || '127.0.0.1'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tokens Tab */}
      {activeTab === 'tokens' && (
        <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4 shadow-md text-xs space-y-3">
          <div className="flex items-center justify-between border-b border-[#272a33] pb-2">
            <div>
              <h3 className="font-bold text-white">Active Service Tokens</h3>
              <p className="text-[11px] text-[#9296A3]">Use service tokens for CI/CD webhook deployments and telemetry collectors.</p>
            </div>
            {isAdmin ? (
              <button
                onClick={generateNewToken}
                className="px-3 py-1.5 rounded bg-[#d4ff24] text-[#030407] font-bold hover:bg-[#e1ff59] transition-colors"
              >
                Generate New Token
              </button>
            ) : (
              <span className="text-[10px] text-[#606470] italic">Requires Admin Role to Generate</span>
            )}
          </div>

          <div className="space-y-2">
            {tokens.map(tok => (
              <div key={tok.id} className="p-3 rounded bg-[#030407] border border-[#272a33] flex items-center justify-between">
                <div>
                  <div className="font-bold text-white">{tok.name}</div>
                  <div className="text-[11px] text-[#d4ff24] mt-0.5">{tok.prefix}</div>
                </div>
                <div className="text-[10px] text-[#9296A3] text-right">
                  <div>Created: {tok.created}</div>
                  <div>Last used: {tok.lastUsed}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
