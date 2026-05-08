function collectVideoTags() {
  function extractPreviewFrame(video) {
    try {
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) {
        return "";
      }
      const canvas = document.createElement("canvas");
      const targetWidth = 320;
      const ratio = video.videoHeight / video.videoWidth;
      canvas.width = targetWidth;
      canvas.height = Math.max(1, Math.round(targetWidth * ratio));
      const context = canvas.getContext("2d");
      if (!context) {
        return "";
      }
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL("image/jpeg", 0.72);
    } catch {
      return "";
    }
  }

  return Array.from(document.querySelectorAll("video"))
    .map((video) => ({
      src: video.currentSrc || video.src || "",
      poster: video.poster || "",
      previewFrame: extractPreviewFrame(video),
      duration: Number(video.duration) || 0,
      videoWidth: Number(video.videoWidth) || 0,
      videoHeight: Number(video.videoHeight) || 0
    }))
    .filter((item) => item.src);
}

function getMetaContent(selector) {
  const node = document.querySelector(selector);
  return node?.getAttribute("content") || "";
}

function collectPageMetadata() {
  const title =
    getMetaContent('meta[property="og:title"]') ||
    getMetaContent('meta[name="twitter:title"]') ||
    document.title ||
    "";

  const image =
    getMetaContent('meta[property="og:image"]') ||
    getMetaContent('meta[name="twitter:image"]') ||
    "";

  return {
    title,
    image
  };
}

function sendMediaUpdate() {
  chrome.runtime.sendMessage({
    type: "MEDIA_ENTRIES_UPDATED",
    payload: {
      pageUrl: location.href,
      title: document.title,
      videos: collectVideoTags(),
      pageMeta: collectPageMetadata()
    }
  });
}

sendMediaUpdate();

for (const video of document.querySelectorAll("video")) {
  video.addEventListener("loadeddata", sendMediaUpdate, { once: true });
}
