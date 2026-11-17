// Dashboard: overall progress, focus stats, streak, per-week and per-material progress,
// weekly focus chart, upcoming focus blocks, quiz average and AI requests left.
import { getAll, getAllByIndex, get } from '../db.js';
import { getActivePath, pathProgress } from '../progress.js';
import { aiRequestsLeft, DAILY_LIMIT } from '../ai-client.js';
import { barChart, focusMinutesByDay, startOfWeek, addDays } from '../charts.js';
import { icon } from '../icons.js';
import { esc, ring, progressBar, emptyState, formatMinutes, dateKey, clampPct, skeleton, $ } from '../ui.js';

export async function render(root) {
  root.innerHTML = `<div class="page">${header()}<div class="grid-3"><div class="card">${skeleton(4)}</div><div class="card">${skeleton(4)}</div><div class="card">${skeleton(4)}</div></div></div>`;

  const path = await getActivePath();
  const prog = path ? await pathProgress(path.id) : null;
  const byDay = await focusMinutesByDay();
  const today = dateKey();
  const weekStart = startOfWeek();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const weekMinutes = weekDays.reduce((sum, d) => sum + (byDay[dateKey(d)] || 0), 0);
  const streak = await studyStreak(byDay);
  const quizzes = await getAll('quiz_attempts');
  const quizAvg = quizzes.length ? (quizzes.reduce((s, q) => s + q.score / q.total, 0) / quizzes.length) * 100 : null;
  const aiLeft = await aiRequestsLeft();
  const upcoming = await upcomingBlocks();

  const stats = [
    ['clock', 'Focus today', formatMinutes(byDay[today] || 0), 'From Pomodoro sessions'],
    ['timer', 'Focus this week', formatMinutes(weekMinutes), 'Monday to Sunday'],
    ['flame', 'Study streak', `${streak} ${streak === 1 ? 'day' : 'days'}`, streak ? 'Keep it going!' : 'Study today to start one'],
    ['quiz', 'Quiz average', quizAvg === null ? 'n/a' : `${Math.round(quizAvg)}%`, `${quizzes.length} quiz${quizzes.length === 1 ? '' : 'zes'} taken`],
    ['sparkles', 'AI requests left', `${aiLeft} / ${DAILY_LIMIT}`, 'Resets every day'],
    ['file', 'Pages read', String(prog ? await pagesRead(prog.materials) : 0), prog ? `${prog.materials.length} PDF${prog.materials.length === 1 ? '' : 's'} in this roadmap` : 'Upload PDFs to track'],
  ];

  root.innerHTML = `<div class="page">
    ${header(path)}
    <div class="stack-lg">
      <div class="dash-hero">
        <section class="card dash-ring-card" aria-label="Overall progress">
          ${ring({ size: 180, stroke: 14, percent: prog?.overall || 0, label: `Overall progress ${clampPct(prog?.overall || 0)} percent`, center: `<div class="ring-value">${clampPct(prog?.overall || 0)}%</div><div class="xs muted">overall</div>` })}
          ${path
            ? `<div class="stack-sm"><p class="small strong">${esc(path.title)}</p><p class="xs muted">${prog.topics.filter((t) => t.done).length} of ${prog.topics.length} topics checked</p></div>`
            : `<a class="btn btn-primary btn-sm" href="#/roadmap">${icon('plus')}Create a roadmap</a>`}
        </section>
        <div class="grid-3">
          ${stats.map(([ic, label, value, sub]) => `<div class="card card-tight stat">
            <span class="stat-label">${icon(ic, ic === 'flame' && streak ? 'streak-flame' : '')}${label}</span>
            <span class="stat-value">${esc(value)}</span>
            <span class="stat-sub">${esc(sub)}</span>
          </div>`).join('')}
        </div>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-header"><h2>Progress by week</h2>${path ? `<a class="small" href="#/roadmap">Open roadmap</a>` : ''}</div>
          ${prog && prog.weeks.length
            ? `<div class="week-bars">${prog.weeks.map((w) => progressBar({ label: `Week ${w.week}: ${w.title}`, percent: w.percent })).join('')}</div>`
            : emptyState({ iconName: 'map', title: 'No roadmap yet', text: 'Create a roadmap to see your weekly progress here.' })}
        </section>
        <section class="card">
          <div class="card-header"><h2>Focus hours this week</h2><span class="badge badge-accent">${formatMinutes(weekMinutes)}</span></div>
          <div class="chart-box"><canvas id="dash-chart"></canvas></div>
        </section>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-header"><h2>Study material</h2><a class="small" href="#/materials">All material</a></div>
          ${prog && prog.materials.length
            ? `<div class="stack">${prog.materials.map((m) => `<a class="material-link" href="#/viewer/${m.id}">${progressBar({ label: m.name, percent: prog.materialPct.get(m.id), small: true })}</a>`).join('')}</div>`
            : emptyState({ iconName: 'book', title: 'No PDFs yet', text: 'Upload a PDF to a topic and your reading progress shows here.' })}
        </section>
        <section class="card">
          <div class="card-header"><h2>Upcoming focus blocks</h2><a class="small" href="#/blocks">Plan blocks</a></div>
          ${upcoming.length
            ? `<ul class="list">${upcoming.map((b) => `<li class="list-item">
                <span class="badge badge-accent">${icon('calendar')}${esc(b.when)}</span>
                <span class="grow small">${esc(b.topic)}</span>
                <span class="xs muted nowrap">${b.duration} min</span>
              </li>`).join('')}</ul>`
            : emptyState({ iconName: 'calendar', title: 'Nothing planned', text: 'Plan focus blocks to build a steady study routine.' })}
        </section>
      </div>
    </div>
  </div>`;

  const page = root.firstElementChild;
  const labels = weekDays.map((d) => d.toLocaleDateString([], { weekday: 'short' }));
  const values = weekDays.map((d) => Math.round(((byDay[dateKey(d)] || 0) / 60) * 10) / 10);
  let chart = barChart($('#dash-chart', page), labels, values, { unit: 'h', label: 'Focus hours this week' });

  // Redraw the chart in the new colors when the theme changes.
  const onTheme = () => {
    chart?.destroy();
    chart = barChart($('#dash-chart', page), labels, values, { unit: 'h', label: 'Focus hours this week' });
  };
  window.addEventListener('theme-changed', onTheme);
  return () => {
    chart?.destroy();
    window.removeEventListener('theme-changed', onTheme);
  };
}

