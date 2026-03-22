const dict = {
  // Nav
  "nav.dashboard": { es: "Panel", en: "Dashboard" },
  "nav.graph": { es: "Grafo", en: "Graph" },
  "nav.search": { es: "Buscar", en: "Search" },
  "nav.concepts": { es: "Conceptos", en: "Concepts" },
  "nav.notes": { es: "Notas", en: "Notes" },
  "nav.experiments": { es: "Experimentos", en: "Experiments" },
  "nav.essays": { es: "Ensayos", en: "Essays" },
  "nav.timeline": { es: "Cronolog\u00eda", en: "Timeline" },
  "nav.capture": { es: "Capturar", en: "Capture" },
  "nav.tools": { es: "Herramientas", en: "Tools" },

  // Home
  "home.title": { es: "Second Brain", en: "Second Brain" },
  "home.subtitle": { es: "Grafo de conocimiento personal \u2014 serverless, biling\u00fce, con b\u00fasqueda sem\u00e1ntica y puerta para agentes de IA.", en: "Personal knowledge graph \u2014 serverless, bilingual, with semantic search and AI agent gateway." },
  "home.tagline": { es: "captura \u2192 clasifica \u2192 conecta \u2192 descubre", en: "capture \u2192 classify \u2192 connect \u2192 discover" },
  "home.dashboard": { es: "Dashboard", en: "Dashboard" },
  "home.dashboard.desc": { es: "Estad\u00edsticas y salud del grafo", en: "Graph stats and health" },
  "home.graph": { es: "Grafo", en: "Graph" },
  "home.graph.desc": { es: "Visualizaci\u00f3n interactiva D3", en: "Interactive D3 visualization" },
  "home.graph.full": { es: "Grafo de conocimiento", en: "Knowledge graph" },
  "home.search": { es: "B\u00fasqueda", en: "Search" },
  "home.search.desc": { es: "Keyword + sem\u00e1ntica con Bedrock", en: "Keyword + semantic with Bedrock" },
  "home.search.full": { es: "B\u00fasqueda", en: "Search" },
  "home.concepts": { es: "Conceptos", en: "Concepts" },
  "home.concepts.desc": { es: "Todos los conceptos del grafo", en: "All graph concepts" },
  "home.notes": { es: "Notas", en: "Notes" },
  "home.notes.desc": { es: "Notas y apuntes", en: "Notes and memos" },
  "home.experiments": { es: "Experimentos", en: "Experiments" },
  "home.experiments.desc": { es: "Proyectos y pruebas", en: "Projects and trials" },
  "home.essays": { es: "Ensayos", en: "Essays" },
  "home.essays.desc": { es: "Ensayos publicados", en: "Published essays" },
  "home.timeline": { es: "Cronolog\u00eda", en: "Timeline" },
  "home.timeline.desc": { es: "Vista cronol\u00f3gica", en: "Chronological view" },
  "home.timeline.full": { es: "L\u00ednea de tiempo", en: "Timeline" },
  "home.capture": { es: "Capturar", en: "Capture" },
  "home.capture.desc": { es: "Ingestar nuevo conocimiento", en: "Ingest new knowledge" },
  "home.capture.full": { es: "Capturar conocimiento", en: "Capture knowledge" },
  "home.dashboard.full": { es: "Panel", en: "Dashboard" },
  "home.browse": { es: "Explorar por tipo", en: "Browse by type" },
  "home.explore": { es: "Herramientas", en: "Tools" },

  // Types
  "type.concept": { es: "Concepto", en: "Concept" },
  "type.note": { es: "Nota", en: "Note" },
  "type.experiment": { es: "Experimento", en: "Experiment" },
  "type.essay": { es: "Ensayo", en: "Essay" },

  // Statuses
  "status.seed": { es: "Semilla", en: "Seed" },
  "status.growing": { es: "Creciendo", en: "Growing" },
  "status.evergreen": { es: "Perenne", en: "Evergreen" },

  // Filters
  "filter.all_types": { es: "Todos los tipos", en: "All types" },
  "filter.all_statuses": { es: "Todos los estados", en: "All statuses" },
  "filter.type": { es: "Filtrar por tipo", en: "Filter by type" },
  "filter.status": { es: "Filtrar por estado", en: "Filter by status" },

  // Search
  "search.title": { es: "B\u00fasqueda", en: "Search" },
  "search.placeholder": { es: "Buscar en el grafo de conocimiento\u2026", en: "Search the knowledge graph\u2026" },
  "search.button": { es: "Buscar", en: "Search" },
  "search.results": { es: "{count} resultado{s} en {ms}ms", en: "{count} result{s} in {ms}ms" },
  "search.no_results": { es: "Sin resultados para \u201c{q}\u201d", en: "No results for \u201c{q}\u201d" },
  "search.suggestions": { es: "Sugerencias:", en: "Suggestions:" },

  // Graph
  "graph.title": { es: "Grafo de conocimiento", en: "Knowledge graph" },
  "graph.nodes_edges": { es: "{nodes} nodos \u00b7 {edges} aristas", en: "{nodes} nodes \u00b7 {edges} edges" },
  "graph.nodes": { es: "nodos", en: "nodes" },
  "graph.edges": { es: "aristas", en: "edges" },
  "graph.loading": { es: "Cargando grafo\u2026", en: "Loading graph\u2026" },

  // Node detail
  "node.back": { es: "\u2190 Grafo", en: "\u2190 Graph" },
  "node.summary_es": { es: "Resumen (ES)", en: "Summary (ES)" },
  "node.summary_en": { es: "Resumen (EN)", en: "Summary (EN)" },
  "node.related": { es: "Nodos relacionados ({count})", en: "Related nodes ({count})" },
  "node.words": { es: "{count} palabras", en: "{count} words" },
  "node.empty": { es: "No se especific\u00f3 un nodo.", en: "No node specified." },

  // Dashboard
  "dashboard.title": { es: "Dashboard", en: "Dashboard" },
  "dashboard.nodes": { es: "Nodos", en: "Nodes" },
  "dashboard.edges": { es: "Aristas", en: "Edges" },
  "dashboard.orphans": { es: "Hu\u00e9rfanos", en: "Orphans" },
  "dashboard.orphans.sub": { es: "< 2 aristas", en: "< 2 edges" },
  "dashboard.seeds": { es: "Semillas", en: "Seeds" },
  "dashboard.seeds.sub": { es: "pendientes de revisi\u00f3n", en: "pending review" },
  "dashboard.by_type": { es: "Por tipo", en: "By type" },
  "dashboard.by_status": { es: "Por estado", en: "By status" },
  "dashboard.most_connected": { es: "M\u00e1s conectados", en: "Most connected" },
  "dashboard.edges_count": { es: "{count} aristas", en: "{count} edges" },
  "dashboard.graph_health": { es: "Salud del grafo", en: "Graph health" },
  "dashboard.avg_connections": { es: "Promedio", en: "Average" },
  "dashboard.needs_attention": { es: "Necesitan atenci\u00f3n", en: "Needs attention" },

  // Listing
  "listing.filter": { es: "Filtrar...", en: "Filter..." },
  "listing.empty": { es: "No hay nodos con estos filtros.", en: "No nodes match these filters." },

  // Timeline
  "timeline.title": { es: "Línea de tiempo", en: "Timeline" },
  "timeline.count": { es: "{count} nodos", en: "{count} nodes" },
  "timeline.description": { es: "{count} elementos, ordenados por última actualización", en: "{count} items, sorted by last update" },

  // Preferences
  "prefs.theme": { es: "Tema", en: "Theme" },
  "prefs.light": { es: "Claro", en: "Light" },
  "prefs.dark": { es: "Oscuro", en: "Dark" },
  "prefs.layout": { es: "Ancho", en: "Layout" },
  "prefs.boxed": { es: "Centrado", en: "Boxed" },
  "prefs.full": { es: "Completo", en: "Full" },
  "prefs.locale": { es: "Idioma", en: "Language" },

  // Common
  "common.loading": { es: "Cargando\u2026", en: "Loading\u2026" },
  "common.error": { es: "Error: {msg}", en: "Error: {msg}" },
  "footer": { es: "Serverless Second Brain \u00b7 Powered by AWS", en: "Serverless Second Brain \u00b7 Powered by AWS" },

  // Auth
  "auth.login": { es: "Iniciar sesi\u00f3n", en: "Log in" },
  "auth.logout": { es: "Cerrar sesi\u00f3n", en: "Log out" },

  // Capture
  "capture.title": { es: "Capturar", en: "Capture" },
  "capture.login_required": { es: "Inicia sesi\u00f3n para capturar conocimiento.", en: "Log in to capture knowledge." },
  "capture.text_label": { es: "Texto", en: "Text" },
  "capture.text_placeholder": { es: "Pega o escribe el contenido a capturar (m\u00ednimo 50 caracteres)\u2026", en: "Paste or type content to capture (minimum 50 characters)\u2026" },
  "capture.char_count": { es: "{count} caracteres (m\u00ednimo 50)", en: "{count} characters (minimum 50)" },
  "capture.url_label": { es: "URL de origen (opcional)", en: "Source URL (optional)" },
  "capture.type_label": { es: "Tipo", en: "Type" },
  "capture.lang_label": { es: "Idioma", en: "Language" },
  "capture.submit": { es: "Capturar", en: "Capture" },
  "capture.submitting": { es: "Procesando\u2026", en: "Processing\u2026" },
  "capture.success": { es: "Nodo creado exitosamente", en: "Node created successfully" },
  "capture.view_node": { es: "Ver nodo creado", en: "View created node" },
  "nav.capture": { es: "Capturar", en: "Capture" },
} as const;

export type Locale = "es" | "en";
export type DictKey = keyof typeof dict;

export function t(key: DictKey, locale: Locale, vars?: Record<string, string | number>): string {
  const raw = dict[key]?.[locale] ?? key;
  if (!vars) return raw;
  return Object.entries(vars).reduce<string>(
    (s, [k, v]) => s.replaceAll(`{${k}}`, String(v)),
    raw,
  );
}

/** Get the localized title/summary from API data based on locale */
export function localized(item: { title_es?: string; title_en?: string; summary_es?: string; summary_en?: string; title?: string }, field: "title" | "summary", locale: Locale): string {
  const key = `${field}_${locale}` as keyof typeof item;
  return (item[key] as string) ?? (item as Record<string, string>)[field] ?? "";
}

/** Get type label */
export function typeLabel(type: string, locale: Locale): string {
  const key = `type.${type}` as DictKey;
  return t(key, locale);
}

/** Get status label */
export function statusLabel(status: string, locale: Locale): string {
  const key = `status.${status}` as DictKey;
  return t(key, locale);
}
