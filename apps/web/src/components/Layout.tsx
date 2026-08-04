import { Link, Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth.tsx";

export function Layout() {
  const { user, loading, logout } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <div>
      <header className="app-header">
        <Link className="brand" to="/">
          tuxedo<b>qa</b>
        </Link>
        <div style={{ display: "flex", gap: "1.1rem", alignItems: "center" }}>
          <span className="muted">{user.email}</span>
          <Link to="/settings">Configurações</Link>
          <button
            type="button"
            onClick={() => {
              void logout();
            }}
          >
            Sair
          </button>
        </div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
