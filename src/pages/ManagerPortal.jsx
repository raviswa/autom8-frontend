// ============================================================================
// AUTOM8 FRONTEND - MANAGER PORTAL
// src/pages/ManagerPortal.jsx
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

export default function ManagerPortal() {
  const { user, apiClient, logout } = useAuth();
  
  const [tables, setTables] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedTable, setSelectedTable] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNewOrder, setShowNewOrder] = useState(false);

  // Fetch all data
  const fetchData = useCallback(async () => {
    try {
      const [tablesRes, ordersRes, menuRes] = await Promise.all([
        apiClient.get('/api/tables'),
        apiClient.get('/api/orders'),
        apiClient.get('/api/menu-items')
      ]);

      setTables(tablesRes.data.tables || []);
      setOrders(ordersRes.data.orders || []);
      setMenuItems(menuRes.data.items || []);
    } catch (err) {
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, [apiClient]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchData]);

  const createOrder = async () => {
    if (!selectedTable || selectedItems.length === 0) {
      alert('Please select a table and items');
      return;
    }

    try {
      const items = selectedItems.map(item => ({
        menu_item_id: item.id,
        quantity: item.quantity || 1,
        special_instructions: item.special_instructions
      }));

      const response = await apiClient.post('/api/orders', {
        table_id: selectedTable,
        items,
        notes: ''
      });

      // Reset form
      setSelectedItems([]);
      setSelectedTable(null);
      setShowNewOrder(false);

      // Refresh data
      fetchData();
    } catch (err) {
      console.error('Failed to create order:', err);
      alert('Error creating order: ' + err.message);
    }
  };

  const updateTableStatus = async (tableId, status) => {
    try {
      await apiClient.put(`/api/tables/${tableId}/status`, { status });
      fetchData();
    } catch (err) {
      console.error('Failed to update table status:', err);
    }
  };

  const getTableStatus = (table) => {
    const order = orders.find(o => o.table_id === table.id && o.status !== 'completed');
    return {
      status: order ? 'occupied' : table.status,
      order
    };
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'available':
        return 'bg-green-500 hover:bg-green-600';
      case 'occupied':
        return 'bg-blue-500 hover:bg-blue-600';
      case 'reserved':
        return 'bg-yellow-500 hover:bg-yellow-600';
      case 'dirty':
        return 'bg-red-500 hover:bg-red-600';
      default:
        return 'bg-gray-500 hover:bg-gray-600';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading Manager Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100">
      {/* Header */}
      <div className="bg-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 flex items-center">
                <svg className="w-10 h-10 text-blue-600 mr-3" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M3 4a1 1 0 011-1h12a1 1 0 011 1v2a1 1 0 01-1 1H4a1 1 0 01-1-1V4zm0 6a1 1 0 011-1h12a1 1 0 011 1v6a1 1 0 01-1 1H4a1 1 0 01-1-1v-6zM4 16a1 1 0 00-1 1v2a1 1 0 001 1h12a1 1 0 001-1v-2a1 1 0 00-1-1H4z" />
                </svg>
                Manager Portal
              </h1>
              <p className="text-gray-600 mt-1">Manage tables, orders, and kitchen operations</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">👤 {user?.full_name || user?.email}</span>
              <button
                onClick={() => setShowNewOrder(true)}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg transition flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New Order
              </button>
              <button
                onClick={logout}
                className="bg-red-500 hover:bg-red-600 text-white font-bold py-3 px-5 rounded-lg transition flex items-center"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Table Grid */}
        <div className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Table Allocation</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {tables.map((table) => {
              const { status, order } = getTableStatus(table);
              return (
                <button
                  key={table.id}
                  onClick={() => {
                    setSelectedTable(table.id);
                    setShowNewOrder(true);
                  }}
                  className={`p-6 rounded-lg text-white font-bold text-xl transition transform hover:scale-105 shadow-lg ${getStatusColor(
                    status
                  )}`}
                >
                  <p className="text-sm opacity-90 mb-2">Table {table.table_number}</p>
                  <p className="text-2xl mb-3">🪑</p>
                  <p className="capitalize text-sm mb-2">{status}</p>
                  {order && (
                    <p className="text-xs opacity-80 bg-black bg-opacity-20 px-2 py-1 rounded">
                      Order: {order.order_number?.slice(-4)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Orders */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Active Orders</h2>
          <div className="grid gap-6">
            {orders
              .filter((o) => ['pending', 'confirmed', 'in_progress'].includes(o.status))
              .map((order) => {
                const table = tables.find((t) => t.id === order.table_id);
                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-lg shadow-lg p-6 hover:shadow-xl transition"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                      {/* Order Info */}
                      <div>
                        <h3 className="text-lg font-bold text-gray-900">
                          Order #{order.order_number?.slice(-4)}
                        </h3>
                        <p className="text-gray-600 text-sm mt-1">
                          Table {table?.table_number || 'N/A'} • {table?.section}
                        </p>
                        <p className="text-gray-500 text-xs mt-2">
                          {format(new Date(order.created_at), 'HH:mm:ss')}
                        </p>
                      </div>

                      {/* Items */}
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Items</p>
                        <div className="space-y-1">
                          {order.order_items?.map((item, idx) => (
                            <p key={idx} className="text-sm text-gray-600">
                              {item.quantity}x {item.menu_item?.name}
                              <span
                                className={`ml-2 px-2 py-1 rounded text-xs font-semibold ${
                                  item.status === 'pending'
                                    ? 'bg-red-100 text-red-700'
                                    : item.status === 'in_progress'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : item.status === 'ready'
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {item.status}
                              </span>
                            </p>
                          ))}
                        </div>
                      </div>

                      {/* Total */}
                      <div>
                        <p className="text-sm font-semibold text-gray-700 mb-2">Total</p>
                        <p className="text-2xl font-bold text-blue-600">
                          ${order.total_amount?.toFixed(2)}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Status: <span className="font-semibold capitalize">{order.status}</span>
                        </p>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        <button className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded-lg transition text-sm">
                          View Details
                        </button>
                        {order.status === 'in_progress' && (
                          <button className="bg-green-600 hover:bg-green-700 text-white font-semibold py-2 rounded-lg transition text-sm">
                            Mark Ready
                          </button>
                        )}
                        <button className="bg-red-600 hover:bg-red-700 text-white font-semibold py-2 rounded-lg transition text-sm">
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>

      {/* New Order Modal */}
      {showNewOrder && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-96 overflow-y-auto">
            <div className="sticky top-0 bg-blue-600 text-white p-6 flex justify-between items-center">
              <h3 className="text-2xl font-bold">
                New Order {selectedTable ? `- Table ${tables.find(t => t.id === selectedTable)?.table_number}` : ''}
              </h3>
              <button
                onClick={() => setShowNewOrder(false)}
                className="text-2xl hover:opacity-80 transition"
              >
                ✕
              </button>
            </div>

            <div className="p-6">
              <p className="font-semibold text-gray-900 mb-4">Select items:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {menuItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      const existing = selectedItems.find(i => i.id === item.id);
                      if (existing) {
                        setSelectedItems(selectedItems.filter(i => i.id !== item.id));
                      } else {
                        setSelectedItems([...selectedItems, { ...item, quantity: 1 }]);
                      }
                    }}
                    className={`p-3 rounded-lg border-2 transition ${
                      selectedItems.find(i => i.id === item.id)
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-300 hover:border-blue-600'
                    }`}
                  >
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    <p className="text-blue-600 font-bold">${item.price.toFixed(2)}</p>
                  </button>
                ))}
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => setShowNewOrder(false)}
                  className="flex-1 bg-gray-300 hover:bg-gray-400 text-gray-900 font-bold py-3 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  onClick={createOrder}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-lg transition"
                >
                  Create Order
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
