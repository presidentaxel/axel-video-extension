export const MEDIA_FILE_PATTERN = /\.(mp4|m4v|webm|m3u8|mp3|aac|wav)(\?.*)?$/i;
export const HLS_PATTERN = /\.m3u8(\?.*)?$/i;

export function parseKalturaLikeMetadata(url) {
  const decoded = decodeURIComponent(url);
  const entryMatch = decoded.match(/\/entryId\/([^/]+)/i);
  const flavorMatch = decoded.match(/\/flavorId\/([^/]+)/i);
  const nameMatch = decoded.match(/\/name\/([^/]+)/i);
  const qualityMatch = decoded.match(/(\d{3,4})p/i);
  const heightMatch = decoded.match(/\/h\/(\d{3,4})/i);
  const widthMatch = decoded.match(/\/w\/(\d{3,4})/i);
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();

  const rawName = nameMatch?.[1] || "";
  const cleanedName = rawName
    .replace(/\.(mp4|m3u8|webm)$/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  const bestQuality = qualityMatch?.[1] || heightMatch?.[1] || "";

  return {
    mediaKey: entryMatch?.[1] || "",
    flavorId: flavorMatch?.[1] || "",
    titleHint: cleanedName,
    qualityLabel: bestQuality ? `${bestQuality}p` : "",
    host,
    width: widthMatch?.[1] ? Number(widthMatch[1]) : 0,
    height: heightMatch?.[1] ? Number(heightMatch[1]) : 0
  };
}

export function createMediaEntry({ tabId, url, initiator, method, type }) {
  const normalizedType = HLS_PATTERN.test(url) ? "hls" : type || "other";
  const parsed = parseKalturaLikeMetadata(url);
  return {
    id: `${tabId}:${url}`,
    mediaKey: parsed.mediaKey || "",
    flavorId: parsed.flavorId || "",
    tabId,
    url,
    initiator: initiator || "",
    method: method || "GET",
    resourceType: normalizedType,
    qualityLabel: parsed.qualityLabel || "",
    titleHint: parsed.titleHint || "",
    host: parsed.host || "",
    width: parsed.width || 0,
    height: parsed.height || 0,
    detectedAt: new Date().toISOString()
  };
}

export function isCandidateMediaRequest(request) {
  if (!request || !request.url) {
    return false;
  }
  return MEDIA_FILE_PATTERN.test(request.url);
}

export function toAbsoluteUrl(rawLine, baseUrl) {
  try {
    return new URL(rawLine, baseUrl).toString();
  } catch {
    return "";
  }
}

export function parseManifestSegments(manifestText, manifestUrl) {
  return manifestText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line) => toAbsoluteUrl(line, manifestUrl))
    .filter(Boolean);
}

export async function extractSegmentsFromManifest(
  manifestUrl,
  manifestText,
  fetchImpl = fetch,
  depth = 0
) {
  const entries = parseManifestSegments(manifestText, manifestUrl);
  if (!entries.length) {
    return [];
  }

  const nestedPlaylist = entries.find((entry) => HLS_PATTERN.test(entry));
  if (nestedPlaylist && depth < 2) {
    const nestedResponse = await fetchImpl(nestedPlaylist, { credentials: "include" });
    if (!nestedResponse.ok) {
      throw new Error(`Cannot fetch nested playlist (${nestedResponse.status}).`);
    }
    const nestedText = await nestedResponse.text();
    return extractSegmentsFromManifest(nestedPlaylist, nestedText, fetchImpl, depth + 1);
  }

  return entries.filter((entry) => !HLS_PATTERN.test(entry));
}

