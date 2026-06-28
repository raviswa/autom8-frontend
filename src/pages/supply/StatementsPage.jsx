import { resolveSupplyApiBase } from '../../config/api';
// src/pages/supply/StatementsPage.jsx
// ============================================================================
// MODULE 10 — Statement Engine · Frontend
//
// Two tabs:
//   1. Credit Book  — all clients, outstanding balances, overdue/blocked flags
//   2. Statements   — per-client monthly statement list + generate / download
// ============================================================================

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import {
  BookOpen, TrendingUp, AlertTriangle, Ban,
  Download, Send, RefreshCw, ChevronRight,
  ArrowLeft, Calendar, FileText, CheckCircle2,
  Clock, Filter, ArrowUpDown
} from 'lucide-react';

const API = resolveSupplyApiBase();

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiFetch(path, opts = {}) {
  const token = localStorage.getItem('supply_token');
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// ── Utility ───────────────────────────────────────────────────────────────────

function fmt(n) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR', maximumFractionDigits: 0,
  }).format(n || 0);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function monthLabel(str) {
  if (!str) return '—';
  const [y, m] = str.split('-');
  return new Date(y, parseInt(m) - 1, 1)
    .toLocaleString('en-IN', { month: 'long', year: 'numeric' });
}

function prevMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// ── Summary card ──────────────────────────────────────────────────────────────

