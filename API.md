# LearnPath: data model and API contract

All study data lives in the browser (IndexedDB database `learnpath`, version 1). There are no users and no server database.

## IndexedDB object stores

| Store | Key | Indexes | Fields |
|---|---|---|---|
| `paths` | `id` | none | `id, title, goal, level, hoursPerWeek, weeks, language, weekInfo[{week,title,focus}], active (bool), source ('ai' or 'sample'), createdAt` |
| `topics` | `id` | `pathId` | `id, pathId, week, order, title, description, estHours, done (bool), doneAt` |
| `materials` | `id` | `topicId`, `pathId` | `id, topicId, pathId, name, size, type, blob (PDF Blob), totalPages, createdAt` |
| `page_progress` | `id` (`materialId:page`) | `materialId` | `id, materialId, page, seconds, completed (bool, after 5 s dwell), visitedAt` |
| `pomodoro_sessions` | `id` | `topicId`, `startedAt` | `id, topicId, pathId, blockId, phase ('focus'), startedAt, endedAt, minutes, completed (bool)` |
| `focus_blocks` | `id` | `date` | `id, date ('YYYY-MM-DD'), start ('HH:MM'), duration (min), topicId, status ('planned','done','missed'), createdAt` |
| `quiz_attempts` | `id` | `topicId` | `id, topicId, materialId, page, score, total, createdAt` |
| `ai_cache` | `key` | none | `key (action+language+input hash), action, language, data, createdAt` |
| `settings` | `key` | none | `key, value`. Keys: `pomodoro`, `language`, `a11y`, `aiUsage {date, count}`, `reader:<materialId> {lastPage, zoom}` (kept apart so page turns never rewrite the PDF Blob) |

`localStorage` holds only `lp-theme` and `lp-pomodoro` (the running timer state).

Progress roll-up: material % = completed pages / total pages. Topic % = 100 if checked done, else the average of its materials (0 if none). Week % = average topic %. Overall % = average topic % of the active roadmap.

## `POST /api/ai`

Request (JSON):

```json
{ "action": "roadmap | explain | quiz", "language": "en", "input": "string, max 4000 chars" }
```

- `language`: one of `en, hi, ta, te, kn, ml, bn, mr`.
- `input`: for `roadmap`, a short text with goal, level, hours/week and weeks. For `explain` and `quiz`, the text of one PDF page.

Success `200`:

```json
{ "ok": true, "action": "explain", "model": "provider/model:free", "data": { } }
```

| action | `data` shape |
|---|---|
| `roadmap` | `{ "title": "...", "weeks": [ { "week": 1, "title": "...", "focus": "...", "topics": [ { "title": "...", "description": "...", "estHours": 3 } ] } ] }` |
| `explain` | `{ "bullets": ["...", "..."] }` (about 5) |
| `quiz` | `{ "questions": [ { "question": "...", "options": ["a","b","c","d"], "correct": 0, "explanation": "..." } ] }` (3) |

Errors: `{ "ok": false, "error": "<code>", "message": "friendly text" }`

| status | error | when |
|---|---|---|
| 400 | `bad_request` | invalid JSON, unknown action, bad language, empty or too-long input |
| 405 | `method_not_allowed` | not a POST |
| 429 | `rate_limited` | OpenRouter free limit reached |
| 500 | `no_key` | `OPENROUTER_API_KEY` is not set |
| 502 | `bad_output` | model reply was not valid JSON after one retry |
| 502 | `upstream` | OpenRouter error |
| 504 | `timeout` | no reply within 55 s |
