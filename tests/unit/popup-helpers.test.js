import { describe, expect, it } from "vitest";
import { escapeHtml } from "../../src/popup/popup-helpers.js";

describe("popup helpers", () => {
  it("escapes unsafe html chars", () => {
    const input = `<script>alert("x")</script>`;
    const escaped = escapeHtml(input);
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).not.toContain("<script>");
  });
});
