import { describe, expect, it } from "vitest";
import { shortenHash } from "./Lists";

describe("shortenHash", () => {
  it("shortens the real artifact sha256 and keeps prefix", () => {
    const full = "sha256:38fb8f49fbee0b7131014b14c432fdd8dc521d522b4c76be2e04d002608e008e";
    const short = shortenHash(full);
    expect(short).toBe("sha256:38fb8f49…e008e".replace("…e008e", "…" + full.slice(-6)));
    expect(short.length).toBeLessThan(full.length / 2);
    expect(full.startsWith("sha256:38fb8f49")).toBe(true);
    expect(full.endsWith(short.slice(-6))).toBe(true);
  });
  it("leaves short values alone", () => {
    expect(shortenHash("abc123")).toBe("abc123");
  });
});
