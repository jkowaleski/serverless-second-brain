/** DynamoDB key prefix helpers — single source of truth for PK/SK patterns. */

export const nodeKey = (slug: string) => `NODE#${slug}`;
export const edgeKey = (slug: string) => `EDGE#${slug}`;
export const auditKey = (ts: string) => `AUDIT#${ts}`;
export const statusKey = (status: string) => `STATUS#${status}`;
export const META = "META";
export const EMBED = "EMBED";
