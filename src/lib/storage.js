const STORAGE_KEYS = Object.freeze({
  SETTINGS: "settings"
});

const DEFAULT_SETTINGS = Object.freeze({
  maxItems: 100,
  deduplicateByUrl: true
});

export async function getSettings() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
  return {
    ...DEFAULT_SETTINGS,
    ...(result[STORAGE_KEYS.SETTINGS] || {})
  };
}

export async function setSettings(partialSettings) {
  const current = await getSettings();
  const next = {
    ...current,
    ...partialSettings
  };
  await chrome.storage.local.set({
    [STORAGE_KEYS.SETTINGS]: next
  });
  return next;
}

export { DEFAULT_SETTINGS };
