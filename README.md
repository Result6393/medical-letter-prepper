# Letter Builder

Build routine clinic letters from tick boxes, then copy them into Word, print them on letterhead, or paste them into PowerChart.

Everything runs in your browser. The app makes no network requests apart from settings sync, if you turn it on. Patient details typed into the page are never saved or sent: they disappear when you close or refresh the tab.

## Using it

1. Pick the **hospital** (if you have set up more than one), the **letter type** (routine review, discharge, referral / request, support / status) and the **clinic**. The clinic decides which phrases and drug suggestions you see.
2. Choose who it is **to**, and optionally add the patient's details: type them, or take a screenshot of the patient banner in the record system and paste it (Ctrl+V) to fill name, MRN and DOB. The picture is read inside the page by a built-in text reader, is never uploaded, and is not kept. Always check what it filled in. Leave them blank to print a gap for a sticker, with `PATIENT` standing in the body text.
3. Fill the **summary block**: diagnosis, visual acuity (type or pick), IOP, treatment (the drug picker adds lines), and the review interval. The interval feeds both the Plan line and the sentence “We will review him in 6 months' time”, so they can't disagree.
4. Tick the **stock phrases** in each section and add your own words in the box underneath. Pronouns (he / she / they) and the patient's name follow your choices.
5. Use the buttons above the preview:
   - **Download Word letter**: a finished `.docx` on the chosen hospital's letterhead, with the real header, footer and logos, always A4. The file is named by date only.
   - **Print / save PDF**: prints the letter on the chosen hospital's letterhead; choose "Save as PDF" in the print window to make a PDF. Untick "Print and PDF include the letterhead" to print the letter alone onto pre-printed paper (set the space to leave in Settings → Print & dates).
   - **Copy for Word**: formatted text to paste into a document yourself.
   - **Copy for PowerChart**: plain text only. Headings on their own line, everything left-aligned, no tables, bullets or symbols.
   - **Edit body text**: turns the body into a text box to edit by hand. Ticks then stop changing it until you discard your edits.

Anything still needing attention (`PATIENT`, or a `[bracketed]` prompt in a phrase) is highlighted in the preview and listed under the buttons. Printing warns if any are left.

## Settings

Open **Settings** to add your name, your hospitals (each with your provider number there),  consultants (with the lines that go under their name), recipients you write to often, extra drug suggestions, and to hide, reword or add phrases. These are saved in the browser as changes from the built-in lists.

- **Hospitals and letterheads:** add each hospital with your provider number there (it differs by site and is printed after your name for that hospital's letters), and load a Word file that has its letterhead (any letter on it will do). The text of the file you load is removed as it is read, and the page is set to A4. Letterheads stay in your browser, are all carried in the offline copy, are not synced, and are never part of this repository. Consultants are shared across hospitals: write `{hospital}` in a consultant's lines (e.g. `Consultant Ophthalmologist, {hospital}`) and it follows the hospital chosen for each letter.
- **Sync across devices:** sign in with your work settings sync password. This reuses the sync used by the other work apps (`src/sync.js` is an identical copy of the shared client in [Result6393.github.io](https://github.com/Result6393/Result6393.github.io)). Settings are encrypted in the browser before upload. It only works on the GitHub Pages version.
- **Export / import:** save the settings to a file and load them on another machine.
- **Which settings an offline copy uses:** each copy records when it was saved. Opened in a browser that already holds older settings (for example from an earlier copy), a newer copy replaces them with the settings and letterheads built into it. Opened again later, the browser's own settings win, so edits made inside the file are kept.
- **Offline copy with my settings:** downloads this page (named with the version, e.g. `letter-builder-v0.6.0-with-settings.html`) as one HTML file with your settings and every hospital's letterhead built in, for a computer where the web version is blocked. It contains your names, so keep it private.

## Privacy

- The built-in phrases and lists contain no real names. Consultant names, your name and provider number live only in your settings.
- `.gitignore` blocks Word, PDF, spreadsheet and settings files; CI fails if any are committed, or if real email addresses appear.
- Never commit sample letters or anything copied from a real patient letter. Tests use invented data.

## Development

```bash
npm install
npm run dev      # local dev server
npm test         # engine tests
npm run build    # single-file build in dist/index.html
```

`dist/index.html` is one self-contained file that also works opened straight from disk.

| File | What it does |
| --- | --- |
| `src/phrases.ts` | Built-in phrases, sections, clinics, drug and diagnosis suggestions |
| `src/letter.ts` | Fills pronoun and name tokens, builds the letter, plain and HTML output |
| `src/docx.ts` | Strips a loaded letterhead file, forces A4, fills it with a letter, reads its header and footer |
| `src/printhtml.ts` | Print / PDF page layouts, with or without the letterhead |
| `src/ocr.ts` | Offline text reader for screenshots (Tesseract, built into the page) |
| `src/patientheader.ts` | Finds name, MRN and DOB in the text of a patient banner |
| `src/settings.ts` | Settings shape, defaults, import / export, merging with the built-in phrases |
| `src/settings-view.ts` | The settings dialog |
| `src/main.ts` | The screen |
| `src/sync.js` | Shared sync client (keep identical to the canonical copy) |
