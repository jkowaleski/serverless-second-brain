/** Cosine similarity between two vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

/** 90-day TTL as Unix timestamp for audit items. */
export function auditTtl(): number {
  return Math.floor(Date.now() / 1000) + 90 * 86400;
}
