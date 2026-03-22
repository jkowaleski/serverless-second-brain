import { createContext, useContext, useCallback, useEffect, useState, useRef, type ReactNode } from "react";

interface AuthState {
  user: { email: string } | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
  showLogin: boolean;
  setShowLogin: (v: boolean) => void;
}

const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN ?? "";
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID ?? "";
const REGION = COGNITO_DOMAIN ? new URL(COGNITO_DOMAIN).hostname.split(".").at(-3) ?? "us-east-1" : "us-east-1";
const COGNITO_IDP = `https://cognito-idp.${REGION}.amazonaws.com/`;

function decodeJwt(token: string): Record<string, unknown> {
  const payload = token.split(".")[1];
  return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
}

function isExpired(accessToken: string): boolean {
  try {
    const claims = decodeJwt(accessToken);
    return (claims.exp as number) * 1000 <= Date.now();
  } catch { return true; }
}

function userPoolId(): string {
  return import.meta.env.VITE_COGNITO_USER_POOL_ID ?? "";
}

const Ctx = createContext<AuthState>({
  user: null, token: null, loading: true,
  login: async () => null, logout: () => {},
  showLogin: false, setShowLogin: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<{ email: string } | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLogin, setShowLogin] = useState(false);
  const refreshTokenRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const refreshingRef = useRef<Promise<boolean> | null>(null);

  const clearSession = useCallback(() => {
    setUser(null);
    setToken(null);
    refreshTokenRef.current = null;
    localStorage.removeItem("ssb-refresh");
    clearTimeout(timerRef.current);
  }, []);

  const applyToken = useCallback((accessToken: string, refreshToken?: string) => {
    if (isExpired(accessToken)) return;
    setToken(accessToken);
    if (refreshToken) {
      refreshTokenRef.current = refreshToken;
      localStorage.setItem("ssb-refresh", refreshToken);
    }
    try {
      const claims = decodeJwt(accessToken);
      setUser({ email: (claims.email as string) ?? (claims.username as string) ?? "owner" });
    } catch { /* ignore */ }
  }, []);

  const refreshAuth = useCallback(async (rt: string): Promise<boolean> => {
    // Deduplicate concurrent refresh calls
    if (refreshingRef.current) return refreshingRef.current;

    const doRefresh = async (): Promise<boolean> => {
      const poolId = userPoolId();
      if (!poolId || !CLIENT_ID) return false;
      try {
        const res = await fetch(COGNITO_IDP, {
          method: "POST",
          headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth" },
          body: JSON.stringify({
            AuthFlow: "REFRESH_TOKEN_AUTH",
            ClientId: CLIENT_ID,
            AuthParameters: { REFRESH_TOKEN: rt },
          }),
        });
        if (!res.ok) {
          // Refresh token revoked or expired — clear session
          clearSession();
          return false;
        }
        const data = await res.json();
        const result = data.AuthenticationResult;
        if (result?.AccessToken) {
          applyToken(result.AccessToken);
          return true;
        }
      } catch {
        // Network error — don't clear session, token might still be valid
      }
      return false;
    };

    refreshingRef.current = doRefresh().finally(() => { refreshingRef.current = null; });
    return refreshingRef.current;
  }, [applyToken, clearSession]);

  const scheduleRefresh = useCallback((accessToken: string) => {
    clearTimeout(timerRef.current);
    try {
      const claims = decodeJwt(accessToken);
      // Refresh 60s before expiry
      const ms = (claims.exp as number) * 1000 - Date.now() - 60_000;
      if (ms > 0 && refreshTokenRef.current) {
        const rt = refreshTokenRef.current;
        timerRef.current = setTimeout(async () => {
          const ok = await refreshAuth(rt);
          if (!ok) clearSession();
        }, ms);
      }
    } catch { /* ignore */ }
  }, [refreshAuth, clearSession]);

  // Restore session from stored refresh token
  useEffect(() => {
    const rt = localStorage.getItem("ssb-refresh");
    if (rt && CLIENT_ID && userPoolId()) {
      refreshTokenRef.current = rt;
      refreshAuth(rt).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
    return () => clearTimeout(timerRef.current);
  }, [refreshAuth]);

  // Schedule refresh whenever token changes
  useEffect(() => {
    if (token) scheduleRefresh(token);
  }, [token, scheduleRefresh]);

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const poolId = userPoolId();
    if (!poolId || !CLIENT_ID) return "Auth not configured";
    try {
      const res = await fetch(COGNITO_IDP, {
        method: "POST",
        headers: { "Content-Type": "application/x-amz-json-1.1", "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth" },
        body: JSON.stringify({
          AuthFlow: "USER_PASSWORD_AUTH",
          ClientId: CLIENT_ID,
          AuthParameters: { USERNAME: email, PASSWORD: password },
        }),
      });
      const data = await res.json();
      if (!res.ok) return data.message ?? data.__type ?? "Login failed";
      const result = data.AuthenticationResult;
      if (result?.AccessToken) {
        applyToken(result.AccessToken, result.RefreshToken);
        setShowLogin(false);
        return null;
      }
      if (data.ChallengeName) return `Challenge: ${data.ChallengeName}`;
      return "Unexpected response";
    } catch (err) {
      return err instanceof Error ? err.message : "Network error";
    }
  }, [applyToken]);

  return <Ctx.Provider value={{ user, token, loading, login, logout: clearSession, showLogin, setShowLogin }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }
