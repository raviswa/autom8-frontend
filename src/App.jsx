// ============================================================================
// AUTOM8 FRONTEND — MAIN APP
// ============================================================================
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth }                            from './contexts/AuthContext';
import { WebSocketProvider }                                from './contexts/WebSocketContext';
import { SubscriptionProvider, useSubscription, FEATURES }  from './contexts/SubscriptionContext';

import { KOTPrintTemplate } from './components/KOTPrint';
export const kotRef = React.createRef();
import LoginPage          from './pages/LoginPage';
import OwnerDashboard     from './pages/OwnerDashboard';
import BrandDashboard     from './pages/BrandDashboard';
import CaptainPortal      from './pages/CaptainPortal';
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

// ── Simple toast ──────────────────────────────────────────────────────────────
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

// ── Outlet drill-down wrapper (brand owner viewing a single outlet) ────────────
// Reads :outletId from URL params and passes it to OwnerDashboard as restaurantId.
function OutletDrillDown() {
  const { outletId } = useParams();
  const { user, logout, apiClient } = useAuth();
  // Try to find the outlet name from the cached outlets list on the user object
  const outletName = user?.outlets?.find(o => o.id === outletId)?.name ?? 'Outlet';
  return (
    <OwnerDashboard
      restaurantId={outletId}
      restaurantName={outletName}
      onLogout={logout}
      apiClient={apiClient}
    />
  );
}

// ── Routes ────────────────────────────────────────────────────────────────────
function AppRoutes() {
  const { user, loading, logout, apiClient } = useAuth();
  const { hasFeature, hasAnyOf, loading: subLoading } = useSubscription();
  const { showToast, ToastUI } = useToast();

  if (loading || subLoading) return <Spinner />;

  // Brand owners have restaurant_id = null — fall back to the first outlet id if needed
  const restaurantId   = user?.restaurant_id ?? user?.restaurantId ?? user?.outlets?.[0]?.id ?? null;
  const restaurantName = user?.restaurant_name ?? user?.restaurantName
    ?? user?.brand?.name ?? 'Munafe';

  const defaultRoute = () => {
    if (!user) return '/login';
    const roleMap = {
      brand_owner:   '/dashboard/brand',
      brand_manager: '/dashboard/brand',
      owner:         '/dashboard/owner',
      manager:       '/dashboard/manager',
      kitchen_staff: '/dashboard/kitchen',
      marketing:     '/dashboard/marketing',
      captain:       '/dashboard/captain',
      waiter:        '/dashboard/kitchen',  // waiters land on KDS (read-only view)
    };
    return roleMap[user.role] ?? `/dashboard/${user.role}`;
  };

  return (
    <>
      {ToastUI}
      <Routes>

        {/* ── Public ── */}
        <Route path="/login" element={<LoginPage />} />

        {/* Walk-in form (public kiosk) */}
        <Route
          path="/checkin"
          element={
            <FeatureRoute feature={FEATURES.TOKEN_MANAGEMENT}>
              <WalkInForm />
            </FeatureRoute>
          }
        />

        {/* ── Brand Owner — chain dashboard ── */}
        <Route
          path="/dashboard/brand"
          element={
            <ProtectedRoute allowedRoles={['brand_owner', 'brand_manager']}>
              <BrandDashboard />
            </ProtectedRoute>
          }
        />

        {/* ── Brand Owner — outlet drill-down (reuses OwnerDashboard scoped to outlet) ── */}
        <Route
          path="/dashboard/brand/outlet/:outletId"
          element={
            <ProtectedRoute allowedRoles={['brand_owner', 'brand_manager']}>
              <OutletDrillDown />
            </ProtectedRoute>
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

        {/* ── Settings — owner + brand_owner ── */}
        <Route
          path="/settings"
          element={
            <ProtectedRoute allowedRoles={['owner', 'brand_owner']}>
              <SettingsPanel apiClient={apiClient} showToast={showToast} />
            </ProtectedRoute>
          }
        />

        {/* ── Marketing / CRM dashboard ── */}
        <Route
          path="/dashboard/marketing"
          element={
            <ProtectedRoute allowedRoles={['marketing', 'owner', 'brand_owner', 'brand_manager']}>
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

        {/* ── KDS (kitchen + waiters get read-only view) ── */}
        <Route
          path="/dashboard/kitchen"
          element={
            <ProtectedRoute allowedRoles={['kitchen_staff', 'owner', 'manager', 'waiter']}>
              {hasAnyOf(FEATURES.DINE_IN, FEATURES.TAKEAWAY, FEATURES.DELIVERY)
                ? <KDSScreen />
                : <FeatureWall feature={FEATURES.DINE_IN} />
              }
            </ProtectedRoute>
          }
        />

        {/* ── Captain Portal — takeaway QR fulfillment ── */}
        <Route
          path="/dashboard/captain"
          element={
            <ProtectedRoute allowedRoles={['captain', 'owner', 'manager']}>
              <CaptainPortal />
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
