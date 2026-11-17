# LearnPath progress

## Phases
- [x] Phase 0: Setup (done)
- [x] Phase 1: Core planner (done)
- [x] Phase 2: Study (done)
- [x] Phase 3: Overview (done)
- [ ] Phase 4: Finish (not started)

## Last pushed commit
Phase 3: Dashboard, focus blocks, settings (see git log)

## Decisions (small choices made without asking)
- Commit author for this repo only: Rithvik Prasanth <223428936+rithvikprasanth@users.noreply.github.com>. No Co-Authored-By lines.
- Node 26 is installed at C:\Program Files\nodejs (the agent shell needs PATH refreshed to find it).
- Easy-to-read font option uses Atkinson Hyperlegible (free, via @fontsource), served locally.
- vendor files: pdfjs-dist 6.5 (pdf.min.mjs + worker), chart.js 4.6 UMD, Inter 400-700, Atkinson 400/700.
- vercel.json: `outputDirectory: public`, `functions.api/ai.js.maxDuration: 60`.
- OpenRouter free-model check (2026-11-17): the public models API returned an unusual short list with no ":free" models, so the free list could not be verified. Models come from OPENROUTER_MODELS; the code always appends "openrouter/free" as the last fallback. User should check https://openrouter.ai/models?max_price=0 and set OPENROUTER_MODELS.

- Server validates and retries once on bad JSON; the browser validates again and falls back to a sample plan (sample-plan.js).
- AI_MOCK=1 in .env makes /api/ai return canned data (local testing only, saves the free quota).
- OpenRouter `models` fallback list: first 2 models from OPENROUTER_MODELS + "openrouter/free" (kept to 3).
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
- CLAUDE.md and .claude/ are not committed (they're the local brief, not app code).

## Known issues
- Viewer toolbar is narrow at 1280px, so long PDF names are cut off with "..." (full name in the tooltip).

## Next step
Phase 4: polish pass, final README, one real AI test once .env exists, final push.
