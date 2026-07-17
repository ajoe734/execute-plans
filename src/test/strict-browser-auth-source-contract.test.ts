import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), "src", path), "utf8");
}

describe("strict browser auth source contract", () => {
  it("contains no persistent BFF bearer storage source", () => {
    const headers = source("lib/bff-v1/headers.ts");
    const authProvider = source("lib/auth/AuthProvider.tsx");
    const browserSession = source("lib/auth/bffBrowserSession.ts");
    const supabaseClient = source("integrations/supabase/client.ts");
    const bffBridge = [headers, authProvider, browserSession].join("\n");

    expect(bffBridge).not.toMatch(/localStorage|sessionStorage/);
    expect(bffBridge).not.toContain("pantheon.bff.bearerToken");
    expect(bffBridge).not.toContain("pantheon_operator_token");
    expect(bffBridge).not.toContain("VITE_BFF_DEV_BEARER_TOKEN");
    expect(supabaseClient).toContain("storage: sameTabAuthStorage");
  });

  it("limits Supabase persistence to same-tab sessionStorage", () => {
    const storage = source("integrations/supabase/sameTabAuthStorage.ts");
    expect(storage).toContain("window.sessionStorage");
    expect(storage).not.toContain("window.localStorage");
    expect(storage).not.toContain("pantheon.bff.bearerToken");
    expect(storage).not.toContain("pantheon_operator_token");
  });

  it("keeps privileged secrets out of the browser auth bridge", () => {
    const combined = [
      source("lib/auth/AuthProvider.tsx"),
      source("lib/auth/bffBrowserSession.ts"),
      source("integrations/supabase/client.ts"),
    ].join("\n");

    expect(combined).not.toMatch(/service[_-]?role/i);
    expect(combined).not.toMatch(/client[_-]?secret/i);
    expect(combined).not.toMatch(/private[_-]?key/i);
  });

  it("mounts both Persona management and Agora shells behind ProtectedRoute", () => {
    const app = source("App.tsx");
    expect(app).toContain("<ProtectedRoute><PlatformShellRoute /></ProtectedRoute>");
    expect(app).toContain("<ProtectedRoute><AgoraLayoutRoute /></ProtectedRoute>");
  });
});
