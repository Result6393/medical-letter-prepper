# Project notes

Letter Builder: tick-box clinic letters that run entirely in the browser. Mirrors the setup of `Result6393/Theatre-list-prepper-v2` (Vite + TypeScript, single-file build, shared settings sync).

## Privacy (most important)
This app exists because patient data must never go to an AI service or an outside server.
- **Never read, copy or commit real patient letters.** The folder above this repo holds anonymised samples; treat them as private. Do not copy sentences containing identifying details (names, dates of birth, rare histories, places) into phrases, tests or docs.
- **No real names anywhere** in code, tests, README, comments or commit messages: not patients, doctors, consultants or the user's own name and provider number. Those live only in user settings. Use invented names ("Dr A Example", "Smith").
- Patient fields are never stored: no `localStorage`, no network, no URL parameters. Only settings (and `letter-builder.prefs`, which holds clinic / type / consultant id) are saved.
- Before every push, scan the tree and new commits for names taken from the samples. Keep that name list outside the repo.

- **The letterhead is private too.** The hospital letterhead (logos, address) and the user's settings file live outside this repo, in the folder above. Never copy the logos, address, or a `.docx` into the repo. The app only ever receives the letterhead from the user at run time (`src/docx.ts`), strips its body text on load, and stores it in `localStorage` under `letter-builder.templates`, one per hospital (not synced: they are larger than the sync server's limit). Hospital names live in settings, not in code.
- **Screenshots are patient data.** A pasted patient banner is read in the page (`src/ocr.ts`, engine and language data built in, no network) and then dropped. Never store it, log it, or add a real screenshot to the repo or tests; tests use invented banner text.

## Phrases
- Stock phrases are in `src/phrases.ts`. Tokens are documented at the top of that file and filled in by `src/letter.ts`. Add a token in both places and in the "known tokens" test.
- Phrases must be neutral wording a clinician would reuse, not a copy of one patient's letter.

## Settings and sync
- Settings shape lives in `src/settings.ts`. Changing it in a way old saved settings can't read is a major version bump; adding optional fields is fine because `importSettings` fills defaults.
- `src/sync.js` and `src/sync.d.ts` are identical copies of the canonical files in `Result6393/Result6393.github.io` (`settings/`). Copy changes across, never edit here. App name on the sync server is `letter-builder`; the server allows only `https://result6393.github.io` and 64 KB per app.

## Versioning and release
Bump `package.json` version with every pushed change (patch for fixes, minor for features, major for breaking saved settings). Merging to `main` deploys GitHub Pages and publishes `letter-builder-vX.Y.Z.html` as a release (workflows in `.github/`).
