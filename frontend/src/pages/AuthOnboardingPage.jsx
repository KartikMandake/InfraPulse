import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {copyText} from '../utils/operatorFeedback.js';

export const AuthOnboardingPage = () => {
  const { user, role, login, register, logout, switchDemoUser } = useAuth();
  const [activeTab, setActiveTab] = useState('session'); // 'session' or 'cluster'
  
  // Login / Register state
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'register'
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMsg, setAuthMsg] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Cluster wizard state
  const [currentStep, setCurrentStep] = useState(2);
  const [clusterName, setClusterName] = useState('prod-k8s-mesh');
  const [copiedHelm, setCopiedHelm] = useState(false);
  const [clipboardError,setClipboardError]=useState(null);
  const [isConnected, setIsConnected] = useState(true);

  const helmCmd = `helm repo add infrapulse https://charts.infrapulse.io\nhelm upgrade --install infrapulse infrapulse/agent --set cluster.name=${clusterName}`;

  const copyHelm = async () => {
    const result=await copyText(helmCmd);setClipboardError(result.ok?null:result.error);
    setCopiedHelm(result.ok);
    if(result.ok)setTimeout(() => setCopiedHelm(false), 1500);
  };

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setAuthMsg(null);
    try {
      if (authMode === 'login') {
        await login(email, password);
        setAuthMsg({ type: 'success', text: `Successfully logged in as ${email}!` });
      } else {
        await register({ name, email, password });
        setAuthMsg({ type: 'success', text: `Account registered successfully! Assigned default role: viewer.` });
      }
      setPassword('');
    } catch (err) {
      setAuthMsg({ type: 'error', text: err.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-3 font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#d4ff24]">
            <span className="material-symbols-outlined text-[20px]">badge</span>
          </div>
          <div>
            <h1 className="text-xl text-white font-semibold tracking-tight">Authentication & Cluster Onboarding</h1>
            <p className="text-xs text-[#9296A3]">
              Self-service operator authentication, RBAC session verification, and Kubernetes telemetry agent setup.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-[#9296A3]">Current Session:</span>
          <span className="text-[#50d890] font-bold">{user?.name || 'Guest'}</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] uppercase font-bold bg-[#1558c9]/20 text-[#4c87f4] border border-[#1558c9]/50">
            {role}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-[#272a33] text-xs">
        <button
          onClick={() => setActiveTab('session')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'session' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          User Session & Credentials
        </button>
        <button
          onClick={() => setActiveTab('cluster')}
          className={`px-3 py-1.5 border-b-2 font-medium transition-colors ${
            activeTab === 'cluster' ? 'border-[#d4ff24] text-[#d4ff24]' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          Cluster Agent Setup (Helm)
        </button>
      </div>

      {/* Session / Login Tab */}
      {activeTab === 'session' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          {/* Active Session Status */}
          <div className="p-4 bg-[#101116] border border-[#272a33] rounded-xl space-y-3">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px] text-[#50d890]">verified_user</span>
              <span>Active Server Session</span>
            </h2>

            {user ? (
              <div className="space-y-2 text-xs">
                <div className="p-3 bg-[#030407] border border-[#272a33] rounded-lg space-y-1">
                  <div className="flex justify-between">
                    <span className="text-[#9296A3]">Name:</span>
                    <span className="text-white font-bold">{user.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9296A3]">Email:</span>
                    <span className="text-[#b1c5ff]">{user.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9296A3]">RBAC Role:</span>
                    <span className="text-[#d4ff24] font-bold uppercase">{user.role}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#9296A3]">Status:</span>
                    <span className="text-[#50d890]">{user.status}</span>
                  </div>
                </div>

                <div className="text-[11px] text-[#9296A3]">
                  Session stored in PostgreSQL <code className="text-[#d4ff24]">sessions</code> table with HTTP-only cookie.
                </div>

                <button
                  onClick={logout}
                  className="px-3 py-1.5 rounded bg-red-950/40 border border-red-800 text-red-300 hover:bg-red-900/50 transition-colors flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[14px]">logout</span>
                  <span>End Session (Logout)</span>
                </button>
              </div>
            ) : (
              <div className="p-4 text-center text-[#9296A3]">
                No active session found. Please sign in or register below.
              </div>
            )}

            <div className="border-t border-[#272a33] pt-3">
              <div className="text-[11px] text-[#9296A3] mb-2 font-bold">Quick Switch Personas:</div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => switchDemoUser('admin')}
                  className="px-2.5 py-1 rounded bg-[#1558c9]/20 border border-[#1558c9]/50 text-[#4c87f4] hover:bg-[#1558c9]/40 text-[11px]"
                >
                  Sarah Chen (Admin)
                </button>
                <button
                  onClick={() => switchDemoUser('responder')}
                  className="px-2.5 py-1 rounded bg-[#d4ff24]/10 border border-[#d4ff24]/40 text-[#d4ff24] hover:bg-[#d4ff24]/20 text-[11px]"
                >
                  Marcus Vance (Responder)
                </button>
                <button
                  onClick={() => switchDemoUser('viewer')}
                  className="px-2.5 py-1 rounded bg-[#272a33] border border-[#3A3E4D] text-[#9296A3] hover:text-white text-[11px]"
                >
                  Alex Ross (Viewer)
                </button>
              </div>
            </div>
          </div>

          {/* Login or Register Form */}
          <div className="p-4 bg-[#101116] border border-[#272a33] rounded-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-[#272a33]">
              <h2 className="text-sm font-bold text-white">
                {authMode === 'login' ? 'Sign In with Credentials' : 'Create New Account'}
              </h2>
              <div className="flex gap-1 bg-[#030407] p-0.5 rounded border border-[#272a33]">
                <button
                  onClick={() => { setAuthMode('login'); setAuthMsg(null); }}
                  className={`px-2 py-0.5 rounded text-[10px] ${authMode === 'login' ? 'bg-[#1558C9] text-white font-bold' : 'text-[#9296A3]'}`}
                >
                  Login
                </button>
                <button
                  onClick={() => { setAuthMode('register'); setAuthMsg(null); }}
                  className={`px-2 py-0.5 rounded text-[10px] ${authMode === 'register' ? 'bg-[#1558C9] text-white font-bold' : 'text-[#9296A3]'}`}
                >
                  Register
                </button>
              </div>
            </div>

            {authMsg && (
              <div className={`p-2 rounded text-[11px] border ${
                authMsg.type === 'success' ? 'bg-[#50d890]/10 border-[#50d890]/30 text-[#50d890]' : 'bg-red-950/30 border-red-800 text-red-300'
              }`}>
                {authMsg.text}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-3">
              {authMode === 'register' && (
                <div>
                  <label className="text-[#9296A3] block mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Elena Rostova"
                    className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none focus:border-[#d4ff24]"
                  />
                </div>
              )}

              <div>
                <label className="text-[#9296A3] block mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operator@infrapulse.io"
                  className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none focus:border-[#d4ff24]"
                />
              </div>

              <div>
                <label className="text-[#9296A3] block mb-1">Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none focus:border-[#d4ff24]"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2 rounded bg-[#d4ff24] text-[#030407] font-bold hover:bg-[#e1ff59] transition-colors disabled:opacity-50 text-xs"
              >
                {isSubmitting ? 'Processing...' : authMode === 'login' ? 'Sign In →' : 'Register Account →'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Cluster Setup Tab */}
      {activeTab === 'cluster' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {[
              { num: 1, title: 'Cluster Identity', desc: 'Configure namespace & region metadata' },
              { num: 2, title: 'Deploy OTel Helm Agent', desc: 'Inject sidecars and eBPF kernel probes' },
              { num: 3, title: 'Mesh Verification', desc: '142 services automatically discovered' },
            ].map(st => (
              <div
                key={st.num}
                onClick={() => setCurrentStep(st.num)}
                className={`p-3 rounded-xl border cursor-pointer transition-all ${
                  currentStep === st.num
                    ? 'bg-[#171920] border-[#d4ff24] shadow-[0_0_10px_rgba(212,255,36,0.2)]'
                    : 'bg-[#101116] border-[#272a33]'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                    currentStep >= st.num ? 'bg-[#d4ff24] text-[#030407]' : 'bg-[#22252e] text-[#9296A3]'
                  }`}>
                    {st.num}
                  </span>
                  <span className="font-bold text-white">{st.title}</span>
                </div>
                <p className="text-[11px] text-[#9296A3] mt-1 pl-7">{st.desc}</p>
              </div>
            ))}
          </div>

          <div className="p-4 bg-[#101116] border border-[#272a33] rounded-xl shadow-md flex flex-col gap-4 text-xs">
            {currentStep === 1 && (
              <div className="space-y-3">
                <h2 className="text-base font-bold text-white">Step 1: Cluster Metadata Configuration</h2>
                <div className="space-y-2 max-w-md">
                  <label className="text-[#9296A3]">Target Kubernetes Cluster Name</label>
                  <input
                    type="text"
                    value={clusterName}
                    onChange={(e) => setClusterName(e.target.value)}
                    className="w-full bg-[#030407] border border-[#272a33] p-2 rounded text-white focus:outline-none focus:border-[#d4ff24]"
                  />
                </div>
                <button
                  onClick={() => setCurrentStep(2)}
                  className="px-4 py-2 rounded bg-[#d4ff24] text-[#030407] font-bold"
                >
                  Next: View Helm Commands →
                </button>
              </div>
            )}

            {currentStep === 2 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold text-white">Step 2: Deploy InfraPulse Helm Agent</h2>
                  <button
                    onClick={copyHelm}
                    className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] hover:border-[#3A3E4D] text-white flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[14px]">content_copy</span>
                    <span>{copiedHelm ? 'Copied Helm Script!' : 'Copy Script'}</span>
                  </button>
                </div>
                {clipboardError&&<p role="alert" className="text-red-400 text-xs">{clipboardError}</p>}
                <pre className="p-3 bg-[#030407] border border-[#272a33] rounded-lg text-xs text-[#b1c5ff] overflow-x-auto leading-relaxed">
                  {helmCmd}
                </pre>
                <div className="p-3 bg-[#171920] border border-[#272a33] rounded text-[#9296A3] space-y-1">
                  <div className="text-white font-bold">Capabilities Installed:</div>
                  <div>• eBPF kernel network latency profiler</div>
                  <div>• OpenTelemetry collector DaemonSet on all 48 nodes</div>
                  <div>• Instant Envoy service mesh auto-discovery</div>
                </div>
                <button
                  onClick={() => setCurrentStep(3)}
                  className="px-4 py-2 rounded bg-[#d4ff24] text-[#030407] font-bold"
                >
                  Next: Verify Mesh Telemetry →
                </button>
              </div>
            )}

            {currentStep === 3 && (
              <div className="space-y-3">
                <h2 className="text-base font-bold text-white">Step 3: Cluster Verification & Streaming</h2>
                <div className="p-3 bg-[#030407] border border-[#50d890]/40 rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2 text-[#50d890]">
                    <span className="material-symbols-outlined text-[20px]">check_circle</span>
                    <span className="font-bold">Cluster Connected Successfully!</span>
                  </div>
                  <span className="text-white">142 Services streaming to prod-us-east-1</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsConnected(!isConnected)}
                    className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#22252e]"
                  >
                    Toggle Connection Simulation ({isConnected ? 'Connected' : 'Disconnected'})
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
