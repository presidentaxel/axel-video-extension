import { MESSAGE_TYPES } from "../lib/messages.js";

const form = document.getElementById("settingsForm");
const maxItemsInput = document.getElementById("maxItems");
const deduplicateByUrlInput = document.getElementById("deduplicateByUrl");
const statusNode = document.getElementById("status");

function setStatus(message) {
  statusNode.textContent = message;
}

async function loadSettings() {
  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.GET_SETTINGS
  });

  if (!response?.ok) {
    setStatus("Unable to load settings.");
    return;
  }

  maxItemsInput.value = String(response.data.maxItems);
  deduplicateByUrlInput.checked = Boolean(response.data.deduplicateByUrl);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const maxItems = Number(maxItemsInput.value);

  const response = await chrome.runtime.sendMessage({
    type: MESSAGE_TYPES.UPDATE_SETTINGS,
    payload: {
      maxItems,
      deduplicateByUrl: deduplicateByUrlInput.checked
    }
  });

  setStatus(response?.ok ? "Settings saved." : "Failed to save settings.");
});

void loadSettings();
