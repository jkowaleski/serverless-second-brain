import { CognitoJwtVerifier } from "aws-jwt-verify";

const USER_POOL_ID = process.env.USER_POOL_ID!;
const SPA_CLIENT_ID = process.env.SPA_CLIENT_ID!;
const MCP_CLIENT_ID = process.env.MCP_CLIENT_ID!;

const verifier = CognitoJwtVerifier.create({
  userPoolId: USER_POOL_ID,
  tokenUse: "access",
  clientId: [SPA_CLIENT_ID, MCP_CLIENT_ID],
});

interface AuthorizerEvent {
  type: string;
  headers?: Record<string, string>;
  methodArn: string;
}

interface AuthorizerResult {
  principalId: string;
  policyDocument: {
    Version: string;
    Statement: Array<{
      Action: string;
      Effect: string;
      Resource: string;
    }>;
  };
  context?: Record<string, string | boolean>;
}

export const handler = async (event: AuthorizerEvent): Promise<AuthorizerResult> => {
  const arnParts = event.methodArn.split(":");
  const apiGatewayArn = arnParts[5].split("/");
  const region = arnParts[3];
  const accountId = arnParts[4];
  const apiId = apiGatewayArn[0];
  const stage = apiGatewayArn[1];
  const resourceArn = `arn:aws:execute-api:${region}:${accountId}:${apiId}/${stage}/*`;

  const authHeader = event.headers?.Authorization || event.headers?.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "") || "";

  if (!token) {
    // Anonymous — allow invoke but flag as unauthenticated
    return {
      principalId: "anonymous",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [{ Action: "execute-api:Invoke", Effect: "Allow", Resource: resourceArn }],
      },
      context: { authenticated: "false" },
    };
  }

  try {
    const payload = await verifier.verify(token);
    return {
      principalId: payload.sub,
      policyDocument: {
        Version: "2012-10-17",
        Statement: [{ Action: "execute-api:Invoke", Effect: "Allow", Resource: resourceArn }],
      },
      context: {
        authenticated: "true",
        sub: payload.sub,
        scopes: (payload.scope as string) || "",
      },
    };
  } catch {
    // Invalid token — deny
    return {
      principalId: "unauthorized",
      policyDocument: {
        Version: "2012-10-17",
        Statement: [{ Action: "execute-api:Invoke", Effect: "Deny", Resource: resourceArn }],
      },
    };
  }
};
