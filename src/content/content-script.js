function collectVideoTags() {
  return Array.from(document.querySelectorAll("video[src]")).map((video) => ({
    src: video.currentSrc || video.src,
    poster: video.poster || ""
  }));
}

chrome.runtime.sendMessage({
  type: "MEDIA_ENTRIES_UPDATED",
  payload: {
    pageUrl: location.href,
    title: document.title,
    videos: collectVideoTags()
  }
});
