// ============================================================================
// AUTOM8 FRONTEND - MAIN APP
// src/App.jsx
// ============================================================================
// Install: npm install react react-router-dom axios zustand date-fns
// Run: npm run dev

import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';

// Pages
import LoginPage from './pages/LoginPage';
import OwnerDashboard from './pages/OwnerDashboard';
import ManagerPortal from './pages/ManagerPortal';
import KDSScreen from './pages/KDSScreen';
import NotFound from './pages/NotFound';

// Add this import at top of App.jsx
import MenuPage from './pages/MenuPage';

// Add this route inside <Routes>
<Route
  path="/dashboard/menu"
  element={
    <ProtectedRoute allowedRoles={['owner', 'manager']}>
      <MenuPage />
    </ProtectedRoute>
  }
/>
// Protected Route Component
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" />;
  }

  return children;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<LoginPage />} />
      
      {/* Protected Routes */}
      <Route 
        path="/dashboard/owner" 
        element={
          <ProtectedRoute allowedRoles={['owner']}>
            <OwnerDashboard />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/dashboard/manager" 
        element={
          <ProtectedRoute allowedRoles={['manager', 'owner']}>
            <ManagerPortal />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/dashboard/kitchen" 
        element={
          <ProtectedRoute allowedRoles={['kitchen_staff', 'owner', 'manager']}>
            <KDSScreen />
          </ProtectedRoute>
        } 
      />

      {/* Redirect root to login */}
      <Route path="/" element={<Navigate to={user ? `/dashboard/${user.role}` : '/login'} />} />
      
      {/* 404 */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export default function App() {
  return (
    <Router>
      <AuthProvider>
        <WebSocketProvider>
          <AppRoutes />
        </WebSocketProvider>
      </AuthProvider>
    </Router>
  );
}
