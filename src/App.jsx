// ============================================================================
// AUTOM8 FRONTEND — MAIN APP
// ============================================================================
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WebSocketProvider } from './contexts/WebSocketContext';
import { SubscriptionProvider, useSubscription, FEATURES } from './contexts/SubscriptionContext';

import { KOTPrintTemplate } from './components/KOTPrint';
import LoginPage from './pages/LoginPage';
import OwnerDashboard from './pages/OwnerDashboard';
import MarketingDashboard from './pages/MarketingDashboard';
import ManagerPortal from './pages/ManagerPortal';
import KDSScreen from './pages/KDSScreen';
import MenuPage from './pages/MenuPage';
import WalkInForm from './pages/WalkInForm';
import FeatureWall from './pages/FeatureWall';
import NotFound from './pages/NotFound';
import SetupStatusPage from './pages/SetupStatusPage';
import BillingPage from './pages/BillingPage';
import SoftLockPage from './pages/SoftLockPage';
import SubscriptionStatusBar from './components/SubscriptionStatusBar';
import SetupProgressBar from './components/SetupProgressBar';

import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import BrandDashboard from './pages/BrandDashboard';
import CaptainPortal from './pages/CaptainPortal';
import SettingsPanel from './components/SettingsPanel';

import SupplyLogin from './pages/supply/SupplyLogin';
import SupplyDashboard from './pages/supply/SupplyDashboard';
import SupplyCatalog from './pages/supply/SupplyCatalog';
import SupplyRatecard from './pages/supply/SupplyRatecard';
import SupplyClients from './pages/supply/SupplyClients';
import SupplyClientAccount from './pages/supply/SupplyClientAccount';
import SupplyOrders from './pages/supply/SupplyOrders';
import SupplyOrderDetail from './pages/supply/SupplyOrderDetail';
import SupplyPickingList from './pages/supply/SupplyPickingList';
import SupplyRouteSheet from './pages/supply/SupplyRouteSheet';
import SupplyPaymentClaims from './pages/supply/SupplyPaymentClaims';
import SupplyInvoices from './pages/supply/SupplyInvoices';
import StatementsPage from './pages/supply/StatementsPage';
import SupplyAnalytics from './pages/supply/SupplyAnalytics';
import SupplySettings from './pages/supply/SupplySettings';
import OrderForm from './pages/supply/OrderForm';

export const kotRef = React.createRef();

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

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/unauthorized" />;
  return children;
}

function FeatureRoute({ feature, children }) {
  const { hasFeature, loading, softLocked } = useSubscription();
  if (loading) return <Spinner />;
  if (softLocked) return <Navigate to="/subscription-locked" replace />;
  if (!hasFeature(feature)) return <FeatureWall feature={feature} />;
  return children;
}

/** Soft-lock gate for operational dashboards (Screen D). Settings/billing stay reachable. */
function SubscriptionGate({ children }) {
  const { softLocked, loading } = useSubscription();
  if (loading) return <Spinner />;
  if (softLocked) return <Navigate to="/subscription-locked" replace />;
  return children;
}

/** After login: incomplete setup → Screen A (owners / brand owners). */
function SetupGate({ children }) {
  const { user, apiClient } = useAuth();
  const [state, setState] = React.useState({ loading: true, redirect: null });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user) {
        if (!cancelled) setState({ loading: false, redirect: null });
        return;
      }
      const role = user.role;
      // Screen A is per-outlet; brand multi-outlet uses B2 / outlet drill-down instead
      if (role !== 'owner') {
        if (!cancelled) setState({ loading: false, redirect: null });
        return;
      }

      const restaurantId = user.restaurant_id || user.outlets?.[0]?.id || 'unknown';
      const seenKey = `autom8_setup_seen_${restaurantId}`;

      try {
        const seen = sessionStorage.getItem(seenKey);
        if (seen === '1') {
          if (!cancelled) setState({ loading: false, redirect: null });
          return;
        }
      } catch { /* ignore */ }

      try {
        const res = await apiClient.get('/api/onboarding/status');
        if (cancelled) return;
        if (res.data?.lifetime) {
          // Demo / platform-owner outlet — never trap on Setup
          try { sessionStorage.setItem(seenKey, '1'); } catch { /* ignore */ }
          setState({ loading: false, redirect: null });
        } else if (res.data && res.data.setup_complete === false) {
          setState({ loading: false, redirect: '/setup' });
        } else if (res.data?.setup_complete === true) {
          try { sessionStorage.setItem(seenKey, '1'); } catch { /* ignore */ }
          setState({ loading: false, redirect: null });
        } else {
          // Unexpected payload — send owner to activation checklist
          setState({ loading: false, redirect: '/setup' });
        }
      } catch (err) {
        // Never treat API failure / tenant_missing as "setup complete"
        if (!cancelled) setState({ loading: false, redirect: '/setup' });
      }
    })();
    return () => { cancelled = true; };
  }, [user, apiClient]);

  if (state.loading) return <Spinner />;
  if (state.redirect) return <Navigate to={state.redirect} replace />;
  return children;
}

