chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    pdfHelper: {
      lastOperation: "convert-docx",
      runs: 0
    }
  });
});
