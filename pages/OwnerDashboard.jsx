// ============================================================================
// AUTOM8 FRONTEND - OWNER DASHBOARD
// src/pages/OwnerDashboard.jsx
// ============================================================================

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { format } from 'date-fns';

export default function OwnerDashboard() {
  const { user, apiClient } = useAuth();
  
  const [report, setReport] = useState(null);
  const [orders, setOrders] = useState([]);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    try {
      const [reportRes, ordersRes, staffRes] = await Promise.all([
        apiClient.get(`/api/reports/sales?date=${selectedDate}`),
        apiClient.get('/api/orders'),
        apiClient.get('/api/staff')
      ]);

      setReport(reportRes.data.report);
      setOrders(ordersRes.data.orders || []);
      setStaff(staffRes.data.staff || []);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  }, [apiClient, selectedDate]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className=\"min-h-screen bg-gray-100 flex items-center justify-center\">
        <div className=\"text-center\">
          <div className=\"w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4\"></div>
          <p className=\"text-gray-600 text-lg\">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  const topItems = report?.categoryBreakdown
    ? Object.entries(report.categoryBreakdown)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
    : [];

  const completedOrders = orders.filter(o => o.status === 'completed');
  const todayOrders = completedOrders.filter(o => 
    format(new Date(o.created_at), 'yyyy-MM-dd') === selectedDate
  );

  return (
    <div className=\"min-h-screen bg-gradient-to-br from-blue-50 to-blue-100\">
      {/* Header */}
      <div className=\"bg-white shadow-lg\">
        <div className=\"max-w-7xl mx-auto px-6 py-6\">
          <div className=\"flex justify-between items-center\">
            <div>
              <h1 className=\"text-4xl font-bold text-gray-900 flex items-center\">
                <svg className=\"w-10 h-10 text-blue-600 mr-3\" fill=\"currentColor\" viewBox=\"0 0 20 20\">
                  <path d=\"M3 1a1 1 0 000 2h1.22l.305 1.222a.997.997 0 00.01.042l1.358 5.43-.893.892C3.74 11.846 4.632 14 6.414 14H15a1 1 0 000-2H6.414l1-1H14a1 1 0 00.894-.553l3-6A1 1 0 0017 6H6.28l-.31-1.243A1 1 0 005 4H3z\" />
                </svg>
                Owner Dashboard
              </h1>
              <p className=\"text-gray-600 mt-1\">Restaurant analytics and management</p>
            </div>
            <div>
              <input
                type=\"date\"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className=\"border-2 border-gray-300 rounded-lg px-4 py-2 text-gray-900\"
              />
            </div>
          </div>
        </div>
      </div>

      <div className=\"max-w-7xl mx-auto px-6 py-8\">
        {/* KPIs */}
        <div className=\"grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8\">
          {/* Total Revenue */}
          <div className=\"bg-white rounded-lg shadow-lg p-6\">
            <div className=\"flex items-center justify-between\">
              <div>
                <p className=\"text-gray-600 text-sm font-semibold\">Total Revenue</p>
                <p className=\"text-4xl font-bold text-green-600 mt-2\">
                  ${report?.totalRevenue?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className=\"text-5xl opacity-30\">💰</div>
            </div>
            <p className=\"text-gray-500 text-xs mt-4\">Today's sales</p>
          </div>

          {/* Total Orders */}
          <div className=\"bg-white rounded-lg shadow-lg p-6\">
            <div className=\"flex items-center justify-between\">
              <div>
                <p className=\"text-gray-600 text-sm font-semibold\">Total Orders</p>
                <p className=\"text-4xl font-bold text-blue-600 mt-2\">
                  {report?.totalOrders || 0}
                </p>
              </div>
              <div className=\"text-5xl opacity-30\">📋</div>
            </div>
            <p className=\"text-gray-500 text-xs mt-4\">Orders completed</p>
          </div>

          {/* Average Order Value */}
          <div className=\"bg-white rounded-lg shadow-lg p-6\">
            <div className=\"flex items-center justify-between\">
              <div>
                <p className=\"text-gray-600 text-sm font-semibold\">Avg Order Value</p>
                <p className=\"text-4xl font-bold text-purple-600 mt-2\">
                  ${report?.avgOrderValue?.toFixed(2) || '0.00'}
                </p>
              </div>
              <div className=\"text-5xl opacity-30\">📊</div>
            </div>
            <p className=\"text-gray-500 text-xs mt-4\">Average spent per order</p>
          </div>

          {/* Staff Online */}
          <div className=\"bg-white rounded-lg shadow-lg p-6\">
            <div className=\"flex items-center justify-between\">
              <div>
                <p className=\"text-gray-600 text-sm font-semibold\">Staff Online</p>
                <p className=\"text-4xl font-bold text-orange-600 mt-2\">
                  {staff.filter(s => s.is_active).length}/{staff.length}
                </p>
              </div>
              <div className=\"text-5xl opacity-30\">👥</div>
            </div>
            <p className=\"text-gray-500 text-xs mt-4\">Active staff members</p>
          </div>
        </div>

        <div className=\"grid grid-cols-1 lg:grid-cols-3 gap-8\">
          {/* Top Items */}
          <div className=\"lg:col-span-1 bg-white rounded-lg shadow-lg p-6\">
            <h2 className=\"text-xl font-bold text-gray-900 mb-6\">Top Categories</h2>
            <div className=\"space-y-4\">
              {topItems.map(([category, count], idx) => (
                <div key={category} className=\"flex items-center justify-between\">
                  <div className=\"flex items-center\">
                    <div className=\"w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold\">
                      {idx + 1}
                    </div>
                    <span className=\"ml-3 text-gray-900 font-semibold\">{category}</span>
                  </div>
                  <span className=\"bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-sm font-bold\">
                    {count}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Staff Management */}
          <div className=\"lg:col-span-2 bg-white rounded-lg shadow-lg p-6\">
            <h2 className=\"text-xl font-bold text-gray-900 mb-6\">Staff Management</h2>
            <div className=\"overflow-x-auto\">
              <table className=\"w-full\">
                <thead>
                  <tr className=\"border-b-2 border-gray-300\">
                    <th className=\"text-left py-3 px-4 font-semibold text-gray-700\">Name</th>
                    <th className=\"text-left py-3 px-4 font-semibold text-gray-700\">Role</th>
                    <th className=\"text-left py-3 px-4 font-semibold text-gray-700\">Status</th>
                    <th className=\"text-left py-3 px-4 font-semibold text-gray-700\">Last Login</th>
                  </tr>
                </thead>
                <tbody>
                  {staff.slice(0, 5).map((member) => (
                    <tr key={member.id} className=\"border-b border-gray-200 hover:bg-gray-50 transition\">
                      <td className=\"py-3 px-4 text-gray-900 font-semibold\">{member.full_name}</td>
                      <td className=\"py-3 px-4\">
                        <span className=\"px-3 py-1 rounded-full text-sm font-semibold capitalize\" 
                          style={{
                            backgroundColor: member.role === 'owner' ? '#fef3c7' : member.role === 'manager' ? '#dbeafe' : '#dcfce7',
                            color: member.role === 'owner' ? '#92400e' : member.role === 'manager' ? '#1e40af' : '#15803d'
                          }}>
                          {member.role.replace('_', ' ')}
                        </span>
                      </td>
                      <td className=\"py-3 px-4\">
                        <span className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          member.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'
                        }`}>
                          {member.is_active ? '🟢 Online' : '⚫ Offline'}
                        </span>
                      </td>
                      <td className=\"py-3 px-4 text-gray-600 text-sm\">
                        {member.last_login ? format(new Date(member.last_login), 'MMM dd, HH:mm') : 'Never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {staff.length > 5 && (
                <div className=\"mt-4 text-center text-sm text-gray-600\">
                  + {staff.length - 5} more staff members
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className=\"mt-8 bg-white rounded-lg shadow-lg p-6\">
          <h2 className=\"text-xl font-bold text-gray-900 mb-6\">Recent Orders</h2>
          <div className=\"overflow-x-auto\">
            <table className=\"w-full\">
              <thead>
                <tr className=\"border-b-2 border-gray-300\">
                  <th className=\"text-left py-3 px-4 font-semibold text-gray-700\">Order</th>
                  <th className=\"text-left py-3 px-4 font-semibold text-gray-700\">Table</th>
                  <th className=\"text-left py-3 px-4 font-semibold text-gray-700\">Items</th>
                  <th className=\"text-left py-3 px-4 font-semibold text-gray-700\">Total</th>
                  <th className=\"text-left py-3 px-4 font-semibold text-gray-700\">Status</th>
                </tr>
              </thead>
              <tbody>
                {todayOrders.slice(0, 10).map((order) => (
                  <tr key={order.id} className=\"border-b border-gray-200 hover:bg-gray-50 transition\">
                    <td className=\"py-3 px-4 font-semibold text-gray-900\">#{order.order_number?.slice(-4)}</td>
                    <td className=\"py-3 px-4 text-gray-600\">Table {order.table?.table_number || 'N/A'}</td>
                    <td className=\"py-3 px-4 text-gray-600\">{order.order_items?.length || 0} items</td>
                    <td className=\"py-3 px-4 font-bold text-green-600\">${order.total_amount?.toFixed(2)}</td>
                    <td className=\"py-3 px-4\">
                      <span className={`px-3 py-1 rounded-full text-sm font-semibold capitalize ${ order.status === 'completed' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