function header(path) {
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  return `<header class="page-header">
    <div><h1>${hello}</h1><p>${path ? `Active roadmap: ${esc(path.title)}` : 'Welcome to LearnPath. Start by creating a roadmap.'}</p></div>
    <div class="page-actions">
      <a class="btn btn-secondary" href="#/materials">${icon('book')}Read</a>
      <a class="btn btn-primary" href="#/pomodoro">${icon('play')}Start focusing</a>
    </div>
  </header>`;
}

// Days in a row (ending today, or yesterday if today has no study yet) with study activity:
// a focus session or a page read.
async function studyStreak(byDay) {
  const days = new Set(Object.keys(byDay).filter((d) => byDay[d] > 0));
  (await getAll('page_progress')).filter((r) => r.completed).forEach((r) => days.add(dateKey(r.visitedAt)));
  let streak = 0;
  let d = new Date();
  if (!days.has(dateKey(d))) d = addDays(d, -1);
  while (days.has(dateKey(d))) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}

async function pagesRead(materials) {
  let count = 0;
  for (const m of materials) count += (await getAllByIndex('page_progress', 'materialId', m.id)).filter((r) => r.completed).length;
  return count;
}

async function upcomingBlocks() {
  // Planned blocks that have not ended yet.
  const blocks = (await getAll('focus_blocks'))
    .filter((b) => b.status === 'planned' && new Date(`${b.date}T${b.start}`).getTime() + b.duration * 60000 >= Date.now())
    .sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`))
    .slice(0, 5);
  return Promise.all(
    blocks.map(async (b) => {
      const topic = b.topicId ? await get('topics', b.topicId) : null;
      const day = b.date === dateKey() ? 'Today' : new Date(`${b.date}T00:00`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
      return { when: `${day} ${b.start}`, topic: topic?.title || 'Free study', duration: b.duration };
    })
  );
}
