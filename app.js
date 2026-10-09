/*****************************************************************************
 *  LABEL MAKER FOR SCHOOLS — application logic
 *  Fully client-side. No data is uploaded anywhere.
 *****************************************************************************/
"use strict";

/* =====================================================================
 *  AVERY / compatible A4 template geometry (millimetres)
 *  Sourced from the glabels open template set (as published by
 *  sheetstolabels.com) and Avery's own template pages.
 * ===================================================================== */
const AVERY_TEMPLATES = {
  L7160: {
    code: "L7160", cols: 3, rows: 7,
    labelW: 63.99, labelH: 38.1,
    originX: 7.48, originY: 15.49,
    pitchX: 66.04, pitchY: 38.1,
    radius: 1.76, sharp: false,
    note: "21 per sheet · 63.5 × 38.1 mm",
    short: "Address labels",
  },
  L7161: {
    code: "L7161", cols: 3, rows: 6,
    labelW: 63.57, labelH: 46.74,
    originX: 7.41, originY: 8.11,
    pitchX: 65.93, pitchY: 46.74,
    radius: 2.47, sharp: false,
    note: "18 per sheet · 63.5 × 46.6 mm",
    short: "Tall address labels",
  },
  L7162: {
    code: "L7162", cols: 2, rows: 8,
    labelW: 99.07, labelH: 33.90,
    originX: 3.99, originY: 12.98,
    pitchX: 102.48, pitchY: 33.90,
    radius: 1.76, sharp: false,
    note: "16 per sheet · 99.1 × 33.9 mm",
    short: "Wide address labels",
  },
  L7163: {
    code: "L7163", cols: 2, rows: 7,
    labelW: 99.09, labelH: 38.1,
    originX: 3.35, originY: 15.17,
    pitchX: 103.01, pitchY: 38.1,
    radius: 1.76, sharp: false,
    note: "14 per sheet · 99.1 × 38.1 mm",
    short: "Wide address / shipping",
  },
  L7171: {
    code: "L7171", cols: 1, rows: 4,
    labelW: 200, labelH: 60,
    originX: 5, originY: 28.5,
    pitchX: 200, pitchY: 60,
    radius: 0, sharp: true,
    note: "4 per sheet · 200 × 60 mm",
    short: "Lever arch / filing labels",
  },
  KF01132: {
    code: "KF01132", cols: 2, rows: 8,
    labelW: 105, labelH: 37,
    originX: 0, originY: 0,
    pitchX: 105, pitchY: 37,
    radius: 0, sharp: true,
    fullBleed: true,
    note: "16 per sheet · 105 × 37 mm",
    short: "Q-Connect multi-purpose (butt cut)",
  },
};

const PAGE_W = 210, PAGE_H = 297; // A4 portrait

/* Printer/browser offset compensation (mm).
 * Base value comes from config.js (printCalibration). Any values entered
 * in the "Printing options" panel are layered on top and remembered for
 * this browser (localStorage), so a school doesn't need to edit config.js. */
const CAL_KEY = "labelMakerCalibration";
const readStoredCal = () => {
  try { return JSON.parse(localStorage.getItem(CAL_KEY) || "null"); }
  catch (e) { return null; }
};
const CAL = () => {
  const base = SCHOOL_CONFIG.printCalibration ? {
    x: Number(SCHOOL_CONFIG.printCalibration.x) || 0,
    y: Number(SCHOOL_CONFIG.printCalibration.y) || 0,
  } : { x: 0, y: 0 };
  const extra = readStoredCal();
  return extra ? { x: base.x + (Number(extra.x) || 0), y: base.y + (Number(extra.y) || 0) } : base;
};
const calLeft = (v) => v + CAL().x;
const calTop = (v) => v + CAL().y;

/* School-name strip colour — surfaced as a picker in the printing options.
 * Layered over config.js primaryColor and remembered for this browser. */
const COLOR_KEY = "labelMakerBarColor";
const readStoredColor = () => {
  try {
    const v = localStorage.getItem(COLOR_KEY);
    return v && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
  } catch (e) { return null; }
};
const effectiveBarColor = () => readStoredColor() || SCHOOL_CONFIG.primaryColor;

/* =====================================================================
 *  App state
 * ===================================================================== */
const state = {
  columns: [],
  rows: [],
  rowNumbers: [],
  skippedRows: [],
  partialNameRows: [],
  mapping: { firstName: null, lastName: null, className: null, subject: null, yearGroup: null, school: null, colour: null },
  sort: "none",
  template: (SCHOOL_CONFIG.defaultTemplate in AVERY_TEMPLATES) ? SCHOOL_CONFIG.defaultTemplate : "L7160",
  layout: "classic",
  logoDataUrl: null,
  opts: {
    showGuides: true,
    color: true,
    skipBlanks: true,
    colourCode: false,
    colourField: "name",
    logoSize: "std",
    showSchoolTop: SCHOOL_CONFIG.label.showSchoolNameTop,
    showClassName: SCHOOL_CONFIG.label.showClassName,
    showSubject: SCHOOL_CONFIG.label.showSubject,
    showYearGroup: SCHOOL_CONFIG.label.showYearGroup,
  },
};

/* =====================================================================
 *  Small helpers
 * ===================================================================== */
const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const esc = (s) => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;");

/* Spreadsheet-style column letters: 0→A, 1→B, … 25→Z, 26→AA, 27→AB. */
const columnLetter = (i) => {
  let s = "";
  while (i >= 0) { s = String.fromCharCode(65 + (i % 26)) + s; i = Math.floor(i / 26) - 1; }
  return s;
};

/* Colour names → hex, used for the "Text colour" mapping field.
 * A CSV colour column can hold any name here (or a hex code) and the
 * matching label text is coloured (and already bold). */
