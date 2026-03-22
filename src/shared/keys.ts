/** DynamoDB key prefix helpers — single source of truth for PK/SK patterns. */

export const nodeKey = (slug: string) => `NODE#${slug}`;
export const edgeKey = (slug: string) => `EDGE#${slug}`;
export const auditKey = (ts: string) => `AUDIT#${ts}`;
export const statusKey = (status: string) => `STATUS#${status}`;
export const META = "META" as const;
export const EMBED = "EMBED" as const;

/** Extract slug from a prefixed key (e.g. "NODE#foo" → "foo"). */
export const fromNodeKey = (pk: string) => pk.slice(5);   // "NODE#".length
export const fromEdgeKey = (sk: string) => sk.slice(5);   // "EDGE#".length
