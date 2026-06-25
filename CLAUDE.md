# CLAUDE.md

Guidance for AI assistants (Claude Code) working in this repository.

## What this repo is

A self-contained, static training-assessment quiz for **承鋆生醫 (MedicalTek)**'s new-hire
onboarding ("MDTK 新人教育訓練驗收測驗"). There is no build system, package manager, server,
or test suite — the entire product is two standalone HTML files that open directly in a
browser or get printed to paper.

- `mdtk_student_quiz_v3.html` — the student-facing quiz. Click bubbles to answer; no
  correct/wrong feedback is shown. Has a sticky toolbar with a progress bar, a "clear all
  answers" button, and a print button.
- `mdtk_answer_sheet_v4.html` — the teacher/answer-key version. Same question content, but
  marks the correct option (`.correct-opt` / `.ac.correct`) and adds an explanation block
  (`.exp-block`) under each question. Has a legend explaining the color coding. No
  interactive answer-picking JS (it's a reference document, not something a student fills in).
- `README.md` — just the repo name, effectively empty.

The student and answer-sheet files are **independent copies**, not generated from a shared
source. Editing a question's text, options, or correct answer must be done **in both files**
to keep them in sync.

## File anatomy (important: lines are extremely long)

Both HTML files are essentially one-line-per-section documents:
- A `<style>` block (a few hundred lines, one CSS rule per line).
- Inline base64 PNG logos in `<img src="data:image/png;base64,...">` — do not try to read
  these visually; treat them as opaque binary blobs.
- The entire `<body>` of questions/sessions is typically a **single very long line**
  (100K+ characters) inside `.wrap`. Reading the whole file with the normal file-read tool
  will fail or be truncated — use targeted `grep -oP`/`sed -n '<N>p'` extraction instead of
  trying to read the file top-to-bottom.
- The student quiz's interactive logic is a small inline `<script>` block, also on one line.

## Quiz data model (as encoded in the HTML)

- The quiz is organized into 7 **sessions** (`<section class="session" id="s1">` … `id="s7"`),
  each corresponding to a training module, e.g.:
  1. 公司 & 產品定位
  2. 產品原理 × 接線操作
  3. 競爭對手分析：規格對比 & ADR 競品
  4. 3D Clinical Applications
  5. 醫師行為 & 醫院行政
  6. Selling Skill × 展覽接觸技巧
  7. 國內業務：報價 × 出貨 × 跟刀報告
- Each session has a `.sref` line citing the source training materials it's drawn from, and
  some sessions carry a version `<span class="badge">vN</span>` indicating which revision of
  that session's questions is in use.
- Total question count is hardcoded as `TOTAL=70` in the student quiz's script — if the
  number of questions changes, update this constant and the `/ 70 題` label/answer-table
  column count to match.
- Each question is a `.qcard` with a stable id `qcard_<sessionIndex>_<questionIndexInSession>`
  (0-based), containing a `.qhdr` (question number/text) and `.opts` (a `.opt-row` per choice,
  each with a lettered `.bubble` A/B/C…).
- `data-si` / `data-qi` / `data-oi` attributes on each `.bubble` encode session index, question
  index, and option index — these indices drive both the click handler and the answer-summary
  table (`#ac_<sessionId>_<qi>` cells in `.ans-tbl`).
- In the answer sheet, the correct option's `.opt-row` gets class `correct-opt`, and the
  matching summary-table cell gets class `correct`; an `.exp-block` with `.exp-label`/`.exp-text`
  follows the options to explain the right answer.

## Student quiz JS (`mdtk_student_quiz_v3.html`, inline `<script>`)

Plain vanilla JS, no dependencies, no persistence (state is in-memory only — refreshing the
page clears all answers):
- `pick(el)` — toggles a bubble: selecting deselects any prior choice for that question;
  clicking the same bubble again clears the answer. Updates the answer-summary table via
  `syncCell`.
- `syncCell(si, qi, oi)` — writes the selected letter (or blank) into the corresponding cell
  of the answer-summary table at the top of the page.
- `updateProgress()` — recomputes "已作答 X / 70 題" and the percentage progress bar from
  `Object.keys(sel).length`.
- `clearAll()` — confirms, then wipes all selections, bubble highlighting, and summary cells.
- Printing is just `window.print()`; print-specific layout (page breaks per session,
  hiding the toolbar, forcing background colors) lives in the `@media print` CSS block.

## Conventions to follow when editing

- **Keep it dependency-free.** No build tooling, frameworks, or external CDN assets should be
  introduced — these files are meant to be opened by double-clicking or printed directly.
- **Preserve the single-file deliverable model.** Don't split CSS/JS into separate files;
  everything must stay inline so the HTML is portable as a standalone document.
- **Mirror changes across both files.** Any edit to question wording, options, option order,
  or correct answers in the student quiz must be replicated in the answer sheet (and vice
  versa for explanation text), since there is no shared template.
- **Update `TOTAL` and answer-table headers together** if you add/remove questions or sessions.
- **Versioning via badges**: when a session's question set changes meaningfully, bump (or add)
  its `<span class="badge">vN</span>` in both files, matching the filename version convention
  already used (`_v3` for the student quiz, `_v4` for the answer sheet — these version numbers
  track the *file's* overall revision, while per-session badges track that session's revision).
- **Content language is Traditional Chinese (zh-TW)** with embedded English product/technical
  terms (e.g. product model numbers, competitor brand names) — keep this mixed-language style
  consistent when adding content.
- **Print layout matters.** This document is regularly printed as a physical answer sheet, so
  any structural change should be sanity-checked against the `@media print` rules (page breaks
  per session/cover/instructions, `qcard { page-break-inside: avoid }`, forced background
  colors via `-webkit-print-color-adjust:exact`).

## Working with these files efficiently

- Don't attempt to `Read` the whole HTML file at once — the body content is one giant line and
  will exceed normal tool limits. Use `grep -n`, `grep -oP`, or `sed -n '<line>p' | head -c N`
  to pull out the section you need (e.g. a specific `qcard_<si>_<qi>` block).
- To find a specific question, search for its `id="qcard_<si>_<qi>"` or for unique substrings
  of the question text.
- There is no test suite, linter, or CI — verification is manual: open the file in a browser
  (or via Playwright if needed) and click through the toolbar buttons, or use `window.print()`
  preview to check pagination.
