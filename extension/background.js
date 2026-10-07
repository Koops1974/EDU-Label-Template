// Service worker: routes "Send to Label Maker" requests from the popup
// into an open label-maker tab (or opens one).

const LABEL_SITE = "https://labels.welwyntech.co.uk/";
const LABEL_HOST = "labels.welwyntech.co.uk";

// Local testing: a file:// index.html inside the "Label Templates" folder.
function isLocalLabelTab(url) {
  return typeof url === "string" && url.startsWith("file:") && /label[- ]?templates/i.test(url);
}

// Only the main label-maker page has the paste UI (not print-guide/feedback).
function isLabelMakerPage(url) {
  if (!url) return false;
  if (url.startsWith("file:")) return isLocalLabelTab(url);
  if (url.indexOf(LABEL_HOST) === -1) return false;
  try {
    const path = new URL(url).pathname;
    return path === "/" || path === "" || path === "/index.html";
  } catch (_) {
    return false;
  }
}

async function findLabelMakerTab() {
  // 1. an open tab on the live site (main page only)
  try {
    const tabs = await chrome.tabs.query({ url: ["*://" + LABEL_HOST + "/*"] });
    const main = tabs.find((t) => isLabelMakerPage(t.url));
    if (main) return main.id;
  } catch (_) { /* ignore */ }
  // 2. an open local copy (development)
  const all = await chrome.tabs.query({});
  const found = all.find((t) => isLabelMakerPage(t.url));
  if (found) return found.id;
  // 3. none open — open the live tool
  const created = await chrome.tabs.create({ url: LABEL_SITE });
  return created.id;
}

function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

// Runs inside the page (isolated world). The label maker's UI ids are stable,
// so drive the existing controls directly — no page-side hook required.
// Falls back to a CustomEvent for future-proofing if the markup ever changes.
const IMPORT_FN = (csv) => {
  try {
    const doc = document;
    const root = doc.documentElement;
    root.removeAttribute("data-labelmaker-ok");

    const box = doc.getElementById("pasteList");
    const go = doc.getElementById("pasteGo");
    if (box && go) {
      const tab = doc.getElementById("tabPaste");
      if (tab) tab.click();
      box.value = csv;
      go.click();
      root.setAttribute("data-labelmaker-ok", "1");
      return true;
    }

    doc.dispatchEvent(new CustomEvent("labelmaker-import", { detail: csv }));
    return root.getAttribute("data-labelmaker-ok") === "1";
  } catch (_) {
    return false;
  }
};

async function sendToTab(tabId, csv) {
  let noHandlerRuns = 0;
  let lastInjectError = "";
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: IMPORT_FN,
        args: [csv]
      });
      const ok = !!(results && results[0] && results[0].result);
      if (ok) return { ok: true, reason: "delivered" };
      // Page reached, but nothing handled it (old app.js / still booting).
      noHandlerRuns++;
      if (noHandlerRuns >= 3) return { ok: false, reason: "no-handler" };
    } catch (err) {
      // Tab not reachable — e.g. file access not enabled for a file:// page.
      lastInjectError = String(err);
    }
    await wait(400);
  }
  return { ok: false, reason: "not-runnable", error: lastInjectError };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || msg.type !== "IMPORT") return false;
  console.log("[labelmaker] IMPORT received, rows:", (msg.csv || "").split("\n").length);
  (async () => {
    try {
      const tabId = await findLabelMakerTab();
      console.log("[labelmaker] target tab:", tabId);
      const result = await sendToTab(tabId, msg.csv);
      console.log("[labelmaker] delivered:", result.ok, result.reason);
      if (result.ok) chrome.tabs.update(tabId, { active: true });
      const tab = await chrome.tabs.get(tabId);
      sendResponse({ ok: result.ok, reason: result.reason, url: tab.url, error: result.error || "" });
    } catch (err) {
      console.error("[labelmaker] error:", err);
      sendResponse({ ok: false, reason: "exception", error: String(err) });
    }
  })();
  return true; // async response
});