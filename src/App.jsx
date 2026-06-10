// ============================================================================
// AUTOM8 FRONTEND — MAIN APP
// ============================================================================
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth }                            from './contexts/AuthContext';
import { WebSocketProvider }                                from './contexts/WebSocketContext';
import { SubscriptionProvider, useSubscription, FEATURES }  from './contexts/SubscriptionContext';

import { KOTPrintTemplate } from './components/KOTPrint';
export const kotRef = React.createRef();
import LoginPage          from './pages/LoginPage';
import OwnerDashboard     from './pages/OwnerDashboard';
import MarketingDashboard from './pages/MarketingDashboard';
import ManagerPortal      from './pages/ManagerPortal';
import KDSScreen          from './pages/KDSScreen';
import NotFound           from './pages/NotFound';
import MenuPage           from './pages/MenuPage';
import WalkInForm         from './pages/WalkInForm';
import FeatureWall        from './pages/FeatureWall';
import SettingsPanel      from './components/SettingsPanel';

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

// ── Simple toast (used by SettingsPanel) ──────────────────────────────────────
function useToast() {
  const [toast, setToast] = React.useState(null);
  const showToast = React.useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }, []);
  const ToastUI = toast ? (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '10px 18px', borderRadius: 10, fontSize: 13, fontWeight: 500,
      background: toast.type === 'error' ? '#A32D2D' : '#1D9E75',
      color: '#fff', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
      animation: 'fadeIn 0.2s ease',
    }}>
      {toast.msg}
    </div>
  ) : null;
  return { showToast, ToastUI };
}

// ── Routes ────────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user, loading, logout, apiClient } = useAuth();
  const { hasFeature, hasAnyOf, loading: subLoading } = useSubscription();
  const { showToast, ToastUI } = useToast();

  if (loading || subLoading) return <Spinner />;

  const restaurantId   = user?.restaurant_id ?? user?.restaurantId ?? '46fb9b9e-431a-43c9-9edb-d316b0fef216';
  const restaurantName = user?.restaurant_name ?? user?.restaurantName ?? 'Hotel Munafe';

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
    <>
      {ToastUI}
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

        {/* ── Settings ── (owner only) ── */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute allowedRoles={['owner']}>
              <SettingsPanel apiClient={apiClient} showToast={showToast} />
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
    </>
  );
}

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  return (
    <Router>
      <AuthProvider>
        <SubscriptionProvider>
          <WebSocketProvider>
            <KOTPrintTemplate ref={kotRef} />
            <AppRoutes />
          </WebSocketProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </Router>
  );
}