const COLOUR_MAP = {
  blue: "#1d4ed8", navy: "#1e3a8a", red: "#dc2626", orange: "#f97316",
  green: "#16a34a", purple: "#7c3aed", violet: "#7c3aed", pink: "#db2777",
  yellow: "#ca8a04", amber: "#b45309", gold: "#b45309", black: "#000000",
  white: "#ffffff", grey: "#6b7280", gray: "#6b7280", brown: "#92400e",
  teal: "#0d9488", cyan: "#0891b2", maroon: "#9f1239", magenta: "#c026d3",
  lime: "#65a30d", turquoise: "#14b8a6", silver: "#9ca3af",
};
function resolveColour(raw) {
  const v = String(raw == null ? "" : raw).trim().toLowerCase();
  if (!v || v === "none" || v === "default") return null;
  if (/^#?[0-9a-f]{6}$/i.test(v)) return v;
  if (COLOUR_MAP[v]) return COLOUR_MAP[v];
  for (const w of v.split(/[\s\-]+/)) { // "light blue" → blue
    if (COLOUR_MAP[w]) return COLOUR_MAP[w];
  }
  return null;
}

const LOGO_MULT = { std: 1, lg: 1.7, xl: 2.4 };

function setupBranding() {
  const C = SCHOOL_CONFIG;
  document.title = C.appTitle + " | Print Pupil & Book Labels";
  $("#headerSchool").textContent = C.appTitle;
  $("#footerText").textContent = C.footerLine + (C.contactEmail ? " · " + C.contactEmail : "");
  $("#footerYear").textContent = new Date().getFullYear();
  const mark = $("#brandMark");
  mark.textContent = C.logoText || C.shortName.slice(0, 2).toUpperCase();
  mark.style.background = C.primaryColor;
  document.documentElement.style.setProperty("--primary", C.primaryColor);
  document.documentElement.style.setProperty("--primary-dark", C.primaryColor);
}

/* =====================================================================
 *  Template cards
 * ===================================================================== */
function renderTemplateList() {
  const box = $("#templateList");
  box.innerHTML = "";
  Object.keys(AVERY_TEMPLATES).forEach((code) => {
    const t = AVERY_TEMPLATES[code];
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "template-card" + (state.template === code ? " selected" : "");
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", state.template === code ? "true" : "false");
    btn.innerHTML =
      `<span class="t-code">${t.code}</span>` +
      `<div class="t-size">${t.note}</div>` +
      `<div class="t-note">${t.short}</div>`;
    btn.addEventListener("click", () => {
      state.template = code;
      if (t.fullBleed && state.opts.color) {
        state.opts.color = false;
        const chk = $("#optColor");
        if (chk) chk.checked = false;
      }
      renderTemplateList();
      renderAll();
    });
    box.appendChild(btn);
  });
}

/* =====================================================================
 *  CSV handling
 * ===================================================================== */
/* Spreadsheets don't agree on an encoding: Google Sheets and modern Excel
 * write UTF-8, but Excel on Windows still defaults to windows-1252
 * (Latin-1). Decoding the latter as UTF-8 turns "Bjørn" into "BjÃ¸rn" and
 * can even blank characters out, so decode with the encoding the file
 * actually uses and only tell the teacher when we had to step in. */

/* The tell-tale sign of UTF-8 bytes read as Latin-1: "Ã©" for é, "â€™"
 * for a curly apostrophe, "Â°" for a degree sign. */
const MOJIBAKE = /(?:\u00C2|\u00C3|\u00E2)[\u0080-\u00FF\u0093\u0094\u009C\u009D]/;

/* Re-read text that was already decoded wrongly: turn each character back
 * into the single byte it came from, then decode those bytes as UTF-8.
 * Returns null when that isn't possible, so genuine non-Latin text (any
 * character outside Latin-1) is never touched. */
function repairMojibake(text) {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 255) return null;
    bytes[i] = code;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    return null;
  }
}

