# LearnPath

**A free, private, AI-powered study planner.** A student types a goal ("Class 12 Physics: Electrostatics"), their level, hours per week and number of weeks. LearnPath builds a week-by-week roadmap. The student can then:

- study with a Pomodoro timer and planned focus blocks
- read their own PDFs inside the app
- get simple AI explanations and quizzes for any page
- watch an honest completion percentage based on pages they really read

No login, no accounts, no payment. Everything a student saves stays in **their own browser**.

## Societal impact

LearnPath is built for students who can't afford paid coaching or study apps, especially first-generation learners and students in smaller towns.

- **Free for a limited time.** No subscription, no ads, no payment and no sign-up right now. Just open the link. Hosting (Vercel Hobby) and AI (OpenRouter free models) cost nothing. A paid plan may be added later: `public/js/plan.js` has a `paywallEnabled` switch (off) kept ready for it.
- **Private by design.** There are no accounts and no database of students. PDFs and progress are stored only in the student's browser (IndexedDB). Only the text of **one page** is sent to the AI, and only when the student clicks an AI button.
- **Regional languages.** Study Buddy explanations and quizzes can be requested in English, Hindi, Tamil, Telugu, Kannada, Malayalam, Bengali or Marathi. Roadmaps are always made in English, because free models are only reliable in English for long structured plans.
- **Accessible.** "Read aloud" (browser text-to-speech), an easy-to-read font option (Atkinson Hyperlegible, designed for low-vision readers and helpful for many dyslexic readers), a large-text option, full keyboard use, visible focus and WCAG AA contrast in light and dark themes.
- **Low data use.** Light pages, no frameworks, no CDNs, and AI answers are cached so the same page is never sent twice.
- **Honest progress.** A page counts as read only after 5 seconds on it, so skipping through a PDF doesn't fake progress. This builds real study habits.

## Features

| Area | What it does |
|---|---|
| **AI roadmap** | Form (goal, level, 1-25 hours/week, 1-25 weeks; checked as you type) → the AI returns strict JSON (weeks → topics), always in English. It's validated, with one server retry if the JSON is bad. While it works, a timer shows progress. If the free AI is busy or slow, the app **retries automatically** (up to 3 tries; only the first counts toward the daily limit). It never makes a fake plan: if every try fails, the student sees why and clicks **Try again**. You can keep several roadmaps (one is "active"). |
| **Pomodoro** | **The student sets every length** right on the Pomodoro page (focus 1-120 min, short and long break 1-60 min, long break after 2-8 sessions), with quick presets (25/5, 45/10, 50/10, 90/20) and checks while typing. It starts at 25/5/15. Time is computed from timestamps, so it never drifts and it survives tab sleep and page refresh. Start, pause, resume, skip, reset and auto-start, with a sound and browser notification at the end of each phase. Every focus session is logged to a roadmap topic. |
| **Focus blocks** | Plan blocks by date, start time, duration and topic. Day and week views, with planned/done/missed status. **Start** launches the Pomodoro for that topic. Includes a weekly focus-hours chart. |
| **Study viewer** | Upload a PDF to a topic, or with **no topic** as general reading (no roadmap needed). PDF only, max 20 MB, stored in the browser. General PDFs track their own reading % but don't count toward a roadmap. The PDF.js viewer has page navigation, zoom, keyboard shortcuts and resumes at your last page. A page completes after 5 s of reading, and a page map shows what's done. |
| **Progress roll-up** | Material % = completed pages / total pages. That rolls up to topic %, then week %, then overall %. |
| **AI Study Buddy** | Works on the current page's text. **Explain simply** gives about 5 plain-language bullets. **Quiz me** gives 3 multiple-choice cards and saves your score. **Read aloud** speaks the explanation. Scanned pages with no text are detected and never sent. |
| **Dashboard** | Overall % ring, focus today and this week, streak, per-week %, per-material %, quiz average, AI requests left and upcoming blocks. |
| **Settings** | Pomodoro durations, dark theme, AI language, easy-to-read font, large text, export/import JSON backup, reset all data, storage used and an About card. |

