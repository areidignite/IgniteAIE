/// <reference types="vite/client" />

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken: (config?: { prompt?: string }) => void;
}

interface Google {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: TokenResponse) => void;
        error_callback?: (error: { type: string; message: string }) => void;
        prompt?: string;
      }) => TokenClient;
    };
  };
}

declare const google: Google;
