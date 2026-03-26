import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell';
import { ProtectedRoute } from './components/ProtectedRoute';
import { RouteErrorBoundary } from './components/RouteErrorBoundary';
import { DashboardPage } from './pages/DashboardPage';
import { ClientsPage } from './pages/ClientsPage';
import { LoginPage } from './pages/LoginPage';
import { MembershipsPage } from './pages/MembershipsPage';
import { PosPage } from './pages/PosPage';
import { SettingsPage } from './pages/SettingsPage';

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/memberships" element={<MembershipsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route
            path="/pos"
            element={
              <RouteErrorBoundary>
                <PosPage />
              </RouteErrorBoundary>
            }
          />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
