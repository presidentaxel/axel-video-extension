import { MESSAGE_TYPES } from "../lib/messages.js";
import { escapeHtml } from "./popup-helpers.js";

const statusNode = document.getElementById("status");
const mediaListNode = document.getElementById("mediaList");
const clearBtn = document.getElementById("clearBtn");

function renderItems(items) {
  mediaListNode.innerHTML = "";

  if (!items.length) {
    statusNode.textContent = "Aucune video detectee sur cet onglet.";
    return;
  }

  statusNode.textContent = `${items.length} video detectee${items.length > 1 ? "s" : ""}.`;
  const fragment = document.createDocumentFragment();

  for (const item of items) {
    const li = document.createElement("li");
    li.className = "popup__item";
    const thumb = item.thumbnailUrl
      ? `<img class="popup__thumb-img" src="${escapeHtml(item.thumbnailUrl)}" alt="thumbnail" />`
      : `<div class="popup__thumb-empty">Preview</div>`;
    const durationBadge = item.durationLabel
      ? `<span class="popup__duration">${escapeHtml(item.durationLabel)}</span>`
      : "";
    const variants = Array.isArray(item.variants) && item.variants.length ? item.variants : [];
    const optionsMarkup = variants
      .map(
        (variant, index) => `
          <option
            value="${escapeHtml(variant.url)}"
            data-filename="${escapeHtml(variant.filename || item.filename || "")}"
            ${index === 0 ? "selected" : ""}
          >
            ${escapeHtml(variant.qualityLabel || "auto")}
          </option>
        `
      )
      .join("");

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
            <select class="popup__quality-select" aria-label="Qualite">
              ${optionsMarkup || '<option value="">auto</option>'}
            </select>
            <button
              class="popup__download-btn"
              data-url="${escapeHtml(item.sourceUrl)}"
              data-filename="${escapeHtml(item.filename || "")}"
              type="button"
            >
              Télécharger
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
    statusNode.textContent = "Impossible de charger les videos.";
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
  let filename = button.dataset.filename || "";
  const row = button.closest(".popup__item");
  const qualitySelect = row?.querySelector(".popup__quality-select");
  const selectedOption = qualitySelect?.selectedOptions?.[0];
  const selectedUrl = selectedOption?.value;
  if (selectedUrl) {
    button.dataset.url = selectedUrl;
  }
  if (selectedOption?.dataset?.filename) {
    filename = selectedOption.dataset.filename;
    button.dataset.filename = filename;
  }

  const targetUrl = button.dataset.url;
  if (!targetUrl) {
    return;
  }

  statusNode.textContent = "Preparation du telechargement...";
  button.disabled = true;

  try {
    const response = await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.DOWNLOAD_MEDIA,
      payload: { url: targetUrl, filename }
    });
    if (!response?.ok) {
      statusNode.textContent = response?.error || "Telechargement echoue.";
      return;
    }
    const modeLabel = response?.data?.mode === "reconstructed" ? "reconstructed MP4" : "direct";
    statusNode.textContent = `Telechargement lance (${modeLabel}).`;
  } catch (error) {
    statusNode.textContent = error?.message || "Telechargement echoue.";
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
