import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="space-y-4 text-center py-12">
      <h1 className="text-2xl font-bold">404</h1>
      <p className="text-[var(--color-muted)]">Pagina no encontrada / Page not found</p>
      <Link to="/" className="text-sm text-[var(--color-accent)] hover:underline">Inicio / Home</Link>
    </div>
  );
}
