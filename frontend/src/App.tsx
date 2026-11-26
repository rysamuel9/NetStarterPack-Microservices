import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';

// Route-level code splitting per domain/microservice agar bundle awal tetap ramping
const LoginPage = lazy(() =>
  import('./pages/auth/LoginPage').then((m) => ({ default: m.LoginPage }))
);
const ProfilePage = lazy(() =>
  import('./pages/auth/ProfilePage').then((m) => ({ default: m.ProfilePage }))
);
const DashboardPage = lazy(() =>
  import('./pages/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage }))
);
const ReportsPage = lazy(() =>
  import('./pages/dashboard/ReportsPage').then((m) => ({ default: m.ReportsPage }))
);
const AuditLogsPage = lazy(() =>
  import('./pages/dashboard/AuditLogsPage').then((m) => ({ default: m.AuditLogsPage }))
);
const ProductsPage = lazy(() =>
  import('./pages/catalog/ProductsPage').then((m) => ({ default: m.ProductsPage }))
);
const OrdersPage = lazy(() =>
  import('./pages/orders/OrdersPage').then((m) => ({ default: m.OrdersPage }))
);
const WorkflowCreatePage = lazy(() =>
  import('./pages/workflow/WorkflowCreatePage').then((m) => ({ default: m.WorkflowCreatePage }))
);
const WorkflowWorkingListPage = lazy(() =>
  import('./pages/workflow/WorkflowWorkingListPage').then((m) => ({
    default: m.WorkflowWorkingListPage,
  }))
);
const WorkflowTrackingPage = lazy(() =>
  import('./pages/workflow/WorkflowTrackingPage').then((m) => ({
    default: m.WorkflowTrackingPage,
  }))
);
const AnnouncementsPage = lazy(() =>
  import('./pages/announcements/AnnouncementsPage').then((m) => ({ default: m.AnnouncementsPage }))
);
const AnnouncementDetailPage = lazy(() =>
  import('./pages/announcements/AnnouncementDetailPage').then((m) => ({
    default: m.AnnouncementDetailPage,
  }))
);
const OrganizationPage = lazy(() =>
  import('./pages/identity/OrganizationPage').then((m) => ({ default: m.OrganizationPage }))
);
const UsersPage = lazy(() =>
  import('./pages/identity/UsersPage').then((m) => ({ default: m.UsersPage }))
);
const RolesPage = lazy(() =>
  import('./pages/identity/RolesPage').then((m) => ({ default: m.RolesPage }))
);
const MenusPage = lazy(() =>
  import('./pages/identity/MenusPage').then((m) => ({ default: m.MenusPage }))
);
const LookupsPage = lazy(() =>
  import('./pages/masterdata/LookupsPage').then((m) => ({ default: m.LookupsPage }))
);
const LiveTrackingPage = lazy(() =>
  import('./pages/tracking/LiveTrackingPage').then((m) => ({ default: m.LiveTrackingPage }))
);
const UnderDevelopmentPage = lazy(() =>
  import('./pages/common/UnderDevelopmentPage').then((m) => ({ default: m.UnderDevelopmentPage }))
);

const PageLoadingFallback: React.FC = () => (
  <div className="min-h-[45vh] flex items-center justify-center">
    <div className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white border border-slate-200 shadow-xs text-sm text-slate-600">
      <span className="w-4 h-4 rounded-full border-2 border-teal-600 border-t-transparent animate-spin" />
      <span>Memuat halaman...</span>
    </div>
  </div>
);

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Suspense fallback={<PageLoadingFallback />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route
                path="dashboard"
                element={
                  <ProtectedRoute permission="Dashboard.View">
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="products"
                element={
                  <ProtectedRoute permission="Products.View">
                    <ProductsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="orders"
                element={
                  <ProtectedRoute permission="Orders.View">
                    <OrdersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="workflow-create"
                element={
                  <ProtectedRoute permission="Workflows.Create">
                    <WorkflowCreatePage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="workflow-working-list"
                element={
                  <ProtectedRoute permission="Workflows.Approve">
                    <WorkflowWorkingListPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="workflow-tracking"
                element={
                  <ProtectedRoute permission="Workflows.View">
                    <WorkflowTrackingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="announcements"
                element={
                  <ProtectedRoute permission="Announcements.View">
                    <AnnouncementsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="announcement" element={<Navigate to="/announcements" replace />} />
              <Route
                path="announcements/:id"
                element={
                  <ProtectedRoute permission="Announcements.View">
                    <AnnouncementDetailPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="reports"
                element={
                  <ProtectedRoute permission="Reports.View">
                    <ReportsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute permission="Users.View">
                    <UsersPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="organization"
                element={
                  <ProtectedRoute permission="Organization.View">
                    <OrganizationPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="roles"
                element={
                  <ProtectedRoute permission="Roles.View">
                    <RolesPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="menus"
                element={
                  <ProtectedRoute permission="Menus.View">
                    <MenusPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="lookups"
                element={
                  <ProtectedRoute permission="Lookups.View">
                    <LookupsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="tracking"
                element={
                  <ProtectedRoute permission="Tracking.View">
                    <LiveTrackingPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <ProtectedRoute permission="AuditLogs.View">
                    <AuditLogsPage />
                  </ProtectedRoute>
                }
              />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="*" element={<UnderDevelopmentPage />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
