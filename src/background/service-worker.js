import { MESSAGE_TYPES } from "../lib/messages.js";
import { getSettings, setSettings } from "../lib/storage.js";

const MEDIA_FILE_PATTERN = /\.(mp4|m4v|webm|m3u8|mp3|aac|wav)(\?.*)?$/i;
const HLS_PATTERN = /\.m3u8(\?.*)?$/i;
const mediaByTab = new Map();

function createMediaEntry({ tabId, url, initiator, method, type }) {
  const normalizedType = HLS_PATTERN.test(url) ? "hls" : type || "other";
  return {
    id: `${tabId}:${url}`,
    tabId,
    url,
    initiator: initiator || "",
    method: method || "GET",
    resourceType: normalizedType,
    detectedAt: new Date().toISOString()
  };
}

function isCandidateMediaRequest(request) {
  if (!request || !request.url) {
    return false;
  }
  return MEDIA_FILE_PATTERN.test(request.url);
}

async function pushContentVideoEntries(tabId, payload) {
  if (!payload || !Array.isArray(payload.videos)) {
    return;
  }
  const settings = await getSettings();
  const list = mediaByTab.get(tabId) || [];

  const fromPage = payload.videos
    .filter((video) => typeof video.src === "string" && video.src.length > 0)
    .map((video) =>
      createMediaEntry({
        tabId,
        url: video.src,
        initiator: payload.pageUrl || "",
        method: "GET",
        type: "media"
      })
    );

  const merged = [...fromPage, ...list];
  const deduped = settings.deduplicateByUrl
    ? merged.filter(
        (entry, index, array) =>
          array.findIndex((candidate) => candidate.url === entry.url) === index
      )
    : merged;

  mediaByTab.set(tabId, deduped.slice(0, settings.maxItems));
}

function toAbsoluteUrl(rawLine, baseUrl) {
  try {
    return new URL(rawLine, baseUrl).toString();
  } catch {
    return "";
  }
}

function parseManifestSegments(manifestText, manifestUrl) {
  return manifestText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => toAbsoluteUrl(line, manifestUrl))
    .filter(Boolean);
}

async function extractSegmentsFromManifest(manifestUrl, manifestText, depth = 0) {
  const entries = parseManifestSegments(manifestText, manifestUrl);
  if (!entries.length) {
    return [];
  }

  const nestedPlaylist = entries.find((entry) => HLS_PATTERN.test(entry));
  if (nestedPlaylist && depth < 2) {
    const nestedResponse = await fetch(nestedPlaylist, { credentials: "include" });
    if (!nestedResponse.ok) {
      throw new Error(`Cannot fetch nested playlist (${nestedResponse.status}).`);
    }
    const nestedText = await nestedResponse.text();
    return extractSegmentsFromManifest(nestedPlaylist, nestedText, depth + 1);
  }

  return entries.filter((entry) => !HLS_PATTERN.test(entry));
}

async function fetchAsArrayBuffer(url) {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  return response.arrayBuffer();
}

function sanitizeFileName(input) {
  return input.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").slice(0, 120);
}

function buildOutputName(url) {
  const fromUrl = url.split("/").pop() || "video";
  const noQuery = fromUrl.split("?")[0] || "video";
  const stem = noQuery.replace(/\.(m3u8|mp4|m4v|webm)$/i, "");
  return `${sanitizeFileName(stem || "video")}.mp4`;
}

async function downloadDirectUrl(url) {
  const filename = buildOutputName(url);
  const downloadId = await chrome.downloads.download({
    url,
    filename,
    saveAs: true
  });
  return { downloadId, filename, mode: "direct" };
}

async function reconstructAndDownloadHls(manifestUrl) {
  const manifestResponse = await fetch(manifestUrl, { credentials: "include" });
  if (!manifestResponse.ok) {
    throw new Error(`Cannot fetch manifest (${manifestResponse.status}).`);
  }
  const manifestText = await manifestResponse.text();
  const segments = await extractSegmentsFromManifest(manifestUrl, manifestText);
  if (!segments.length) {
    throw new Error("No segments found in manifest.");
  }

  const buffers = [];
  for (const segmentUrl of segments) {
    buffers.push(await fetchAsArrayBuffer(segmentUrl));
  }

  const blob = new Blob(buffers, { type: "video/mp4" });
  const blobUrl = URL.createObjectURL(blob);
  const filename = buildOutputName(manifestUrl);

  try {
    const downloadId = await chrome.downloads.download({
      url: blobUrl,
      filename,
      saveAs: true
    });
    return {
      downloadId,
      filename,
      segmentCount: segments.length,
      mode: "reconstructed"
    };
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}

async function downloadMedia(url) {
  if (HLS_PATTERN.test(url)) {
    return reconstructAndDownloadHls(url);
  }
  return downloadDirectUrl(url);
}

async function pushMediaEntry(request) {
  const tabId = typeof request.tabId === "number" ? request.tabId : -1;
  const settings = await getSettings();
  const list = mediaByTab.get(tabId) || [];
  const candidate = createMediaEntry({
    tabId,
    url: request.url,
    initiator: request.initiator,
    method: request.method,
    type: request.type
  });

  const nextList = settings.deduplicateByUrl
    ? [candidate, ...list.filter((item) => item.url !== candidate.url)]
    : [candidate, ...list];

  mediaByTab.set(tabId, nextList.slice(0, settings.maxItems));
}

chrome.webRequest.onCompleted.addListener(
  async (request) => {
    if (!isCandidateMediaRequest(request)) {
      return;
    }
    await pushMediaEntry(request);
  },
  { urls: ["<all_urls>"] }
);

chrome.tabs.onRemoved.addListener((tabId) => {
  mediaByTab.delete(tabId);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const type = message?.type;

    if (type === MESSAGE_TYPES.GET_MEDIA_ENTRIES) {
      const tabId = sender.tab?.id ?? message?.tabId ?? -1;
      sendResponse({
        ok: true,
        data: mediaByTab.get(tabId) || []
      });
      return;
    }

    if (type === MESSAGE_TYPES.CLEAR_MEDIA_ENTRIES) {
      const tabId = sender.tab?.id ?? message?.tabId ?? -1;
      mediaByTab.set(tabId, []);
      sendResponse({ ok: true });
      return;
    }

    if (type === MESSAGE_TYPES.GET_SETTINGS) {
      const settings = await getSettings();
      sendResponse({ ok: true, data: settings });
      return;
    }

    if (type === MESSAGE_TYPES.MEDIA_ENTRIES_UPDATED) {
      const tabId = sender.tab?.id ?? message?.tabId ?? -1;
      await pushContentVideoEntries(tabId, message.payload);
      sendResponse({ ok: true });
      return;
    }

    if (type === MESSAGE_TYPES.UPDATE_SETTINGS) {
      const settings = await setSettings(message.payload || {});
      sendResponse({ ok: true, data: settings });
      return;
    }

    if (type === MESSAGE_TYPES.DOWNLOAD_MEDIA) {
      const targetUrl = message?.payload?.url;
      if (!targetUrl || typeof targetUrl !== "string") {
        sendResponse({ ok: false, error: "Invalid media URL." });
        return;
      }
      const result = await downloadMedia(targetUrl);
      sendResponse({ ok: true, data: result });
      return;
    }

    sendResponse({ ok: false, error: "Unsupported message type." });
  })().catch((error) => {
    sendResponse({
      ok: false,
      error: error?.message || "Unknown service worker error."
    });
  });

  return true;
});
