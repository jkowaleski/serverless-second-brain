/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_COGNITO_DOMAIN: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
