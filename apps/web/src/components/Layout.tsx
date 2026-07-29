import { Link, Outlet } from "react-router-dom";

export function Layout() {
  return (
    <div>
      <header className="app-header">
        <Link className="brand" to="/">
          tuxedo-qa
        </Link>
        <span className="muted">dashboard local</span>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
