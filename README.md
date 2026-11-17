# LearnPath

A free, private, AI-powered study planner for students. Enter a goal and LearnPath builds a week-by-week roadmap. You can then study with a Pomodoro timer, read your PDFs inside the app, and get simple AI explanations and quizzes. All your study data stays in your own browser.

> The full README (features, societal impact, how the AI is "taught", demo flow) is written in Phase 4.

## Run locally

1. Install Node.js 18 or newer.
2. `npm install`
3. Copy `.env.example` to `.env` and paste your OpenRouter key into it (never commit `.env`).
4. `npm run dev`, then open http://localhost:3000

## Deploy on Vercel (free Hobby plan, done once)

1. The **owner of the GitHub repo** signs in at [vercel.com](https://vercel.com) with GitHub (Hobby plan, free).
2. **Add New → Project → Import** the `LearnPath` repository.
3. Framework preset: **Other**. Build command: leave empty. Output directory: **public**.
4. **Environment Variables**: add `OPENROUTER_API_KEY` (your key from openrouter.ai → Keys) and `OPENROUTER_MODELS` (comma-separated free model IDs, for example `model-one:free,model-two:free,openrouter/free`).
5. Click **Deploy**. After that, every push to `main` redeploys automatically.
