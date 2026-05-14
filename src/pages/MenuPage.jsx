// ============================================================================
// AUTOM8 FRONTEND - MENU MANAGEMENT PAGE
// src/pages/MenuPage.jsx
// ============================================================================
// Shows synced Meta catalog items
// Owner can: trigger sync, toggle availability
// Manager can: view menu when creating orders

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function MenuPage() {
  const { apiClient, user } = useAuth();

  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [syncResult, setSyncResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchMenu = useCallback(async () => {
    try {
      const params = selectedCategory !== 'all' ? `?category=${selectedCategory}` : '';
      const response = await apiClient.get(`/api/menu-items${params}`);
      const menuItems = response.data.items || [];
      setItems(menuItems);

      // Extract unique categories
      const uniqueCategories = [...new Set(menuItems.map(i => i.category).filter(Boolean))];
      setCategories(uniqueCategories);
    } catch (err) {
      console.error('Failed to fetch menu:', err);
    } finally {
      setLoading(false);
    }
  }, [apiClient, selectedCategory]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const response = await apiClient.get('/api/catalog/status');
      setLastSync(response.data.lastSync);
    } catch (err) {
      console.error('Failed to fetch sync status:', err);
    }
  }, [apiClient]);

  useEffect(() => {
    fetchMenu();
    fetchSyncStatus();
  }, [fetchMenu, fetchSyncStatus]);

  const triggerSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const response = await apiClient.post('/api/catalog/sync');
      setSyncResult(response.data);
      await fetchMenu();
      await fetchSyncStatus();
    } catch (err) {
      setSyncResult({ success: false, error: err.message });
    } finally {
      setSyncing(false);
    }
  };

  const toggleAvailability = async (itemId, currentStatus) => {
    try {
      await apiClient.put(`/api/menu-items/${itemId}/availability`, {
        is_available: !currentStatus
      });
      setItems(prev =>
        prev.map(item =>
          item.id === itemId ? { ...item, is_available: !currentStatus } : item
        )
      );
    } catch (err) {
      console.error('Failed to toggle availability:', err);
    }
  };

  const filteredItems = items.filter(item =>
    item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const groupedItems = filteredItems.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading menu...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex flex-wrap justify-between items-center gap-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
                🍽️ Menu Management
              </h1>
              <p className="text-gray-500 mt-1 text-sm">
                Synced from Meta WhatsApp Catalog •
                Last sync: {lastSync
                  ? new Date(lastSync).toLocaleString()
                  : 'Never'}
              </p>
            </div>

            {/* Sync Button - Owner only */}
            {user?.role === 'owner' && (
              <button
                onClick={triggerSync}
                disabled={syncing}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-3 px-6 rounded-lg transition"
              >
                {syncing ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Syncing...
                  </>
                ) : (
                  <>🔄 Sync from Meta</>
                )}
              </button>
            )}
          </div>

          {/* Sync Result Banner */}
          {syncResult && (
            <div className={`mt-4 p-4 rounded-lg ${syncResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              {syncResult.success ? (
                <p className="text-green-800 font-semibold">
                  ✅ Sync complete! {syncResult.synced} items updated
                  {syncResult.errors > 0 && ` (${syncResult.errors} errors)`}
                </p>
              ) : (
                <p className="text-red-800 font-semibold">
                  ❌ Sync failed: {syncResult.error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-blue-600">{items.length}</p>
            <p className="text-gray-500 text-sm mt-1">Total Items</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-green-600">
              {items.filter(i => i.is_available).length}
            </p>
            <p className="text-gray-500 text-sm mt-1">Available</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-red-500">
              {items.filter(i => !i.is_available).length}
            </p>
            <p className="text-gray-500 text-sm mt-1">Unavailable</p>
          </div>
          <div className="bg-white rounded-lg shadow p-4 text-center">
            <p className="text-3xl font-bold text-purple-600">{categories.length}</p>
            <p className="text-gray-500 text-sm mt-1">Categories</p>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex flex-wrap gap-4 mb-6">
          <input
            type="text"
            placeholder="Search menu items..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 min-w-64 px-4 py-2 border-2 border-gray-300 rounded-lg focus:outline-none focus:border-blue-500"
          />
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-lg font-semibold transition ${selectedCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border-2 border-gray-300'}`}
            >
              All
            </button>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 rounded-lg font-semibold transition ${selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 border-2 border-gray-300'}`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items by Category */}
        {Object.entries(groupedItems).map(([category, categoryItems]) => (
          <div key={category} className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-1 h-6 bg-blue-600 rounded"></span>
              {category}
              <span className="text-sm font-normal text-gray-500">({categoryItems.length} items)</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryItems.map(item => (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl shadow hover:shadow-md transition overflow-hidden ${!item.is_available ? 'opacity-60' : ''}`}
                >
                  {/* Item Image */}
                  {item.image_url && (
                    <div className="h-40 overflow-hidden">
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-full h-full object-cover"
                        onError={(e) => { e.target.style.display = 'none'; }}
                      />
                    </div>
                  )}

                  <div className="p-4">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-bold text-gray-900 text-lg leading-tight">{item.name}</h3>
                      <span className="text-blue-600 font-bold text-lg ml-2 whitespace-nowrap">
                        ₹{item.price?.toFixed(2)}
                      </span>
                    </div>

                    {item.description && (
                      <p className="text-gray-500 text-sm mb-3 line-clamp-2">{item.description}</p>
                    )}

                    <div className="flex justify-between items-center">
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${item.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {item.is_available ? '✅ Available' : '❌ Unavailable'}
                      </span>

                      {/* Toggle - Owner only */}
                      {user?.role === 'owner' && (
                        <button
                          onClick={() => toggleAvailability(item.id, item.is_available)}
                          className={`text-xs font-semibold px-3 py-1 rounded-lg transition ${item.is_available ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-green-100 text-green-700 hover:bg-green-200'}`}
                        >
                          {item.is_available ? 'Mark Unavailable' : 'Mark Available'}
                        </button>
                      )}
                    </div>

                    {/* Meta sync info */}
                    {item.meta_product_id && (
                      <p className="text-gray-400 text-xs mt-2">
                        Meta ID: {item.meta_product_id}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {filteredItems.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-4">🍽️</p>
            <p className="text-xl font-semibold text-gray-600">No menu items found</p>
            {user?.role === 'owner' && (
              <button
                onClick={triggerSync}
                className="mt-4 bg-blue-600 text-white font-bold py-3 px-6 rounded-lg"
              >
                🔄 Sync from Meta now
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
