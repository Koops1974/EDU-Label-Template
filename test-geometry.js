// Headless verification of core label geometry + sheet building.
// This does NOT test the DOM UI; it exercises pure app logic in node.
"use strict";

const fs = require("fs");
const path = require("path");

// --- minimal DOM stubs so app.js can load ---
global.window = { addEventListener() {}, print() {} };
global.document = {
  addEventListener() {},
  querySelector: () => ({ style: {} }),
  querySelectorAll: () => [],
  createElement: () => ({ style: {}, classList: { add() {} }, addEventListener() {}, appendChild() {} }),
  documentElement: { style: { setProperty() {} } },
  title: "",
  body: { appendChild() {} },
};
global.CSS = { escape: (s) => s };
global.localStorage = {
  _s: {}, getItem(k) { return this._s[k] || null; },
  setItem(k, v) { this._s[k] = String(v); },
  removeItem(k) { delete this._s[k]; },
};
global.Papa = {
  parse: () => ({
    data: [],
    errors: [],
    meta: { fields: [] },
  }),
};

// SCHOOL_CONFIG comes from config.js
const configSrc = fs.readFileSync(path.join(__dirname, "config.js"), "utf8")
  .replace("const SCHOOL_CONFIG", "global.SCHOOL_CONFIG");
eval(configSrc);

