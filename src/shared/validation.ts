import { CaptureRequest } from "./types.js";
import { ValidationError } from "./errors.js";

const SLUG_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const VALID_TYPES = (process.env.NODE_TYPES || "concept,note,experiment,essay").split(",");
const VALID_LANGUAGES = (process.env.LANGUAGES || "es,en").split(",");

export function validateCaptureRequest(body: unknown): CaptureRequest {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body is required");
  }

  const req = body as Record<string, unknown>;

  if (typeof req.text !== "string" || req.text.length < 50) {
    throw new ValidationError("text is required and must be at least 50 characters");
  }

  if (req.url !== undefined && typeof req.url !== "string") {
    throw new ValidationError("url must be a string");
  }

  if (req.type !== undefined && !VALID_TYPES.includes(req.type as string)) {
    throw new ValidationError(`type must be one of: ${VALID_TYPES.join(", ")}`);
  }

  if (req.language !== undefined && !VALID_LANGUAGES.includes(req.language as string)) {
    throw new ValidationError("language must be 'es' or 'en'");
  }

  return {
    text: req.text as string,
    url: req.url as string | undefined,
    type: (req.type as string) ?? "concept",
    language: (req.language as "es" | "en") ?? "es",
  };
}

export function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 80);
}

export function isValidSlug(slug: string): boolean {
  return SLUG_REGEX.test(slug);
}
