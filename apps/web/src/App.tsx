import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { useAuth } from "./lib/auth.tsx";
import { Chat } from "./pages/Chat.tsx";
import { ConnectAI } from "./pages/ConnectAI.tsx";
import { Credentials } from "./pages/Credentials.tsx";
import { Login } from "./pages/Login.tsx";
import { Monitor } from "./pages/Monitor.tsx";
import { PairDebug } from "./pages/PairDebug.tsx";
import { ProjectShell } from "./pages/ProjectShell.tsx";
import { Protection } from "./pages/Protection.tsx";
import { PublicStatus } from "./pages/PublicStatus.tsx";
import { Settings } from "./pages/Settings.tsx";
import { StatusPageAdmin } from "./pages/StatusPageAdmin.tsx";
import { Tests } from "./pages/Tests.tsx";
import { Webhooks } from "./pages/Webhooks.tsx";

function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <Login />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/status/:pageSlug" element={<PublicStatus />} />
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/" element={<Layout />}>
        <Route index element={<Monitor />} />
        <Route path="settings" element={<Settings />} />
        <Route path="projects/:slug" element={<ProjectShell />}>
          <Route index element={<Navigate to="chat" replace />} />
          <Route path="chat" element={<Chat />} />
          <Route path="connect" element={<ConnectAI />} />
          <Route path="tests" element={<Tests />} />
          <Route path="credentials" element={<Credentials />} />
          <Route path="protection" element={<Protection />} />
          <Route path="webhooks" element={<Webhooks />} />
          <Route path="status-page" element={<StatusPageAdmin />} />
          <Route path="pair-debug" element={<PairDebug />} />
        </Route>
      </Route>
    </Routes>
  );
}
