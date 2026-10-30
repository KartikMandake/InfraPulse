import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

export const IntegrationsPage = () => {
  const { integrations: mockIntegrations } = useApp();
  const { role, isAdmin, isResponder } = useAuth();
  
  const [activeMainTab, setActiveMainTab] = useState('ecosystem'); // 'ecosystem' | 'notifications' | 'connectors'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Phase 19 Enterprise Ecosystem Integrations State
  const [catalog, setCatalog] = useState([]);
  const [configuredIntegrations, setConfiguredIntegrations] = useState([]);
  const [testingId, setTestingId] = useState(null);
  const [testResult, setTestResult] = useState(null);

  // Modals state
  const [isConfigureModalOpen, setIsConfigureModalOpen] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState(null);
  const [configForm, setConfigForm] = useState({
    name: '',
    description: '',
    config: {},
    credentials: {}
  });

  // Webhook deliveries modal
  const [isDeliveriesModalOpen, setIsDeliveriesModalOpen] = useState(false);
  const [selectedIntegrationForDeliveries, setSelectedIntegrationForDeliveries] = useState(null);
  const [deliveriesList, setDeliveriesList] = useState([]);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState(null);

  // Credential rotation modal
  const [isRotateModalOpen, setIsRotateModalOpen] = useState(false);
  const [rotationCredentials, setRotationCredentials] = useState({});

  // Notification state (preserved from Phase 9)
  const [settings, setSettings] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [testSending, setTestSending] = useState(false);
  const [notifTestResult, setNotifTestResult] = useState(null);
  const [retryingId, setRetryingId] = useState(null);

  const loadEcosystemData = async () => {
    try {
      const [catRes, listRes] = await Promise.allSettled([
        api.getIntegrationCatalog(),
        api.getIntegrations()
      ]);

      if (catRes.status === 'fulfilled' && catRes.value?.data) {
        setCatalog(catRes.value.data);
      }
      if (listRes.status === 'fulfilled' && listRes.value?.data) {
        setConfiguredIntegrations(listRes.value.data);
      }
    } catch (err) {
      console.warn('[IntegrationsPage] Failed to load ecosystem integrations:', err.message);
    }
  };

  const loadNotificationData = async () => {
    try {
      const [settingsRes, deliveriesRes] = await Promise.allSettled([
        api.getNotificationSettings(),
        api.getNotifications({ limit: 50 })
      ]);

      if (settingsRes.status === 'fulfilled' && settingsRes.value?.data) {
        setSettings(settingsRes.value.data);
      }
      if (deliveriesRes.status === 'fulfilled' && deliveriesRes.value?.data) {
        setDeliveries(deliveriesRes.value.data);
      }
    } catch (err) {
      console.warn('[IntegrationsPage] Failed to load notification data:', err.message);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    await Promise.all([loadEcosystemData(), loadNotificationData()]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleTestConnection = async (integrationId) => {
    if (!isAdmin) return;
    setTestingId(integrationId);
    setTestResult(null);
    try {
      const res = await api.testIntegration(integrationId);
      setTestResult({
        id: integrationId,
        ok: res.ok,
        message: res.message,
        latencyMs: res.latencyMs
      });
      await loadEcosystemData();
    } catch (err) {
      setTestResult({
        id: integrationId,
        ok: false,
        message: err.message
      });
    } finally {
      setTestingId(null);
    }
  };

  const handleOpenConfigure = (provider) => {
    setSelectedProvider(provider);
    const existing = configuredIntegrations.find(i => i.provider === provider.key);

    if (existing) {
      setConfigForm({
        id: existing.id,
        name: existing.name,
        description: existing.description || '',
        config: existing.config || {},
        credentials: {}
      });
    } else {
      setConfigForm({
        name: `${provider.name} Integration`,
        description: provider.description,
        config: getDefaultConfigForProvider(provider.key),
        credentials: getDefaultCredentialsForProvider(provider.key)
      });
    }
    setIsConfigureModalOpen(true);
  };

  const getDefaultConfigForProvider = (key) => {
    switch (key) {
      case 'github': return { repository: 'infrapulse-org/payment-service', defaultBranch: 'main' };
      case 'kubernetes': return { clusterUrl: 'https://kubernetes.default.svc', namespaces: ['production', 'default'], timeoutMs: 5000 };
      case 'prometheus': return { endpoint: 'http://localhost:9090', timeoutMs: 5000, metricMappings: { p99_latency: 'http_request_duration_seconds:p99' } };
      case 'grafana': return { url: 'http://localhost:3000', dashboardPrefix: 'http://localhost:3000/d/' };
      case 'slack': return { defaultChannel: '#incidents-war-room', notifyOnSeverity: ['critical', 'high'] };
      case 'opentelemetry': return { collectorEndpoint: 'http://localhost:4318', maxPayloadBytes: 2097152 };
      default: return {};
    }
  };

  const getDefaultCredentialsForProvider = (key) => {
    switch (key) {
      case 'github': return { webhookSecret: 'gh_secret_supersecure_32b_token' };
      case 'kubernetes': return { bearerToken: 'k8s_token_service_account_read_only' };
      case 'prometheus': return { apiKey: '' };
      case 'grafana': return { serviceToken: 'glsa_service_token_readonly' };
      case 'slack': return { webhookUrl: 'https://hooks.slack.com/services/T00/B00/X00' };
      case 'opentelemetry': return { ingestionKey: 'otel_ingest_key_secure_48b' };
      default: return {};
    }
  };

  const handleSaveConfiguration = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError(null);
      if (configForm.id) {
        // Update existing
        await api.updateIntegration(configForm.id, {
          name: configForm.name,
          description: configForm.description,
          config: configForm.config,
          ...(Object.keys(configForm.credentials || {}).length > 0 ? { credentials: configForm.credentials } : {})
        });
        setSuccessMsg('Integration configuration updated successfully.');
      } else {
        // Create new
        await api.createIntegration({
          provider: selectedProvider.key,
          name: configForm.name,
          description: configForm.description,
          config: configForm.config,
          credentials: configForm.credentials
        });
        setSuccessMsg(`Successfully connected and verified ${selectedProvider.name}.`);
      }
      setIsConfigureModalOpen(false);
      setTimeout(() => setSuccessMsg(null), 3500);
      await loadEcosystemData();
    } catch (err) {
      setError(err.message || 'Failed to save integration.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDeliveries = async (integration) => {
    setSelectedIntegrationForDeliveries(integration);
    setIsDeliveriesModalOpen(true);
    try {
      const res = await api.getIntegrationDeliveries(integration.id);
      setDeliveriesList(res?.data || []);
    } catch (err) {
      console.warn('Failed to load deliveries:', err.message);
      setDeliveriesList([]);
    }
  };

  const handleRetryIntegrationDelivery = async (deliveryId) => {
    try {
      setRetryingDeliveryId(deliveryId);
      await api.retryIntegrationDelivery(selectedIntegrationForDeliveries.id, deliveryId);
      const res = await api.getIntegrationDeliveries(selectedIntegrationForDeliveries.id);
      setDeliveriesList(res?.data || []);
    } catch (err) {
      alert(`Retry error: ${err.message}`);
    } finally {
      setRetryingDeliveryId(null);
    }
  };

  const handleRotateCredentials = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      await api.rotateIntegrationCredentials(selectedIntegrationForDeliveries.id, { credentials: rotationCredentials });
      setSuccessMsg('Credentials rotated successfully with AES-256-GCM.');
      setIsRotateModalOpen(false);
      setRotationCredentials({});
      setTimeout(() => setSuccessMsg(null), 3500);
      await loadEcosystemData();
    } catch (err) {
      alert(`Rotation failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Notification handlers (preserved from Phase 9)
  const handleTestNotification = async (channelType) => {
    if (!isAdmin) return;
    setTestSending(true);
    setNotifTestResult(null);
    try {
      const res = await api.sendTestNotification({ channelType });
      setNotifTestResult({
        type: 'success',
        text: `Test ping to ${channelType.toUpperCase()} transmitted successfully (Status: ${res.data?.delivery?.status || 'sent'})`
      });
      loadNotificationData();
    } catch (err) {
      setNotifTestResult({
        type: 'error',
        text: `Test failed: ${err.message}`
      });
    } finally {
      setTestSending(false);
    }
  };

  const handleRetryDelivery = async (deliveryId) => {
    if (!isResponder && !isAdmin) return;
    setRetryingId(deliveryId);
    try {
      await api.retryNotification(deliveryId);
      await loadNotificationData();
    } catch (err) {
      alert(`Retry error: ${err.message}`);
    } finally {
      setRetryingId(null);
    }
  };

  return (
    <div className="flex flex-col w-full pb-8 space-y-4 font-mono text-xs">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-[#101116] border border-[#272a33] rounded-xl shadow-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#171920] border border-[#272a33] flex items-center justify-center text-[#d4ff24]">
            <span className="material-symbols-outlined text-[22px]">hub</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl text-white font-bold tracking-tight">Enterprise Integrations & Platform Ecosystem</h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#1558C9]/20 text-[#60a5fa] border border-[#1558C9]/50">
                Phase 19
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-[#171920] text-[#9296A3] border border-[#272a33]">
                Role: {role}
              </span>
            </div>
            <p className="text-xs text-[#9296A3] mt-0.5">
              Production-grade connectors for GitHub, Kubernetes, Prometheus, Grafana, Slack, and OpenTelemetry with AES-256-GCM encryption.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {activeMainTab === 'notifications' && isAdmin && (
            <button
              onClick={() => handleTestNotification('slack')}
              disabled={testSending}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[#1558C9] hover:bg-[#124ab0] text-white font-bold text-xs transition-colors disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[15px]">send</span>
              <span>{testSending ? 'Sending Ping...' : 'Test Slack Ping'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Global Alerts / Messages */}
      {error && (
        <div className="bg-red-950/40 border border-red-500/40 text-red-200 p-3 rounded text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-red-400 text-sm">error</span>
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-xs underline">Dismiss</button>
        </div>
      )}
      {successMsg && (
        <div className="bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 p-3 rounded text-xs flex items-center gap-2">
          <span className="material-symbols-outlined text-emerald-400 text-sm">check_circle</span>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-[#272a33] text-xs">
        <button
          onClick={() => setActiveMainTab('ecosystem')}
          className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
            activeMainTab === 'ecosystem' ? 'border-[#d4ff24] text-[#d4ff24] font-bold' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">extension</span>
          <span>Enterprise Ecosystem ({configuredIntegrations.length}/6 Connected)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('notifications')}
          className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
            activeMainTab === 'notifications' ? 'border-[#d4ff24] text-[#d4ff24] font-bold' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">notifications_active</span>
          <span>Notification Rails & Queue ({deliveries.length} Deliveries)</span>
        </button>

        <button
          onClick={() => setActiveMainTab('connectors')}
          className={`px-3 py-2 border-b-2 font-medium transition-colors flex items-center gap-1.5 ${
            activeMainTab === 'connectors' ? 'border-[#d4ff24] text-[#d4ff24] font-bold' : 'border-transparent text-[#9296A3] hover:text-white'
          }`}
        >
          <span className="material-symbols-outlined text-[16px]">sensors</span>
          <span>Community Connectors ({mockIntegrations.length})</span>
        </button>
      </div>

      {/* TAB 1: ENTERPRISE ECOSYSTEM CONNECTORS */}
      {activeMainTab === 'ecosystem' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {catalog.map(prov => {
              const connected = configuredIntegrations.find(i => i.provider === prov.key);
              const isConnected = connected && connected.status === 'CONNECTED';
              const isDegraded = connected && connected.status === 'DEGRADED';
              const isError = connected && connected.status === 'ERROR';

              return (
                <div
                  key={prov.key}
                  className="bg-[#101116] border border-[#272a33] hover:border-[#3A3E4D] p-4 rounded-xl flex flex-col justify-between gap-3 shadow-sm transition-all"
                >
                  <div>
                    {/* Header: Provider & Status Badge */}
                    <div className="flex items-center justify-between pb-2.5 border-b border-[#272a33]">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[20px] text-[#60a5fa]">
                          {prov.key === 'github' ? 'code' :
                           prov.key === 'kubernetes' ? 'cloud' :
                           prov.key === 'prometheus' ? 'show_chart' :
                           prov.key === 'grafana' ? 'dashboard' :
                           prov.key === 'slack' ? 'chat' : 'schema'}
                        </span>
                        <span className="font-bold text-white text-sm">{prov.name}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        isConnected ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' :
                        isDegraded ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' :
                        isError ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' :
                        'bg-gray-800 text-gray-400 border border-gray-700'
                      }`}>
                        {connected ? connected.status : 'DISCONNECTED'}
                      </span>
                    </div>

                    <p className="text-xs text-[#9296A3] mt-2 mb-3 leading-relaxed">
                      {prov.description}
                    </p>

                    {/* Connection details if configured */}
                    {connected ? (
                      <div className="space-y-1.5 p-2.5 bg-[#171920] rounded-lg border border-[#272a33] text-[11px]">
                        <div className="flex items-center justify-between text-[#9ca3af]">
                          <span>Credentials:</span>
                          <span className="text-white font-semibold">
                            {connected.credentialsConfigured ? 'AES-256-GCM Encrypted' : 'None'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[#9ca3af]">
                          <span>Last Success:</span>
                          <span className="text-[#d4ff24]">
                            {connected.lastSuccessAt ? new Date(connected.lastSuccessAt).toLocaleTimeString() : 'Never'}
                          </span>
                        </div>
                        {connected.errorMessage && (
                          <div className="text-rose-400 text-[10px] truncate" title={connected.errorMessage}>
                            Error: {connected.errorMessage}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-2.5 bg-[#171920]/40 rounded-lg border border-[#272a33]/60 text-[11px] text-[#6b7280]">
                        No active connection configured for this provider.
                      </div>
                    )}

                    {/* Test result banner if active for this provider */}
                    {testResult && connected && testResult.id === connected.id && (
                      <div className={`mt-2 p-2 rounded text-[11px] border ${
                        testResult.ok ? 'bg-emerald-950/30 border-emerald-500/40 text-emerald-300' : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
                      }`}>
                        <div className="font-bold">{testResult.ok ? 'Connection Verified' : 'Check Failed'}</div>
                        <div>{testResult.message} {testResult.latencyMs ? `(${testResult.latencyMs}ms)` : ''}</div>
                      </div>
                    )}
                  </div>

                  {/* Actions Footer */}
                  <div className="pt-2.5 border-t border-[#272a33] flex items-center justify-between gap-2">
                    {connected ? (
                      <>
                        <div className="flex items-center gap-1.5">
                          {isAdmin && (
                            <button
                              onClick={() => handleTestConnection(connected.id)}
                              disabled={testingId === connected.id}
                              className="px-2.5 py-1 bg-[#171920] hover:bg-[#20232c] border border-[#272a33] text-white rounded text-[11px] flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[13px] text-[#d4ff24]">bolt</span>
                              <span>{testingId === connected.id ? 'Testing...' : 'Test'}</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleOpenDeliveries(connected)}
                            className="px-2 py-1 bg-[#171920] hover:bg-[#20232c] border border-[#272a33] text-[#9ca3af] hover:text-white rounded text-[11px]"
                            title="Inspect Webhook / Ingestion Deliveries"
                          >
                            Logs
                          </button>
                        </div>

                        {isAdmin && (
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleOpenConfigure(prov)}
                              className="px-2.5 py-1 bg-[#1558c9] hover:bg-[#124ab0] text-white font-bold rounded text-[11px]"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="w-full flex justify-end">
                        {isAdmin ? (
                          <button
                            onClick={() => handleOpenConfigure(prov)}
                            className="px-3 py-1 bg-[#d4ff24] hover:bg-[#e1ff59] text-[#030407] font-bold rounded text-[11px] flex items-center gap-1"
                          >
                            <span className="material-symbols-outlined text-[14px]">link</span>
                            Connect Provider
                          </button>
                        ) : (
                          <span className="text-[10px] text-[#6b7280]">Admin access required to connect</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: NOTIFICATION RAILS & QUEUE (Preserved from Phase 9) */}
      {activeMainTab === 'notifications' && (
        <div className="space-y-4">
          {notifTestResult && (
            <div className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
              notifTestResult.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                : 'bg-red-950/40 border-red-500/40 text-red-200'
            }`}>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm">
                  {notifTestResult.type === 'success' ? 'check_circle' : 'error'}
                </span>
                <span>{notifTestResult.text}</span>
              </div>
              <button onClick={() => setNotifTestResult(null)} className="text-[#9296A3] hover:text-white">✕</button>
            </div>
          )}

          <div className="bg-[#101116] border border-[#272a33] rounded-xl p-4">
            <h2 className="text-sm font-bold text-white mb-2">Persistent Delivery Queue Logs</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-[#272a33] text-[#717684]">
                    <th className="py-2 px-2.5">Time</th>
                    <th className="py-2 px-2.5">Channel</th>
                    <th className="py-2 px-2.5">Event</th>
                    <th className="py-2 px-2.5">Incident</th>
                    <th className="py-2 px-2.5">Recipient</th>
                    <th className="py-2 px-2.5">Status</th>
                    <th className="py-2 px-2.5">Attempts</th>
                    <th className="py-2 px-2.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#171920]">
                  {deliveries.map((del) => (
                    <tr key={del.id} className="hover:bg-[#171920]">
                      <td className="py-2 px-2.5 text-[#717684]">{new Date(del.createdAt).toLocaleTimeString()}</td>
                      <td className="py-2 px-2.5 uppercase font-bold text-white">{del.channelType}</td>
                      <td className="py-2 px-2.5 text-[#60a5fa]">{del.eventType}</td>
                      <td className="py-2 px-2.5 text-[#d4ff24] font-bold">{del.incidentId || 'N/A'}</td>
                      <td className="py-2 px-2.5 text-white truncate max-w-[160px]">{del.recipient}</td>
                      <td className="py-2 px-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                          del.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' :
                          del.status === 'pending' ? 'bg-amber-500/20 text-amber-300' :
                          'bg-rose-500/20 text-rose-400'
                        }`}>
                          {del.status}
                        </span>
                      </td>
                      <td className="py-2 px-2.5 text-[#9296A3]">{del.attemptCount} / {del.maxAttempts}</td>
                      <td className="py-2 px-2.5 text-right">
                        {del.status === 'failed' && (isResponder || isAdmin) && (
                          <button
                            onClick={() => handleRetryDelivery(del.id)}
                            disabled={retryingId === del.id}
                            className="px-2 py-0.5 rounded bg-red-950/40 border border-red-800 text-red-300 hover:bg-red-900/50"
                          >
                            {retryingId === del.id ? 'Retrying...' : 'Retry'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: COMMUNITY CONNECTORS */}
      {activeMainTab === 'connectors' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {mockIntegrations.map(int => (
            <div key={int.id} className="p-4 bg-[#101116] border border-[#272a33] rounded-xl flex flex-col justify-between gap-3">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-[#272a33]">
                  <span className="font-bold text-white">{int.name}</span>
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase">{int.status}</span>
                </div>
                <div className="mt-2 text-[#9296A3] text-[11px] space-y-1">
                  <div>Category: <strong className="text-white">{int.category}</strong></div>
                  <div>Throughput: <strong className="text-[#d4ff24]">{int.ingestRate}</strong></div>
                  <div>Heartbeat: <strong className="text-white">{int.lastSync}</strong></div>
                </div>
              </div>
              <div className="pt-2 border-t border-[#272a33] flex items-center justify-between">
                <span className="text-[10px] text-[#5A5E6B]">Verified OTel Bridge</span>
                <span className="text-[10px] text-white">Active</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* CONFIGURE / CONNECT INTEGRATION MODAL */}
      {isConfigureModalOpen && selectedProvider && (
        <div className="fixed inset-0 bg-[#030407]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveConfiguration}
            className="bg-[#101116] border border-[#272a33] w-full max-w-lg p-5 rounded-xl shadow-2xl flex flex-col gap-3.5 text-xs font-mono"
          >
            <div className="flex items-center justify-between border-b border-[#272a33] pb-2.5">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-[#1558C9]">tune</span>
                Configure {selectedProvider.name} Integration
              </span>
              <button
                type="button"
                onClick={() => setIsConfigureModalOpen(false)}
                className="text-[#9296A3] hover:text-white"
              >
                ✕
              </button>
            </div>

            <div>
              <label className="block text-white font-bold mb-1">Integration Name *</label>
              <input
                type="text"
                required
                value={configForm.name}
                onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-white outline-none focus:border-[#1558c9]"
              />
            </div>

            <div>
              <label className="block text-white font-bold mb-1">Configuration (JSON) *</label>
              <textarea
                rows={5}
                required
                value={JSON.stringify(configForm.config, null, 2)}
                onChange={(e) => {
                  try {
                    setConfigForm({ ...configForm, config: JSON.parse(e.target.value) });
                  } catch (err) {
                    // typing
                  }
                }}
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-[#60a5fa] font-mono text-[11px] outline-none focus:border-[#1558c9]"
              />
            </div>

            <div>
              <label className="block text-white font-bold mb-1">
                Credentials (Encrypted at rest with AES-256-GCM)
              </label>
              <textarea
                rows={4}
                value={JSON.stringify(configForm.credentials, null, 2)}
                onChange={(e) => {
                  try {
                    setConfigForm({ ...configForm, credentials: JSON.parse(e.target.value) });
                  } catch (err) {
                    // typing
                  }
                }}
                placeholder="{ webhookSecret: '...' }"
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-[#d4ff24] font-mono text-[11px] outline-none focus:border-[#1558c9]"
              />
              <div className="text-[10px] text-[#6b7280] mt-1">
                Secrets are never exposed to the browser after saving. Stored using authenticated envelope encryption.
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#272a33]">
              <button
                type="button"
                onClick={() => setIsConfigureModalOpen(false)}
                className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#20232c]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-1.5 rounded bg-[#1558c9] hover:bg-[#124ab0] text-white font-bold"
              >
                Save & Connect
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WEBHOOK DELIVERIES & LOGS MODAL */}
      {isDeliveriesModalOpen && selectedIntegrationForDeliveries && (
        <div className="fixed inset-0 bg-[#030407]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-[#101116] border border-[#272a33] w-full max-w-2xl p-5 rounded-xl shadow-2xl flex flex-col gap-3 font-mono text-xs max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-[#272a33] pb-2.5">
              <div>
                <span className="text-sm font-bold text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#60a5fa]">receipt_long</span>
                  Webhook & Ingestion Deliveries: {selectedIntegrationForDeliveries.name}
                </span>
                <span className="text-[11px] text-[#9ca3af]">Idempotent delivery audit trail with retry controls</span>
              </div>
              <button onClick={() => setIsDeliveriesModalOpen(false)} className="text-[#9296A3] hover:text-white">✕</button>
            </div>

            {deliveriesList.length === 0 ? (
              <div className="p-6 text-center text-[#6b7280]">
                No webhook deliveries recorded yet for this integration.
              </div>
            ) : (
              <div className="space-y-2">
                {deliveriesList.map(del => (
                  <div key={del.id} className="p-2.5 bg-[#030407] border border-[#272a33] rounded-lg flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{del.event_type}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          del.status === 'PROCESSED' ? 'bg-emerald-500/20 text-emerald-400' :
                          del.status === 'FAILED' ? 'bg-rose-500/20 text-rose-400' : 'bg-blue-500/20 text-blue-400'
                        }`}>
                          {del.status}
                        </span>
                        <span className="text-[10px] text-[#717684]">ID: {del.delivery_id || del.id}</span>
                      </div>
                      <div className="text-[11px] text-[#9ca3af] mt-1">
                        Processed: {new Date(del.processed_at || del.created_at).toLocaleString()}
                      </div>
                      {del.error_details && (
                        <div className="text-rose-400 text-[10px] mt-0.5">{del.error_details}</div>
                      )}
                    </div>

                    {del.status === 'FAILED' && (isResponder || isAdmin) && (
                      <button
                        onClick={() => handleRetryIntegrationDelivery(del.id)}
                        disabled={retryingDeliveryId === del.id}
                        className="px-2.5 py-1 bg-red-950/40 border border-red-800 text-red-300 rounded text-[10px] hover:bg-red-900/50"
                      >
                        {retryingDeliveryId === del.id ? 'Retrying...' : 'Retry Delivery'}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-[#272a33]">
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => setIsRotateModalOpen(true)}
                  className="px-3 py-1.5 rounded bg-purple-900/30 border border-purple-700 text-purple-300 hover:bg-purple-800/40 text-xs font-bold"
                >
                  Rotate Credentials...
                </button>
              )}
              <button
                onClick={() => setIsDeliveriesModalOpen(false)}
                className="px-4 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white hover:bg-[#20232c]"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ROTATE CREDENTIALS MODAL */}
      {isRotateModalOpen && selectedIntegrationForDeliveries && (
        <div className="fixed inset-0 bg-[#030407]/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <form
            onSubmit={handleRotateCredentials}
            className="bg-[#101116] border border-[#272a33] w-full max-w-md p-4 rounded-xl shadow-2xl flex flex-col gap-3 font-mono text-xs"
          >
            <div className="border-b border-[#272a33] pb-2">
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-400">sync_lock</span>
                Rotate Integration Credentials
              </span>
              <p className="text-[11px] text-[#9ca3af] mt-1">
                Enter replacement credentials. The new secret will be re-encrypted under a newly incremented key version.
              </p>
            </div>

            <div>
              <label className="block text-white font-bold mb-1">New Credentials (JSON)</label>
              <textarea
                rows={4}
                required
                value={JSON.stringify(rotationCredentials, null, 2)}
                onChange={(e) => {
                  try {
                    setRotationCredentials(JSON.parse(e.target.value));
                  } catch (err) {}
                }}
                className="w-full bg-[#030407] border border-[#272a33] rounded p-2 text-[#d4ff24] font-mono text-[11px] outline-none focus:border-purple-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[#272a33]">
              <button
                type="button"
                onClick={() => setIsRotateModalOpen(false)}
                className="px-3 py-1.5 rounded bg-[#171920] border border-[#272a33] text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 rounded bg-purple-600 hover:bg-purple-500 text-white font-bold"
              >
                Confirm Rotation
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default IntegrationsPage;
