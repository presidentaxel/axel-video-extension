export const MEDIA_FILE_PATTERN = /\.(mp4|m4v|webm|m3u8|mp3|aac|wav)(\?.*)?$/i;
export const HLS_PATTERN = /\.m3u8(\?.*)?$/i;

export function createMediaEntry({ tabId, url, initiator, method, type }) {
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

export async function downloadDirectUrl(url, downloadsApi) {
  const filename = buildOutputName(url);
  const downloadId = await downloadsApi.download({
    url,
    filename,
    saveAs: true
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
  const merged = [];
  for (const buffer of buffers) {
    merged.push(arrayBufferToBase64(buffer));
  }
  return `data:video/mp4;base64,${merged.join("")}`;
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
  const filename = buildOutputName(manifestUrl);
  const downloadId = await downloadsApi.download({
    url: dataUrl,
    filename,
    saveAs: true
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
  return downloadDirectUrl(url, deps.downloadsApi);
}

