import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout.tsx";
import { Credentials } from "./pages/Credentials.tsx";
import { Monitor } from "./pages/Monitor.tsx";
import { PairDebug } from "./pages/PairDebug.tsx";
import { ProjectShell } from "./pages/ProjectShell.tsx";
import { Protection } from "./pages/Protection.tsx";
import { StatusPageAdmin } from "./pages/StatusPageAdmin.tsx";
import { Tests } from "./pages/Tests.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Monitor />} />
        <Route path="projects/:slug" element={<ProjectShell />}>
          <Route index element={<Navigate to="tests" replace />} />
          <Route path="tests" element={<Tests />} />
          <Route path="credentials" element={<Credentials />} />
          <Route path="protection" element={<Protection />} />
          <Route path="status-page" element={<StatusPageAdmin />} />
          <Route path="pair-debug" element={<PairDebug />} />
        </Route>
      </Route>
    </Routes>
  );
}
