import { describe, expect, it } from "vitest";
import { isSupportedMessageType, MESSAGE_TYPES } from "../../src/lib/messages.js";

describe("messages", () => {
  it("contains expected message types", () => {
    expect(MESSAGE_TYPES.GET_MEDIA_ENTRIES).toBe("GET_MEDIA_ENTRIES");
    expect(MESSAGE_TYPES.DOWNLOAD_MEDIA).toBe("DOWNLOAD_MEDIA");
  });

  it("validates known message types", () => {
    expect(isSupportedMessageType(MESSAGE_TYPES.GET_SETTINGS)).toBe(true);
    expect(isSupportedMessageType("UNKNOWN")).toBe(false);
  });
});
