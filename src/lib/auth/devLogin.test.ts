import { afterEach, describe, expect, it, vi } from "vitest";
import { postDevLogin } from "./devLogin";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("postDevLogin client credentials flow", () => {
  it("POSTs to /bff/auth/dev-login with credentials: 'include' and browser_session: true", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "token-ignored-by-browser" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    await postDevLogin("dev-operator", "secret-password");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain("/bff/auth/dev-login");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("include");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("application/json");

    const body = JSON.parse(init?.body as string);
    expect(body).toEqual({
      grant_type: "client_credentials",
      client_id: "dev-operator",
      client_secret: "secret-password",
      browser_session: true,
    });
  });

  it("throws error with server message on HTTP 401 unauthorized", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({ message: "Invalid dev client credentials" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      ),
    );

    await expect(postDevLogin("wrong-id", "wrong-pwd")).rejects.toThrow(
      "Invalid dev client credentials",
    );
  });

  it("throws fallback HTTP status error when response body is not JSON", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("Bad Gateway", { status: 502 }),
    );

    await expect(postDevLogin("id", "pwd")).rejects.toThrow("dev-login HTTP 502");
  });
});
