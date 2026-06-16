// Munafe Supply — supplier dashboard (clients, catalog, orders, payment claims)

import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

const emptyClient = {
  name: '', phone: '', gstin: '', credit_limit: 50000, address: '',
};

export default function SupplyDashboard() {
  const { apiClient } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [tab, setTab] = useState('clients');
  const [clients, setClients] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [orders, setOrders] = useState([]);
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [catalogForm, setCatalogForm] = useState({
    name: '', category: 'Vegetables', unit: 'kg', default_price: 0, gst_rate: 0,
  });
  const [message, setMessage] = useState('');

  const loadSuppliers = useCallback(async () => {
    const { data } = await apiClient.get('/api/supply/dashboard/my-suppliers');
    setSuppliers(data.suppliers || []);
    if (data.suppliers?.length === 1) setSupplierId(data.suppliers[0].id);
  }, [apiClient]);

  const loadTab = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    try {
      if (tab === 'clients') {
        const { data } = await apiClient.get(`/api/supply/dashboard/${supplierId}/clients`);
        setClients(data.clients || []);
      } else if (tab === 'catalog') {
        const { data } = await apiClient.get(`/api/supply/dashboard/${supplierId}/catalog`);
        setCatalog(data.items || []);
      } else if (tab === 'orders') {
        const { data } = await apiClient.get(`/api/supply/dashboard/${supplierId}/orders`);
        setOrders(data.orders || []);
      } else if (tab === 'claims') {
        const { data } = await apiClient.get(`/api/supply/dashboard/${supplierId}/payment-claims`);
        setClaims(data.claims || []);
      }
    } catch (e) {
      setMessage(e.response?.data?.error || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [apiClient, supplierId, tab]);

  useEffect(() => { loadSuppliers(); }, [loadSuppliers]);
  useEffect(() => { loadTab(); }, [loadTab]);

  const addClient = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post(`/api/supply/dashboard/${supplierId}/clients`, clientForm);
      setClientForm(emptyClient);
      setMessage('Client added');
      loadTab();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to add client');
    }
  };

  const addCatalogItem = async (e) => {
    e.preventDefault();
    try {
      await apiClient.post(`/api/supply/dashboard/${supplierId}/catalog`, catalogForm);
      setCatalogForm({ name: '', category: 'Vegetables', unit: 'kg', default_price: 0, gst_rate: 0 });
      setMessage('Catalog item added');
      loadTab();
    } catch (err) {
      setMessage(err.response?.data?.error || 'Failed to add item');
    }
  };

  const confirmClaim = async (claimId, amount) => {
    await apiClient.post(`/api/supply/dashboard/${supplierId}/payment-claim/${claimId}/confirm`, { amount });
    setMessage('Payment confirmed');
    loadTab();
  };

  const rejectClaim = async (claimId) => {
    await apiClient.post(`/api/supply/dashboard/${supplierId}/payment-claim/${claimId}/reject`);
    setMessage('Payment claim rejected');
    loadTab();
  };

  if (!suppliers.length && !loading) {
    return (
      <div className="max-w-2xl mx-auto p-8">
        <h1 className="text-2xl font-semibold text-slate-900">Munafe Supply</h1>
        <p className="mt-4 text-slate-600">
          No supplier account linked to your login yet. Ask ops to set{' '}
          <code className="text-sm bg-slate-100 px-1 rounded">owner_user_id</code> on your supplier row.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-slate-900">Munafe Supply</h1>
        {suppliers.length > 1 && (
          <select
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
            className="mt-2 border border-slate-300 rounded-lg px-3 py-2"
          >
            <option value="">Select supplier…</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}
        <nav className="flex gap-4 mt-4 text-sm">
          {['clients', 'catalog', 'orders', 'claims'].map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={tab === t ? 'font-semibold text-emerald-700' : 'text-slate-600'}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </nav>
      </header>

      <main className="max-w-4xl mx-auto p-6">
        {message && (
          <p className="mb-4 text-sm text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">{message}</p>
        )}
        {!supplierId ? (
          <p className="text-slate-600">Select a supplier to continue.</p>
        ) : loading ? (
          <p className="text-slate-600">Loading…</p>
        ) : tab === 'clients' ? (
          <div className="space-y-6">
            <form onSubmit={addClient} className="bg-white rounded-xl border p-4 grid gap-3 md:grid-cols-2">
              <input placeholder="Client name" required value={clientForm.name}
                onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                className="border rounded-lg px-3 py-2" />
              <input placeholder="WhatsApp phone (10 digits)" required value={clientForm.phone}
                onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                className="border rounded-lg px-3 py-2" />
              <input placeholder="GSTIN" value={clientForm.gstin}
                onChange={(e) => setClientForm({ ...clientForm, gstin: e.target.value })}
                className="border rounded-lg px-3 py-2" />
              <input type="number" placeholder="Credit limit" value={clientForm.credit_limit}
                onChange={(e) => setClientForm({ ...clientForm, credit_limit: Number(e.target.value) })}
                className="border rounded-lg px-3 py-2" />
              <button type="submit" className="md:col-span-2 bg-emerald-600 text-white rounded-lg py-2">
                Add client
              </button>
            </form>
            <ul className="space-y-2">
              {clients.map((c) => (
                <li key={c.id} className="bg-white rounded-lg border px-4 py-3 flex justify-between">
                  <span>{c.name} · {c.phone}</span>
                  <span className="text-slate-500">₹{c.credit_limit} limit</span>
                </li>
              ))}
            </ul>
          </div>
        ) : tab === 'catalog' ? (
          <div className="space-y-6">
            <form onSubmit={addCatalogItem} className="bg-white rounded-xl border p-4 grid gap-3 md:grid-cols-2">
              <input placeholder="Item name" required value={catalogForm.name}
                onChange={(e) => setCatalogForm({ ...catalogForm, name: e.target.value })}
                className="border rounded-lg px-3 py-2" />
              <input placeholder="Category" value={catalogForm.category}
                onChange={(e) => setCatalogForm({ ...catalogForm, category: e.target.value })}
                className="border rounded-lg px-3 py-2" />
              <input placeholder="Unit" value={catalogForm.unit}
                onChange={(e) => setCatalogForm({ ...catalogForm, unit: e.target.value })}
                className="border rounded-lg px-3 py-2" />
              <input type="number" placeholder="Default price" value={catalogForm.default_price}
                onChange={(e) => setCatalogForm({ ...catalogForm, default_price: Number(e.target.value) })}
                className="border rounded-lg px-3 py-2" />
              <button type="submit" className="md:col-span-2 bg-emerald-600 text-white rounded-lg py-2">
                Add catalog item
              </button>
            </form>
            <ul className="space-y-2">
              {catalog.map((item) => (
                <li key={item.id} className="bg-white rounded-lg border px-4 py-3 flex justify-between">
                  <span>{item.name} ({item.unit})</span>
                  <span>₹{item.default_price}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : tab === 'orders' ? (
          <ul className="space-y-2">
            {orders.map((o) => (
              <li key={o.id} className="bg-white rounded-lg border px-4 py-3">
                <p className="font-medium">#{o.order_number} · {o.supply_clients?.name}</p>
                <p className="text-sm text-slate-600">₹{o.total_amount} · {o.status}</p>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-3">
            {claims.map((c) => (
              <li key={c.id} className="bg-white rounded-lg border px-4 py-3">
                <p className="font-medium">{c.supply_clients?.name} — ₹{c.claimed_amount ?? '?'}</p>
                <p className="text-sm text-slate-600">{c.method} · {c.reference || 'no ref'}</p>
                <div className="flex gap-2 mt-2">
                  <button type="button" onClick={() => confirmClaim(c.id, c.claimed_amount)}
                    className="text-sm px-3 py-1 bg-emerald-600 text-white rounded-lg">Confirm</button>
                  <button type="button" onClick={() => rejectClaim(c.id)}
                    className="text-sm px-3 py-1 border rounded-lg">Reject</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