function decodeCsvBuffer(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  let text;
  let note = "";
  try {
    /* Strict UTF-8: throws on any byte that isn't valid UTF-8, which is
     * the surest sign the file was saved as windows-1252. */
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (e) {
    text = new TextDecoder("windows-1252").decode(bytes);
    note = "read as windows-1252 — accented letters restored";
  }
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (MOJIBAKE.test(text)) {
    const repaired = repairMojibake(text);
    if (repaired && !MOJIBAKE.test(repaired)) {
      text = repaired;
      note = note ? `${note} (and repaired twice-encoded text)` : "repaired twice-encoded text";
    }
  }
  return { text, note };
}

/* A teacher who wants 20 labels should not have to know what a CSV is.
 * Turn a pasted list into the same CSV shape the rest of the app already
 * understands, so preview, sorting, templates and printing stay identical.
 * Returns { csv, rowOffset } — rowOffset keeps reported row numbers
 * pointing at the teacher's own line numbering, not ours. */
const HEADING_CELLS = [
  "name", "pupil name", "student name", "child name", "full name", "display name",
  "first name", "firstname", "last name", "surname", "forename", "given name",
  "subject", "class", "class form", "form", "year", "year group", "group",
  "colour", "color", "school",
];
const isHeadingCell = (cell) =>
  HEADING_CELLS.includes(cell.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim());

const csvCell = (v) => {
  const s = String(v).replace(/^\uFEFF/, "").trim();
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

function pastedToCsv(text) {
  const lines = String(text == null ? "" : text)
    .replace(/\r\n?/g, "\n").split("\n")
    .map((l) => l.replace(/^\uFEFF/, "").trim()).filter((l) => l !== "");
  if (!lines.length) return null;

  const cellsOf = (l) => l.split("\t").map((c) => c.trim());
  /* Copying a range straight from a spreadsheet brings the heading row
   * along — drop it rather than print a label called "First Name". */
  const headerDropped = cellsOf(lines[0]).every(isHeadingCell);
  const body = headerDropped ? lines.slice(1) : lines;
  if (!body.length) return null;

  /* Tab-separated cells (an Excel/Sheets paste) become real columns;
   * otherwise every line is simply one full name. */
  if (!body.some((l) => l.includes("\t"))) {
    return {
      csv: ["Pupil Name"].concat(body.map(csvCell)).join("\n"),
      rowOffset: headerDropped ? 0 : 1,
    };
  }

  const names = ["First Name", "Last Name", "Subject", "Class / form", "Year group", "Colour"];
  const width = Math.max.apply(null, body.map((l) => cellsOf(l).length));
  const head = [];
  for (let i = 0; i < width; i++) head.push(names[i] || "Column " + (i + 1));
  const csv = [head.map(csvCell).join(",")].concat(
    body.map((l) => {
      const c = cellsOf(l);
      while (c.length < width) c.push("");
      return c.map(csvCell).join(",");
    })
  ).join("\n");
  return { csv, rowOffset: headerDropped ? 0 : 1 };
}

function handleCsvText(text, fileName, encodingNote, rowOffset) {
  const parsed = Papa.parse(text, {
    header: true, skipEmptyLines: false, trimHeaders: true,
    transformHeader: (h) => h.replace(/^\uFEFF/, "").trim(),
  });
  /* Benign parse notes we must not reject the file for:
   * TooFewFields / TooManyFields — a ragged row, the absent cells are just
   *   blank and the row is still usable;
   * UndetectableDelimiter — Papa only warns when it can't sniff the
   *   delimiter from a short file and falls back to a comma, which is what
   *   we want anyway. Only broken quotes/structure are fatal. */
  const fatal = (parsed.errors || []).filter(
    (e) => e.code !== "TooFewFields" &&
           e.code !== "TooManyFields" &&
           e.code !== "UndetectableDelimiter"
  );
  if (fatal.length) {
    showUploadError("Could not read that file: " + fatal[0].message);
    return;
  }
  /* Keep the original spreadsheet row number for every pupil row (the
   * header occupies row 1), so rows we can't use can be reported back to
   * the teacher by row number instead of vanishing silently. A pasted
   * list passes rowOffset so the number is the line they see in the box. */
  const rows = [], rowNumbers = [];
  parsed.data.forEach((r, i) => {
    if (!r) return;
    const values = Object.keys(r).map((k) => (r[k] == null ? "" : String(r[k]).trim()));
    if (values.every((v) => v === "")) return; // genuinely blank line
    rows.push(r);
    rowNumbers.push(i + 2 - (rowOffset || 0));
  });
  if (!rows.length) {
    showUploadError("The CSV has no data rows.");
    return;
  }
  state.columns = parsed.meta.fields.filter(Boolean);
  state.rows = rows;
  state.rowNumbers = rowNumbers;
  autoMap();
  /* Rows with no usable pupil name are dropped when "Skip empty pupil
   * names" is on — list them so the spreadsheet can be fixed. A row with
   * only one of the two name columns filled still gets a label, but the
   * teacher should know about it before burning a label sheet. */
  state.skippedRows = [];
  state.partialNameRows = [];
  const firstCol = state.mapping.firstName && state.mapping.firstName.kind === "col" ? state.mapping.firstName.value : null;
  const lastCol = state.mapping.lastName && state.mapping.lastName.kind === "col" ? state.mapping.lastName.value : null;
  if (firstCol && lastCol) {
    rows.forEach((r, i) => {
      const f = r[firstCol] == null ? "" : String(r[firstCol]).trim();
      const l = r[lastCol] == null ? "" : String(r[lastCol]).trim();
      if (!f && !l) state.skippedRows.push(rowNumbers[i]);
      else if (!f || !l) state.partialNameRows.push(rowNumbers[i]);
    });
  } else {
    rows.forEach((r, i) => {
      if (fullName(r) === "") state.skippedRows.push(rowNumbers[i]);
    });
  }
  renderMapping();
  updateFileStatus(fileName, rows.length, encodingNote);
  renderAll();
}

function showUploadError(msg) {
  const text = "⚠ " + msg;
  const up = $("#uploadError");
  if (up) { up.textContent = text; up.hidden = false; }
  /* Surface the same message in whichever source tab is open. */
  const paste = $("#pasteError");
  if (paste) { paste.textContent = text; paste.hidden = false; }
}

function autoMap() {
  const C = SCHOOL_CONFIG.columnAliases;
  const cols = state.columns;
  const find = (aliases) => {
    for (const c of cols) {
      const cl = c.toLowerCase();
      if (aliases.some((a) => a.toLowerCase() === cl)) return { kind: "col", value: c };
    }
    for (const c of cols) {
      const cl = c.toLowerCase();
      for (const a of aliases) {
        const al = a.toLowerCase();
        if (cl.includes(al) || al.includes(cl)) return { kind: "col", value: c };
      }
    }
    return null;
  };

  const firstName = find(C.firstName);
  const lastName  = find(C.lastName);
  const used = new Set([firstName && firstName.value, lastName && lastName.value].filter(Boolean));

  let pupilName = null;
  // exact match (skip columns already claimed by first/last name)
  for (const c of cols) {
    if (used.has(c)) continue;
    const cl = c.toLowerCase();
    if (C.pupilName.some((a) => a.toLowerCase() === cl)) { pupilName = { kind: "col", value: c }; break; }
  }
  // substring match
  if (!pupilName) {
    for (const c of cols) {
      if (used.has(c)) continue;
      const cl = c.toLowerCase();
      for (const a of C.pupilName) {
        const al = a.toLowerCase();
        if (cl.includes(al) || al.includes(cl)) { pupilName = { kind: "col", value: c }; break; }
      }
      if (pupilName) break;
    }
  }
  // If first/last name columns exist, hide pupilName row; else fall back to first column
  if (!pupilName) pupilName = used.size ? { kind: "hide" } : { kind: "col", value: cols[0] || "" };

  state.mapping = {
    pupilName,
    firstName,
    lastName,
    className: find(C.className),
    subject:   find(C.subject),
    yearGroup: find(C.yearGroup),
    school:    find(C.school) || { kind: "fixed", value: SCHOOL_CONFIG.schoolName },
    colour:    find(C.colour || []) || { kind: "hide" },
  };
}

/* =====================================================================
 *  Field-mapping UI
 * ===================================================================== */
const MAPPING_FIELDS = [
  { key: "firstName", label: "First name" },
  { key: "lastName",  label: "Surname" },
  { key: "className", label: "Class / form" },
  { key: "subject",   label: "Subject" },
  { key: "yearGroup", label: "Year group" },
  { key: "school",    label: "School name" },
  { key: "colour",    label: "Text colour (e.g. blue, orange)" },
];

function mappingControl(field) {
  const wrap = document.createElement("div");
  wrap.className = "field-map";

  const lab = document.createElement("label");
  const def = MAPPING_FIELDS.find((f) => f.key === field.key);
  const num = def ? MAPPING_FIELDS.indexOf(def) + 1 : "";
  lab.textContent = num ? `Field ${num} · ${def.label}` : def.label;
  wrap.appendChild(lab);

  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "8px";

  const select = document.createElement("select");
  const opts = [{ kind: "hide", value: "", label: "— Hidden —" }];
  state.columns.forEach((c, i) => opts.push({ kind: "col", value: c, label: "Column " + columnLetter(i) + ": " + c }));
  opts.push({ kind: "fixed", value: "__fixed__", label: "✏️ Fixed text…" });
  opts.forEach((o) => {
    const opt = document.createElement("option");
    opt.value = o.value;
    opt.textContent = o.label;
    opt.dataset.kind = o.kind;
    if (o.kind === "hide") opt.value = "";
    select.appendChild(opt);
  });

  const cur = state.mapping[field.key];
  select.value = cur ? (cur.kind === "col" ? cur.value : (cur.kind === "fixed" ? "__fixed__" : "")) : "";
  if (cur && cur.kind === "col" && !state.columns.includes(cur.value)) select.value = "";

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "Type fixed text…";
  input.value = (cur && cur.kind === "fixed") ? cur.value : "";
  input.className = "fixed-input";
  input.style.cssText = "flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;";
  input.hidden = select.value !== "__fixed__";
  if (cur && cur.kind === "fixed") select.style.flex = "0 1 auto";

  select.style.cssText = "flex:1;padding:8px 10px;border:1px solid var(--border);border-radius:8px;font-size:13px;";
  row.appendChild(select);
  row.appendChild(input);
  wrap.appendChild(row);

  const commit = () => {
    const v = select.value;
    if (v === "") state.mapping[field.key] = { kind: "hide" };
    else if (v === "__fixed__") {
      state.mapping[field.key] = { kind: "fixed", value: input.value.trim() || SCHOOL_CONFIG.schoolName };
      input.hidden = false;
    } else {
      state.mapping[field.key] = { kind: "col", value: v };
      input.hidden = true;
    }
    renderAll();
  };
  select.addEventListener("change", () => {
    input.hidden = select.value !== "__fixed__";
    if (select.value === "__fixed__") setTimeout(() => input.focus(), 0);
    commit();
  });
  input.addEventListener("change", commit);
  input.addEventListener("input", commit);

  return wrap;
}

function renderMapping() {
  const firstRow = $("#mappingRowFirst"), lastRow = $("#mappingRowLast"),
        clsRow = $("#mappingRowClass"), subjRow = $("#mappingRowSubject"),
        yearRow = $("#mappingRowYear"), schRow = $("#mappingRowSchool"),
        colourRow = $("#mappingRowColour");
  const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); };
  [firstRow, lastRow, clsRow, subjRow, yearRow, schRow, colourRow].forEach(clear);
  firstRow.appendChild(mappingControl({ key: "firstName" }));
  lastRow.appendChild(mappingControl({ key: "lastName" }));
  clsRow.appendChild(mappingControl({ key: "className" }));
  subjRow.appendChild(mappingControl({ key: "subject" }));
  yearRow.appendChild(mappingControl({ key: "yearGroup" }));
  schRow.appendChild(mappingControl({ key: "school" }));
  colourRow.appendChild(mappingControl({ key: "colour" }));
}

