import { readBffEnv } from "@/lib/bff-v1/runtimeEnv";

export interface DevLoginParams {
  account: string;
  password: string;
}

export async function postDevLogin(account: string, password: string): Promise<void> {
  const env = readBffEnv();
  const baseUrl = env.VITE_BFF_BASE_URL ?? "";

  const response = await fetch(`${baseUrl}/bff/auth/dev-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-Request-Id": `fe-dev-login-${Date.now()}`,
    },
    credentials: "include",
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: account,
      client_secret: password,
      browser_session: true,
    }),
  });

  if (!response.ok) {
    let message = `dev-login HTTP ${response.status}`;
    try {
      const data = (await response.json()) as Record<string, unknown>;
      if (typeof data?.message === "string") {
        message = data.message;
      } else if (typeof data?.error_description === "string") {
        message = data.error_description;
      } else if (typeof data?.error === "string") {
        message = data.error;
      } else if (data?.error && typeof data.error === "object" && "message" in data.error) {
        message = String((data.error as { message: unknown }).message);
      }
    } catch {
      // Use status message fallback
    }
    throw new Error(message);
  }
}
