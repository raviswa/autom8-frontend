// src/pages/supply/SupplyRouteSheet.jsx
// MODULE 6 — Delivery Route Sheet
// Orders for a date grouped by pincode, sorted by client name.
// Printable layout; supplier can tick off deliveries.

import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

const API = import.meta.env.VITE_API_URL || '';
const todayISO = () => new Date().toISOString().split('T')[0];

export default function SupplyRouteSheet() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [ticked, setTicked]   = useState({});    // order_id → bool
  const [expanded, setExpanded] = useState({});  // order_id → bool

  const date  = searchParams.get('date') || todayISO();
  const token = localStorage.getItem('supply_token');

  useEffect(() => {
    setLoading(true);
    setError('');
    setTicked({});
    fetch(`${API}/api/supply/orders/route-sheet/${date}`, {
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

  const toggleTick   = id => setTicked(p => ({ ...p, [id]: !p[id] }));
  const toggleExpand = id => setExpanded(p => ({ ...p, [id]: !p[id] }));

  const allOrders  = data?.route?.flatMap(g => g.stops) || [];
  const tickedCount = Object.values(ticked).filter(Boolean).length;
  const fmt = n => `₹${Number(n).toFixed(2)}`;

  return (
    <div className="p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 print:mb-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 print:text-lg">Route Sheet</h1>
          {data && (
            <p className="text-sm text-gray-400">
              {tickedCount}/{data.total_stops} delivered · {data.route?.length} area{data.route?.length !== 1 ? 's' : ''}
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
            onClick={() => window.print()}
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-lg text-sm font-medium"
          >
            🖨️ Print
          </button>
        </div>
      </div>

      {/* Print date header */}
      <div className="hidden print:block mb-4 pb-3 border-b">
        <p className="text-sm">Delivery date: <strong>{date}</strong></p>
        <p className="text-sm">Total stops: <strong>{data?.total_stops || 0}</strong></p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 rounded-lg p-3 mb-4 text-sm">{error}</div>
      )}

      {loading && (
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-white rounded-xl h-32 animate-pulse" />
          ))}
        </div>
      )}

      {!loading && data && data.total_stops === 0 && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-3xl mb-2">🗺️</p>
          <p className="text-sm">No deliveries for {date}</p>
        </div>
      )}

      {!loading && data && data.route?.map((group, gi) => (
        <div key={group.pincode} className="mb-6 print:mb-4 print:break-inside-avoid">
          {/* Pincode group header */}
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-indigo-600 text-white text-xs font-bold px-3 py-1 rounded-full print:bg-gray-800">
              📍 {group.pincode}
            </div>
            <span className="text-xs text-gray-400">{group.stops.length} stop{group.stops.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="space-y-2">
            {group.stops.map((stop, si) => {
              const isDelivered = ticked[stop.order_id];
              const isExpanded  = expanded[stop.order_id];
              const stopNum     = data.route
                .slice(0, gi)
                .reduce((acc, g) => acc + g.stops.length, 0) + si + 1;

              return (
                <div
                  key={stop.order_id}
                  className={`bg-white rounded-xl border shadow-sm overflow-hidden print:rounded-none print:border-gray-300
                    ${isDelivered ? 'border-green-200 bg-green-50' : 'border-gray-100'}
                  `}
                >
                  {/* Stop header */}
                  <div className="flex items-start gap-3 p-4">
                    {/* Tick checkbox (interactive on screen, static on print) */}
                    <button
                      onClick={() => toggleTick(stop.order_id)}
                      className={`mt-0.5 w-5 h-5 rounded border-2 flex-shrink-0 flex items-center justify-center print:hidden
                        ${isDelivered
                          ? 'bg-green-500 border-green-500 text-white'
                          : 'border-gray-300 hover:border-indigo-400'}
                      `}
                    >
                      {isDelivered && <span className="text-xs leading-none">✓</span>}
                    </button>

                    {/* Print-only checkbox */}
                    <div className="hidden print:block mt-0.5 w-4 h-4 border-2 border-gray-400 rounded flex-shrink-0" />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`font-semibold text-sm ${isDelivered ? 'line-through text-gray-400' : 'text-gray-900'}`}>
                            <span className="text-gray-400 font-normal mr-1">#{stopNum}</span>
                            {stop.client.name}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {stop.client.address}{stop.client.city ? `, ${stop.client.city}` : ''}
                          </p>
                          <p className="text-xs text-gray-400">{stop.client.phone}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="font-bold text-sm text-gray-900">{fmt(stop.total_amount)}</p>
                          <p className="text-xs text-gray-400">{stop.order_number}</p>
                        </div>
                      </div>

                      {/* Item summary */}
                      <div className="mt-2">
                        <button
                          onClick={() => toggleExpand(stop.order_id)}
                          className="text-xs text-indigo-500 hover:underline print:hidden"
                        >
                          {isExpanded ? 'Hide items ▲' : `${stop.items.length} item${stop.items.length !== 1 ? 's' : ''} ▼`}
                        </button>

                        {/* Expanded item list (screen) */}
                        {isExpanded && (
                          <div className="mt-2 space-y-1 print:hidden">
                            {stop.items.map((item, ii) => (
                              <div key={ii} className="flex justify-between text-xs text-gray-600">
                                <span>{item.name}</span>
                                <span className="font-medium">{Number(item.qty) % 1 === 0 ? item.qty : Number(item.qty).toFixed(3)} {item.unit}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Print: always show items */}
                        <div className="hidden print:block mt-2 space-y-1">
                          {stop.items.map((item, ii) => (
                            <div key={ii} className="flex justify-between text-xs text-gray-600">
                              <span>• {item.name}</span>
                              <span>{Number(item.qty) % 1 === 0 ? item.qty : Number(item.qty).toFixed(3)} {item.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Delivery notes field (print only) */}
                  <div className="hidden print:block border-t border-dashed border-gray-200 px-4 py-2">
                    <p className="text-xs text-gray-400">Notes: _________________________________</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Summary footer (screen) */}
      {!loading && data && data.total_stops > 0 && (
        <div className="print:hidden mt-6 bg-indigo-50 rounded-xl p-4 text-sm text-indigo-800">
          <div className="flex justify-between">
            <span>Total deliveries</span>
            <span className="font-bold">{data.total_stops}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Completed</span>
            <span className="font-bold text-green-700">{tickedCount}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span>Remaining</span>
            <span className="font-bold text-orange-700">{data.total_stops - tickedCount}</span>
          </div>
        </div>
      )}

      {/* Print footer */}
      <div className="hidden print:block mt-8 text-xs text-gray-400 border-t pt-3">
        Munafe Supply · Route sheet for {date} · Printed {new Date().toLocaleString('en-IN')}
      </div>
    </div>
  );
}
