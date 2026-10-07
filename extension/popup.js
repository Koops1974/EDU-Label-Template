// Popup for "Send to Label Maker for Schools" — zero-setup version.
// No Google account or API access is needed; the label maker does everything
// in the browser. Copy cells from a spreadsheet, paste them here, send.

const DATA = document.getElementById("data");
const STATUS = document.getElementById("status");

// Pre-fill a small demo so "Send to Label Maker" can be tried immediately.
if (!DATA.value.trim()) {
  DATA.value = "John Smith\nSarah Jones\nDavid Brown\nEmily Wilson";
}

function setStatus(text, isError) {
  STATUS.hidden = false;
  STATUS.textContent = text;
  STATUS.className = "status" + (isError ? " error" : "");
}

function sendToLabelMaker(csv) {
  setStatus("Sending…", false);
  const timeout = setTimeout(() => {
    setStatus("No reply from the extension — open chrome://extensions, click \u201cService worker\u201d and check its console.", true);
  }, 15000);
  try {
    chrome.runtime.sendMessage({ type: "IMPORT", csv: csv }, (res) => {
      clearTimeout(timeout);
      if (chrome.runtime.lastError) {
        setStatus("Extension error: " + chrome.runtime.lastError.message, true);
        return;
      }
      if (res && res.ok) {
        setStatus("Sent — check the Label Maker tab.", false);
      } else if (res && res.reason === "no-handler") {
        setStatus(
          "The page " + (res.url || "") + " ran but has no import hook yet — " +
          "it needs the edited index.html (app.js v17).",
          true);
      } else if (res && res.reason === "not-runnable") {
        setStatus(
          "Couldn't run on " + (res.url || "") + ". " +
          (res.error || "No permission to run on this page.") +
          " Check the extension's Site access (chrome://extensions → Details).",
          true);
      } else {
        const why = res && res.error ? " (" + res.error + ")" : "";
        setStatus("The Label Maker page didn't respond." + why, true);
      }
    });
  } catch (err) {
    clearTimeout(timeout);
    setStatus("Extension context lost — reload the extension and reopen this popup.", true);
  }
}

document.getElementById("sendBtn").addEventListener("click", () => {
  const text = DATA.value;
  if (!text.trim()) { setStatus("Paste or type at least one name first.", true); return; }
  sendToLabelMaker(text);
});