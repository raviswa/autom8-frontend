// ============================================================================
// AUTOM8 FRONTEND — MAIN APP
// ============================================================================
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth }                            from './contexts/AuthContext';
import { WebSocketProvider }                                from './contexts/WebSocketContext';
import { SubscriptionProvider, useSubscription, FEATURES }  from './contexts/SubscriptionContext';

import LoginPage          from './pages/LoginPage';
import OwnerDashboard     from './pages/OwnerDashboard';
import MarketingDashboard from './pages/MarketingDashboard';
import ManagerPortal      from './pages/ManagerPortal';
import KDSScreen          from './pages/KDSScreen';
import NotFound           from './pages/NotFound';
import MenuPage           from './pages/MenuPage';
import WalkInForm         from './pages/WalkInForm';
import FeatureWall        from './pages/FeatureWall';

// ── Protected Route ───────────────────────────────────────────────────────────
function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" />;
  return children;
}

// ── Feature-gated route ───────────────────────────────────────────────────────
function FeatureRoute({ feature, children }) {
  const { hasFeature, loading } = useSubscription();
  // FIX: never show FeatureWall while the subscription fetch is still in flight.
  // Without this guard, features=[] → hasFeature=false → FeatureWall flashes
  // for ~200ms before the response arrives and the real page renders.
  if (loading) return <Spinner />;
  if (!hasFeature(feature)) return <FeatureWall feature={feature} />;
  return children;
}

// ── Spinner ───────────────────────────────────────────────────────────────────
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
  const { user, loading, logout, apiClient } = useAuth();
  // FIX: also pull loading from subscription so inline hasAnyOf checks
  // never run against an empty features array.
  const { hasFeature, hasAnyOf, loading: subLoading } = useSubscription();
  if (loading || subLoading) return <Spinner />;

  const restaurantId   = user?.restaurant_id ?? user?.restaurantId ?? '46fb9b9e-431a-43c9-9edb-d316b0fef216';
  const restaurantName = user?.restaurant_name ?? user?.restaurantName ?? 'Hotel Munafe';

  // Default redirect target per role
  const defaultRoute = () => {
    if (!user) return '/login';
    const roleMap = {
      owner:         '/dashboard/owner',
      manager:       '/dashboard/manager',
      kitchen_staff: '/dashboard/kitchen',
      marketing:     '/dashboard/marketing',
    };
    return roleMap[user.role] ?? `/dashboard/${user.role}`;
  };

  return (
    <Routes>

      {/* ── Public ── */}
      <Route path="/login" element={<LoginPage />} />

      {/* Walk-in form */}
      <Route
        path="/checkin"
        element={
          <FeatureRoute feature={FEATURES.TOKEN_MANAGEMENT}>
            <WalkInForm />
          </FeatureRoute>
        }
      />

      {/* ── Owner dashboard ── */}
      <Route
        path="/dashboard/owner"
        element={
          <ProtectedRoute allowedRoles={['owner']}>
            <OwnerDashboard
              restaurantId={restaurantId}
              restaurantName={restaurantName}
              onLogout={logout}
              apiClient={apiClient}
            />
          </ProtectedRoute>
        }
      />

      {/* ── Marketing / CRM dashboard ── */}
      <Route
        path="/dashboard/marketing"
        element={
          <ProtectedRoute allowedRoles={['marketing', 'owner']}>
            <MarketingDashboard
              restaurantId={restaurantId}
              restaurantName={restaurantName}
              onLogout={logout}
              apiClient={apiClient}
            />
          </ProtectedRoute>
        }
      />

      {/* ── Manager portal ── */}
      <Route
        path="/dashboard/manager"
        element={
          <ProtectedRoute allowedRoles={['manager', 'owner']}>
            <ManagerPortal />
          </ProtectedRoute>
        }
      />

      {/* ── KDS ── */}
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

      {/* ── Menu management ── */}
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
      <Route path="/" element={<Navigate to={defaultRoute()} />} />

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
