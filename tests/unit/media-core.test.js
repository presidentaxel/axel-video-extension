import { describe, expect, it, vi } from "vitest";
import {
  arrayBufferToBase64,
  buildDisplayEntries,
  buildOutputNameFromMetadata,
  buildDataUrlFromBuffers,
  buildOutputName,
  createMediaEntry,
  downloadMedia,
  extractSegmentsFromManifest,
  isCandidateMediaRequest,
  parseManifestSegments,
  sanitizeFileName
} from "../../src/background/media-core.js";

describe("media core", () => {
  it("detects candidate media request", () => {
    expect(isCandidateMediaRequest({ url: "https://a/b/file.mp4" })).toBe(true);
    expect(isCandidateMediaRequest({ url: "https://a/b/file.txt" })).toBe(false);
  });

  it("creates hls media entry for m3u8", () => {
    const entry = createMediaEntry({ tabId: 1, url: "https://x/stream.m3u8" });
    expect(entry.resourceType).toBe("hls");
    expect(entry.id).toBe("1:https://x/stream.m3u8");
  });

  it("sanitizes output filename", () => {
    expect(sanitizeFileName('a<>:"/\\|?*b')).toBe("a_________b");
    expect(buildOutputName("https://x/video.m3u8?token=1")).toBe("video.mp4");
    expect(
      buildOutputNameFromMetadata({
        title: "My Dissertation Video",
        qualityLabel: "720p",
        fallbackUrl: "https://x/video.mp4"
      })
    ).toBe("My Dissertation Video_720p.mp4");
  });

  it("parses manifest segments to absolute urls", () => {
    const manifest = "#EXTM3U\nseg-1.ts\n#EXTINF:10,\nseg-2.ts";
    const result = parseManifestSegments(manifest, "https://cdn.example.com/master/playlist.m3u8");
    expect(result).toEqual([
      "https://cdn.example.com/master/seg-1.ts",
      "https://cdn.example.com/master/seg-2.ts"
    ]);
  });

  it("resolves nested playlists", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith("variant.m3u8")) {
        return {
          ok: true,
          text: async () => "#EXTM3U\nchunk-1.ts\nchunk-2.ts"
        };
      }
      return {
        ok: true,
        text: async () => "#EXTM3U\nvariant.m3u8"
      };
    });
    const segments = await extractSegmentsFromManifest(
      "https://cdn.example.com/master.m3u8",
      "#EXTM3U\nvariant.m3u8",
      fetchImpl
    );
    expect(segments).toEqual([
      "https://cdn.example.com/chunk-1.ts",
      "https://cdn.example.com/chunk-2.ts"
    ]);
  });

  it("builds data url from array buffers", () => {
    const a = new TextEncoder().encode("a").buffer;
    const b = new TextEncoder().encode("b").buffer;
    const dataUrl = buildDataUrlFromBuffers([a, b]);
    expect(dataUrl.startsWith("data:video/mp4;base64,")).toBe(true);
    expect(dataUrl.endsWith("YWI=")).toBe(true);
    expect(arrayBufferToBase64(a)).toBe("YQ==");
  });

  it("downloads direct media for mp4", async () => {
    const download = vi.fn(async () => 99);
    const result = await downloadMedia("https://cdn/file.mp4", {
      downloadsApi: { download },
      fetchImpl: vi.fn()
    });
    expect(result.mode).toBe("direct");
    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0][0].saveAs).toBe(false);
  });

  it("falls back to fetched bytes when direct download fails", async () => {
    const download = vi
      .fn()
      .mockRejectedValueOnce(new Error("blocked"))
      .mockResolvedValueOnce(123);
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      arrayBuffer: async () => new TextEncoder().encode("hello").buffer
    }));

    const result = await downloadMedia("https://cdn/protected.mp4", {
      downloadsApi: { download },
      fetchImpl
    });

    expect(result.mode).toBe("direct-fallback");
    expect(download).toHaveBeenCalledTimes(2);
    expect(download.mock.calls[1][0].url.startsWith("data:video/mp4;base64,")).toBe(true);
  });

  it("reconstructs hls and downloads data url", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (url.endsWith(".m3u8")) {
        return {
          ok: true,
          text: async () => "#EXTM3U\npart-1.ts\npart-2.ts"
        };
      }
      return {
        ok: true,
        arrayBuffer: async () => new TextEncoder().encode(url).buffer
      };
    });

    const download = vi.fn(async () => 7);
    const result = await downloadMedia("https://cdn/master.m3u8", {
      fetchImpl,
      downloadsApi: { download }
    });
    expect(result.mode).toBe("reconstructed");
    expect(result.segmentCount).toBe(2);
    expect(download).toHaveBeenCalledOnce();
    expect(download.mock.calls[0][0].url.startsWith("data:video/mp4;base64,")).toBe(true);
  });

  it("builds single display card from duplicate entries", () => {
    const raw = [
      createMediaEntry({
        tabId: 1,
        url: "https://host/scf/hls/entryId/abc/flavorId/one/name/Test.Video.360p.mp4"
      }),
      createMediaEntry({
        tabId: 1,
        url: "https://host/scf/hls/entryId/abc/flavorId/two/name/Test.Video.720p.mp4"
      })
    ];

    const cards = buildDisplayEntries(raw, {
      title: "Fallback Title",
      poster: "https://img/thumb.jpg",
      duration: 185
    });

    expect(cards).toHaveLength(1);
    expect(cards[0].qualityLabel).toBe("720p");
    expect(cards[0].thumbnailUrl).toBe("https://img/thumb.jpg");
    expect(cards[0].durationLabel).toBe("03:05");
    expect(cards[0].filename).toContain("720p");
  });
});
