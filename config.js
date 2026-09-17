/*****************************************************************************
 *  SCHOOL BRANDING & SETTINGS  –  EDIT THIS FILE
 *
 *  This is the only place school-specific information goes.
 *  Everything here appears on the labels and in the page header/footer.
 *  Because this tool is fully client-side, nothing here ever leaves a
 *  school device. See README.md for the GDPR notes.
 *****************************************************************************/

const SCHOOL_CONFIG = {
  /* ------------------------------------------------------------------
   *  1. TOOL TITLE & SCHOOL BRANDING
   * ---------------------------------------------------------------- */
  appTitle: "Label Maker for Schools", // Shown in the page header / tab title
  schoolName: "My School Name",          // Full school name printed on each label
  shortName: "My School",                // Used where there is less space
  logoText: "ALM",                       // 2-4 letter monogram shown if no logo image is set

  /* School crest / logo.
   * OPTION A – upload later from the page (easiest, per-session only).
   * OPTION B – drop a file called 'assets/school-logo.png' in this repo
   *            and set this to "assets/school-logo.png". It is loaded
   *            from the same location as the app, so no data is sent
   *            anywhere else. */
  logo: "",                              // e.g. "assets/school-logo.png"  (leave "" to use monogram)

  /* Brand colours – used for the accent bar on each label. */
  primaryColor: "#1d4ed8",               // Main accent colour (hex)
  printTextColor: "#ffffff",             // Text colour printed ON the accent colour
  accentColor: "#93c5fd",                // Secondary / highlight colour

  /* ------------------------------------------------------------------
   *  2. WHAT APPEARS ON EACH LABEL (toggles + defaults)
   * ---------------------------------------------------------------- */
  label: {
    showSchoolNameTop: true,             // Small school name strip at the top of the label
    showClassName: true,                 // e.g. "7A"
    showSubject: true,                   // e.g. "Mathematics"
    showYearGroup: true,                 // e.g. "Year 7"
    showPupilName: true,                 // The pupil name is always processed; this only
                                         // controls whether it is drawn on the label.
    showClassLabel: "Class:",            // Prefix text before the class name ("" = none)
  },

  /* ------------------------------------------------------------------
   *  3. DEFAULT LABEL LAYOUT / PRINTER DEFAULTS
   * ---------------------------------------------------------------- */
  defaultTemplate: "L7160",              // Default code: L7160, L7161, L7162,
                                         // L7163, L7171 or L4780

  /* PRINT CALIBRATION (millimetres).
   * Every sheet is positioned to the exact label-sheet geometry, but some
   * printers / browsers quietly add their own top and side margins.
   * Test on plain paper first: measure how far the dashed boxes sit
   * from the right position on the real sheet, then enter the offset
   * here. Negative y moves everything UP, negative x moves LEFT.
   * Leave as 0,0 if the test print lines up. */
  printCalibration: { x: 0, y: 0 },

  defaultFont: "Arial, Helvetica, sans-serif",
  defaultTextColor: "#111827",

  /* ------------------------------------------------------------------
   *  4. FOOTER / EXTRA TEXT
   * ---------------------------------------------------------------- */
  footerLine: "Label Maker for Schools — free, open source, GDPR-friendly",
  contactEmail: "",                      // Shown on the footer line if set, e.g. "admin@school.org"

  /* ------------------------------------------------------------------
   *  5. CSV COLUMN AUTO-DETECTION
   * ---------------------------------------------------------------- */
  /* These are the column names (case-insensitive, trimmed) the tool
   * looks for in your CSV so it can pre-fill the field mapping for you. */
  columnAliases: {
    pupilName: ["name", "student", "pupil", "student name", "pupil name", "child", "full name"],
    firstName: ["first name", "firstname", "forename", "given name", "first name(s)"],
    lastName:  ["last name", "lastname", "surname", "family name", "second name", "lname"],
    className: ["class", "form", "class/form", "form group", "class name", "tutor group"],
    subject:   ["subject", "lesson", "area", "subject name"],
    yearGroup: ["year", "year group", "yeargroup", "school year", "key stage"],
    school:    ["school", "school name", "academy", "establishment"],
    custom:    ["custom", "other", "extra", "note"],
  },
};