/* =====================================================================
 *  Label content build
 * ===================================================================== */
function fieldValue(row, fieldKey) {
  const m = state.mapping[fieldKey];
  if (!m || m.kind === "hide") return "";
  if (m.kind === "fixed") return m.value || "";
  return (row[m.value] == null ? "" : String(row[m.value]).trim());
}

function schoolName(row) {
  return fieldValue(row, "school") || SCHOOL_CONFIG.schoolName;
}

function effectiveLogoSrc() {
  if (state.logoDataUrl) return state.logoDataUrl;
  if (SCHOOL_CONFIG.logo) return SCHOOL_CONFIG.logo;
  return null;
}

/* Split a pupil row into { first, last } parts.
 * When the CSV has separate first/last columns those take priority.
 * When only a full-name column is present the last token becomes surname. */
function nameParts(row) {
  const first = fieldValue(row, "firstName");
  const last  = fieldValue(row, "lastName");
  if (first || last) return { first, last };
  const full  = fieldValue(row, "pupilName");
  const bits  = full.split(/\s+/).filter(Boolean);
  return { first: bits.length ? bits[0] : "", last: bits.length ? bits[bits.length - 1] : "" };
}

function fullName(row) {
  return [nameParts(row).first, nameParts(row).last].filter(Boolean).join(" ");
}

/* Outermost row layout: which pupils fill which cells.
 * Returns flat array of { rowData, index } for filled cells (index = cell number 0-based). */
