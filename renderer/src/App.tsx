import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ElectronLocaleBridge } from "./components/ElectronLocaleBridge";
import { AuthNavigationRegistrar } from "./components/AuthNavigationRegistrar";
import { DesktopUpdateLayer } from "./components/DesktopUpdateLayer";
import { GlobalAuthForbiddenBanner } from "./components/GlobalAuthForbiddenBanner";
import { RequireAuth } from "./components/RequireAuth";
import {
  AccountPage,
  HistoryPage,
  SavedResultsPage,
  MemoryPage,
  LoginPage,
  RegisterPage,
  VerifyEmailPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  SettingsPage,
  TemplatesPage,
  TemplateDetailPage,
  ToolHubPage,
  ToolsPage,
  WorkbenchPage,
  AutomationConsolePage
} from "./pages";

export const App = () => (
  <>
    <ElectronLocaleBridge />
    <DesktopUpdateLayer />
    <AuthNavigationRegistrar />
    <GlobalAuthForbiddenBanner />
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Navigate to="/workbench" replace />} />
        <Route path="/workbench" element={<WorkbenchPage />} />
        <Route path="/tool-hub" element={<ToolHubPage />} />
        <Route path="/tools" element={<ToolsPage />} />
        <Route path="/tasks/new" element={<Navigate to="/workbench" replace />} />
        <Route path="/results" element={<Navigate to="/workbench" replace />} />
        <Route path="/history" element={<HistoryPage />} />
        <Route path="/saved-results" element={<SavedResultsPage />} />
        <Route path="/memory" element={<MemoryPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/usage" element={<Navigate to="/account#account-quota" replace />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/templates/:templateId" element={<TemplateDetailPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/automation" element={<AutomationConsolePage />} />
      </Route>
    </Routes>
  </>
);

