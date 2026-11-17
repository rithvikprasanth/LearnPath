# LearnPath progress

## Phases
- [x] Phase 0: Setup (done)
- [x] Phase 1: Core planner (done)
- [x] Phase 2: Study (done)
- [x] Phase 3: Overview (done)
- [x] Phase 4: Finish (done; one real AI call + live Vercel check still waiting on .env / deploy)

## Last pushed commit
Phase 4: polish pass and final README (see git log)

## Decisions (small choices made without asking)
- Commit author for this repo only: Rithvik Prasanth <223428936+rithvikprasanth@users.noreply.github.com>. No Co-Authored-By lines.
- Node 26 is installed at C:\Program Files\nodejs (the agent shell needs PATH refreshed to find it).
- Easy-to-read font option uses Atkinson Hyperlegible (free, via @fontsource), served locally.
- vendor files: pdfjs-dist 6.5 (pdf.min.mjs + worker), chart.js 4.6 UMD, Inter 400-700, Atkinson 400/700.
- vercel.json: `outputDirectory: public`, `functions.api/ai.js.maxDuration: 60`.
- OpenRouter models (re-checked 2026-11-17 with the live API): nvidia/nemotron-3.5-super-vl:free (main, fastest reliable JSON), google/gemma-4-31b-it:free, google/gemma-4-26b-a4b-it:free. All have non-mandatory reasoning.

- Roadmap: server validates and retries once on bad JSON; the browser retries automatically up to 3 tries on busy/slow/bad answers (retries do not count toward the daily limit). No sample plan: on failure the student clicks Try again (sample-plan.js removed at the user's request; a fake plan is not acceptable for the demo). Roadmaps are English-only (language choice removed from the form).
- AI_MOCK=1 in .env makes /api/ai return canned data (local testing only, saves the free quota).
- OpenRouter request: `models` = up to 3 ids from OPENROUTER_MODELS (only ids ending in ":free"), `reasoning: { enabled: false }` (thinking off: ~2x faster, no truncated JSON), `max_tokens: 6000`. "openrouter/free" is no longer added (it routed to tiny models that returned empty answers).
- Daily AI limit (15 per browser) counts requests that reach the AI; bad_request / no_key do not count.
- Pomodoro: skipping a focus session logs it as "partial" if at least 1 minute was studied; it does not count toward the 4-cycle set.
- Viewer: last page + zoom saved in settings key `reader:<materialId>` so page turns never rewrite the PDF Blob.
- Dwell tracking adds real elapsed time every 500 ms (capped at 2 s per tick, only while the tab is visible); a page completes at 5 s.
- PDF.js 6: documents are closed with `pdf.loadingTask.destroy()` (there is no `pdf.destroy()` in v6).
- Pages with under 20 characters of text are treated as scanned: no AI call, friendly message.
- Starting a focus block launches one normal Pomodoro focus session for its topic; the block is marked done when that session completes (or by hand in the block details).
- Planned blocks whose end time has passed are marked "missed" when the Focus Blocks page opens.
- Streak = consecutive days (ending today or yesterday) with a focus session or a completed page.
- Export = all stores except `materials` (PDFs); Import replaces those stores and keeps PDFs.
- Roadmap form limits: 1-25 hours/week and 1-25 weeks (about half a year), at the user's request. Values are checked while typing (too-high/invalid shows a message at once; empty is flagged on Generate) and are never changed silently. Fields start empty with placeholders. A 52-week test took 43 s (too close to the 55 s limit), so 25 weeks is the safe maximum.
- CLAUDE.md and .claude/ are not committed (they're the local brief, not app code).

## Known issues
- Free models can still be busy at peak times; the app retries automatically and then asks the student to try again.
- Vercel env var OPENROUTER_MODELS must match .env (third model changed from ERNIE to gemma-4-26b-a4b-it).
- Playwright is not installed, so the 1280px checks were done in the Claude desktop browser pane instead.
- Viewer toolbar is narrow at 1280px, so long PDF names are cut off with "..." (full name in the tooltip).

## Next step
1. User creates .env (OPENROUTER_API_KEY + free OPENROUTER_MODELS) -> restart `npm run dev` -> run ONE real roadmap + ONE explain call to confirm the free models answer in the right shape.
2. Friend imports the repo on Vercel and adds the two env vars -> check the live link.
