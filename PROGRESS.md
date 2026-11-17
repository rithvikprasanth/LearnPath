# LearnPath progress

## Phases
- [x] Phase 0: Setup (in progress → see last commit)
- [ ] Phase 1: Core planner (not started)
- [ ] Phase 2: Study (not started)
- [ ] Phase 3: Overview (not started)
- [ ] Phase 4: Finish (not started)

## Last pushed commit
(none yet)

## Decisions (small choices made without asking)
- Commit author for this repo only: Rithvik Prasanth <223428936+rithvikprasanth@users.noreply.github.com>. No Co-Authored-By lines.
- Node 26 is installed at C:\Program Files\nodejs (the agent shell needs PATH refreshed to find it).
- Easy-to-read font option uses Atkinson Hyperlegible (free, via @fontsource), served locally.
- vendor files: pdfjs-dist 6.5 (pdf.min.mjs + worker), chart.js 4.6 UMD, Inter 400-700, Atkinson 400/700.
- vercel.json: `outputDirectory: public`, `functions.api/ai.js.maxDuration: 60`.
- OpenRouter free-model check (2026-11-17): the public models API returned an unusual short list with no ":free" models, so the free list could not be verified. Models come from OPENROUTER_MODELS; the code always appends "openrouter/free" as the last fallback. User should check https://openrouter.ai/models?max_price=0 and set OPENROUTER_MODELS.

## Known issues
- none yet

## Next step
Phase 0 commit + first push.