const appSrc = fs.readFileSync(path.join(__dirname, "app.js"), "utf8")
  .replace("const AVERY_TEMPLATES = {", "global.AVERY_TEMPLATES = {")
  .replace("const PAGE_W = 210, PAGE_H = 297;", "global.PAGE_W = 210; global.PAGE_H = 297;")
  .replace("const state = {", "global.state = {")
  .replace('const SAMPLE_CSV = [', 'global.SAMPLE_CSV = [')
  .replace(
    /document\.addEventListener\("DOMContentLoaded", \(\) => \{[\s\S]*$/,
    "global.__app = { autoMap, buildSheets, planFills, labelContentHtml, buildLabelCell, fieldValue, fullName, calibrationSheetHtml, CAL };"
  );
eval(appSrc);

let failures = 0;
function check(cond, msg) {
  if (cond) console.log("  OK  " + msg);
  else { failures++; console.log("  FAIL " + msg); }
}

// Load sample data as if a CSV had been parsed
const sample = [
  ["Aarav Patel", "7A", "Mathematics", "Year 7"],
  ["Mia Thompson", "7A", "Mathematics", "Year 7"],
  ["Oliver Smith", "7B", "English", "Year 7"],
].map((r) => ({ "Pupil Name": r[0], "Class/Form": r[1], Subject: r[2], "Year Group": r[3] }));

state.columns = ["Pupil Name", "Class/Form", "Subject", "Year Group"];
state.rows = sample;
__app.autoMap();

console.log("Auto-mapping:");
console.log("  pupils:", JSON.stringify(state.mapping.pupilName));
console.log("  class: ", JSON.stringify(state.mapping.className));
console.log("  subj:  ", JSON.stringify(state.mapping.subject));
console.log("  year:  ", JSON.stringify(state.mapping.yearGroup));
console.log("  school:", JSON.stringify(state.mapping.school));
check(state.mapping.pupilName && state.mapping.pupilName.value === "Pupil Name", "pupil name auto-detected");
check(state.mapping.className && state.mapping.className.value === "Class/Form", "class auto-detected");
check(state.mapping.subject && state.mapping.subject.value === "Subject", "subject auto-detected");
check(state.mapping.yearGroup && state.mapping.yearGroup.value === "Year Group", "year auto-detected");
check(state.mapping.school && state.mapping.school.kind === "fixed", "school falls back to fixed (from config)");

console.log("Template geometry:");
for (const code of Object.keys(AVERY_TEMPLATES)) {
  const t = AVERY_TEMPLATES[code];
  const perSheet = t.cols * t.rows;
  const rightEdge = t.originX + (t.cols - 1) * t.pitchX + t.labelW;
  const bottomEdge = t.originY + (t.rows - 1) * t.pitchY + t.labelH;
  check(rightEdge <= 210.01 && bottomEdge <= 297.01,
        `${code}: ${t.cols}x${t.rows}=${perSheet}/sheet fits A4 (right=${rightEdge.toFixed(2)}, bottom=${bottomEdge.toFixed(2)})`);
}

console.log("Sheet builder (L7160, 3 pupils → 1 sheet):");
state.template = "L7160";
const sheets = __app.buildSheets(false);
check(sheets.length === 1, "3 pupils on L7160 (21/sheet) → 1 sheet");
const cellRegex = /buildLabelCell[\s\S]*?/;
const firstFilled = sheets[0].split('class="label-cell')[1];
check(firstFilled && firstFilled.includes("left:7.48mm"), "first cell x = 7.48mm");
check(firstFilled && firstFilled.includes("top:15.49mm"), "first cell y = 15.49mm");
check(sheets[0].includes("Aarav Patel"), "name text present in sheet");
check(sheets[0].includes("7A"), "class text present in sheet");
check(sheets[0].includes("Mathematics"), "subject present in sheet");

// positions of second and third cells
const lefts = [...sheets[0].matchAll(/left:([\d.]+)mm;top:([\d.]+)mm;width:/g)].map((m) => m[1]);
const tops = [...sheets[0].matchAll(/left:[\d.]+mm;top:([\d.]+)mm;width:/g)].map((m) => m[1]);
check(lefts[1] === "73.52", `second cell x = 73.52 (origin + 1 piit) got ${lefts[1]}`);
check(lefts[2] === "139.56", `third cell x = 139.56 got ${lefts[2]}`);
console.log("  cell x positions:", lefts.slice(0, 3, 4).join(", "));

// badge layout includes accent pill class
state.layout = "badge";
const badgeSheet = __app.buildSheets(false)[0];
check(badgeSheet.includes('label-inner badge'), "badge layout class applied: " + badgeSheet.slice(100, 500).replace(/\n/g, ""));

console.log("Logo size option:");
state.opts.logoSize = "lg";
const lgSheet = __app.buildSheets(false)[0];
check(lgSheet.includes("--logo-mult:1.7;"), "Large logo → --logo-mult:1.7");
state.opts.logoSize = "xl";
const xlSheet = __app.buildSheets(false)[0];
check(xlSheet.includes("--logo-mult:2.4;"), "Extra large logo → --logo-mult:2.4");
state.opts.logoSize = "std";
const stdSheet = __app.buildSheets(false)[0];
check(stdSheet.includes("--logo-mult:1;"), "Standard logo → --logo-mult:1");

console.log("Calibration test sheet:");
const cal = __app.calibrationSheetHtml();
check((cal.match(/class="cal-tick"/g) || []).length === 30, "left ruler has 30 ticks (0..290mm)");
check((cal.match(/class="cal-num"/g) || []).length === 30, "ruler has 30 mm numbers");
check((cal.match(/class="cal-hick/g) || []).length === 22, "top ruler has 22 ticks (0..210mm)");
check((cal.match(/class="label-cell guides"/g) || []).length === 21, "21 dashed guide boxes on L7160");
check(cal.includes("left:7.48mm;top:15.49mm"), "first guide sits at L7160 origin (7.48, 15.49)");
check(cal.includes("cal-head"), "test-sheet explainer text present");

console.log("First/last name columns + A-Z sort:");
const splitSample = [
  ["Charlie", "Brown", "7A", "Maths", "Year 7"],
  ["Alice", "Smith", "7A", "Maths", "Year 7"],
  ["Bob", "Adams", "7B", "English", "Year 7"],
].map((r) => ({ "First Name": r[0], "Last Name": r[1], "Class/Form": r[2], Subject: r[3], "Year Group": r[4] }));
state.columns = ["First Name", "Last Name", "Class/Form", "Subject", "Year Group"];
state.rows = splitSample;
__app.autoMap();
check(state.mapping.firstName && state.mapping.firstName.value === "First Name", "First Name column auto-detected");
check(state.mapping.lastName && state.mapping.lastName.value === "Last Name", "Last Name column auto-detected");
check(state.mapping.pupilName && state.mapping.pupilName.kind === "hide", "full-name column hidden when first/last used");
check(__app.fullName(splitSample[0]) === "Charlie Brown", "full name merged from first+last columns");
state.sort = "surname";
let bySurname = __app.planFills().fills.map((f) => f.rowData["First Name"]);
check(JSON.stringify(bySurname) === JSON.stringify(["Bob", "Charlie", "Alice"]), "A-Z surname order: " + JSON.stringify(bySurname));
state.sort = "first";
let byFirst = __app.planFills().fills.map((f) => f.rowData["First Name"]);
check(JSON.stringify(byFirst) === JSON.stringify(["Alice", "Bob", "Charlie"]), "A-Z first-name order: " + JSON.stringify(byFirst));
state.sort = "none";

// single full-name column still works; surname derived from last token
const fullSample = [
  ["Ann Smith", "7A", "Maths", "Year 7"],
  ["Zoe Brown", "7A", "Maths", "Year 7"],
].map((r) => ({ "Pupil Name": r[0], "Class/Form": r[1], Subject: r[2], "Year Group": r[3] }));
state.columns = ["Pupil Name", "Class/Form", "Subject", "Year Group"];
state.rows = fullSample;
__app.autoMap();
check(state.mapping.pupilName && state.mapping.pupilName.value === "Pupil Name", "single full-name column still detected");
state.sort = "surname";
bySurname = __app.planFills().fills.map((f) => f.rowData["Pupil Name"]);
check(JSON.stringify(bySurname) === JSON.stringify(["Zoe Brown", "Ann Smith"]), "surname derived from full-name fallback: " + JSON.stringify(bySurname));
state.sort = "none";

console.log("Colour-coding column:");
const colourSample = [
  ["Ruby", "Baxter", "7A", "Maths", "Year 7", "Blue"],
  ["Nova", "Wells", "7A", "Maths", "Year 7", "Orange"],
  ["Tess", "Reds", "7B", "English", "Year 7", "dark red"],
  ["Addie", "Green", "7B", "English", "Year 7", "#00ff00"],
].map((r) => ({ "First Name": r[0], "Last Name": r[1], "Class/Form": r[2], Subject: r[3], "Year Group": r[4], Colour: r[5] }));
state.columns = ["First Name", "Last Name", "Class/Form", "Subject", "Year Group", "Colour"];
state.rows = colourSample;
state.layout = "classic";
state.sort = "none";
__app.autoMap();
check(state.mapping.colour && state.mapping.colour.value === "Colour", "Colour column auto-detected");
state.opts.colourCode = false;
const plainSheet = __app.buildSheets(false)[0];
check(!plainSheet.includes('class="label-name" style'), "no colour on names when the advanced option is off");
state.opts.colourCode = true;
const colourSheet = __app.buildSheets(false)[0];
check(colourSheet.includes('class="label-name" style="color:#1d4ed8;"'), "Blue → #1d4ed8 on the name");
check(colourSheet.includes('class="label-name" style="color:#f97316;"'), "Orange → #f97316 on the name");
check(colourSheet.includes('class="label-name" style="color:#dc2626;"'), "two-word 'dark red' resolves to red (#dc2626)");
check(colourSheet.includes('class="label-name" style="color:#00ff00;"'), "raw hex code (#00ff00) used as-is");
state.opts.colourField = "subject";
const subjSheet = __app.buildSheets(false)[0];
check(subjSheet.includes('class="label-subject" style="color:#1d4ed8;"'), "colour targets Subject when selected");
check(!subjSheet.includes('class="label-name" style="color:#1d4ed8;"'), "name left uncoloured when Subject selected");
state.opts.colourField = "meta";
const metaSheet = __app.buildSheets(false)[0];
check(metaSheet.includes('class="label-meta" style="color:#1d4ed8;"'), "colour targets Class/year row when selected");
state.opts.colourField = "all";
const allSheet = __app.buildSheets(false)[0];
check(allSheet.includes('label-inner classic color" style="color:#1d4ed8;'), "colour targets whole label text when selected");
state.opts.colourField = "name";
state.opts.colourCode = false;

console.log("Result: " + (failures ? failures + " FAILURES" : "ALL CHECKS PASSED"));
process.exit(failures ? 1 : 0);