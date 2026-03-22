/** Shared HTTP response helpers — CORS headers + JSON responses. */

const CORS_ORIGIN = process.env.CORS_ALLOW_ORIGIN ?? "*";

export const corsHeaders = (methods = "GET,OPTIONS") => ({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type,Authorization",
  "Access-Control-Allow-Methods": methods,
});

export const jsonResponse = (statusCode: number, body: unknown, methods?: string) => ({
  statusCode,
  headers: corsHeaders(methods),
  body: JSON.stringify(body),
});

export const errorResponse = (statusCode: number, error: string, message: string, methods?: string) =>
  jsonResponse(statusCode, { error, message }, methods);