function OutletDrillDown() {
  const { outletId } = useParams();
  const { user, logout, apiClient } = useAuth();
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

function AppRoutes() {
  const { user, loading, logout, apiClient } = useAuth();
  const { hasAnyOf, loading: subLoading } = useSubscription();
  if (loading || subLoading) return <Spinner />;

  const restaurantId = user?.restaurant_id ?? user?.restaurantId ?? '46fb9b9e-431a-43c9-9edb-d316b0fef216';
  // The dashboard replaces this generic fallback with the canonical tenant
  // name returned by /api/dashboard/waba once it loads.
  const restaurantName = user?.restaurant_name ?? user?.restaurantName ?? 'Your business';

  const defaultRoute = () => {
    if (!user) return '/login';
    const roleMap = {
      brand_owner: '/dashboard/brand',
      brand_manager: '/dashboard/brand',
      owner: '/dashboard/owner',
      manager: '/dashboard/manager',
      kitchen_staff: '/dashboard/kitchen',
      packing_staff: '/dashboard/packing',
      dispatch_staff: '/dashboard/packing',
      sales_staff: '/dashboard/manager',
      marketing: '/dashboard/marketing',
      captain: '/dashboard/captain',
      waiter: '/dashboard/kitchen',
    };
    return roleMap[user.role] ?? `/dashboard/${user.role}`;
  };

  return (
    <Routes>
      {/* ── Public ── */}
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      {/* ── Setup / Billing / Soft-lock ── */}
      <Route
        path="/setup"
        element={
          <ProtectedRoute allowedRoles={['owner', 'brand_owner', 'brand_manager']}>
            <SetupStatusPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/billing"
        element={
          <ProtectedRoute allowedRoles={['owner', 'brand_owner', 'brand_manager', 'manager']}>
            <BillingPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings/billing"
        element={<Navigate to="/billing" replace />}
      />
      <Route
        path="/subscription-locked"
        element={
          <ProtectedRoute allowedRoles={['owner', 'brand_owner', 'brand_manager', 'manager', 'kitchen_staff', 'packing_staff', 'dispatch_staff', 'sales_staff', 'captain']}>
            <SoftLockPage />
          </ProtectedRoute>
        }
      />

      {/* ── Brand Owner / Manager ── */}
      <Route
        path="/dashboard/brand"
        element={
          <ProtectedRoute allowedRoles={['brand_owner', 'brand_manager']}>
            <SubscriptionGate>
              <SetupGate>
                <>
                  <SetupProgressBar />
                  <SubscriptionStatusBar />
                  <BrandDashboard />
                </>
              </SetupGate>
            </SubscriptionGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/brand/outlet/:outletId"
        element={
          <ProtectedRoute allowedRoles={['brand_owner', 'brand_manager']}>
            <SubscriptionGate>
              <OutletDrillDown />
            </SubscriptionGate>
          </ProtectedRoute>
        }
      />

      {/* ── Settings (allowed during soft-lock) ── */}
      <Route
        path="/settings"
        element={
          <ProtectedRoute allowedRoles={['owner', 'brand_owner', 'manager']}>
            <SettingsPanel apiClient={apiClient} showToast={(msg) => console.log(msg)} />
          </ProtectedRoute>
        }
      />

      {/* ── Captain Portal ── */}
      <Route
        path="/dashboard/captain"
        element={
          <ProtectedRoute allowedRoles={['captain', 'owner', 'manager']}>
            <CaptainPortal />
          </ProtectedRoute>
        }
      />

      {/* ── Check-in (token management) ── */}
      <Route
        path="/checkin"
        element={
          <FeatureRoute feature={FEATURES.TOKEN_MANAGEMENT}>
            <WalkInForm />
          </FeatureRoute>
        }
      />

      {/* ── Core dashboards ── */}
      <Route
        path="/dashboard/owner"
        element={
          <ProtectedRoute allowedRoles={['owner']}>
            <SubscriptionGate>
              <SetupGate>
                <>
                  <SetupProgressBar />
                  <SubscriptionStatusBar />
                  <OwnerDashboard
                    restaurantId={restaurantId}
                    restaurantName={restaurantName}
                    onLogout={logout}
                    apiClient={apiClient}
                  />
                </>
              </SetupGate>
            </SubscriptionGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/marketing"
        element={
          <ProtectedRoute allowedRoles={['marketing', 'owner']}>
            <SubscriptionGate>
              <MarketingDashboard
                restaurantId={restaurantId}
                restaurantName={restaurantName}
                onLogout={logout}
                apiClient={apiClient}
              />
            </SubscriptionGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/manager"
        element={
          <ProtectedRoute allowedRoles={['manager', 'owner', 'sales_staff']}>
            <SubscriptionGate>
              <ManagerPortal />
            </SubscriptionGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/kitchen"
        element={
          <ProtectedRoute allowedRoles={['kitchen_staff', 'owner', 'manager']}>
            <SubscriptionGate>
              {hasAnyOf(FEATURES.DINE_IN, FEATURES.TAKEAWAY, FEATURES.DELIVERY)
                ? <KDSScreen />
                : <FeatureWall feature={FEATURES.DINE_IN} />}
            </SubscriptionGate>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard/packing"
        element={
          <ProtectedRoute allowedRoles={['kitchen_staff', 'packing_staff', 'dispatch_staff', 'owner', 'manager']}>
            <SubscriptionGate>
              {hasAnyOf(FEATURES.DINE_IN, FEATURES.TAKEAWAY, FEATURES.DELIVERY)
                ? <KDSScreen />
                : <FeatureWall feature={FEATURES.DINE_IN} />}
            </SubscriptionGate>
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard/menu"
        element={
          <ProtectedRoute allowedRoles={['owner', 'manager']}>
            <SubscriptionGate>
              {hasAnyOf(FEATURES.DINE_IN, FEATURES.TAKEAWAY, FEATURES.DELIVERY)
                ? <MenuPage />
                : <FeatureWall feature={FEATURES.DINE_IN} />}
            </SubscriptionGate>
          </ProtectedRoute>
        }
      />

      {/* ── Supply chain ── */}
      <Route path="/supply/login" element={<SupplyLogin />} />
      <Route path="/supply/dashboard" element={<SupplyDashboard />} />
      <Route path="/supply/catalog" element={<SupplyCatalog />} />
      <Route path="/supply/clients" element={<SupplyClients />} />
      <Route path="/supply/clients/:id" element={<SupplyClientAccount />} />
      <Route path="/supply/clients/:id/ratecard" element={<SupplyRatecard />} />
      <Route path="/supply/orders" element={<SupplyOrders />} />
      <Route path="/supply/orders/:id" element={<SupplyOrderDetail />} />
      <Route path="/supply/orders/picking/:date" element={<SupplyPickingList />} />
      <Route path="/supply/orders/route/:date" element={<SupplyRouteSheet />} />
      <Route path="/supply/picking-list" element={<SupplyPickingList />} />
      <Route path="/supply/route-sheet" element={<SupplyRouteSheet />} />
      <Route path="/supply/payment-claims" element={<SupplyPaymentClaims />} />
      <Route path="/supply/invoices" element={<SupplyInvoices />} />
      <Route path="/supply/statements" element={<StatementsPage />} />
      <Route path="/supply/analytics" element={<SupplyAnalytics />} />
      <Route path="/supply/settings" element={<SupplySettings />} />

      {/* ── Order form (public token links) ── */}
      <Route path="/s/:token" element={<OrderForm />} />
      <Route path="/s/b/:token" element={<OrderForm permanent />} />

      {/* ── Fallbacks ── */}
      <Route path="/" element={<Navigate to={defaultRoute()} />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

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
