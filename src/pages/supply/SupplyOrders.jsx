import { resolveSupplyApiBase } from '../../config/api';
// src/pages/supply/SupplyOrders.jsx
// MODULE 6 — Supplier Order Management
// Lists all orders with date/status/client filters. Links to detail.

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

const API = resolveSupplyApiBase();

const STATUS_META = {
  confirmed:           { label: 'Confirmed',           color: 'bg-blue-100 text-blue-800'   },
  out_for_delivery:    { label: 'Out for Delivery',     color: 'bg-yellow-100 text-yellow-800' },
  delivered:           { label: 'Delivered',            color: 'bg-green-100 text-green-800' },
  partially_delivered: { label: 'Partial Delivery',     color: 'bg-orange-100 text-orange-800' },
  cancelled:           { label: 'Cancelled',            color: 'bg-gray-100 text-gray-500'   },
};

const todayISO = () => new Date().toISOString().split('T')[0];

export default function SupplyOrders() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [orders, setOrders]     = useState([]);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [updatingId, setUpdatingId] = useState(null);

  const date      = searchParams.get('date')   || todayISO();
  const status    = searchParams.get('status') || '';
  const clientId  = searchParams.get('client') || '';

  const token = localStorage.getItem('supply_token');

  const fetchOrders = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ date });
    if (status)   params.set('status',    status);
    if (clientId) params.set('client_id', clientId);

    fetch(`${API}/api/supply/orders?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return; }
        setOrders(data.orders || []);
        setTotal(data.total || 0);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [date, status, clientId, token]);

  useEffect(() => { fetchOrders(); }, [fetchOrders]);

  const setFilter = (key, val) => {
    const p = new URLSearchParams(searchParams);
    if (val) p.set(key, val); else p.delete(key);
    setSearchParams(p);
  };

  const updateStatus = async (orderId, newStatus) => {
    setUpdatingId(orderId);
    try {
      const res = await fetch(`${API}/api/supply/orders/${orderId}/status`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status: newStatus }),
      });
      if (res.ok) fetchOrders();
      else {
        const d = await res.json();
        alert(d.error || 'Status update failed');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const cancelOrder = async (orderId) => {
    if (!window.confirm('Cancel this order?')) return;
    setUpdatingId(orderId);
    try {
      const res = await fetch(`${API}/api/supply/orders/${orderId}/cancel`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      if (res.ok) fetchOrders();
      else {
        const d = await res.json();
        alert(d.error || 'Cancel failed');
      }
    } finally {
      setUpdatingId(null);
    }
  };

  const fmt = n => `₹${Number(n).toFixed(2)}`;

  return (
    <div className="p-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Orders</h1>
          {!loading && <p className="text-sm text-gray-400">{total} order{total !== 1 ? 's' : ''}</p>}
        </div>
        <div className="flex gap-2">
          <Link
            to={`/supply/picking-list?date=${date}`}
            className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium"
          >
            📋 Picking List
          </Link>
          <Link
            to={`/supply/route-sheet?date=${date}`}
            className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg font-medium"
          >
            🗺️ Route Sheet
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <input
          type="date"
          value={date}
          onChange={e => setFilter('date', e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        />
        <select
          value={status}
          onChange={e => setFilter('status', e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="">All statuses</option>
          {Object.entries(STATUS_META).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        {date !== todayISO() && (
          <button
            onClick={() => setFilter('date', todayISO())}
            className="text-sm text-indigo-600 hover:underline"
          >
            Today
          </button>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-xl h-24 animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && orders.length === 0 && !error && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">📦</p>
          <p className="text-sm">No orders for {date}</p>
        </div>
      )}

      {/* Order list */}
      {!loading && orders.length > 0 && (
        <div className="space-y-3">
          {orders.map(order => {
            const sm = STATUS_META[order.status] || { label: order.status, color: 'bg-gray-100 text-gray-600' };
            const isUpdating = updatingId === order.id;

            return (
              <div key={order.id} className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 text-sm">
                        {order.supply_clients?.name}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sm.color}`}>
                        {sm.label}
                      </span>
                      {order.source === 'whatsapp' && (
                        <span className="text-xs bg-green-50 text-green-700 px-1.5 py-0.5 rounded">WA</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {order.order_number} · {new Date(order.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <p className="font-bold text-gray-900 text-sm shrink-0">{fmt(order.total_amount)}</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap mt-3">
                  <Link
                    to={`/supply/orders/${order.id}`}
                    className="text-xs text-indigo-600 hover:underline"
                  >
                    View details
                  </Link>

                  {order.status === 'confirmed' && (
                    <button
                      onClick={() => updateStatus(order.id, 'out_for_delivery')}
                      disabled={isUpdating}
                      className="text-xs bg-yellow-50 hover:bg-yellow-100 text-yellow-800 px-2.5 py-1 rounded-lg font-medium disabled:opacity-50"
                    >
                      {isUpdating ? '…' : '🚚 Mark Out for Delivery'}
                    </button>
                  )}

                  {order.status === 'out_for_delivery' && (
                    <>
                      <button
                        onClick={() => updateStatus(order.id, 'delivered')}
                        disabled={isUpdating}
                        className="text-xs bg-green-50 hover:bg-green-100 text-green-800 px-2.5 py-1 rounded-lg font-medium disabled:opacity-50"
                      >
                        {isUpdating ? '…' : '✅ Mark Delivered'}
                      </button>
                      <Link
                        to={`/supply/orders/${order.id}?action=partial`}
                        className="text-xs bg-orange-50 hover:bg-orange-100 text-orange-800 px-2.5 py-1 rounded-lg font-medium"
                      >
                        Partial Delivery
                      </Link>
                    </>
                  )}

                  {['confirmed', 'out_for_delivery'].includes(order.status) && (
                    <button
                      onClick={() => cancelOrder(order.id)}
                      disabled={isUpdating}
                      className="text-xs text-red-500 hover:text-red-700 ml-auto disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
