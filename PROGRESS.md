# LearnPath progress

## Phases
- [x] Phase 0: Setup (done)
- [x] Phase 1: Core planner (done)
- [ ] Phase 2: Study (not started)
- [ ] Phase 3: Overview (not started)
- [ ] Phase 4: Finish (not started)

## Last pushed commit
Phase 1: Core planner (see git log)

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
- CLAUDE.md and .claude/ are not committed (they're the local brief, not app code).

## Known issues
- none yet

## Next step
Phase 2: PDF upload + PDF.js viewer + page tracking + Study Buddy.
