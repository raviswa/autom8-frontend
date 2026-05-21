// ============================================================================
// AUTOM8 FRONTEND - CUSTOMER WALK-IN FORM (QR Code Landing Page)
// src/pages/WalkInForm.jsx
//
// FIX: restaurant_id is read from the URL query parameter ?restaurant=<uuid>
//      This is the correct multi-tenant approach — each restaurant's QR code
//      encodes their own ID in the URL. No env var needed.
//
//      QR code for Munafe should point to:
//        https://autom8-frontend-production.up.railway.app/checkin?restaurant=46fb9b9e-431a-43c9-9edb-d316b0fef216
//
//      For each new restaurant, generate a QR code with their own UUID.
//
// Route in App.jsx / router:
//   <Route path="/checkin" element={<WalkInForm />} />
// ============================================================================

import React, { useState } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function WalkInForm() {
  const [step,    setStep]    = useState('form');   // 'form' | 'token'
  const [name,    setName]    = useState('');
  const [phone,   setPhone]   = useState('');
  const [type,    setType]    = useState('');        // 'dinein' | 'takeaway'
  const [pax,     setPax]     = useState(2);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [token,   setToken]   = useState(null);

  // Read restaurant_id from URL query param — e.g. /checkin?restaurant=<uuid>
  // This is set once when the QR code is generated, works for any number of restaurants.
  const restaurantId = new URLSearchParams(window.location.search).get('restaurant');

  const submit = async () => {
    if (!name.trim()) { setError('Please enter your name');              return; }
    if (!type)        { setError('Please choose dine-in or takeaway');   return; }
    if (type === 'dinein' && (pax < 1 || pax > 20)) {
      setError('Please enter a valid number of people (1–20)');
      return;
    }
    if (!restaurantId) {
      setError('Invalid QR code — restaurant not found. Please scan the QR code at the entrance again.');
      console.error('[WalkInForm] No ?restaurant= param in URL:', window.location.href);
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/tokens`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          name.trim(),
          phone:         phone.trim(),
          type,
          pax:           type === 'takeaway' ? 1 : pax,
          restaurant_id: restaurantId,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create token');
      }

      const data = await res.json();
      setToken(data.token);
      setStep('token');
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─── Token confirmation screen ─────────────────────────────────────────────
  if (step === 'token' && token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm text-center">

          <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-1">You're checked in!</h1>
          <p className="text-gray-500 text-sm mb-6">Please wait while we prepare your table.</p>

          {/* Token display */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-6 mb-6">
            <p className="text-xs font-semibold text-blue-400 uppercase tracking-widest mb-2">Your Token</p>
            <p className="text-5xl font-bold text-blue-600">{token.id}</p>
          </div>

          <div className="space-y-2 text-sm text-gray-600 mb-8 text-left bg-gray-50 rounded-xl p-4">
            <div className="flex justify-between">
              <span className="text-gray-400">Name</span>
              <span className="font-medium">{token.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Type</span>
              <span className="font-medium capitalize">{token.type === 'dinein' ? 'Dine-in' : 'Takeaway'}</span>
            </div>
            {token.type === 'dinein' && (
              <div className="flex justify-between">
                <span className="text-gray-400">Party size</span>
                <span className="font-medium">{token.pax} {token.pax === 1 ? 'person' : 'people'}</span>
              </div>
            )}
          </div>

          {token.type === 'dinein' ? (
            <p className="text-sm text-gray-500">
              The manager has been notified. You'll receive a WhatsApp message when your table is ready.
            </p>
          ) : (
            <p className="text-sm text-gray-500">
              Please wait near the counter. Your order will be ready shortly.
            </p>
          )}
        </div>
      </div>
    );
  }

  // ─── Form screen ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">

        {/* Restaurant logo / header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome!</h1>
          <p className="text-gray-500 text-sm mt-1">Tell us a bit about your visit</p>
        </div>

        <div className="space-y-5">

          {/* Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">Your name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Ravi"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">
              WhatsApp number <span className="font-normal text-gray-400">(for table notification)</span>
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="91XXXXXXXXXX"
              className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* Dine-in / Takeaway */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">How would you like to order?</label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'dinein',   label: 'Dine-in',  icon: '🪑' },
                { value: 'takeaway', label: 'Takeaway', icon: '🛍️' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setType(opt.value)}
                  className={`rounded-xl border-2 py-4 text-sm font-semibold transition flex flex-col items-center gap-1 ${
                    type === opt.value
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-blue-300 text-gray-600'
                  }`}
                >
                  <span className="text-2xl">{opt.icon}</span>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pax (only for dine-in) */}
          {type === 'dinein' && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                How many people? <span className="font-bold text-blue-600">{pax}</span>
              </label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setPax(p => Math.max(1, p - 1))}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xl transition flex items-center justify-center"
                >−</button>
                <input
                  type="range"
                  min={1} max={20} value={pax}
                  onChange={e => setPax(Number(e.target.value))}
                  className="flex-1"
                />
                <button
                  onClick={() => setPax(p => Math.min(20, p + 1))}
                  className="w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-xl transition flex items-center justify-center"
                >+</button>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={submit}
            disabled={loading}
            className={`w-full py-4 rounded-xl font-bold text-white text-sm transition ${
              loading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
            }`}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Getting your token...
              </span>
            ) : (
              'Get Token →'
            )}
          </button>

        </div>
      </div>
    </div>
  );
}
