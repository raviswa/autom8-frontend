// src/pages/supply/SupplyPickingList.jsx
// MODULE 6 — Aggregated Picking List
// All items needed across all orders for a given delivery date.

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';
const todayISO = () => new Date().toISOString().split('T')[0];

export default function SupplyPickingList() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');
  const [expanded, setExpanded] = useState({});  // item_id → bool

  const date  = searchParams.get('date') || todayISO();
  const token = localStorage.getItem('supply_token');

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`${API}/api/supply/orders/picking-list/${date}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [date, token]);

  const toggleExpand = id => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const handlePrint = () => window.print();

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 print:mb-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 print:text-lg">Picking List</h1>
          {data && (
            <p className="text-sm text-gray-400">
              {data.total_orders} order{data.total_orders !== 1 ? 's' : ''} · {data.total_clients} client{data.total_clients !== 1 ? 's' : ''}
            </p>
          )}
        </div>
        <div className="flex gap-2 print:hidden">
          <input
            type="date"
            value={date}
            onChange={e => setSearchParams({ date: e.target.value })}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm"
          />
          <button
            onClick={handlePrint}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Print-only date header */}
      <div className="hidden print:block mb-4">
        <p className="text-sm text-gray-500">Delivery date: <strong>{date}</strong></p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {loading && (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="bg-white rounded-xl h-14 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data && data.picking_list?.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p className="text-sm">No orders for {date}</p>
        </div>
      )}

      {!loading && data && data.picking_list?.length > 0 && (
        <div className="space-y-2">
          {data.picking_list.map((row, idx) => (
            <div
              key={row.item_id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden print:border print:border-gray-300 print:rounded-none"
            >
              {/* Main row */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer print:cursor-default"
                onClick={() => toggleExpand(row.item_id)}
              >
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-400 w-5 text-right print:w-6">{idx + 1}</span>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{row.item_name}</p>
                    <p className="text-xs text-gray-400">{row.clients.length} client{row.clients.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="font-bold text-gray-900">
                      {Number(row.total_qty) % 1 === 0 ? row.total_qty : Number(row.total_qty).toFixed(3)}
                    </p>
                    <p className="text-xs text-gray-400">{row.unit}</p>
                  </div>
                  <span className="text-gray-300 print:hidden">
                    {expanded[row.item_id] ? '▲' : '▼'}
                  </span>
                </div>
              </div>

              {/* Per-client breakdown */}
              {(expanded[row.item_id] || false) && (
                <div className="border-t border-gray-100 bg-gray-50 px-4 py-2 space-y-1 print:block">
                  {row.clients.map(c => (
                    <div key={c.client_id} className="flex justify-between text-xs text-gray-600">
                      <span>{c.client_name}</span>
                      <span className="font-medium">
                        {Number(c.qty) % 1 === 0 ? c.qty : Number(c.qty).toFixed(3)} {row.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Print: always show breakdown */}
              <div className="hidden print:block border-t border-gray-200 bg-gray-50 px-4 py-2 space-y-1">
                {row.clients.map(c => (
                  <div key={c.client_id} className="flex justify-between text-xs text-gray-600">
                    <span>{c.client_name}</span>
                    <span>{Number(c.qty) % 1 === 0 ? c.qty : Number(c.qty).toFixed(3)} {row.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Print footer */}
      <div className="hidden print:block mt-6 text-xs text-gray-400 border-t pt-3">
        Munafe Supply · Picking list for {date} · Printed {new Date().toLocaleString('en-IN')}
      </div>
    </div>
  );
}
