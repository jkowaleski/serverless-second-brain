import { validateCaptureRequest } from "../../../shared/validation.js";
import { listNodeSlugs } from "../../../shared/dynamodb.js";
import type { CaptureRequest } from "../../../shared/types.js";

interface ValidateOutput {
  input: CaptureRequest;
  existingSlugs: string[];
}

export const handler = async (event: string | Record<string, unknown>): Promise<ValidateOutput> => {
  // Step Functions passes the input as a JSON string (from API Gateway escapeJavaScript)
  // or as an already-parsed object (from direct invocation / testing)
  const parsed = typeof event === "string" ? JSON.parse(event) : event;
  const input = validateCaptureRequest(parsed);
  const existingSlugs = await listNodeSlugs();
  return { input, existingSlugs };
};
