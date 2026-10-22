// Headless verification of core label geometry + sheet building.
// This does NOT test the DOM UI; it exercises pure app logic in node.
"use strict";

const fs = require("fs");
const path = require("path");

// --- minimal DOM stubs so app.js can load ---
const makeEl = () => ({
  style: {}, dataset: {}, hidden: false, textContent: "", value: "", disabled: false,
  firstChild: null, className: "",
  classList: { add() {}, remove() {}, toggle() {} },
  appendChild() {}, removeChild() {}, addEventListener() {}, removeEventListener() {},
  setAttribute() {}, querySelector: () => makeEl(), querySelectorAll: () => [],
});
const elCache = {};
global.window = { addEventListener() {}, print() {}, removeEventListener() {} };
global.document = {
  addEventListener() {},
  querySelector: (sel) => (elCache[sel] = elCache[sel] || makeEl()),
  querySelectorAll: () => [],
  createElement: () => makeEl(),
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
// Use the real vendored Papa Parse so CSV handling is genuinely exercised.
global.Papa = require(path.join(__dirname, "lib/papaparse.min.js"));

// SCHOOL_CONFIG comes from config.js
const configSrc = fs.readFileSync(path.join(__dirname, "config.js"), "utf8")
  .replace("const SCHOOL_CONFIG", "global.SCHOOL_CONFIG");
eval(configSrc);

const appSrc = fs.readFileSync(path.join(__dirname, "app.js"), "utf8")
  .replace("const AVERY_TEMPLATES = {", "global.AVERY_TEMPLATES = {")
  .replace("const PAGE_W = 210, PAGE_H = 297;", "global.PAGE_W = 210; global.PAGE_H = 297;")
  .replace("const state = {", "global.state = {")
  .replace("const GRAPHIC_TEMPLATES = [", "global.GRAPHIC_TEMPLATES = [")
  .replace('const SAMPLE_CSV = [', 'global.SAMPLE_CSV = [')
  .replace(
    /document\.addEventListener\("DOMContentLoaded", \(\) => \{[\s\S]*$/,
    "global.__app = { autoMap, buildSheets, planFills, labelContentHtml, buildLabelCell, buildGraphicCell, buildMarkingCell, buildSimpleCell, simpleContentHtml, markingContentHtml, effectiveLogoSrc, graphicSrc, fieldValue, fullName, calibrationSheetHtml, CAL, handleCsvText, updateSkippedNote, decodeCsvBuffer, repairMojibake, pastedToCsv, exportSetup, applySetup, chipsText, mapStatusText, trayState, trayPlan, traySheetsHtml, trayLabelHtml, trayAddLabel, trayDuplicateLabel, trayRemoveLabel, trayMoveLabel, trayAddStarters, trayClearLabels, trayActiveLabel, trayMetaText };"
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

console.log("L7165 (8/sheet, 99.1 x 67.7 mm):");
{
  const savedRows = state.rows, savedTemplate = state.template;
  state.rows = Array.from({ length: 16 }, (_, i) => ({
    "Pupil Name": "Pupil " + (i + 1), "Class/Form": "7A", Subject: "Maths", "Year Group": "Year 7",
  }));
  state.template = "L7165";
  const l65 = __app.buildSheets(false);
  check(l65.length === 2, `16 pupils on L7165 (8/sheet) → 2 sheets, got ${l65.length}`);
  const cells = [...l65[0].matchAll(/left:([\d.]+)mm;top:([\d.]+)mm;width:([\d.]+)mm;height:([\d.]+)mm/g)];
  check(cells.length === 8, `L7165 sheet 1 holds all 8 labels, got ${cells.length}`);
  check(cells[0][1] === "3.99" && cells[0][2] === "13.10",
        `first L7165 label at (3.99, 13.10) got (${cells[0][1]}, ${cells[0][2]})`);
  check(cells[7][1] === "106.47" && cells[7][2] === "216.20",
        `last L7165 label at (106.47, 216.20) got (${cells[7][1]}, ${cells[7][2]})`);
  check(cells[0][3] === "99.10" && cells[0][4] === "67.70",
        `L7165 label size 99.1 × 67.7 mm, got ${cells[0][3]} × ${cells[0][4]}`);
  check(l65[0].includes("Pupil 1") && l65[1].includes("Pupil 9"), "pupils fill the sheet in order across both sheets");
  state.template = savedTemplate;
  state.rows = savedRows;
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

console.log("Subject highlight option:");
state.opts.subjectHighlight = true;
const hlSheet = __app.buildSheets(false)[0];
const innerCount = (hlSheet.match(/class="label-inner/g) || []).length;
const hlCount = (hlSheet.match(/subj-hl/g) || []).length;
check(innerCount > 0 && hlCount === innerCount, `highlight class on all ${innerCount} labels when the option is on`);
state.opts.subjectHighlight = false;
const hlOffSheet = __app.buildSheets(false)[0];
check(!hlOffSheet.includes("subj-hl"), "highlight removed from every label when the option is off");
state.opts.subjectHighlight = true;

console.log("Logo-top (stack) layout:");
{
  const savedLayout = state.layout, savedLogo = state.logoDataUrl;
  state.layout = "stack";
  const srow = { "Pupil Name": "Aarav Patel", "Class/Form": "7A", Subject: "Mathematics", "Year Group": "Year 7" };
  const c = __app.labelContentHtml(srow);
  check(c.metaPart.includes("Year 7 · 7A"), `stack meta reads "Year 7 · 7A", got: ${c.metaPart.replace(/ style="[^"]*"/g, "")}`);
  check(!c.metaPart.includes("Class:"), "stack meta drops the Class: prefix");
  const cell = __app.buildLabelCell(srow, AVERY_TEMPLATES.L7160, 0);
  check(/class="label-inner stack/.test(cell), "stack layout class on the label");
  check(cell.indexOf("label-school") > -1 && cell.indexOf("label-meta") > -1 &&
        cell.indexOf("label-subject") > -1 && cell.indexOf("label-name") > -1,
        "stack label has school, class/year, subject and name lines");
  check(!cell.includes("lbl-logo"), "logo space collapses when no logo is set");
  state.logoDataUrl = "data:image/png;base64,AAAA";
  const cellLogo = __app.buildLabelCell(srow, AVERY_TEMPLATES.L7160, 0);
  check(cellLogo.includes('class="lbl-logo"'), "logo renders when one is set");
  state.logoDataUrl = savedLogo;
  state.layout = "classic";
  const c2 = __app.labelContentHtml(srow);
  check(c2.metaPart.includes("Class:7A"), "classic meta keeps the Class: prefix");
  state.layout = savedLayout;
}

console.log("Font family option:");
{
  const savedFont = state.opts.font;
  state.opts.font = "comic";
  const fCell = __app.buildLabelCell(sample[0], AVERY_TEMPLATES.L7160, 0);
  check(/class="label-inner [^"]*f-comic/.test(fCell), "font class applied to normal labels");
  const fMark = __app.buildMarkingCell(AVERY_TEMPLATES.L7162, 0);
  check(fMark.includes('label-inner marking f-comic'), "font class applied to the marking label");
  state.opts.font = "";
  const dCell = __app.buildLabelCell(sample[0], AVERY_TEMPLATES.L7160, 0);
  check(!/f-comic|f-georgia|f-verdana|f-trebuchet/.test(dCell), "no font class with the default font");
  state.opts.font = savedFont;
}

console.log("Per-line text sizes:");
{
  const saved = { n: state.opts.nameSize, s: state.opts.subjSize, m: state.opts.metaSize };
  state.opts.nameSize = 1.3; state.opts.subjSize = 0.85; state.opts.metaSize = 1.15;
  const szCell = __app.buildLabelCell(sample[0], AVERY_TEMPLATES.L7160, 0);
  check(szCell.includes("--name-fs:6.76mm;"), "name size 1.3 → --name-fs:6.76mm");
  check(szCell.includes("--subj-fs:2.55mm;"), "subject size 0.85 → --subj-fs:2.55mm");
  check(szCell.includes("--meta-fs:2.88mm;"), "class/year size 1.15 → --meta-fs:2.88mm");
  state.opts.nameSize = 1; state.opts.subjSize = 1; state.opts.metaSize = 1;
  const dCell = __app.buildLabelCell(sample[0], AVERY_TEMPLATES.L7160, 0);
  check(dCell.includes("--name-fs:5.20mm;") && dCell.includes("--subj-fs:3.00mm;") && dCell.includes("--meta-fs:2.50mm;"),
        "normal sizes restore the defaults");
  state.opts.nameSize = saved.n; state.opts.subjSize = saved.s; state.opts.metaSize = saved.m;
}

console.log("Setup export / import:");
{
  const saved = {
    layout: state.layout, template: state.template,
    font: state.opts.font, nameSize: state.opts.nameSize,
    title: state.banner.title, wilf: (state.banner.wilf || []).slice(),
  };
  state.layout = "stack"; state.template = "L7165"; state.opts.font = "georgia";
  state.opts.nameSize = 1.15;
  state.banner.title = "Story club"; state.banner.wilf = ["A", "B", "", ""];
  const payload = __app.exportSetup();
  check(payload.app === "edu-label-maker" && payload.version === 1, "export identifies the app and version");
  check(payload.layout === "stack" && payload.template === "L7165", "export carries layout + template");
  check(payload.opts.font === "georgia" && payload.opts.nameSize === 1.15, "export carries font + size options");
  check(payload.banner.title === "Story club" && payload.banner.wilf[1] === "B", "export carries banner content");
  state.layout = "classic"; state.template = "L7160"; state.opts.font = "";
  state.opts.nameSize = 1; state.banner.title = ""; state.banner.wilf = ["", "", "", ""];
  const err = __app.applySetup(JSON.parse(JSON.stringify(payload)));
  check(err === "", `imported file applies cleanly (got "${err}")`);
  check(state.layout === "stack" && state.template === "L7165", "layout + template restored");
  check(state.opts.font === "georgia" && state.opts.nameSize === 1.15, "font + size restored");
  check(state.banner.title === "Story club" && state.banner.wilf[0] === "A", "banner content restored");
  const err2 = __app.applySetup({ app: "something-else" });
  check(typeof err2 === "string" && err2.length > 0, "a foreign file is rejected with a message");
  const junk = JSON.parse(JSON.stringify(payload));
  junk.opts.font = "wingdings"; junk.template = "NOPE"; junk.opts.nameSize = 99;
  const err3 = __app.applySetup(junk);
  check(err3 === "" && state.opts.font === "georgia" && state.template === "L7165" && state.opts.nameSize === 1.15,
        "junk values in a file are ignored");
  state.layout = saved.layout; state.template = saved.template;
  state.opts.font = saved.font; state.opts.nameSize = saved.nameSize;
  state.banner.title = saved.title; state.banner.wilf = saved.wilf;
}

console.log("Step tabs (summary chips):");
{
  const saved = { t: state.template, l: state.layout, f: state.opts.font, rows: state.rows };
  state.template = "L7160"; state.layout = "badge"; state.opts.font = "comic";
  const chips = __app.chipsText();
  check(chips.data.includes("3 pupils"), `data chip counts the loaded pupils ("${chips.data}")`);
  check(chips.sheet === "L7160 · 21/sheet", `sheet chip shows the chosen sheet ("${chips.sheet}")`);
  check(chips.design === "Badge · Comic Sans", `design chip shows style + font ("${chips.design}")`);
  check(/^Offset [+-][\d.]+ [+-][\d.]+ mm$/.test(chips.print), `print chip shows the offset ("${chips.print}")`);
  state.rows = [];
  check(__app.chipsText().data === "No list yet", "data chip reports no list when the rows are empty");
  state.template = saved.t; state.layout = saved.l;
  state.opts.font = saved.f; state.rows = saved.rows;
}

console.log("Mapping status (Adjust… expander):");
{
  const st = __app.mapStatusText();
  check(st.charAt(0) === "✓" && st.includes("Name") && st.includes("Class") &&
        st.includes("Subject") && st.includes("Year"),
        `status lists the auto-mapped columns ("${st}")`);
  check(!st.includes("School"), "default fixed school name is not listed as a column");
  const savedName = state.mapping.pupilName, savedFirst = state.mapping.firstName;
  state.mapping.pupilName = null; state.mapping.firstName = null;
  check(__app.mapStatusText().charAt(0) === "⚠",
        "status warns when no name column is mapped");
  state.mapping.pupilName = savedName; state.mapping.firstName = savedFirst;
}

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
check(allSheet.includes('label-inner classic color subj-hl" style="color:#1d4ed8;'), "colour targets whole label text when selected");
state.opts.colourField = "name";
state.opts.colourCode = false;

console.log("Skipped-row reporting (rows with no pupil name):");
state.opts.skipBlanks = true;
const messyCsv = [
  "First Name,Last Name,Subject",   // spreadsheet row 1 (header)
  "Ana,Þórsdóttir,Maths",           // row 2 — accented name, kept
  ",  ,English",                    // row 3 — subject but no name, skipped
  "Ben,,Art",                       // row 4 — no subject, kept
  "",                               // row 5 — blank line, ignored silently
  "Cara,\"O'Neill, Sr\",History",    // row 6 — quoted comma, kept
  "   ,   ,   ",                   // row 7 — whitespace only, ignored
  "Dan,Ng,Physics",                 // row 8 — kept
  ",  ,History",                    // row 9 — no name, skipped
].join("\n");
__app.handleCsvText(messyCsv, "messy.csv");
check(state.rows.length === 6, "6 data rows kept (rows 2, 3, 4, 6, 8, 9)");
check(JSON.stringify(state.rowNumbers) === "[2,3,4,6,8,9]", "spreadsheet row numbers tracked: " + JSON.stringify(state.rowNumbers));
check(JSON.stringify(state.skippedRows) === "[3,9]", "rows 3 and 9 reported as skipped: " + JSON.stringify(state.skippedRows));
check(state.rows[0]["First Name"] === "Ana" && state.rows[0]["Last Name"] === "Þórsdóttir", "accented name parsed intact");
check(state.rows[3]["Last Name"] === "O'Neill, Sr", "quoted comma parsed as one value: " + state.rows[3]["Last Name"]);
check(__app.planFills().fills.length === 4, "4 labels made from the 6 rows (rows 3 and 9 skipped)");
__app.updateSkippedNote();
const note = elCache["#skippedNote"];
check(note.hidden === false && note.textContent.includes("rows 3, 9"), "notice names the skipped rows: " + note.textContent.slice(0, 52));
state.opts.skipBlanks = false;
__app.updateSkippedNote();
const offNote = elCache["#skippedNote"];
check(offNote.hidden === false && !offNote.textContent.includes("no pupil name"),
  "with 'Skip empty pupil names' off the skipped line goes but the partial-name check stays");
check(offNote.textContent.includes("row 4"), "row 4 (Ben, no surname) still flagged while the option is off");
state.opts.skipBlanks = true;

console.log("Partial-name warning (only first or only last name):");
const partialCsv = [
  "First Name,Last Name,Subject",  // row 1 (header)
  "Ana,Þórsdóttir,Maths",          // row 2 — complete, silent
  ",Smith,English",                // row 3 — no first name → flagged
  "Ben,,Art",                      // row 4 — no last name → flagged
  "Cara,O'Neill,History",          // row 5 — complete, silent
  ",,Physics",                     // row 6 — no name at all → skipped
].join("\n");
__app.handleCsvText(partialCsv, "partial.csv");
check(JSON.stringify(state.skippedRows) === "[6]", "only row 6 has no name at all: " + JSON.stringify(state.skippedRows));
check(JSON.stringify(state.partialNameRows) === "[3,4]", "rows 3 and 4 flagged as partial names: " + JSON.stringify(state.partialNameRows));
__app.updateSkippedNote();
const pnote = elCache["#skippedNote"].textContent;
check(pnote.includes("rows 3, 4") && pnote.includes("only a first or last name"), "notice reports the partial rows");
check(pnote.includes("row 6"), "notice still reports the fully-blank row: " + pnote.split("\n")[0].slice(0, 48));
check(__app.planFills().fills.length === 4, "4 labels made (row 6 skipped, rows 3 and 4 keep their partial name)");
// A CSV with a single full-name column must NOT raise partial-name noise.
__app.handleCsvText("Pupil Name,Subject\nCher,Music\nMadonna,Art\n", "single.csv");
check(state.partialNameRows.length === 0, "no partial-name warnings for a single full-name column");
check(state.skippedRows.length === 0, "no skipped rows for a single full-name column");

console.log("Paste-a-list (no CSV needed):");
const pasted = __app.pastedToCsv("John Smith\nSarah Jones\n\nDavid Brown\nEmily Wilson\n");
check(pasted !== null && pasted.rowOffset === 1, "plain list builds CSV with rowOffset 1: " + JSON.stringify(pasted));
const pLines = pasted.csv.split("\n");
check(pLines[0] === "Pupil Name", "plain list uses a single full-name column");
check(pLines.slice(1).join("|") === "John Smith|Sarah Jones|David Brown|Emily Wilson", "names kept in order, blank lines dropped");
__app.handleCsvText(pasted.csv, "Pasted list");
check(state.rows.length === 4 && state.partialNameRows.length === 0, "4 pupils from a plain list, no partial warnings");
check(state.rows.map((r) => __app.fullName(r)).join("|") === "John Smith|Sarah Jones|David Brown|Emily Wilson", "all four names appear on the labels");

const comma = __app.pastedToCsv("Rollins, Sonny\nD'Artagnan\n");
check(comma.csv.split("\n")[1] === '"Rollins, Sonny"', "a comma in a name is quoted, not treated as a column: " + comma.csv.split("\n")[1]);

// Pasting tab-separated cells from Excel: columns land in first/last/subject.
const tabs = __app.pastedToCsv("John\tSmith\tMaths\nSarah\t\tArt\n");
check(tabs.rowOffset === 1, "tab paste with no heading keeps line numbering (offset 1)");
check(tabs.csv.split("\n")[0] === "First Name,Last Name,Subject", "tab cells become first/last/subject columns: " + tabs.csv.split("\n")[0]);
__app.handleCsvText(tabs.csv, "Pasted list", "", tabs.rowOffset);
check(state.rows.length === 2, "two pupils from tab paste");
check(__app.fullName(state.rows[0]) === "John Smith" && __app.fieldValue(state.rows[0], "subject") === "Maths", "tab row: John Smith, Maths");
check(JSON.stringify(state.partialNameRows) === "[2]", "pasted line 2 (missing surname) reported as row 2: " + JSON.stringify(state.partialNameRows));

// Copying a whole range from a spreadsheet includes its heading row.
const headed = __app.pastedToCsv("First Name\tLast Name\tSubject\nJohn\tSmith\tMaths\nSarah\t\tArt\n");
check(headed.rowOffset === 0, "spreadsheet heading row dropped, row numbers start at the first name");
__app.handleCsvText(headed.csv, "Pasted list", "", headed.rowOffset);
check(state.rows.length === 2, "heading row is consumed, not printed");
check(JSON.stringify(state.partialNameRows) === "[3]", "pasted line 3 (missing surname) still reported correctly: " + JSON.stringify(state.partialNameRows));

// Nothing pasted at all → friendly null, not a silent empty sheet.
check(__app.pastedToCsv("   \n\t\n") === null, "whitespace-only paste returns nothing to do");

__app.handleCsvText(SAMPLE_CSV, "sample-pupils.csv");
check(state.rows.length === 16, "sample CSV still loads all 16 pupils");
check(state.skippedRows.length === 0, "sample CSV reports no skipped rows");

console.log("CSV encoding (accents survive whatever the spreadsheet used):");
/* Escapes, not literal accented letters, so this test file's own encoding
 * can never be the thing that breaks. */
const accentRow =
  "Pupil Name,Subject\n" +
  "Bj\u00f8rn S\u00f8rensen,Maths\n" +
  "Ana N\u00fa\u00f1ez,Art\n" +
  "Zo\u00eb O'Brien,Music\n";
const accentNames = "Bj\u00f8rn S\u00f8rensen|Ana N\u00fa\u00f1ez|Zo\u00eb O'Brien";
const namesOf = (decoded) => decoded.split("\n").filter((l) => l !== "").slice(1).map((l) => l.split(",")[0]);

// 1. Plain UTF-8 — the normal case, nothing to announce.
const utf8 = __app.decodeCsvBuffer(Buffer.from(accentRow, "utf8"));
check(utf8.note === "" && utf8.text === accentRow, "UTF-8 file read cleanly with no warning");
check(namesOf(utf8.text).join("|") === accentNames, "UTF-8 names intact: " + JSON.stringify(namesOf(utf8.text)));

// 2. windows-1252 bytes, as Excel on Windows produces.
const win = __app.decodeCsvBuffer(Buffer.from(accentRow, "latin1"));
check(namesOf(win.text).join("|") === accentNames, "windows-1252 accents restored: " + JSON.stringify(namesOf(win.text)));
check(/windows-1252/.test(win.note), "teacher is told the file was read as windows-1252: " + win.note);

// 3. UTF-8 text that was already decoded as Latin-1 once, then saved back.
const doubleEncoded = Buffer.from(Buffer.from(accentRow, "utf8").toString("latin1"), "utf8");
const repaired = __app.decodeCsvBuffer(doubleEncoded);
check(namesOf(repaired.text).join("|") === accentNames, "twice-encoded text repaired: " + JSON.stringify(namesOf(repaired.text)));
check(/repaired/.test(repaired.note), "teacher is told the text was repaired: " + repaired.note);

// 4. A leading BOM must not end up glued to the first column heading.
const withBom = __app.decodeCsvBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Pupil Name,Subject\nAda Lovelace,Maths\n", "utf8")]));
__app.handleCsvText(withBom.text, "bom.csv");
check(state.columns[0] === "Pupil Name", "BOM stripped from the first heading: " + JSON.stringify(state.columns[0]));
check(state.rows.length === 1 && __app.fullName(state.rows[0]) === "Ada Lovelace",
  "BOM file loads its one pupil: " + JSON.stringify(state.rows.map((r) => __app.fullName(r))));

// 5. Real non-Latin text must be left completely alone.
const cjk = __app.decodeCsvBuffer(Buffer.from("Pupil Name,Subject\n\u6850\u85e4 \u82b1\u5b50,Maths\n", "utf8"));
check(cjk.text.includes("\u6850\u85e4 \u82b1\u5b50") && cjk.note === "", "Japanese text left untouched");

console.log("Experimental graphic templates (test feature):");
const gT = global.AVERY_TEMPLATES["L7160"];
const gRow = { "Pupil Name": "Aarav Patel", "Class/Form": "7A", Subject: "Mathematics", "Year Group": "Year 7" };
const longRow = { "Pupil Name": "Alexandria-Eleanor-Margaret Beaumont-Smythe", "Class/Form": "7A", Subject: "Design & Technology", "Year Group": "Year 7" };
state.columns = ["Pupil Name", "Class/Form", "Subject", "Year Group"];
state.rows = [gRow, longRow];
__app.autoMap();
for (const d of global.GRAPHIC_TEMPLATES) {
  state.graph = { slug: d.slug, pos: Math.round(d.centreY * 100), colour: "dark" };
  const cell = __app.buildGraphicCell(gRow, gT, 0);
  const cellLong = __app.buildGraphicCell(longRow, gT, 1);
  check(/class="label-cell/.test(cell) && cell.includes('class="gfx-img"'), `${d.slug}: graphic cell keeps label-cell box + artwork img`);
  check(cell.includes("src=\"Templates/") && cell.includes(encodeURIComponent(d.file)), `${d.slug}: references the supplied artwork file`);
  check(cell.includes('class="gfx-img"') && (d.fit === "fill" ? cell.includes('style="object-fit:fill;"') : !cell.includes('object-fit:fill')), `${d.slug}: artwork fills the label${d.fit === "fill" ? " (stretched)" : " (cropped, no distortion)"}`);
  check(cell.includes(">Aarav Patel</div>") && cell.includes("Mathematics") && cell.includes("7A"), `${d.slug}: name, subject and class render on the design`);
  check(cellLong.includes("Alexandria-Eleanor-Margaret Beaumont-Smythe"), `${d.slug}: long name still present (wraps inside its band)`);
  check(/top:[\d.]+%;height:[\d.]+%/.test(cell), `${d.slug}: text sits in its own positioned band (top/height %)`);
  if (d.slug === "space-explorer") {
    const m = /top:([\d.]+)%/.exec(cell);
    check(m && Number(m[1]) >= 40, "space-explorer: its blank band defaults lower on the label (>=40%)");
  }
}
// Multi-row CSV through the same planning pipeline.
state.columns = ["Pupil Name", "Class/Form", "Subject", "Year Group"];
state.rows = sample;
__app.autoMap();
state.template = "L7160";
state.graph = { slug: "colourful-classroom", pos: 50, colour: "dark" };
const multi = __app.buildSheets(true)[0];
check((multi.match(/class="gfx-img"/g) || []).length === 21, "graphic sheet still builds 21 cells/sheet on L7160");
check(multi.includes("Aarav Patel") && multi.includes("Mia Thompson") && multi.includes("Oliver Smith"), "all CSV rows appear on the graphic sheet");
// Switching back must restore the original, geometry-identical cells.
state.graph = null;
const back = __app.buildSheets(true)[0];
check(!back.includes("gfx-img") && back.includes("label-inner"), "switching back restores the original label cells");
check(back.includes("left:7.48mm") && back.includes("top:15.49mm"), "plain sheet geometry unchanged after switching back");

console.log("Marking / Story-club banner label (static layout):");
check(state.banner.title === "" && state.banner.character === "" && state.banner.vocab === "", "banner text starts empty (teacher types their own content)");
const mT = global.AVERY_TEMPLATES["L7162"];
state.layout = "marking";
state.template = "L7162";
state.rows = [];
state.graph = null;
const blankCell = __app.buildMarkingCell(mT, 0);
check(!blankCell.includes('class="mk-title"') && !blankCell.includes('class="mk-char"'), "empty banner hides the title/character lines");
check((blankCell.match(/class="mk-box"/g) || []).length === 0, "empty WILF criteria renders the header but no checkboxes");
state.banner.title = "Drawing Club: The Magic Paintbrush";
state.banner.character = "Character: Chang";
state.banner.vocab = "avaricious, capsized\nobey, enchanted";
state.banner.wilf = ["Capital Letters", ". (Full stop)", "word with prefix un", ""];
const mCell = __app.buildMarkingCell(mT, 0);
check(mCell.includes('class="label-inner marking"'), "marking cell uses the marking interior");
check(mCell.includes("Drawing Club: The Magic Paintbrush"), "title renders from state.banner");
check(mCell.includes("Character: Chang"), "character line renders");
  check(mCell.includes("avaricious") && mCell.includes("obey"), "vocabulary block renders");
  check(mCell.indexOf('class="mk-wilf"') < mCell.indexOf('class="mk-vocab"'), "WILF checklist sits to the LEFT of the wider vocab box (left-to-right order)");
  check(mCell.indexOf('class="mk-vocab"') < mCell.indexOf('class="mk-circle"'), "vocab box sits between the WILF checklist and the circle");
check(mCell.includes(">WILF<"), "WILF header renders");
check((mCell.match(/class="mk-box"/g) || []).length === 3, "three WILF criteria checkboxes render (4th is blank/skipped)");
  check(mCell.includes("Capital Letters") && mCell.includes("word with prefix un"), "typed criteria text renders");
  const vfs = (cell) => parseFloat((cell.match(/--mk-vocab-fs:([\d.]+)mm/) || [])[1]);
  state.banner.vocab = "one\ntwo\nthree\nfour";
  const vFour = vfs(__app.buildMarkingCell(mT, 0));
  state.banner.vocab = "one\ntwo\nthree\nfour\nfive\nsix";
  const vSix = vfs(__app.buildMarkingCell(mT, 0));
  check(vSix < vFour, `5+ word-bank lines step the font down (${vSix}mm < ${vFour}mm)`);
  state.banner.vocab = "a\nb\nc\nd\ne\nf\ng\nh";
  const vEight = vfs(__app.buildMarkingCell(mT, 0));
  check(vEight < vSix, `7+ word-bank lines step down again (${vEight}mm < ${vSix}mm)`);
  state.banner.vocab = "avaricious, capsized\nobey, enchanted";
check(mCell.includes('class="mk-circle"'), "grading circle renders as its own outline element");
check(/left:[\d.]+mm;top:[\d.]+mm;/.test(mCell), "marking cell keeps label geometry (mm origin + size)");
const markSheets = __app.buildSheets(true);
check(markSheets.length === 1, "empty data still prints exactly one marking sheet");
check((markSheets[0].match(/label-inner marking/g) || []).length === 16, "L7162 marking sheet builds all 16 cells");
const normCell = (s) => s.replace(/left:[\d.]+mm/g, "L").replace(/top:[\d.]+mm/g, "T");
const second = normCell(mCell) === normCell(__app.buildMarkingCell(mT, 15));
check(second, "every marking cell is identical (static banner, no row data)");
state.banner.showWilf = false;
state.banner.showCircle = false;
const trimmed = __app.buildMarkingCell(mT, 0);
check(!trimmed.includes('class="mk-wilf"') && !trimmed.includes('class="mk-circle"'), "WILF and circle toggle off cleanly");
state.banner.showWilf = true;
state.banner.showCircle = true;
state.banner.wilf.push("Be kind");
const four = __app.buildMarkingCell(mT, 0);
check((four.match(/class="mk-box"/g) || []).length === 4, "4th WILF criterion renders when supplied");
state.banner.wilf.length -= 1;
// The same banner must build on the KF01132 butt-cut sheet (105 x 37 mm).
const kT = global.AVERY_TEMPLATES["KF01132"];
const kCell = __app.buildMarkingCell(kT, 0);
check(kCell.includes('class="label-inner marking"') && kCell.includes("Drawing Club: The Magic Paintbrush"), "marking banner builds on the KF01132 sheet");
check(/left:0\.00mm;top:0\.00mm/.test(kCell), "KF01132 keeps its full-bleed origin at 0,0");
const kSheets = __app.buildSheets(true);
check((kSheets[0].match(/label-inner marking/g) || []).length === 16, "KF01132 marking sheet builds all 16 cells");

// Restore app defaults so later checks start clean.
state.banner.title = ""; state.banner.character = ""; state.banner.vocab = "";
state.banner.wilf = ["", "", "", ""];
state.layout = "classic";
state.template = "L7160";
state.rows = sample;

console.log("Simple WALT & WILF template:");
{
  const sT = global.AVERY_TEMPLATES["L7162"];
  state.layout = "simple";
  state.template = "L7162";
  state.opts.font = "";
  state.rows = [];
  state.simple.walt = "To identify features of a portrait";
  state.simple.wilf = ["I can label the eyes", "I can use shading", "I can add a background", ""];

  const sCell = __app.buildSimpleCell(sT, 0);
  check(sCell.includes('label-inner simple'), "simple cell builds");
  check(sCell.includes("To identify features of a portrait"), "WALT text renders");
  check(sCell.includes(">WALT<") && sCell.includes(">WILF<"), "WALT and WILF headers render");
  check((sCell.match(/class="mk-box"/g) || []).length === 3, "three WILF tick boxes render (4th blank criterion skipped)");
  check(sCell.includes('class="sm-circle"'), "traffic-light colouring circle renders");
  check(sCell.includes('class="sm-walt"') && sCell.includes('class="sm-wilf"'), "WALT band and WILF checklist sections present");
  const s2 = __app.buildSimpleCell(sT, 15);
  check(sCell.replace(/left:[\d.]+mm;top:[\d.]+mm;/g, "") === s2.replace(/left:[\d.]+mm;top:[\d.]+mm;/g, ""), "every simple label is identical (static, no row data)");

  state.simple.wilf = ["a", "b", "c", "d"];
  const four = __app.buildSimpleCell(sT, 0);
  check((four.match(/class="mk-box"/g) || []).length === 4, "4th WILF criterion renders when supplied");
  state.simple.wilf = ["I can label the eyes", "I can use shading", "I can add a background", ""];

  const wfs = (cell) => parseFloat((cell.match(/--sm-walt-fs:([\d.]+)mm/) || [])[1]);
  state.simple.walt = "Short WALT";
  const wShort = wfs(__app.buildSimpleCell(sT, 0));
  state.simple.walt = "A much longer WALT statement that keeps going and going so the text has to step down a size to stay readable across three lines in the band";
  const wLong = wfs(__app.buildSimpleCell(sT, 0));
  check(wLong < wShort, `long WALT text steps the font down (${wLong}mm < ${wShort}mm)`);
  check(sCell.includes("sm-walt-t"), "WALT text uses the clamped three-line element");
  state.simple.walt = "To identify features of a portrait";

  const shortT = { cols: 2, rows: 8, originX: 0, pitchX: 0, originY: 0, pitchY: 0, labelW: 99.1, labelH: 20, radius: 2 };
  check(__app.buildSimpleCell(shortT, 0).includes("--sm-circle:9.00mm"), "circle never shrinks below 9mm on very short labels");
  check(__app.buildSimpleCell(sT, 0).includes("--sm-circle:11.00mm"), "circle stays 11mm on standard labels");

  state.logoDataUrl = "data:image/png;base64,AAAA";
  state.opts.logoSize = "xl";
  check(__app.buildSimpleCell(sT, 0).includes("--logo-mult:2.4"), "simple label honours the Logo size option (xl → 2.4)");
  state.opts.logoSize = "std";
  state.logoDataUrl = null;

  const sSheets = __app.buildSheets(true);
  check(sSheets.length === 1, "empty data still prints exactly one simple sheet");
  check((sSheets[0].match(/label-inner simple/g) || []).length === 16, "L7162 simple sheet builds all 16 cells");

  const s60 = __app.buildSimpleCell(global.AVERY_TEMPLATES["L7160"], 0);
  check(s60.includes('label-inner simple') && s60.includes("To identify features of a portrait"), "simple WALT & WILF label builds on the 63.5x38.1mm L7160 sheet too");

  check(__app.chipsText().design === "WALT & WILF · Default", `design chip reads WALT & WILF ("${__app.chipsText().design}")`);
  check(typeof state.simple.walt === "string" && Array.isArray(state.simple.wilf), "simple state shape is walt + wilf[4]");

  const payload = __app.exportSetup();
  check(payload.simple && payload.simple.walt === "To identify features of a portrait" && payload.simple.wilf[1] === "I can use shading", "export carries WALT & WILF content");

  state.simple.walt = ""; state.simple.wilf = ["", "", "", ""];
  const err = __app.applySetup({ app: "edu-label-maker", simple: { walt: "WALT text", wilf: ["a", "b", "", ""] } });
  check(err === "" && state.simple.walt === "WALT text" && state.simple.wilf[1] === "b", "import restores WALT & WILF content");
  state.simple.walt = ""; state.simple.wilf = ["", "", "", ""];
  state.layout = "classic";
  state.template = "L7160";
  state.rows = sample;
}

console.log("Logo upload on every layout:");
{
  const PNG = "data:image/png;base64,AAAA";
  check(__app.effectiveLogoSrc() === null, "no logo set → effectiveLogoSrc is null");
  state.logoDataUrl = PNG;
  check(__app.effectiveLogoSrc() === PNG, "uploaded logo is returned by effectiveLogoSrc");

  // Marking: the general "Add a logo…" upload must now show on the banner
  state.layout = "marking";
  state.template = "L7162";
  state.rows = [];
  state.banner.title = ""; state.banner.character = "";
  state.banner.vocab = ""; state.banner.wilf = ["", "", "", ""];
  state.banner.clubLogo = null;
  const mLogo = __app.buildMarkingCell(global.AVERY_TEMPLATES["L7162"], 0);
  check(mLogo.includes('class="mk-club-img"') && mLogo.includes(PNG), "uploaded logo renders on the marking banner");
  state.banner.clubLogo = "data:image/png;base64,CLUB";
  const mClub = __app.buildMarkingCell(global.AVERY_TEMPLATES["L7162"], 0);
  check(mClub.includes("CLUB") && !mClub.includes(PNG), "a club-specific logo still overrides the general upload on marking");
  state.banner.clubLogo = null;

  // Simple: the upload must show in the WALT band
  state.layout = "simple";
  state.simple.walt = "WALT text"; state.simple.wilf = ["a", "b", "", ""];
  const sLogo = __app.buildSimpleCell(global.AVERY_TEMPLATES["L7162"], 0);
  check(sLogo.includes('class="sm-logo"') && sLogo.includes(PNG), "uploaded logo renders in the WALT band of the simple label");
  state.logoDataUrl = null;
  const sNo = __app.buildSimpleCell(global.AVERY_TEMPLATES["L7162"], 0);
  check(!sNo.includes("sm-logo"), "no logo → simple label omits the logo slot");
  const mNo = __app.buildMarkingCell(global.AVERY_TEMPLATES["L7162"], 0);
  check(!mNo.includes("mk-club-img") && mNo.includes("mk-club-mark"), "no logo → marking falls back to the monogram mark");

  // Classic: unchanged behaviour via effectiveLogoSrc
  state.layout = "classic";
  state.template = "L7160";
  state.rows = sample;
  state.logoDataUrl = PNG;
  const classic = __app.buildSheets(false)[0];
  check(classic.includes(PNG), "uploaded logo still renders on the classic pupil labels");
  state.logoDataUrl = null;
  state.rows = sample;
}

console.log("Tray labels (free A4 layout):");
{
  __app.trayClearLabels();
  const ts = __app.trayState;
  ts.size = "medium"; ts.gap = 3; ts.cut = "dashed"; ts.defaultTpl = "pastel";

  // Geometry: how many of each size fit on A4 (margin 8mm, gap 3mm)
  const fake = (n) => Array.from({ length: n }, () => ({}));
  const med = __app.trayPlan(fake(50), "medium", 3, 8);
  check(med.cols === 2 && med.rows === 6 && med.per === 12, `medium 90x40: 2x6=12/page (got ${med.cols}x${med.rows}=${med.per})`);
  const sml = __app.trayPlan(fake(50), "small", 3, 8);
  check(sml.cols === 3 && sml.rows === 8 && sml.per === 24, `small 60x30: 3x8=24/page (got ${sml.cols}x${sml.rows}=${sml.per})`);
  const lar = __app.trayPlan(fake(50), "large", 3, 8);
  check(lar.cols === 1 && lar.rows === 5 && lar.per === 5, `large 100x50: 1x5=5/page (got ${lar.cols}x${lar.rows}=${lar.per})`);

  // Pagination: 13 medium labels -> 2 pages (12 + 1), mm positions exact
  for (let i = 0; i < 13; i++) __app.trayAddLabel("Label " + (i + 1));
  const plan = __app.trayPlan(ts.labels, "medium", 3, 8);
  check(plan.pages.length === 2 && plan.pages[0].length === 12 && plan.pages[1].length === 1,
    `13 labels paginate 12 + 1 (got ${plan.pages.map((p) => p.length).join(" + ")})`);
  const c0 = plan.pages[0][0], c1 = plan.pages[0][1], c2 = plan.pages[0][2];
  check(c0.x === 8 && c0.y === 8, `first label at margin 8,8 (got ${c0.x},${c0.y})`);
  check(c1.x === 101 && c1.y === 8, `second label at 101,8 (90mm + 3mm gap)`);
  check(c2.y === 51, `third label starts row 2 at y=51 (40mm + 3mm gap)`);

  // Sheet HTML: real mm sizes, cut lines, print-sheet class for printing
  const sheets = __app.traySheetsHtml(false);
  check((sheets.match(/class="sheet tray-page"/g) || []).length === 2, "preview builds 2 tray pages");
  check(sheets.includes("width:90.00mm;height:40.00mm;"), "labels carry exact 90x40mm size");
  check(sheets.includes('class="tray-cell cut-dashed"'), "dashed cut lines applied");
  const printSheets = __app.traySheetsHtml(true);
  check(printSheets.includes("print-sheet") && printSheets.includes("tray-page"), "print pages keep .print-sheet for the print pipeline");

  // Meta summary
  check(__app.trayMetaText() === "13 labels · 2 pages · 90 × 40 mm", `meta summary ("${__app.trayMetaText()}")`);

  // Long text shrinks; short text stays large; escaping works
  const shortHtml = __app.trayLabelHtml({ id: 900, text: "Art", tpl: "pastel", scale: 1, align: "center", decor: "none" });
  const longHtml = __app.trayLabelHtml({ id: 901, text: "International Reading Corner", tpl: "pastel", scale: 1, align: "center", decor: "none" });
  const fs = (h) => parseFloat(/font-size:([\d.]+)mm/.exec(h)[1]);
  check(fs(longHtml) < fs(shortHtml), `long text renders smaller than short (${fs(longHtml)}mm < ${fs(shortHtml)}mm)`);
  check(fs(longHtml) >= 2.2, "shrunk title never below 2.2mm");
  const evil = __app.trayLabelHtml({ id: 902, text: 'Maths <b>&"x"', tpl: "bold", scale: 1, align: "left", decor: "bar" });
  check(evil.includes("&lt;b&gt;") && !evil.includes("<b>") && evil.includes("tray-decor-bar"),
    "label text is escaped and decoration renders");
  const aL = __app.trayLabelHtml({ id: 910, text: "Left", tpl: "pastel", scale: 1, align: "left", decor: "none" });
  const aR = __app.trayLabelHtml({ id: 911, text: "Right", tpl: "pastel", scale: 1, align: "right", decor: "none" });
  const aC = __app.trayLabelHtml({ id: 912, text: "Centre", tpl: "pastel", scale: 1, align: "center", decor: "none" });
  check(aL.includes("text-align:left") && aR.includes("text-align:right") && aC.includes("text-align:center"),
    "align left/right/centre each render on its label");

  // List operations
  const first = ts.labels[0], second = ts.labels[1];
  check(__app.trayDuplicateLabel(first.id) && ts.labels.length === 14, "duplicate inserts a copy (14 labels)");
  check(ts.labels[1].text === first.text && ts.labels[1].id !== first.id, "copy keeps text, gets a new id");
  check(__app.trayMoveLabel(second.id, "down") && ts.labels[3].id === second.id && ts.labels[2].id !== second.id, "move down reorders");
  check(!__app.trayMoveLabel(ts.labels[0].id, "up"), "move up at the top is a no-op");
  check(__app.trayRemoveLabel(ts.labels[13].id) && ts.labels.length === 13, "remove drops one label");
  check(__app.trayAddStarters() === 10 && ts.labels.length === 23, "starter list appends the 10 common labels");
  check(__app.trayAddStarters() === 0, "starters already present are not re-added");

  __app.trayClearLabels();
  check(ts.labels.length === 0 && ts.activeId === null, "clear empties the list");
  check(__app.trayMetaText() === "No labels yet.", "meta reports the empty list");
  check(__app.trayAddStarters() === 10 && ts.labels.length === 10, "starter list adds 10 common classroom labels");
  check(__app.trayActiveLabel() === null, "starter labels do not auto-select");
  const made = __app.trayAddLabel("Pupils");
  check(__app.trayActiveLabel() === made, "add selects the new label for editing");
  check(state.rows.length === sample.length, "tray operations never touch the pupil rows");

  // Leave tray state clean for any future checks
  __app.trayClearLabels();
  ts.size = "medium"; ts.gap = 3; ts.cut = "dashed"; ts.defaultTpl = "pastel";
}

console.log("Result: " + (failures ? failures + " FAILURES" : "ALL CHECKS PASSED"));
process.exit(failures ? 1 : 0);