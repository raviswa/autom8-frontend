// ============================================================================
// AUTOM8 FRONTEND - MAIN APP
// src/App.jsx
// ============================================================================
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';

// Pages
import LoginPage      from './pages/LoginPage';
import OwnerDashboard from './pages/OwnerDashboard';
import ManagerPortal  from './pages/ManagerPortal';
import KDSScreen      from './pages/KDSScreen';
import NotFound       from './pages/NotFound';
import MenuPage       from './pages/MenuPage';
import WalkInForm     from './pages/WalkInForm';

// ── Protected Route ───────────────────────────────────────────────────────────
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

  if (!user) return <Navigate to="/login" />;

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/unauthorized" />;
  }

  return children;
}

// ── Routes ────────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user } = useAuth();

  // Pull restaurant info from the user object stored in localStorage
  // user object comes from your /api/auth/login response — check what fields it returns
  const restaurantId   = user?.restaurant_id   || user?.restaurantId   || null;
  const restaurantName = user?.restaurant_name || user?.restaurantName || 'My Restaurant';

  return (
    <Routes>

      {/* ── Public ── */}
      <Route path="/login"   element={<LoginPage />} />
      <Route path="/checkin" element={<WalkInForm />} />

      {/* ── Owner ── */}
      <Route
        path="/dashboard/owner"
        element={
          <ProtectedRoute allowedRoles={['owner']}>
            <OwnerDashboard
              restaurantId={restaurantId}
              restaurantName={restaurantName}
            />
          </ProtectedRoute>
        }
      />

      {/* ── Manager ── */}
      <Route
        path="/dashboard/manager"
        element={
          <ProtectedRoute allowedRoles={['manager', 'owner']}>
            <ManagerPortal />
          </ProtectedRoute>
        }
      />

      {/* ── Kitchen ── */}
      <Route
        path="/dashboard/kitchen"
        element={
          <ProtectedRoute allowedRoles={['kitchen_staff', 'owner', 'manager']}>
            <KDSScreen />
          </ProtectedRoute>
        }
      />

      {/* ── Menu ── */}
      <Route
        path="/dashboard/menu"
        element={
          <ProtectedRoute allowedRoles={['owner', 'manager']}>
            <MenuPage />
          </ProtectedRoute>
        }
      />

      {/* ── Default redirect ── */}
      <Route
        path="/"
        element={<Navigate to={user ? `/dashboard/${user.role}` : '/login'} />}
      />

      {/* ── 404 ── */}
      <Route path="*" element={<NotFound />} />

    </Routes>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
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