function planFills() {
  const t = AVERY_TEMPLATES[state.template];
  const perSheet = t.cols * t.rows;
  let pupils = state.rows.slice();
  if (state.opts.skipBlanks) {
    pupils = pupils.filter((r) => fullName(r) !== "");
  }
  if (state.sort === "first" || state.sort === "surname") {
    const keyOf = (r) => (state.sort === "first" ? nameParts(r).first : nameParts(r).last).toLowerCase();
    pupils = pupils.slice().sort((a, b) => {
      const ka = keyOf(a), kb = keyOf(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }
  const fills = [];
  pupils.forEach((r, i) => {
    const sheet = Math.floor(i / perSheet);
    const cell = i % perSheet;
    fills.push({ rowData: r, sheet, cell });
  });
  return { fills, perSheet };
}

/* Font sizing scaled to the label's physical height (in mm). */
function fontScale(labelH) {
  return clamp(Math.sqrt(labelH / 38.1), 0.62, 1.85); // 38.1mm label = scale 1
}

function labelContentHtml(row) {
  const C = SCHOOL_CONFIG;
  const name = fullName(row);
  const showName = C.label.showPupilName && name !== "";
  const cls = fieldValue(row, "className");
  const subj = fieldValue(row, "subject");
  const yr = fieldValue(row, "yearGroup");
  const o = state.opts;
  const logo = effectiveLogoSrc();
  const useColor = o.color;

  const parts = [];

  if (o.showSchoolTop) {
    const text = esc(schoolName(row));
    const logoHtml = logo
      ? `<img class="lbl-logo" src="${esc(logo)}" alt="">`
      : "";
    parts.push(
      `<div class="label-school${useColor ? " bar" : ""}" ` +
      `style="--bar-bg:${effectiveBarColor()};--bar-text:${C.printTextColor};">
         ${logoHtml}<span class="lbl-school-text">${text}</span>
       </div>`
    );
  }

  const rowColour = o.colourCode ? resolveColour(fieldValue(row, "colour")) : null;
  const cStyle = (sel) => (rowColour && o.colourField === sel) ? ` style="color:${rowColour};"` : "";

  const namePart = showName
    ? `<div class="label-name"${cStyle("name")}>${esc(name)}</div>`
    : "";

  let subjectPart = "";
  if (o.showSubject && subj) {
    subjectPart = `<div class="label-subject"${cStyle("subject")}>${esc(subj)}</div>`;
  }

  const metaBits = [];
  if (o.showClassName && cls) metaBits.push(`${C.label.showClassLabel}${esc(cls)}`);
  if (o.showYearGroup && yr) metaBits.push(esc(yr));
  const metaPart = metaBits.length
    ? `<div class="label-meta"${cStyle("meta")}><span>${metaBits.join("</span><span>")}</span></div>`
    : "";

  return { namePart, subjectPart, metaPart, parts, name, rowColour };
}

function buildLabelCell(row, t, cellIndex) {
  const col = cellIndex % t.cols;
  const rowIdx = Math.floor(cellIndex / t.cols);
  const left = calLeft(t.originX + col * t.pitchX);
  const top = calTop(t.originY + rowIdx * t.pitchY);

  const C = SCHOOL_CONFIG;
  const { namePart, subjectPart, metaPart, parts, rowColour } = labelContentHtml(row);

  const labelH = t.labelH;
  const fs = fontScale(labelH);
  const outerTextColor = (rowColour && state.opts.colourField === "all") ? rowColour : C.defaultTextColor;
  const accentSoft = hexToRgba(C.accentColor, 0.28);

  const schoolTop = parts.join("");

  const layoutCls = " " + state.layout;
  const cssVars =
    `--lh:${labelH.toFixed(2)}mm;` +
    `--lw:${t.labelW.toFixed(2)}mm;` +
    `--name-fs:${(5.2 * fs).toFixed(2)}mm;` +
    `--school-fs:${(2.9 * fs).toFixed(2)}mm;` +
    `--subj-fs:${(3.0 * fs).toFixed(2)}mm;` +
    `--meta-fs:${(2.5 * fs).toFixed(2)}mm;` +
    `--r:${t.radius}mm;` +
    `--accent-soft:${accentSoft};` +
    `--bar-bg:${effectiveBarColor()};` +
    `--bar-text:${C.printTextColor};` +
    `--logo-mult:${(LOGO_MULT[state.opts.logoSize] || 1)};` +
    `--label-bg:#fff;`;

  const colorCls = state.opts.color ? " color" : "";
  const guidesCls = state.opts.showGuides ? " guides" : "";

  return (
    `<div class="label-cell${guidesCls}" style="left:${left.toFixed(2)}mm;top:${top.toFixed(2)}mm;` +
    `width:${t.labelW.toFixed(2)}mm;height:${labelH.toFixed(2)}mm;${cssVars}">` +
      `<div class="label-inner${layoutCls}${colorCls}" style="color:${outerTextColor};">` +
        `${schoolTop}${namePart}${subjectPart}${metaPart}` +
      `</div>` +
    `</div>`
  );
}

function hexToRgba(hex, alpha) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return "rgba(29,78,216," + alpha + ")";
  const r = parseInt(m[1], 16), g = parseInt(m[2], 16), b = parseInt(m[3], 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/* =====================================================================
 *  Sheet rendering
 * ===================================================================== */
function emptySheetHtml() {
  const t = AVERY_TEMPLATES[state.template];
  let cells = "";
  for (let i = 0; i < t.cols * t.rows; i++) {
    const col = i % t.cols, rowI = Math.floor(i / t.cols);
    const left = calLeft(t.originX + col * t.pitchX), top = calTop(t.originY + rowI * t.pitchY);
    const guides = state.opts.showGuides ? " guides" : "";
    cells +=
      `<div class="label-cell${guides}" style="left:${left.toFixed(2)}mm;top:${top.toFixed(2)}mm;` +
      `width:${t.labelW.toFixed(2)}mm;height:${t.labelH.toFixed(2)}mm;"></div>`;
  }
  return `<div class="sheet"><div class="sheet-pad">${cells}</div></div>`;
}

function buildSheets(printMode) {
  const t = AVERY_TEMPLATES[state.template];
  const { fills, perSheet } = planFills();
  const sheetsHtml = [];
  const totalSheets = fills.length ? Math.max(...fills.map((f) => f.sheet)) + 1 : 0;

  for (let s = 0; s < totalSheets; s++) {
    const sheetFills = fills.filter((f) => f.sheet === s);
    const cellsByCell = {};
    sheetFills.forEach((f) => { cellsByCell[f.cell] = f.rowData; });
    let cells = "";
    for (let i = 0; i < perSheet; i++) {
      if (cellsByCell[i] !== undefined) {
        cells += buildLabelCell(cellsByCell[i], t, i);
      } else {
        const col = i % t.cols, rowI = Math.floor(i / t.cols);
        const guides = state.opts.showGuides ? " guides" : "";
        cells +=
          `<div class="label-cell${guides}" style="left:${calLeft(t.originX + col * t.pitchX).toFixed(2)}mm;` +
        `top:${calTop(t.originY + rowI * t.pitchY).toFixed(2)}mm;` +
          `width:${t.labelW.toFixed(2)}mm;height:${t.labelH.toFixed(2)}mm;"></div>`;
      }
    }
    const cls = printMode ? "sheet print-sheet" : "sheet";
    sheetsHtml.push(`<div class="${cls}"><div class="sheet-pad">${cells}</div></div>`);
  }
  return sheetsHtml;
}

function renderPreview() {
  const container = $("#sheetContainer");
  const meta = $("#previewMeta");
  const t = AVERY_TEMPLATES[state.template];
  const n = planFills().fills.length;
  const sheets = n ? buildSheets(false) : [emptySheetHtml()];
  container.innerHTML = sheets.join("");
  if (n) {
    const sheetsNeeded = Math.ceil(n / (t.cols * t.rows));
    meta.textContent = `${n} label${n === 1 ? "" : "s"} · ${sheetsNeeded} sheet${sheetsNeeded === 1 ? "" : "s"} of ${t.code}`;
  } else {
    meta.textContent = "Preview of " + t.code + " sheet";
  }
}

function renderPrintRoot() {
  const root = $("#printRoot");
  const n = planFills().fills.length;
  root.innerHTML = n ? buildSheets(true).join("") : "";
  const sheets = $$(".print-sheet", root);
  // ensure proper page-break grouping
  sheets.forEach((sh) => sh.style.pageBreakBefore = "");
}

/* =====================================================================
 *  Calibration test sheet
 *  Prints just the label guide outlines plus a millimetre ruler down the
 *  left edge and along the top. The visible gap between the printed "0"
 *  marks and the physical sheet edge IS the offset to cancel out.
 * ===================================================================== */
function calibrationSheetHtml() {
  const t = AVERY_TEMPLATES[state.template];
  let cells = "";
  for (let i = 0; i < t.cols * t.rows; i++) {
    const col = i % t.cols, rowI = Math.floor(i / t.cols);
    const left = calLeft(t.originX + col * t.pitchX), top = calTop(t.originY + rowI * t.pitchY);
    cells +=
      `<div class="label-cell guides" style="left:${left.toFixed(2)}mm;top:${top.toFixed(2)}mm;` +
      `width:${t.labelW.toFixed(2)}mm;height:${t.labelH.toFixed(2)}mm;"></div>`;
  }
  const ticks = [];
  for (let y = 0; y <= 290; y += 10) {
    const h = (y % 50 === 0) ? 5 : 3;
    ticks.push(`<div class="cal-tick" style="top:${y}mm;height:${h}mm"></div>`);
    ticks.push(`<div class="cal-num" style="top:${y}mm">${y}</div>`);
  }
  const hticks = [];
  for (let x = 0; x <= 210; x += 10) {
    hticks.push(`<div class="cal-hick${x % 50 === 0 ? " big" : ""}" style="left:${x}mm"></div>`);
  }
  return `<div class="sheet print-sheet">` +
    `<div class="cal-head" style="left:30mm">A4 top edge → mm<br>Measure the gap around the dashed boxes after printing</div>` +
    `<div class="sheet-pad">${ticks.join("")}${hticks.join("")}${cells}</div></div>`;
}

function printCalibrationSheet() {
  const root = $("#printRoot");
  if (!root) return;
  const t = AVERY_TEMPLATES[state.template];
  const c = CAL();
  root.innerHTML = calibrationSheetHtml();
  const stamp = root.querySelector(".cal-head");
  if (stamp) stamp.textContent =
    `ALIGNMENT TEST · offset X ${c.x >= 0 ? "+" : ""}${c.x} mm, Y ${c.y >= 0 ? "+" : ""}${c.y} mm · ` + t.code +
    " — the printed gap around the dashed boxes (use the mm ruler) is what to enter with the opposite sign";
  const restore = () => {
    root.innerHTML = "";
    window.removeEventListener("afterprint", restore);
    clearTimeout(restoreTimer);
    renderAll();
  };
  const restoreTimer = setTimeout(restore, 60000); /* safety if afterprint never fires */
  window.addEventListener("afterprint", restore);
  window.print();
}

/* Tell the teacher exactly which spreadsheet rows need attention, so they
 * can fix the file instead of wondering why labels are missing. */
const rowList = (nums) => {
  const max = 12;
  const listed = nums.slice(0, max).join(", ");
  return listed + (nums.length > max ? ` and ${nums.length - max} more` : "");
};

function updateSkippedNote() {
  const el = $("#skippedNote");
  if (!el) return;
  const lines = [];
  const skipped = state.opts.skipBlanks ? (state.skippedRows || []) : [];
  const partial = state.partialNameRows || [];

  if (skipped.length) {
    const many = skipped.length === 1;
    lines.push(
      `${skipped.length} ${many ? "row has" : "rows have"} no pupil name ` +
      `(row${many ? "" : "s"} ${rowList(skipped)}) so no label was made for ` +
      `${many ? "it" : "them"}. Add the missing name${many ? "" : "s"} in your spreadsheet and upload the file again.`
    );
  }
  if (partial.length) {
    const many = partial.length === 1;
    lines.push(
      `${partial.length} ${many ? "row has" : "rows have"} only a first or last name ` +
      `(row${many ? "" : "s"} ${rowList(partial)}) — a label was still made, so check those cells before printing.`
    );
  }

  el.hidden = !lines.length;
  el.textContent = lines.length ? "⚠ " + lines.join("\n⚠ ") : "";
}

function renderAll() {
  updateSkippedNote();
  renderPreview();
  renderPrintRoot();
  const hasData = state.rows.length > 0;
  $("#printBtn").disabled = !hasData;
  const t = AVERY_TEMPLATES[state.template];
  $("#printNote").textContent = !hasData
    ? "No preview? Upload a CSV first."
    : (t.fullBleed
        ? "Full-bleed sheet (no margin at the edges) — print at 100% / Actual size with margins set to 'none'. Test one sheet before a full run."
        : "Choose 'Save as PDF' in the print dialog for a printable file.");
}

/* =====================================================================
 *  Events & wiring
 * ===================================================================== */
function updateFileStatus(fileName, count, note) {
  const s = $("#fileStatus");
  s.hidden = false;
  $("#fileStatusText").textContent =
    `✓ ${fileName} — ${count} pupils loaded${note ? ` · ${note}` : ""}`;
  $("#mappingSection").hidden = false;
  $("#uploadError").hidden = true;
  const pasteErr = $("#pasteError");
  if (pasteErr) pasteErr.hidden = true;
}

function initEvents() {
  const dropZone = $("#dropZone");
  const fileInput = $("#csvFile");

  $("#browseBtn").addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("click", (e) => {
    if (e.target.id !== "browseBtn") fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    const f = fileInput.files[0];
    if (f) readFile(f);
    fileInput.value = "";
  });

  ["dragover", "dragenter"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("dragover"); }));
  ["dragleave", "drop"].forEach((ev) =>
    dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("dragover"); }));
  dropZone.addEventListener("drop", (e) => {
    const f = e.dataTransfer.files[0];
    if (f) readFile(f);
  });

  $("#clearFileBtn").addEventListener("click", () => {
    state.columns = []; state.rows = [];
    state.rowNumbers = []; state.skippedRows = []; state.partialNameRows = [];
    state.mapping = {};
    state.sort = "none";
    if (sortSelect) sortSelect.value = "none";
    $("#fileStatus").hidden = true;
    $("#mappingSection").hidden = true;
    const pasteHint = $("#pasteHint");
    if (pasteHint) pasteHint.hidden = true;
    renderMapping();
    renderAll();
  });

  $("#loadSampleBtn").addEventListener("click", () => {
    handleCsvText(SAMPLE_CSV, "sample-pupils.csv");
  });

  /* --- Paste-a-list mode (the no-CSV path) --- */
  const setSourceTab = (which) => {
    const upload = which === "upload";
    $("#tabUpload").classList.toggle("is-active", upload);
    $("#tabPaste").classList.toggle("is-active", !upload);
    $("#tabUpload").setAttribute("aria-selected", String(upload));
    $("#tabPaste").setAttribute("aria-selected", String(!upload));
    $("#uploadSource").hidden = !upload;
    $("#pasteSource").hidden = upload;
    if (upload) $("#uploadError").hidden = true;
    else $("#pasteError").hidden = true;
  };
  $("#tabUpload").addEventListener("click", () => setSourceTab("upload"));
  $("#tabPaste").addEventListener("click", () => setSourceTab("paste"));

  const makeFromPaste = () => {
    const built = pastedToCsv($("#pasteList").value);
    if (!built) {
      const el = $("#pasteError");
      el.textContent = "⚠ Paste at least one name to make labels.";
      el.hidden = false;
      return;
    }
    handleCsvText(built.csv, "Pasted list", "", built.rowOffset);
    const hint = $("#pasteHint");
    /* On failure handleCsvText stops and leaves the previous list alone. */
    if (!$("#pasteError").hidden) { hint.hidden = true; return; }
    hint.hidden = false;
    hint.textContent = `${state.rows.length} names ready — edit the box and press Make labels again to update.`;
  };
  $("#pasteGo").addEventListener("click", makeFromPaste);
  $("#pasteList").addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") makeFromPaste();
  });

  /* Optional Chrome-extension bridge ("Send to Label Maker"). Reuses the
     exact paste path — same as typing the names and pressing Make labels.
     Inert unless a "labelmaker-import" event is dispatched. */
  const importFromExternal = (text) => {
    try {
      if (typeof text !== "string" || !text.trim()) return false;
      setSourceTab("paste");
      const box = $("#pasteList");
      if (!box) return false;
      box.value = text;
      $("#pasteGo").click();
      return true;
    } catch (err) {
      console.warn("Label maker import failed:", err);
      return false;
    }
  };
  const importFromExternalAndAck = (text) => {
    const ok = importFromExternal(text);
    document.documentElement.setAttribute("data-labelmaker-ok", ok ? "1" : "0");
    return ok;
  };
  window.__labelMakerImport = importFromExternalAndAck;
  document.addEventListener("labelmaker-import", (e) => importFromExternalAndAck(e.detail));

  $("#printBtn").addEventListener("click", () => window.print());

  /* Share this site: native share sheet where supported, otherwise copy
   * the link and confirm, falling back to a copy dialog on file:// pages. */
  const shareBtn = $("#shareSiteBtn");
  if (shareBtn) {
    shareBtn.addEventListener("click", async () => {
      const url = "https://labels.welwyntech.co.uk/";
      const label = shareBtn.dataset.label || "Share this site";
      if (navigator.share) {
        try { await navigator.share({ title: SCHOOL_CONFIG.schoolName + " Label Maker", text: "Free label maker for schools", url }); }
        catch (e) { /* user cancelled the sheet — fine */ }
        return;
      }
      try {
        await navigator.clipboard.writeText(url);
        shareBtn.textContent = "✓ Link copied";
        setTimeout(() => { shareBtn.textContent = label; }, 2000);
      } catch (e) {
        const done = prompt("Copy this link:", url);
        if (done !== null && done !== "") shareBtn.textContent = "✓ Link copied";
      }
    });
  }

  state.columns = [];
  ["optSchoolTop", "optClassName", "optSubject", "optYearGroup",
   "optGuides", "optColor", "optSkipBlanks", "optColourCode"].forEach((id) => {
    const map = {
      optSchoolTop: "showSchoolTop", optClassName: "showClassName",
      optSubject: "showSubject", optYearGroup: "showYearGroup",
      optGuides: "showGuides", optColor: "color", optSkipBlanks: "skipBlanks",
      optColourCode: "colourCode",
    };
    $(`#${id}`).checked = state.opts[map[id]];
    $(`#${id}`).addEventListener("change", () => {
      state.opts[map[id]] = $(`#${id}`).checked;
      renderAll();
    });
  });

  const colourFieldSelect = $("#colourFieldSelect");
  if (colourFieldSelect) {
    colourFieldSelect.value = state.opts.colourField;
    colourFieldSelect.disabled = !state.opts.colourCode;
    colourFieldSelect.addEventListener("change", () => {
      state.opts.colourField = colourFieldSelect.value;
      renderAll();
    });
    const colourCodeChk = $("#optColourCode");
    if (colourCodeChk) {
      colourCodeChk.addEventListener("change", (e) => {
        colourFieldSelect.disabled = !e.target.checked;
      });
    }
  }

  $("#layoutSelect").addEventListener("change", (e) => {
    state.layout = e.target.value;
    renderAll();
  });

  /* A–Z label order (first name or surname) */
  const sortSelect = $("#sortSelect");
  if (sortSelect) {
    sortSelect.value = state.sort;
    sortSelect.addEventListener("change", () => {
      state.sort = sortSelect.value;
      renderAll();
    });
  }

  const logoSizeSelect = $("#logoSizeSelect");
  if (logoSizeSelect) {
    logoSizeSelect.value = state.opts.logoSize;
    logoSizeSelect.addEventListener("change", () => {
      state.opts.logoSize = logoSizeSelect.value;
      renderAll();
    });
  }

  /* Print-offset calibration (mm, saved per-browser). Negative y moves
   * everything UP, negative x moves LEFT — same convention as config.js. */
  const stored = readStoredCal() || { x: 0, y: 0 };
  const calX = $("#calX"), calY = $("#calY");
  calX.value = stored.x;
  calY.value = stored.y;
  const updateCalReadout = () => {
    $("#calXVal").textContent = (parseFloat(calX.value) || 0);
    $("#calYVal").textContent = (parseFloat(calY.value) || 0);
  };
  const calSaveToStorage = () => {
    const v = {
      x: Math.round((parseFloat(calX.value) || 0) * 10) / 10,
      y: Math.round((parseFloat(calY.value) || 0) * 10) / 10,
    };
    try { localStorage.setItem(CAL_KEY, JSON.stringify(v)); } catch (e) { /* private mode */ }
    updateCalReadout();
  };
  updateCalReadout();
  calX.addEventListener("change", () => { calSaveToStorage(); renderAll(); });
  calY.addEventListener("change", () => { calSaveToStorage(); renderAll(); });
  const calStatus = $("#calStatus");
  const showCalStatus = (msg) => {
    calStatus.textContent = msg;
    calStatus.style.opacity = "1";
  };
  $("#calApply").addEventListener("click", () => {
    calSaveToStorage();
    renderAll();
    const c = CAL();
    showCalStatus(`✔ Saved on this device — preview shifted X ${c.x >= 0 ? "+" : ""}${c.x} mm, Y ${c.y >= 0 ? "+" : ""}${c.y} mm (look at the dashed boxes on the right).`);
    clearTimeout(calStatus._t);
    calStatus._t = setTimeout(() => { calStatus.style.opacity = "0"; }, 6000);
  });
  $("#calTest").addEventListener("click", () => {
    const c = CAL();
    showCalStatus("Printing the alignment test sheet — if the print dialog didn't open, your browser blocked printing.");
    clearTimeout(calStatus._t);
    calStatus._t = setTimeout(() => { calStatus.style.opacity = "0"; }, 8000);
    printCalibrationSheet();
  });
  $("#calReset").addEventListener("click", () => {
    calX.value = 0; calY.value = 0;
    try { localStorage.removeItem(CAL_KEY); } catch (e) { /* private mode */ }
    updateCalReadout();
    renderAll();
    showCalStatus("Calibration reset to 0,0.");
    clearTimeout(calStatus._t);
    calStatus._t = setTimeout(() => { calStatus.style.opacity = "0"; }, 4000);
  });

  /* school-name strip colour picker (saved per-browser) */
  const barColorInput = $("#labelBarColor");
  if (barColorInput) {
    barColorInput.value = readStoredColor() || SCHOOL_CONFIG.primaryColor;
    barColorInput.addEventListener("input", () => {
      if (!/^#[0-9a-fA-F]{6}$/.test(barColorInput.value)) return;
      try { localStorage.setItem(COLOR_KEY, barColorInput.value); } catch (e) { /* private mode */ }
      renderAll();
    });
    const barColorReset = $("#labelBarReset");
    if (barColorReset) {
      barColorReset.addEventListener("click", () => {
        try { localStorage.removeItem(COLOR_KEY); } catch (e) { /* private mode */ }
        barColorInput.value = SCHOOL_CONFIG.primaryColor;
        renderAll();
      });
    }
  }

  window.addEventListener("resize", () => { /* sheets are fixed-size, nothing to do */ });

  /* optional logo upload (client-side only) */
  const logoInput = document.createElement("input");
  logoInput.type = "file";
  logoInput.accept = "image/*";
  logoInput.hidden = true;
  document.body.appendChild(logoInput);
  const addLogoRow = () => {
    const s = document.querySelector("#labelFieldsDetails");
    if (!s) return;
    const row = document.createElement("div");
    row.style.marginTop = "8px";
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-ghost btn-sm";
    btn.style.marginTop = "0";
    btn.textContent = state.logoDataUrl ? "🖼️ Change logo…" : "🖼️ Add a logo…";
    btn.addEventListener("click", () => logoInput.click());
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "btn-ghost btn-sm";
    clear.style.marginTop = "0";
    clear.textContent = "Remove";
    clear.style.display = state.logoDataUrl ? "" : "none";
    clear.addEventListener("click", () => {
      state.logoDataUrl = null;
      row.remove();
      renderAll();
      addLogoRow();
    });
    row.appendChild(btn);
    row.appendChild(clear);
    s.appendChild(row);
  };
  if (!SCHOOL_CONFIG.logo) addLogoRow();
  logoInput.addEventListener("change", () => {
    const f = logoInput.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      state.logoDataUrl = reader.result;
      renderAll();
    };
    reader.readAsDataURL(f);
  });
}

