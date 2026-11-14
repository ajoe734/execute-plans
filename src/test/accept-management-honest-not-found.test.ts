import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const source = readFileSync("scripts/accept-management-hosted-production.mjs", "utf8");
const match = source.match(/function shortContentIncomplete[\s\S]*?\n}\n/);
const shortContentIncomplete = runInNewContext(`(${match![0].replace(/^function shortContentIncomplete/, "function")})`) as
  (content: string, honest: boolean) => boolean;
// Mirrors the honestNotFound regex in crawlRoute.
const notFound = (content: string) => /not found|找不到|不存在/iu.test(content);

describe("short-content rule vs honest not-found", () => {
  it("passes the exact zh-TW stg_001 not-found message", () => {
    const content = "找不到策略 stg_001。";
    expect(content.length).toBeLessThanOrEqual(15);
    expect(notFound(content)).toBe(true);
    expect(shortContentIncomplete(content, notFound(content))).toBe(false);
  });
  it("source wires the helper into content_incomplete", () => {
    expect(source).toContain('shortContentIncomplete(snapshot.content, honestNotFound) && "content_incomplete"');
  });
  it("still fails short content that is not a not-found message", () => {
    expect(shortContentIncomplete("Loading data", notFound("Loading data"))).toBe(true);
    expect(shortContentIncomplete("", false)).toBe(true);
  });
  it("live-id 404 stays a failure (honestNotFound false)", () => {
    expect(shortContentIncomplete("找不到策略 stg_001。", false)).toBe(true);
  });
});
