import { MESSAGE_TYPES } from "../lib/messages.js";
import { getSettings, setSettings } from "../lib/storage.js";
import {
  createMediaEntry,
  downloadMedia,
  isCandidateMediaRequest
} from "./media-core.js";

const mediaByTab = new Map();

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
      const result = await downloadMedia(targetUrl, {
        downloadsApi: chrome.downloads,
        fetchImpl: fetch
      });
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