function readFile(f) {
  if (!/\.(csv|txt)$/i.test(f.name) && f.type !== "text/csv" && f.type !== "text/plain") {
    showUploadError("Please choose a .csv file.");
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    const { text, note } = decodeCsvBuffer(reader.result);
    handleCsvText(text, f.name, note);
  };
  reader.onerror = () => showUploadError("Could not read that file.");
  /* Read bytes, not text: only the raw bytes tell us which encoding the
   * spreadsheet used. */
  reader.readAsArrayBuffer(f);
}

/* =====================================================================
 *  Sample CSV template used by the "Load sample" button.
 *  Swap these out for real pupils — nothing is ever sent anywhere.
 * ===================================================================== */
const SAMPLE_CSV = [
  "First Name,Last Name,Class/Form,Subject,Year Group,Colour",
  "Aarav,Patel,7A,Mathematics,Year 7,Blue",
  "Mia,Thompson,7A,Mathematics,Year 7,Orange",
  "Oliver,Smith,7B,English,Year 7,Green",
  "Isabella,Rossi,7B,English,Year 7,Purple",
  "Noah,Williams,8A,Science,Year 8,Red",
  "Amelia,Brown,8A,Science,Year 8,Teal",
  "Leo,Garcia,8B,History,Year 8,Pink",
  "Sophia,Jones,8B,History,Year 8,Blue",
  "Lucas,Miller,9A,Geography,Year 9,Orange",
  "Ava,Wilson,9A,Geography,Year 9,Green",
  "Ethan,Davis,9B,Art,Year 9,Brown",
  "Sofia,Martin,9B,Art,Year 9,Purple",
  "Mason,Thomas,10A,French,Year 10,Red",
  "Grace,Anderson,10A,French,Year 10,Teal",
  "Jacob,White,10B,Computing,Year 10,Pink",
  "Lily,Harris,10B,Computing,Year 10,Blue",
].join("\n");

/* =====================================================================
 *  Init
 * ===================================================================== */
document.addEventListener("DOMContentLoaded", () => {
  setupBranding();
  renderTemplateList();
  renderMapping();
  renderAll();
  initEvents();
});