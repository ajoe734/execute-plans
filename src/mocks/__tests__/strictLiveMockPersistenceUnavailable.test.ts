import { describe, it, expect } from "vitest";
import {
  StrictLiveMockPersistenceError,
  persistNow,
  clearPersisted,
  rehydrate,
  schedulePersist,
} from "@/mocks/strictLiveMockPersistenceUnavailable";

describe("strictLiveMockPersistenceUnavailable", () => {
  it("throws StrictLiveMockPersistenceError on persistNow()", () => {
    expect(() => persistNow()).toThrow(StrictLiveMockPersistenceError);
    try {
      persistNow();
    } catch (err) {
      expect(err).toBeInstanceOf(StrictLiveMockPersistenceError);
      expect((err as StrictLiveMockPersistenceError).code).toBe("MOCK_PERSISTENCE_UNAVAILABLE");
      expect((err as Error).message).toContain("snapshot is unavailable");
    }
  });

  it("throws StrictLiveMockPersistenceError on clearPersisted()", () => {
    expect(() => clearPersisted()).toThrow(StrictLiveMockPersistenceError);
    try {
      clearPersisted();
    } catch (err) {
      expect(err).toBeInstanceOf(StrictLiveMockPersistenceError);
      expect((err as StrictLiveMockPersistenceError).code).toBe("MOCK_PERSISTENCE_UNAVAILABLE");
      expect((err as Error).message).toContain("reset is unavailable");
    }
  });

  it("rehydrate and schedulePersist do not crash", () => {
    expect(() => rehydrate()).not.toThrow();
    expect(() => schedulePersist()).not.toThrow();
  });
});
