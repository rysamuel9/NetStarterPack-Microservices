import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProductsPage } from './pages/ProductsPage';
import { OrdersPage } from './pages/OrdersPage';
import { WorkflowCreatePage } from './pages/WorkflowCreatePage';
import { WorkflowWorkingListPage } from './pages/WorkflowWorkingListPage';
import { WorkflowTrackingPage } from './pages/WorkflowTrackingPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { AnnouncementDetailPage } from './pages/AnnouncementDetailPage';
import { UnderDevelopmentPage } from './pages/UnderDevelopmentPage';
import { UsersPage } from './pages/UsersPage';
import { RolesPage } from './pages/RolesPage';
import { MenusPage } from './pages/MenusPage';
import { ReportsPage, AuditLogsPage, ProfilePage } from './pages/ReportsAuditProfilePages';

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
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
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