PowerPoint files are not supported (they can't be converted on free hosting). The app tells students to save as PDF first (File → Download → PDF).

## Tech stack (all free)

- **Frontend:** plain HTML, one `styles.css` with design tokens, and vanilla JavaScript ES modules. No framework and no build step.
- **Backend:** one Vercel serverless function, `api/ai.js` (Node.js, built-in `fetch`). No server database.
- **Storage:** IndexedDB in the browser (`public/js/db.js`). `localStorage` only holds the theme and the running timer.
- **Libraries** (installed with npm and copied to `public/vendor` by `npm run vendor`): `pdfjs-dist` (PDF rendering), `chart.js` (charts), `@fontsource/inter` and `@fontsource/atkinson-hyperlegible` (fonts).
- **AI:** OpenRouter free models (IDs ending in `:free`) through its OpenAI-compatible chat API.

See [API.md](API.md) for the IndexedDB stores and the `/api/ai` request/response contract.

## How the AI is "taught" (without training)

We do **not** train or fine-tune a model. That isn't possible for free, and it isn't needed. Instead, we teach the model with carefully written prompts in [`api/prompts.js`](api/prompts.js):

1. **A clear system prompt per action** (`roadmap`, `explain`, `quiz`) that sets its role, the rules (for example "exactly 3 questions, 4 options each") and the language to answer in.
2. **The exact output shape** we want, such as the JSON structure for roadmaps and quizzes.
3. **One worked example** (a "few-shot" example): a short sample input and the perfect answer for it, shown to the model before the real request. Models copy the pattern they see.

Then the server **checks** every answer. It pulls out the JSON, validates every field and asks the model once more if the shape is wrong. The browser checks again and uses a safe fallback if needed.

Free-tier safety:
- The function only accepts the 3 actions and the 8 languages, and caps the input at 4,000 characters. It is **not** a general proxy.
- The OpenRouter key lives only in a server environment variable. It is never in the browser and never committed.
- Each browser can make 50 AI requests per day ("48 of 50 AI requests left today"), and the student can reset the count in **Settings → AI language → Reset usage**. Answers are cached in IndexedDB. The real cap is OpenRouter's free tier (50 requests/day for the whole account, shared by every visitor).
- A list of up to 3 free fallback models (`OPENROUTER_MODELS`) is tried in order if one is busy. "Thinking" (reasoning) is turned off, which makes answers about twice as fast and stops long plans from being cut off.
- If the AI fails or hits the rate limit (429), students see a friendly message and the rest of the app keeps working.

## Environment variables

| Name | Example | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | `sk-or-...` | From openrouter.ai → Keys (free account). Never commit it. |
| `OPENROUTER_MODELS` | `nvidia/nemotron-3.5-super-vl:free,google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free` | Up to 3 free model IDs (ending in `:free`), comma-separated, in priority order. Pick models whose reasoning is **not mandatory** (the function turns thinking off, and mandatory-reasoning models reject that). Check https://openrouter.ai/models?max_price=0 (the list changes often). |
| `AI_MOCK` | `1` | Optional, **local testing only**: returns sample AI answers without calling OpenRouter. |

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env      # Windows: copy .env.example .env
# open .env and paste your OpenRouter key + free model IDs
npm run dev               # http://localhost:3000
```

Other scripts:
- `npm run smoke` runs a quick API check (bad action, too-long input, missing key, mock answers) without any real AI calls.
- `npm run vendor` copies the library files from `node_modules` into `public/vendor`. These files are committed, so Vercel needs no build.

## Deploy on Vercel (free Hobby plan, done once)

1. The **owner of the GitHub repo** signs in at [vercel.com](https://vercel.com) with GitHub (Hobby plan, free). A collaborator usually can't connect someone else's repo, so the owner does this.
2. **Add New → Project → Import** the `LearnPath` repository.
3. Framework preset: **Other**. Build command: leave empty. Output directory: **public**.
4. **Environment Variables:** add `OPENROUTER_API_KEY` and `OPENROUTER_MODELS`.
5. Click **Deploy**. After that, every push to `main` redeploys automatically.

`vercel.json` sets the output directory and gives `api/ai.js` a 60-second maximum duration. The function itself stops waiting for OpenRouter after 55 seconds.

## Demo flow (about 5 minutes)

1. **Roadmap → New roadmap.** Goal "Learn Python basics", Beginner, 5 h/week, 3 weeks → **Generate**. Show the weekly trail and check off one topic. The week node fills and the % goes up.
2. Click **Study** on a topic. The Pomodoro starts for that topic. Show the ring, the session dots, pause/resume, and the mini timer in the sidebar. Refresh the page: the timer keeps the right time.
3. **Study Material.** Upload a PDF to a topic (or with no topic, as general reading). In the viewer, stay on a page for 5 seconds and watch it turn green in the page map. Flip quickly through other pages and see they don't count.
4. **Explain simply** on a text page, then **Read aloud**. Click **Quiz me**, answer the 3 cards and see the score saved.
5. **Focus Blocks.** Add a block for later today, then open Week view. Click **Start**: it opens the Pomodoro linked to that block.
6. **Dashboard.** Show the overall ring, focus minutes, streak, per-week bars, the focus chart, quiz average and AI requests left.
7. **Settings.** Switch on dark theme, the easy-to-read font and large text. Show Export and the About card.

## Project structure

```
api/ai.js            Vercel function: validation, OpenRouter call, retries, friendly errors
api/prompts.js       the "teaching" prompts and few-shot examples
public/index.html    app shell (sidebar + main)
public/styles.css    design tokens + all components
public/js/           db, router, timer, AI client, progress roll-up, UI components, pages/
public/vendor/       pdf.js, chart.js, fonts (copied by npm run vendor)
dev-server.js        local server: static files + POST /api/ai
tests/smoke.js       quick API smoke test
```
