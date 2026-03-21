import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-4 text-center">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found / Pagina no encontrada</p>
      <Link href="/" className="text-sm text-muted-foreground underline hover:text-foreground">
        Home / Inicio
      </Link>
    </div>
  );
}
