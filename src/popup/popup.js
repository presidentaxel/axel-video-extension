import { MESSAGE_TYPES } from "../lib/messages.js";
import { escapeHtml } from "./popup-helpers.js";

const statusNode = document.getElementById("status");
const mediaListNode = document.getElementById("mediaList");
const clearBtn = document.getElementById("clearBtn");

function renderItems(items) {
  mediaListNode.innerHTML = "";

  if (!items.length) {
    statusNode.textContent = "No media detected on this tab yet.";
    return;
  }

  statusNode.textContent = `${items.length} media item(s) detected.`;
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "popup__item";
    const thumb = item.thumbnailUrl
      ? `<img class="popup__thumb-img" src="${escapeHtml(item.thumbnailUrl)}" alt="thumbnail" />`
      : `<div class="popup__thumb-empty">No preview</div>`;
    const durationBadge = item.durationLabel
      ? `<span class="popup__duration">${escapeHtml(item.durationLabel)}</span>`
      : "";
    li.innerHTML = `
      <div class="popup__card">
        <div class="popup__thumb">
          ${thumb}
          ${durationBadge}
        </div>
        <div class="popup__meta">
          <div class="popup__title">${escapeHtml(item.title || "Untitled video")}</div>
          <div class="popup__badges">
            <span class="popup__badge">MP4</span>
            <span class="popup__badge">${escapeHtml(item.qualityLabel || "auto")}</span>
          </div>
          <div class="popup__actions">
            <button
              class="popup__download-btn"
              data-url="${escapeHtml(item.sourceUrl)}"
              data-filename="${escapeHtml(item.filename || "")}"
              type="button"
            >
              Telecharger
            </button>
          </div>
        </div>
      </div>
      <div class="popup__date">${new Date(item.detectedAt).toLocaleString()}</div>
    `;
    fragment.appendChild(li);
  }

  mediaListNode.appendChild(fragment);
}

async function getCurrentTabId() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0]?.id ?? -1;
}

async function loadMediaEntries() {
  const tabId = await getCurrentTabId();
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_MEDIA_ENTRIES,
    tabId
  });

  if (!response?.ok) {
    statusNode.textContent = "Failed to load media entries.";
    return;
  }

  renderItems(response.data || []);
}

async function handleDownloadClick(event) {
  const button = event.target.closest(".popup__download-btn");
  if (!button) {
    return;
  }

  const url = button.dataset.url;
  const filename = button.dataset.filename || "";
  if (!url) {
    return;
  }

  statusNode.textContent = "Preparing download...";
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.DOWNLOAD_MEDIA,
      payload: { url, filename }
    });
    if (!response?.ok) {
      statusNode.textContent = response?.error || "Download failed.";
      return;
    }
    const modeLabel = response?.data?.mode === "reconstructed" ? "reconstructed MP4" : "direct";
    statusNode.textContent = `Download started (${modeLabel}).`;
  } catch (error) {
    statusNode.textContent = error?.message || "Download failed.";
  } finally {
    button.disabled = false;
  }
}

clearBtn.addEventListener("click", async () => {
  const tabId = await getCurrentTabId();
  await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.CLEAR_MEDIA_ENTRIES,
    tabId
  });
  await loadMediaEntries();
});

mediaListNode.addEventListener("click", (event) => {
  void handleDownloadClick(event);
});

void loadMediaEntries();
