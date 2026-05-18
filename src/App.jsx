// ============================================================================
// AUTOM8 FRONTEND — MAIN APP
// Routes are feature-gated: a page only exists if the restaurant subscribes.
// ============================================================================
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth }                           from './contexts/AuthContext';
import { WebSocketProvider }                               from './contexts/WebSocketContext';
import { SubscriptionProvider, useSubscription, FEATURES } from './contexts/SubscriptionContext';

import LoginPage      from './pages/LoginPage';
import OwnerDashboard from './pages/OwnerDashboard';
import ManagerPortal  from './pages/ManagerPortal';
import KDSScreen      from './pages/KDSScreen';
import NotFound       from './pages/NotFound';
import MenuPage       from './pages/MenuPage';
import WalkInForm     from './pages/WalkInForm';
import FeatureWall    from './pages/FeatureWall';

// ── Protected Route ───────────────────────────────────────────────────────────
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" />;
  return children;
}

// ── Feature-gated route — shows FeatureWall if not subscribed ─────────────────
function FeatureRoute({ feature, children }) {
  const { hasFeature, loading } = useSubscription();
  if (loading) return <Spinner />;
  if (!hasFeature(feature)) return <FeatureWall feature={feature} />;
  return children;
}

// ── Spinner ──────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="text-center">
        <div className="w-12 h-12 mx-auto mb-4 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
        <p className="text-gray-600">Loading...</p>
      </div>
    </div>
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user, loading, logout } = useAuth();
  const { hasFeature, hasAnyOf }  = useSubscription();
  if (loading) return <Spinner />;

  const restaurantId   = user?.restaurant_id   ?? user?.restaurantId   ?? null;
  const restaurantName = user?.restaurant_name ?? user?.restaurantName ?? 'My Restaurant';

  return (
    <Routes>

      {/* ── Public ── */}
      <Route path="/login"   element={<LoginPage />} />

      {/* Walk-in form: only accessible if TOKEN_MANAGEMENT is subscribed */}
      <Route
        path="/checkin"
        element={
          <FeatureRoute feature={FEATURES.TOKEN_MANAGEMENT}>
            <WalkInForm />
          </FeatureRoute>
        }
      />

      {/* ── Owner dashboard: always available to owners ── */}
      <Route
        path="/dashboard/owner"
        element={
          <ProtectedRoute allowedRoles={['owner']}>
            <OwnerDashboard
              restaurantId={restaurantId}
              restaurantName={restaurantName}
              onLogout={logout}
            />
          </ProtectedRoute>
        }
      />

      {/* ── Manager portal: needs at least token or any order feature ── */}
      <Route
        path="/dashboard/manager"
        element={
          <ProtectedRoute allowedRoles={['manager', 'owner']}>
            <ManagerPortal />
          </ProtectedRoute>
        }
      />

      {/* ── KDS: only if any ordering channel is subscribed ── */}
      <Route
        path="/dashboard/kitchen"
        element={
          <ProtectedRoute allowedRoles={['kitchen_staff', 'owner', 'manager']}>
            {hasAnyOf(FEATURES.DINE_IN, FEATURES.TAKEAWAY, FEATURES.DELIVERY)
              ? <KDSScreen />
              : <FeatureWall feature={FEATURES.DINE_IN} />
            }
          </ProtectedRoute>
        }
      />

      {/* ── Menu management: only if any ordering channel is subscribed ── */}
      <Route
        path="/dashboard/menu"
        element={
          <ProtectedRoute allowedRoles={['owner', 'manager']}>
            {hasAnyOf(FEATURES.DINE_IN, FEATURES.TAKEAWAY, FEATURES.DELIVERY)
              ? <MenuPage />
              : <FeatureWall feature={FEATURES.DINE_IN} />
            }
          </ProtectedRoute>
        }
      />

      {/* ── Default redirect ── */}
      <Route
        path="/"
        element={<Navigate to={user ? `/dashboard/${user.role === 'kitchen_staff' ? 'kitchen' : user.role}` : '/login'} />}
      />

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Router>
      <AuthProvider>
        <SubscriptionProvider>
          <WebSocketProvider>
            <AppRoutes />
          </WebSocketProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </Router>
  );
}
