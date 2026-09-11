# 🏷️ Avery Label Maker for Schools

A free, open-source, **GDPR-friendly** web tool that turns a simple pupil CSV into ready-to-print Avery label sheets — perfect for name &amp; subject stickers on workbooks.

Everything runs **in your browser**. Upload a CSV, choose your Avery sheet, click **Print / Save as PDF**.

---

## ✨ Features

- **Upload a CSV** (drag & drop or browse) — names, class, subject, year group, school
- **5 popular Avery templates**: L7160, L7163, J8160, L4780, L7169
- **Accurate millimetre geometry** — label origins + pitch from the open glabels data set, printed at 100%
- **Preview on screen**, then **Print / Save as PDF** straight from the browser
- **Customisable schooling branding** via a single config file (logo, colours, school name)
- **Three label layouts**: Classic, Badge, Minimal
- **Fully offline** — all libraries vendored, no CDN, no tracking, no analytics

---

## 🚀 Hosting on GitHub Pages

1. Create a GitHub repository (e.g. `label-maker`).
2. Push these files to the `main` branch:
   ```
   index.html
   styles.css
   app.js
   config.js
   lib/papaparse.min.js
   sample-pupils.csv
   README.md
   ```
3. In the repo go to **Settings → Pages**.
4. Under *Build and deployment*, set **Source** to *Deploy from a branch*, choose `main` / root, and **Save**.
5. Your tool is live at `https://<username>.github.io/<repo>/` — share it with any school.

> All processing is client-side, so it works identically whether hosted or opened as a local file (`index.html` double-click).

---

## 🏫 Customising for your school

Edit **`config.js`** — the single file that controls branding:

| Setting | What it does |
|---|---|
| `schoolName` / `shortName` | Shown in the header and on the school strip of each label |
| `logoText` | 2–4 letter monogram shown if no logo image is set |
| `logo` | Optional logo: `"assets/school-logo.png"` placed in the repo, or leave `""` and upload per-session from the page |
| `primaryColor` / `printTextColor` / `accentColor` | Brand colours used for the label accent bar |
| `label.*` | Which fields show on labels (school strip, class, subject, year, prefixes) |
| `defaultTemplate` | Which Avery sheet is selected by default |
| `columnAliases` | Column headers to auto-detect in uploaded CSVs |

All colours, fonts and layout tools live in `styles.css` if you want deeper redesign.

---

## 📄 CSV format

Plain exported CSV (Excel/Google Sheets → *Save as / Export as .csv*). Header row optional but recommended:

```csv
Pupil Name,Class/Form,Subject,Year Group
Aarav Patel,7A,Mathematics,Year 7
Mia Thompson,7A,Mathematics,Year 7
```

- Column names are auto-detected (see `columnAliases`); you can re-map them manually in the page.
- Empty pupil names are skipped by default.
- A `sample-pupils.csv` is included; the page's **Load sample CSV** button uses the same data.

---

## 🖨️ Printing & PDF

1. Click **Print / Save as PDF**.
2. In the print dialog choose **Save as PDF** (destination).
3. Set **Paper size**: A4, **Margins**: None, **Scale**: 100% / Actual size, **Background graphics**: On.
4. For physical label sheets, run one test print with **dashed alignment guides** on, hold the sheet against the light, and verify the dotted outlines sit on the label edges.

> Browser print scaling ("Fit to page") is the number one cause of misalignment — keep it at **100%**.

---

## 🔒 GDPR & privacy

This tool is designed to be safe for pupil data:

- **No server, no database, no analytics.** Your CSV never leaves the device — there is no upload endpoint to send it to.
- All parsing, rendering and PDF creation happen in the browser.
- The only external code is the vendored, local copy of [Papa Parse](https://www.papaparse.com/) (MIT licence) in `lib/`.
- No cookies, no local storage of pupil data, no tracking pixels.
- Suggested privacy-policy wording for your school website:

> *“Our label maker processes pupil-provided information entirely within the visitor's own browser. Files are not uploaded to, stored by, or transmitted to any server. The tool uses no cookies and no analytics. Users are advised to dispose of printed labels containing personal data appropriately and to handle pupil lists in line with our [school] data-protection policy.”*

> ⚠️ **Recommendation:** only include the fields needed on the label (name, class, subject). Avoid Special Category data (e.g. medical or SEND details) entirely. Check with your Data Protection Officer / GDPR lead before first use in your school.

---

## 📁 Project structure

```
├── index.html              # Single-page UI
├── styles.css              # Screen + print (exact A4 @100%) styles
├── app.js                  # Logic: CSV → mapping → sheets → print
├── config.js               # ⭐ School branding & defaults (edit this)
├── sample-pupils.csv       # Example data
├── lib/papaparse.min.js    # Vendored CSV parser (offline)
└── README.md
```

---

## ✔️ Avery template geometry (A4, verified)

| Code | Grid | Labels/sheet | Label size | Notes |
|---|---|---|---|---|
| L7160 | 3 × 7 | 21 | 63.99 × 38.1 mm | Address labels |
| L7163 | 2 × 7 | 14 | 99.09 × 38.1 mm | Wide address / shipping |
| J8160 | 3 × 7 | 21 | 63.99 × 38.1 mm | Inkjet, same geometry as L7160 |
| L4780 | 4 × 10 | 40 | 48.5 × 25.4 mm | Multipurpose mini labels |
| L7169 | 2 × 2 | 4 | 99.09 × 138.99 mm | Large parcel labels |

---

## 🛠️ Licence

MIT — use it, fork it, share it with every school that wants it.