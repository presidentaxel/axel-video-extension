function collectVideoTags() {
  return Array.from(document.querySelectorAll("video"))
    .map((video) => ({
      src: video.currentSrc || video.src || "",
      poster: video.poster || "",
      duration: Number(video.duration) || 0,
      videoWidth: Number(video.videoWidth) || 0,
      videoHeight: Number(video.videoHeight) || 0
    }))
    .filter((item) => item.src);
}

chrome.runtime.sendMessage({
  type: "MEDIA_ENTRIES_UPDATED",
  payload: {
    pageUrl: location.href,
    title: document.title,
    videos: collectVideoTags()
  }
});