export async function fetchAsArrayBuffer(url, fetchImpl = fetch) {
  const response = await fetchImpl(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Download failed (${response.status}) for ${url}`);
  }
  return response.arrayBuffer();
}

export function sanitizeFileName(input) {
  return input.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_").slice(0, 120);
}

export function buildOutputName(url) {
  const fromUrl = url.split("/").pop() || "video";
  const noQuery = fromUrl.split("?")[0] || "video";
  const stem = noQuery.replace(/\.(m3u8|mp4|m4v|webm)$/i, "");
  return `${sanitizeFileName(stem || "video")}.mp4`;
}

export function buildOutputNameFromMetadata({ title, qualityLabel, fallbackUrl }) {
  const titlePart = title ? sanitizeFileName(title) : "";
  const qualityPart = qualityLabel ? `_${qualityLabel}` : "";
  if (titlePart) {
    return `${titlePart}${qualityPart}.mp4`;
  }
  return buildOutputName(fallbackUrl || "video.mp4");
}

export async function downloadDirectUrl(url, downloadsApi, preferredFilename = "") {
  const filename = preferredFilename || buildOutputName(url);
  const downloadId = await downloadsApi.download({
    url,
    filename,
    saveAs: false
  });
  return { downloadId, filename, mode: "direct" };
}

export function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

export function buildDataUrlFromBuffers(buffers) {
  let totalLength = 0;
  for (const buffer of buffers) {
    totalLength += buffer.byteLength;
  }
  const mergedBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    const bytes = new Uint8Array(buffer);
    mergedBytes.set(bytes, offset);
    offset += bytes.byteLength;
  }
  return `data:video/mp4;base64,${arrayBufferToBase64(mergedBytes.buffer)}`;
}

export async function reconstructAndDownloadHls(manifestUrl, deps) {
  const {
    fetchImpl = fetch,
    downloadsApi,
    toDataUrl = buildDataUrlFromBuffers
  } = deps;

  const manifestResponse = await fetchImpl(manifestUrl, { credentials: "include" });
  if (!manifestResponse.ok) {
    throw new Error(`Cannot fetch manifest (${manifestResponse.status}).`);
  }
  const manifestText = await manifestResponse.text();
  const segments = await extractSegmentsFromManifest(manifestUrl, manifestText, fetchImpl);
  if (!segments.length) {
    throw new Error("No segments found in manifest.");
  }

  const buffers = [];
  for (const segmentUrl of segments) {
    buffers.push(await fetchAsArrayBuffer(segmentUrl, fetchImpl));
  }

  const dataUrl = toDataUrl(buffers);
  const filename = deps.preferredFilename || buildOutputName(manifestUrl);
  const downloadId = await downloadsApi.download({
    url: dataUrl,
    filename,
    saveAs: false
  });

  return {
    downloadId,
    filename,
    segmentCount: segments.length,
    mode: "reconstructed"
  };
}

export async function downloadMedia(url, deps) {
  if (HLS_PATTERN.test(url)) {
    return reconstructAndDownloadHls(url, deps);
  }

  try {
    return await downloadDirectUrl(url, deps.downloadsApi, deps.preferredFilename);
  } catch {
    // Some protected origins fail in native download manager; fallback to fetched bytes.
    const buffer = await fetchAsArrayBuffer(url, deps.fetchImpl);
    const dataUrl = (deps.toDataUrl || buildDataUrlFromBuffers)([buffer]);
    const filename = deps.preferredFilename || buildOutputName(url);
    const downloadId = await deps.downloadsApi.download({
      url: dataUrl,
      filename,
      saveAs: false
    });
    return { downloadId, filename, mode: "direct-fallback" };
  }
}

function qualityScore(label) {
  const value = Number(String(label).replace("p", ""));
  return Number.isFinite(value) ? value : 0;
}

export function formatDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }
  const total = Math.round(value);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function cleanTitle(value) {
  if (!value) {
    return "";
  }
  return value
    .replace(/\s*[-|]\s*.*$/g, "")
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsefulTitle(value) {
  if (!value) {
    return false;
  }
  const lowered = value.toLowerCase();
  if (value.length < 4) {
    return false;
  }
  return !["video", "untitled video", "index", "a", "media"].includes(lowered);
}

function buildGroupKey(entry) {
  if (entry.mediaKey) {
    return `entry:${entry.mediaKey}`;
  }

  const parsed = parseKalturaLikeMetadata(entry.url);
  if (parsed.mediaKey) {
    return `entry:${parsed.mediaKey}`;
  }

  try {
    const url = new URL(entry.url);
    const pathname = url.pathname
      .replace(/\/flavorId\/[^/]+/i, "")
      .replace(/\/name\/[^/]+/i, "");
    return `${url.hostname}${pathname}`;
  } catch {
    return entry.url.split("?")[0];
  }
}

export function buildDisplayEntries(rawEntries, tabMeta = {}) {
  const byKey = new Map();

  for (const entry of rawEntries) {
    const parsed = parseKalturaLikeMetadata(entry.url);
    const key = buildGroupKey(entry);
    const quality = entry.qualityLabel || parsed.qualityLabel || "";
    const titleHint = entry.titleHint || parsed.titleHint || "";
    const variantUrl = entry.url;
    const variantQuality = quality || "auto";
    const variantId = entry.flavorId || parsed.flavorId || variantUrl;
    const current = byKey.get(key);

    if (!current) {
      const variants = new Map();
      variants.set(variantId, {
        id: variantId,
        url: variantUrl,
        qualityLabel: variantQuality
      });
      byKey.set(key, {
        mediaKey: key,
        titleHint,
        qualityLabel: quality,
        bestUrl: entry.url,
        resourceType: entry.resourceType,
        detectedAt: entry.detectedAt,
        host: entry.host || parsed.host || "",
        variants
      });
      continue;
    }

    if (!current.variants.has(variantId)) {
      current.variants.set(variantId, {
        id: variantId,
        url: variantUrl,
        qualityLabel: variantQuality
      });
    }

    const currentScore = qualityScore(current.qualityLabel);
    const candidateScore = qualityScore(quality);
    if (candidateScore >= currentScore) {
      current.qualityLabel = quality || current.qualityLabel;
      current.bestUrl = entry.url;
    }

    if (!current.titleHint && titleHint) {
      current.titleHint = titleHint;
    }
  }

  const titleFromPage = cleanTitle(tabMeta.pageTitle || tabMeta.title || "");
  const posterFromPage = tabMeta.poster || tabMeta.previewFrame || tabMeta.pageImage || "";
  const durationFromPage = tabMeta.duration || 0;

  const cards = Array.from(byKey.values()).map((item) => {
    const candidateTitles = [cleanTitle(item.titleHint), titleFromPage, "Untitled video"];
    const displayTitle = candidateTitles.find(isUsefulTitle) || "Untitled video";
    const qualityLabel = item.qualityLabel || tabMeta.qualityLabel || "auto";
    const variants = Array.from(item.variants.values())
      .sort((a, b) => qualityScore(b.qualityLabel) - qualityScore(a.qualityLabel))
      .map((variant) => ({
        ...variant,
        filename: buildOutputNameFromMetadata({
          title: displayTitle,
          qualityLabel: variant.qualityLabel,
          fallbackUrl: variant.url
        })
      }));

    const bestVariant = variants[0];
    const filename = bestVariant?.filename || buildOutputNameFromMetadata({
      title: displayTitle,
      qualityLabel,
      fallbackUrl: item.bestUrl
    });

    return {
      id: item.mediaKey,
      title: displayTitle,
      qualityLabel,
      durationLabel: formatDuration(durationFromPage),
      thumbnailUrl: posterFromPage,
      sourceUrl: bestVariant?.url || item.bestUrl,
      filename,
      variants,
      detectedAt: item.detectedAt
    };
  });

  // If multiple cards leak for the same page, keep the most relevant one.
  if (cards.length <= 1) {
    return cards;
  }

  const sorted = [...cards].sort((a, b) => qualityScore(b.qualityLabel) - qualityScore(a.qualityLabel));
  return [sorted[0]];
}

