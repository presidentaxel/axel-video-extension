import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSettings, setSettings } from "../../src/lib/storage.js";

describe("storage", () => {
  beforeEach(() => {
    const db = {};
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async (key) => ({ [key]: db[key] })),
          set: vi.fn(async (data) => {
            Object.assign(db, data);
          })
        }
      }
    };
  });

  it("returns defaults when no settings are stored", async () => {
    const settings = await getSettings();
    expect(settings).toEqual({
      maxItems: 100,
      deduplicateByUrl: true
    });
  });

  it("merges and saves settings", async () => {
    const next = await setSettings({ maxItems: 42 });
    expect(next).toEqual({
      maxItems: 42,
      deduplicateByUrl: true
    });
  });
});