function SummaryCard({ icon: Icon, label, value, sub, accent }) {
  const colors = {
    blue:   'bg-blue-50 text-blue-600 border-blue-100',
    red:    'bg-red-50 text-red-600 border-red-100',
    orange: 'bg-orange-50 text-orange-600 border-orange-100',
    green:  'bg-emerald-50 text-emerald-600 border-emerald-100',
  };
  return (
    <div className={`rounded-xl border p-4 flex items-start gap-3 ${colors[accent]}`}>
      <div className="p-2 rounded-lg bg-white/60">
        <Icon size={18} />
      </div>
      <div>
        <p className="text-xs font-medium opacity-70">{label}</p>
        <p className="text-xl font-bold mt-0.5">{value}</p>
        {sub && <p className="text-xs opacity-60 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Credit Book tab ───────────────────────────────────────────────────────────

function CreditBookTab({ onSelectClient }) {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');   // all | overdue
  const [sort, setSort]     = useState('balance'); // balance | overdue

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(
        `/api/supply/statements/credit-book?filter=${filter === 'overdue' ? 'overdue' : ''}&sort=${sort}`
      );
      setData(res);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [filter, sort]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-16 text-center text-gray-400 text-sm">Loading credit book…</div>;
  if (!data)   return null;

  const { clients, totals } = data;

  return (
    <div className="space-y-5">
      {/* Summary row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <SummaryCard icon={TrendingUp}    label="Total Outstanding" value={fmt(totals.total_outstanding)} accent="blue" />
        <SummaryCard icon={AlertTriangle} label="Overdue Clients"   value={totals.overdue_count}         sub="past credit terms" accent="red" />
        <SummaryCard icon={Ban}           label="Credit Blocked"    value={totals.blocked_count}         sub="limit reached" accent="orange" />
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {['all', 'overdue'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 capitalize transition-colors ${
                filter === f ? 'bg-gray-900 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-auto text-sm">
          <ArrowUpDown size={13} className="text-gray-400" />
          <span className="text-gray-500">Sort:</span>
          {['balance', 'overdue'].map(s => (
            <button
              key={s}
              onClick={() => setSort(s)}
              className={`px-2.5 py-1 rounded border capitalize transition-colors text-xs ${
                sort === s ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 text-gray-600 hover:border-gray-400'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <button onClick={load} className="p-1.5 rounded border border-gray-200 hover:bg-gray-50">
          <RefreshCw size={14} className="text-gray-500" />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Client</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Outstanding</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Limit</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Available</th>
              <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="py-10 text-center text-gray-400 text-sm">
                  No clients match the current filter.
                </td>
              </tr>
            )}
            {clients.map(c => (
              <tr
                key={c.client_id}
                className="hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => onSelectClient(c)}
              >
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-400">{c.phone} · Net {c.credit_terms_days}d</p>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className={`font-semibold ${c.outstanding > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                    {fmt(c.outstanding)}
                  </span>
                  {c.days_outstanding > 0 && (
                    <p className="text-xs text-gray-400">{c.days_outstanding}d old</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right hidden md:table-cell text-gray-600">
                  {c.credit_limit > 0 ? fmt(c.credit_limit) : '∞'}
                </td>
                <td className="px-4 py-3 text-right hidden md:table-cell">
                  {c.credit_available !== null
                    ? <span className={c.credit_available === 0 ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                        {fmt(c.credit_available)}
                      </span>
                    : <span className="text-gray-400">Unlimited</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1 justify-center">
                    {c.credit_blocked && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Blocked</span>
                    )}
                    {c.is_overdue && !c.credit_blocked && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Overdue</span>
                    )}
                    {!c.is_overdue && !c.credit_blocked && c.outstanding > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">Active</span>
                    )}
                    {c.outstanding === 0 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">Clear</span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <ChevronRight size={15} className="text-gray-300 inline" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Statements tab (per-client) ───────────────────────────────────────────────

function ClientStatementsView({ client, onBack }) {
  const [statements, setStatements] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [generating, setGenerating] = useState(false);
  const [month, setMonth]           = useState(prevMonth());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch(`/api/supply/statements/${client.client_id}`);
      setStatements(res.statements || []);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  }, [client.client_id]);

  useEffect(() => { load(); }, [load]);

  async function handleGenerate() {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      toast.error('Select a valid month');
      return;
    }
    setGenerating(true);
    try {
      const res = await apiFetch(
        `/api/supply/statements/generate/${client.client_id}?month=${month}`,
        { method: 'POST' }
      );
      toast.success(`Statement generated for ${monthLabel(month)}`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(stmt) {
    try {
      const res = await apiFetch(`/api/supply/statements/${stmt.id}/pdf`);
      window.open(res.url, '_blank');
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function handleResend(stmt) {
    try {
      await apiFetch(`/api/supply/statements/${stmt.id}/resend`, { method: 'POST' });
      toast.success('Statement queued for WhatsApp delivery');
      load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  return (
    <div className="space-y-5">
      {/* Back + header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100">
          <ArrowLeft size={16} className="text-gray-500" />
        </button>
        <div>
          <h3 className="font-semibold text-gray-900">{client.name}</h3>
          <p className="text-xs text-gray-400">
            Outstanding: <span className={client.outstanding > 0 ? 'text-orange-600 font-semibold' : 'text-emerald-600 font-semibold'}>
              {fmt(client.outstanding)}
            </span>
            {client.is_overdue && <span className="ml-2 text-red-500">· Overdue</span>}
          </p>
        </div>
      </div>

      {/* Generate panel */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Generate statement for</label>
          <input
            type="month"
            value={month}
            onChange={e => setMonth(e.target.value)}
            max={prevMonth()}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 disabled:opacity-50 transition-colors"
        >
          {generating ? <RefreshCw size={14} className="animate-spin" /> : <FileText size={14} />}
          {generating ? 'Generating…' : 'Generate PDF'}
        </button>
      </div>

      {/* Statements list */}
      {loading ? (
        <div className="py-10 text-center text-gray-400 text-sm">Loading statements…</div>
      ) : statements.length === 0 ? (
        <div className="py-10 text-center text-gray-400 text-sm">
          No statements yet. Generate one above.
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Period</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Debits</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Credits</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Closing</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Sent</th>
                <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {statements.map(stmt => (
                <tr key={stmt.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <p className="font-medium text-gray-900">{monthLabel(stmt.period_start)}</p>
                    <p className="text-xs text-gray-400">
                      Opening: {fmt(stmt.opening_balance)}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell text-red-600">
                    {fmt(stmt.total_debits)}
                  </td>
                  <td className="px-4 py-3 text-right hidden md:table-cell text-emerald-600">
                    {fmt(stmt.total_credits)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-semibold ${stmt.closing_balance > 0 ? 'text-gray-900' : 'text-emerald-600'}`}>
                      {fmt(stmt.closing_balance)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {stmt.sent_to_client ? (
                      <span title={`Sent ${fmtDate(stmt.sent_at)}`}>
                        <CheckCircle2 size={16} className="text-emerald-500 inline" />
                      </span>
                    ) : (
                      <Clock size={15} className="text-gray-300 inline" />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      {stmt.pdf_url ? (
                        <>
                          <button
                            onClick={() => handleDownload(stmt)}
                            title="Download PDF"
                            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-600 transition-colors"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleResend(stmt)}
                            title="Resend via WhatsApp"
                            className="p-1.5 rounded-lg hover:bg-green-50 text-green-600 transition-colors"
                          >
                            <Send size={14} />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-400">No PDF</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Root page ─────────────────────────────────────────────────────────────────

export default function StatementsPage() {
  const [tab, setTab]                 = useState('credit-book'); // credit-book | statements
  const [selectedClient, setSelected] = useState(null);

  function handleSelectClient(client) {
    setSelected(client);
    setTab('statements');
  }

  function handleBack() {
    setSelected(null);
    setTab('credit-book');
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <BookOpen size={20} />
          Credit Book &amp; Statements
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Outstanding balances, account statements, and PDF dispatch
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { key: 'credit-book', label: 'Credit Book' },
          { key: 'statements',  label: selectedClient ? `${selectedClient.name} — Statements` : 'Statements' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              if (t.key === 'credit-book') setSelected(null);
            }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-gray-900 text-gray-900'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'credit-book' && (
        <CreditBookTab onSelectClient={handleSelectClient} />
      )}
      {tab === 'statements' && !selectedClient && (
        <div className="py-10 text-center text-gray-400 text-sm">
          Click a client in the Credit Book to view their statements.
        </div>
      )}
      {tab === 'statements' && selectedClient && (
        <ClientStatementsView client={selectedClient} onBack={handleBack} />
      )}
    </div>
  );
}
