import { NavLink, Outlet, useParams } from "react-router-dom";

export function ProjectShell() {
  const { slug } = useParams<{ slug: string }>();
  if (!slug) return null;

  return (
    <div>
      <h1>{slug}</h1>
      <nav className="tabs">
        <NavLink to={`/projects/${slug}/tests`} className={({ isActive }) => (isActive ? "active" : "")}>
          Testes
        </NavLink>
        <NavLink to={`/projects/${slug}/credentials`} className={({ isActive }) => (isActive ? "active" : "")}>
          Credenciais
        </NavLink>
        <NavLink to={`/projects/${slug}/protection`} className={({ isActive }) => (isActive ? "active" : "")}>
          Proteção
        </NavLink>
        <NavLink to={`/projects/${slug}/webhooks`} className={({ isActive }) => (isActive ? "active" : "")}>
          Webhooks
        </NavLink>
        <NavLink to={`/projects/${slug}/status-page`} className={({ isActive }) => (isActive ? "active" : "")}>
          Status Page
        </NavLink>
        <NavLink to={`/projects/${slug}/pair-debug`} className={({ isActive }) => (isActive ? "active" : "")}>
          Pair Debug
        </NavLink>
      </nav>
      <Outlet />
    </div>
  );
}
