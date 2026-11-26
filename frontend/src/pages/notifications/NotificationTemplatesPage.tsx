import React, { useCallback, useEffect, useState } from 'react';
import {
  Mail,
  Eye,
  Send,
  RotateCcw,
  Save,
  RefreshCw,
  Server,
  Activity,
  CheckCircle2,
  AlertTriangle,
  Clock,
  XCircle,
} from 'lucide-react';
import { api } from '../../services/api';
import { formatRelativeTime } from '../../utils/formatters';
import type {
  ApiResult,
  EmailProviderStatus,
  NotificationDeliveryLog,
  NotificationTemplateItem,
  RenderedEmailResult,
} from '../../types';

export const NotificationTemplatesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'templates' | 'logs'>('templates');

  const [providerStatus, setProviderStatus] = useState<EmailProviderStatus | null>(null);
  const [templates, setTemplates] = useState<NotificationTemplateItem[]>([]);
  const [selectedCode, setSelectedCode] = useState<string>('');

  // Editable form fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [subjectTemplate, setSubjectTemplate] = useState('');
  const [bodyHtmlTemplate, setBodyHtmlTemplate] = useState('');
  const [accentColor, setAccentColor] = useState('#0D9488');
  const [actionLabel, setActionLabel] = useState('Buka Aplikasi');
  const [defaultSendInApp, setDefaultSendInApp] = useState(true);
  const [defaultSendEmail, setDefaultSendEmail] = useState(true);
  const [defaultSendPush, setDefaultSendPush] = useState(true);
  const [isActive, setIsActive] = useState(true);

  const [preview, setPreview] = useState<RenderedEmailResult | null>(null);
  const [testRecipient, setTestRecipient] = useState('ronysamuel19@gmail.com');
  const [saving, setSaving] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [previewing, setPreviewing] = useState(false);

  // Delivery logs state
  const [logs, setLogs] = useState<NotificationDeliveryLog[]>([]);
  const [logChannel, setLogChannel] = useState('');
  const [logStatus, setLogStatus] = useState('');
  const [loadingLogs, setLoadingLogs] = useState(false);

  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const applyTemplateToEditor = useCallback((tpl: NotificationTemplateItem) => {
    setSelectedCode(tpl.code);
    setName(tpl.name);
    setDescription(tpl.description);
    setSubjectTemplate(tpl.subjectTemplate);
    setBodyHtmlTemplate(tpl.bodyHtmlTemplate);
    setAccentColor(tpl.accentColor);
    setActionLabel(tpl.actionLabel);
    setDefaultSendInApp(tpl.defaultSendInApp);
    setDefaultSendEmail(tpl.defaultSendEmail);
    setDefaultSendPush(tpl.defaultSendPush);
    setIsActive(tpl.isActive);
  }, []);

  const loadInitial = useCallback(async () => {
    try {
      const [statusRes, tplRes] = await Promise.all([
        api.get<ApiResult<EmailProviderStatus>>('/notifications/provider-status'),
        api.get<ApiResult<NotificationTemplateItem[]>>('/notifications/templates'),
      ]);
      if (statusRes.data.succeeded && statusRes.data.data) {
        setProviderStatus(statusRes.data.data);
        if (statusRes.data.data.devOverrideRecipient) {
          setTestRecipient(statusRes.data.data.devOverrideRecipient);
        }
      }
      if (tplRes.data.succeeded && tplRes.data.data) {
        setTemplates(tplRes.data.data);
        if (tplRes.data.data.length > 0) {
          const current = tplRes.data.data.find((t) => t.code === selectedCode) ?? tplRes.data.data[0];
          applyTemplateToEditor(current);
        }
      }
    } catch {
      setBanner({ type: 'error', text: 'Gagal memuat konfigurasi Notification.Api (:5088).' });
    }
  }, [applyTemplateToEditor, selectedCode]);

  const loadLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const res = await api.get<ApiResult<NotificationDeliveryLog[]>>('/notifications/delivery-logs', {
        params: {
          channel: logChannel || undefined,
          status: logStatus || undefined,
          limit: 100,
        },
      });
      if (res.data.succeeded && res.data.data) {
        setLogs(res.data.data);
      }
    } catch {
      setBanner({ type: 'error', text: 'Gagal memuat delivery logs.' });
    } finally {
      setLoadingLogs(false);
    }
  }, [logChannel, logStatus]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  useEffect(() => {
    if (activeTab === 'logs') loadLogs();
  }, [activeTab, loadLogs]);

  const runPreview = useCallback(
    async (code: string, overrides?: { subjectTemplate?: string; bodyHtmlTemplate?: string; accentColor?: string; actionLabel?: string }) => {
      if (!code) return;
      setPreviewing(true);
      try {
        const res = await api.post<ApiResult<RenderedEmailResult>>(
          `/notifications/templates/${code}/preview`,
          overrides ?? { subjectTemplate, bodyHtmlTemplate, accentColor, actionLabel }
        );
        if (res.data.succeeded && res.data.data) {
          setPreview(res.data.data);
        }
      } catch {
        // ignore
      } finally {
        setPreviewing(false);
      }
    },
    [subjectTemplate, bodyHtmlTemplate, accentColor, actionLabel]
  );

  useEffect(() => {
    if (selectedCode) {
      const tpl = templates.find((t) => t.code === selectedCode);
      if (tpl) {
        runPreview(tpl.code, {
          subjectTemplate: tpl.subjectTemplate,
          bodyHtmlTemplate: tpl.bodyHtmlTemplate,
          accentColor: tpl.accentColor,
          actionLabel: tpl.actionLabel,
        });
      }
    }
  }, [selectedCode, templates, runPreview]);

  const handleSave = async () => {
    if (!selectedCode) return;
    setSaving(true);
    setBanner(null);
    try {
      const res = await api.put<ApiResult<NotificationTemplateItem>>(
        `/notifications/templates/${selectedCode}`,
        {
          name,
          description,
          subjectTemplate,
          bodyHtmlTemplate,
          accentColor,
          actionLabel,
          defaultSendInApp,
          defaultSendEmail,
          defaultSendPush,
          isActive,
        }
      );
      if (res.data.succeeded && res.data.data) {
        setBanner({ type: 'success', text: res.data.message || 'Template disimpan.' });
        setTemplates((prev) => prev.map((t) => (t.code === selectedCode ? res.data.data! : t)));
        await runPreview(selectedCode);
      }
    } catch {
      setBanner({ type: 'error', text: 'Gagal menyimpan template.' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!selectedCode) return;
    setBanner(null);
    try {
      const res = await api.post<ApiResult<NotificationTemplateItem>>(
        `/notifications/templates/${selectedCode}/reset`
      );
      if (res.data.succeeded && res.data.data) {
        applyTemplateToEditor(res.data.data);
        setTemplates((prev) => prev.map((t) => (t.code === selectedCode ? res.data.data! : t)));
        setBanner({ type: 'success', text: res.data.message });
      }
    } catch {
      setBanner({ type: 'error', text: 'Gagal mereset template ke default file HTML.' });
    }
  };

  const handleSendTestEmail = async () => {
    if (!selectedCode) return;
    setSendingTest(true);
    setBanner(null);
    try {
      const res = await api.post<ApiResult<NotificationDeliveryLog>>(
        `/notifications/templates/${selectedCode}/test-email`,
        { recipientEmail: testRecipient }
      );
      if (res.data.succeeded) {
        setBanner({ type: 'success', text: res.data.message });
      } else {
        setBanner({ type: 'error', text: res.data.message || 'Gagal mengirim test email.' });
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      setBanner({ type: 'error', text: msg || 'Gagal mengirim test email.' });
    } finally {
      setSendingTest(false);
    }
  };

  const handleRetryLog = async (id: string) => {
    try {
      const res = await api.post<ApiResult<NotificationDeliveryLog>>(
        `/notifications/delivery-logs/${id}/retry`
      );
      if (res.data.succeeded) {
        setBanner({ type: 'success', text: res.data.message });
        loadLogs();
      }
    } catch {
      setBanner({ type: 'error', text: 'Gagal menjadwalkan ulang pengiriman.' });
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'Sent':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Sent
          </span>
        );
      case 'Simulated':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <AlertTriangle className="w-3 h-3" /> Simulated
          </span>
        );
      case 'Failed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" /> Failed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-50 text-sky-700 border border-sky-200">
            <Clock className="w-3 h-3" /> {status}
          </span>
        );
    }
  };

  const selectedTemplate = templates.find((t) => t.code === selectedCode);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2.5">
            <Mail className="w-6 h-6 text-teal-600" />
            <span>Template &amp; Log Email (Notification.Api)</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Manajemen template HTML Scriban (_BaseLayout + Body Partial), Live Preview, Send Test Email, &amp; Outbox Delivery Log.
          </p>
        </div>
      </div>

      {/* SMTP & Push Provider Status Banner */}
      {providerStatus && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5 text-teal-600" />
              <span>Provider SMTP Aktif</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">{providerStatus.activeProvider}</span>
              {providerStatus.profiles.find((p) => p.isActive)?.hasCredentials ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700">
                  Kredensial Siap
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                  Mode Simulasi (Isi User Secrets)
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Dev Override: <code className="font-mono text-teal-700">{providerStatus.devOverrideRecipient || '-'}</code>
            </p>
          </div>

          <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {providerStatus.profiles.map((p) => (
              <div
                key={p.name}
                className={`p-3 rounded-xl border text-xs ${
                  p.isActive
                    ? 'bg-teal-50/50 border-teal-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900">{p.name}</span>
                  <span className={`text-[10px] font-bold ${p.isActive ? 'text-teal-700' : 'text-slate-400'}`}>
                    {p.isActive ? 'AKTIF' : 'STANDBY'}
                  </span>
                </div>
                <p className="font-mono text-[11px] text-slate-600 mt-1">
                  {p.host}:{p.port} ({p.security})
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  From: {p.fromEmail || '(belum diset di user-secrets)'}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {banner && (
        <div
          className={`px-4 py-3 rounded-xl text-sm border flex items-center justify-between ${
            banner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{banner.text}</span>
          <button type="button" onClick={() => setBanner(null)} className="text-xs font-semibold underline ml-3">
            Tutup
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('templates')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'templates'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Mail className="w-4 h-4" />
          <span>Katalog Template HTML ({templates.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('logs')}
          className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            activeTab === 'logs'
              ? 'border-teal-600 text-teal-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Delivery Log &amp; Retry Queue</span>
        </button>
      </div>

      {activeTab === 'templates' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          {/* Left catalog */}
          <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-700 uppercase tracking-wider">
              Daftar Template ({templates.length})
            </div>
            <div className="divide-y divide-slate-100 max-h-[680px] overflow-y-auto">
              {templates.map((tpl) => {
                const active = tpl.code === selectedCode;
                return (
                  <button
                    key={tpl.code}
                    type="button"
                    onClick={() => applyTemplateToEditor(tpl)}
                    className={`w-full text-left p-3.5 transition-colors hover:bg-slate-50 ${
                      active ? 'bg-teal-50/70 border-l-4 border-teal-600' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {tpl.category}
                      </span>
                      <span
                        className="w-3 h-3 rounded-full border border-white shadow-xs"
                        style={{ backgroundColor: tpl.accentColor }}
                      />
                    </div>
                    <p className="text-sm font-bold text-slate-900 mt-1.5">{tpl.name}</p>
                    <p className="text-[11px] font-mono text-slate-400 mt-0.5">{tpl.code}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right editor + preview */}
          <div className="xl:col-span-8 space-y-5">
            {selectedTemplate && (
              <>
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">{selectedTemplate.name}</h2>
                      <p className="text-xs text-slate-500">
                        Kode: <code className="font-mono text-teal-700">{selectedTemplate.code}</code> • Default file:{' '}
                        <code className="font-mono">{selectedTemplate.defaultFileName}</code>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleReset}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Reset File Default</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => runPreview(selectedCode)}
                        disabled={previewing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Refresh Preview</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>{saving ? 'Menyimpan...' : 'Simpan'}</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Subject Email (Scriban)</label>
                      <input
                        type="text"
                        value={subjectTemplate}
                        onChange={(e) => setSubjectTemplate(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Label Tombol CTA</label>
                        <input
                          type="text"
                          value={actionLabel}
                          onChange={(e) => setActionLabel(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:ring-2 focus:ring-teal-500 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Warna Accent</label>
                        <div className="flex items-center gap-2">
                          <input
                            type="color"
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            className="w-10 h-9 rounded border border-slate-300 cursor-pointer"
                          />
                          <input
                            type="text"
                            value={accentColor}
                            onChange={(e) => setAccentColor(e.target.value)}
                            className="flex-1 px-2.5 py-2 rounded-xl border border-slate-300 text-xs font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-5 text-xs text-slate-700 pt-1">
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={defaultSendInApp} onChange={(e) => setDefaultSendInApp(e.target.checked)} />
                      <span>Default In-App</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={defaultSendEmail} onChange={(e) => setDefaultSendEmail(e.target.checked)} />
                      <span>Default Email</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={defaultSendPush} onChange={(e) => setDefaultSendPush(e.target.checked)} />
                      <span>Default Push</span>
                    </label>
                    <label className="inline-flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
                      <span>Aktif</span>
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Body HTML Partial (otomatis dibungkus <code>_BaseLayout.html</code>)
                    </label>
                    <textarea
                      rows={8}
                      value={bodyHtmlTemplate}
                      onChange={(e) => setBodyHtmlTemplate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-xs font-mono leading-relaxed focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    />
                  </div>

                  {/* Send Test Email box */}
                  <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                    <div className="flex-1">
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Kirim Test Email (pakai sample data template ini)
                      </label>
                      <input
                        type="email"
                        value={testRecipient}
                        onChange={(e) => setTestRecipient(e.target.value)}
                        placeholder="ronysamuel19@gmail.com"
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleSendTestEmail}
                      disabled={sendingTest}
                      className="sm:mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold disabled:opacity-50"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{sendingTest ? 'Mengirim...' : 'Send Test Email'}</span>
                    </button>
                  </div>
                </div>

                {/* Live Email Preview iframe */}
                <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[11px] font-bold uppercase text-slate-400">Live Preview</span>
                      <p className="text-xs font-bold text-slate-900 truncate">
                        Subject: {preview?.subject || '(memuat...)'}
                      </p>
                    </div>
                  </div>
                  {preview ? (
                    <iframe
                      title="Email Preview"
                      srcDoc={preview.htmlBody}
                      sandbox=""
                      className="w-full h-[460px] bg-slate-100 border-0"
                    />
                  ) : (
                    <div className="p-10 text-center text-xs text-slate-400">Memuat preview...</div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={logChannel}
                onChange={(e) => setLogChannel(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium"
              >
                <option value="">Semua Channel</option>
                <option value="Email">Email</option>
                <option value="Push">Push</option>
              </select>
              <select
                value={logStatus}
                onChange={(e) => setLogStatus(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-xs font-medium"
              >
                <option value="">Semua Status</option>
                <option value="Sent">Sent</option>
                <option value="Simulated">Simulated</option>
                <option value="Pending">Pending</option>
                <option value="Failed">Failed</option>
              </select>
            </div>
            <button
              type="button"
              onClick={loadLogs}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border border-slate-300 bg-white hover:bg-slate-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingLogs ? 'animate-spin' : ''}`} />
              <span>Refresh Log</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50 text-left text-[11px] uppercase text-slate-500">
                  <th className="py-3 px-4">Waktu</th>
                  <th className="py-3 px-4">Channel &amp; Provider</th>
                  <th className="py-3 px-4">Penerima</th>
                  <th className="py-3 px-4">Template &amp; Subject</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-slate-400">
                      Belum ada riwayat pengiriman Email atau Push.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                        {formatRelativeTime(log.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">{log.channel}</span>
                        <div className="text-[11px] text-slate-500">{log.providerName || '-'}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-900">{log.recipientName}</div>
                        <div className="font-mono text-[11px] text-slate-500 truncate max-w-[210px]">
                          {log.channel === 'Email'
                            ? log.effectiveRecipientEmail || log.recipientEmail
                            : log.recipientPushToken}
                        </div>
                        {log.channel === 'Email' &&
                          log.effectiveRecipientEmail &&
                          log.recipientEmail &&
                          log.effectiveRecipientEmail !== log.recipientEmail && (
                            <div className="text-[10px] text-amber-700">Asli: {log.recipientEmail}</div>
                          )}
                      </td>
                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-semibold text-slate-900 truncate">{log.subject}</div>
                        <div className="font-mono text-[10px] text-slate-400">{log.templateCode}</div>
                        {log.lastError && (
                          <div className="text-[11px] text-rose-600 mt-0.5 line-clamp-2">{log.lastError}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {statusBadge(log.status)}
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Attempt {log.attemptCount}/{log.maxAttempts}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {(log.status === 'Failed' || log.status === 'Simulated') && (
                          <button
                            type="button"
                            onClick={() => handleRetryLog(log.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Retry</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
