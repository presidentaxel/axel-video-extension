import { MESSAGE_TYPES } from "../lib/messages.js";

const statusNode = document.getElementById("status");
const mediaListNode = document.getElementById("mediaList");
const clearBtn = document.getElementById("clearBtn");

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

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
    li.innerHTML = `
      <div><strong>${item.resourceType || "media"}</strong></div>
      <div class="popup__url">${escapeHtml(item.url)}</div>
      <div>${new Date(item.detectedAt).toLocaleString()}</div>
      <div class="popup__actions">
        <button class="popup__download-btn" data-url="${escapeHtml(item.url)}" type="button">
          Download MP4
        </button>
      </div>
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
  if (!url) {
    return;
  }

  statusNode.textContent = "Preparing download...";
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.DOWNLOAD_MEDIA,
      payload: { url }
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
