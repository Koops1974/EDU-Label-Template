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
  .replace('const SAMPLE_CSV = [', 'global.SAMPLE_CSV = [')
  .replace(
    /document\.addEventListener\("DOMContentLoaded", \(\) => \{[\s\S]*$/,
    "global.__app = { autoMap, buildSheets, planFills, labelContentHtml, buildLabelCell, fieldValue, fullName, calibrationSheetHtml, CAL, handleCsvText, updateSkippedNote, decodeCsvBuffer, repairMojibake, pastedToCsv };"
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

console.log("Result: " + (failures ? failures + " FAILURES" : "ALL CHECKS PASSED"));
process.exit(failures ? 1 : 0);