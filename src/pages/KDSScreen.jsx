// ============================================================================
// AUTOM8 FRONTEND - KDS SCREEN
// src/pages/KDSScreen.jsx
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../contexts/WebSocketContext';
import { formatDistanceToNow } from 'date-fns';

export default function KDSScreen() {
  const { user, apiClient, logout } = useAuth();
  const { connected, updates } = useWebSocket();
  
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending'); // pending, in_progress, ready, all
  const [sound, setSound] = useState(true);

  // Fetch KDS feed
  const fetchKDSFeed = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/kds/feed', {
        params: { status: filter === 'all' ? 'all' : filter }
      });
      setItems(response.data.items || []);
    } catch (err) {
      console.error('Failed to fetch KDS feed:', err);
    } finally {
      setLoading(false);
    }
  }, [apiClient, filter]);

  // Poll for updates every 2 seconds
  useEffect(() => {
    fetchKDSFeed();
    const interval = setInterval(fetchKDSFeed, 2000);
    return () => clearInterval(interval);
  }, [fetchKDSFeed]);

  // Play sound when new orders arrive
  useEffect(() => {
    if (sound && updates.length > 0) {
      const lastUpdate = updates[0];
      if (lastUpdate.type === 'ORDER_NEW' || lastUpdate.status === 'pending') {
        playNotificationSound();
      }
    }
  }, [updates, sound]);

  const playNotificationSound = () => {
    // Web Audio API to create a beep sound
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.setValueAtTime(600, now + 0.1);
    
    gain.gain.setValueAtTime(0.3, now);
    gain.gain.setValueAtTime(0, now + 0.1);
    
    osc.start(now);
    osc.stop(now + 0.1);
  };

  const updateItemStatus = async (itemId, newStatus) => {
    try {
      await apiClient.put(`/api/kds/${itemId}/status`, { status: newStatus });
      
      // Refetch to update UI
      fetchKDSFeed();
      
      if (newStatus === 'ready' && sound) {
        playNotificationSound();
      }
    } catch (err) {
      console.error('Failed to update item status:', err);
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-600 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'normal': return 'bg-blue-500 text-white';
      case 'low': return 'bg-green-500 text-white';
      default: return 'bg-gray-500 text-white';
    }
  };

  const getTimeColor = (createdAt) => {
    const now = new Date();
    const created = new Date(createdAt);
    const minutes = Math.floor((now - created) / 60000);
    
    if (minutes > 20) return 'text-red-600 font-bold';
    if (minutes > 15) return 'text-orange-600 font-bold';
    return 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="h-screen bg-black flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-white text-lg">Loading Kitchen Display...</p>
        </div>
      </div>
    );
  }

  const filterItems = (status) => {
    if (status === 'all') return items;
    return items.filter(item => item.status === status);
  };

  const displayItems = filterItems(filter);

  return (
    <div className="h-screen bg-black text-white overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b-4 border-blue-600 p-6 flex justify-between items-center">
        <div>
          <h1 className="text-4xl font-bold text-blue-400">🔥 KITCHEN DISPLAY SYSTEM</h1>
          <p className="text-gray-400 mt-2">
            {displayItems.length} {filter === 'all' ? 'orders' : filter + ' items'} • 
            WebSocket: <span className={`font-bold ${connected ? 'text-green-400' : 'text-red-400'}`}>
              {connected ? '🟢 LIVE' : '🔴 OFFLINE'}
            </span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          {/* Filter Buttons */}
          <div className="flex gap-2">
            {['pending', 'in_progress', 'ready', 'all'].map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg font-semibold transition ${
                  filter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                }`}
              >
                {status.replace('_', ' ').toUpperCase()}
                <span className="ml-2 text-sm">({filterItems(status).length})</span>
              </button>
            ))}
          </div>

          {/* Logout */}
          <button
            onClick={logout}
            className="bg-red-500 hover:bg-red-600 text-white font-bold py-2 px-4 rounded-lg transition flex items-center text-sm"
          >
            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
            Logout
          </button>

          {/* Sound Toggle */}
          <button
            onClick={() => setSound(!sound)}
            className={`px-4 py-2 rounded-lg font-semibold transition ${
              sound ? 'bg-blue-600' : 'bg-red-600'
            }`}
          >
            {sound ? '🔔 Sound ON' : '🔇 Sound OFF'}
          </button>
        </div>
      </div>

      {/* Orders Grid */}
      <div className="flex-1 overflow-auto p-6">
        {displayItems.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-4xl mb-4">😎</p>
              <p className="text-3xl text-gray-400 font-semibold">No {filter} orders</p>
              <p className="text-gray-600 mt-2">Great job! Everything is caught up.</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {displayItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl overflow-hidden shadow-2xl transform transition hover:scale-105 ${
                  item.status === 'pending'
                    ? 'bg-red-900 border-4 border-red-600'
                    : item.status === 'in_progress'
                    ? 'bg-orange-900 border-4 border-orange-500'
                    : 'bg-green-900 border-4 border-green-500'
                }`}
              >
                {/* Card Header */}
                <div className="bg-black p-4 border-b-2 border-gray-700">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-2xl font-bold text-white">
                        Table {item.order_item?.order?.table?.table_number || 'N/A'}
                      </p>
                      <p className="text-gray-400 text-sm">
                        {item.order_item?.order?.table?.section || 'Unknown Section'}
                      </p>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${getPriorityColor(item.priority)}`}>
                      {item.priority.toUpperCase()}
                    </span>
                  </div>

                  <p className={`text-xl font-bold ${getTimeColor(item.created_at)}`}>
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </p>
                </div>

                {/* Card Body */}
                <div className="p-6">
                  <div className="mb-6">
                    <p className="text-gray-300 text-sm font-semibold mb-3">ITEM:</p>
                    <p className="text-3xl font-bold text-white mb-2">
                      {item.order_item?.menu_item?.name}
                    </p>
                    {item.order_item?.menu_item?.description && (
                      <p className="text-gray-300 text-sm mb-2">
                        {item.order_item.menu_item.description}
                      </p>
                    )}
                    {item.order_item?.special_instructions && (
                      <div className="bg-yellow-900 border-l-4 border-yellow-500 p-3 my-3">
                        <p className="text-yellow-200 font-semibold text-sm">
                          ⚠️ SPECIAL NOTES:
                        </p>
                        <p className="text-yellow-100 text-sm mt-1">
                          {item.order_item.special_instructions}
                        </p>
                      </div>
                    )}
                    <p className="text-gray-400 text-sm mt-3">
                      Qty: <span className="text-white font-bold text-lg">{item.order_item?.quantity}</span>
                    </p>
                  </div>

                  {/* Prep Time */}
                  {item.order_item?.menu_item?.prep_time_minutes && (
                    <div className="bg-gray-800 rounded p-3 mb-4">
                      <p className="text-gray-400 text-xs">Expected Prep Time</p>
                      <p className="text-xl font-bold text-blue-400">
                        {item.order_item.menu_item.prep_time_minutes} mins
                      </p>
                    </div>
                  )}

                  {/* Status Buttons */}
                  <div className="space-y-2">
                    {item.status === 'pending' && (
                      <button
                        onClick={() => updateItemStatus(item.id, 'in_progress')}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition text-lg"
                      >
                        ▶️ START COOKING
                      </button>
                    )}
                    
                    {item.status === 'in_progress' && (
                      <button
                        onClick={() => updateItemStatus(item.id, 'ready')}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 rounded-lg transition text-lg"
                      >
                        ✅ MARK READY
                      </button>
                    )}
                    
                    {item.status === 'ready' && (
                      <div className="w-full bg-green-600 text-white font-bold py-3 rounded-lg text-center text-lg">
                        ✨ READY FOR PICKUP
                      </div>
                    )}

                    <button
                      onClick={() => updateItemStatus(item.id, 'cancelled')}
                      className="w-full bg-red-700 hover:bg-red-800 text-white font-bold py-2 rounded-lg transition"
                    >
                      ❌ Cancel
                    </button>
                  </div>
                </div>

                {/* Footer - Order Number */}
                <div className="bg-black p-3 border-t-2 border-gray-700 text-center">
                  <p className="text-gray-500 text-xs">Order #{item.order_item?.order?.order_number?.slice(-4)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
