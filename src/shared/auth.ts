import type { APIGatewayProxyEvent } from "aws-lambda";
import { CognitoJwtVerifier } from "aws-jwt-verify";

const USER_POOL_ID = process.env.USER_POOL_ID || "";
const SPA_CLIENT_ID = process.env.SPA_CLIENT_ID || "";
const MCP_CLIENT_ID = process.env.MCP_CLIENT_ID || "";

let verifier: ReturnType<typeof CognitoJwtVerifier.create> | null = null;

function getVerifier() {
  if (!verifier && USER_POOL_ID) {
    verifier = CognitoJwtVerifier.create({
      userPoolId: USER_POOL_ID,
      tokenUse: "access",
      clientId: [SPA_CLIENT_ID, MCP_CLIENT_ID].filter(Boolean),
    });
  }
  return verifier;
}

export async function isAuthenticated(event: APIGatewayProxyEvent): Promise<boolean> {
  // Check authorizer context first (for write endpoints using API Gateway authorizer)
  if (event.requestContext?.authorizer?.authenticated === "true") return true;

  // For read endpoints (NONE auth), verify Bearer token inline
  const header = event.headers?.Authorization || event.headers?.authorization || "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const v = getVerifier();
  if (!v) return false;

  try {
    await v.verify(token);
    return true;
  } catch {
    return false;
  }
}
