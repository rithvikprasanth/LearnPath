// charts.js: one helper for every chart (chart.js from /vendor, loaded as window.Chart).
// Colors come from the CSS tokens so charts follow the light/dark theme.
import { dateKey } from './ui.js';
import { getAll } from './db.js';

function token(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Single-series bar chart (thin bars, rounded ends, quiet grid, hover tooltip).
 * Returns the Chart instance (call .destroy() when leaving the page).
 */
export function barChart(canvas, labels, values, { unit = 'h', label = 'Focus hours' } = {}) {
  if (!window.Chart) {
    canvas.replaceWith(Object.assign(document.createElement('p'), { className: 'small muted', textContent: 'Chart could not load.' }));
    return null;
  }
  // Text alternative for screen readers.
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', `${label}: ` + labels.map((l, i) => `${l} ${values[i]} ${unit}`).join(', '));

  const text = token('--text-muted');
  const grid = token('--border');
  return new window.Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label,
          data: values,
          backgroundColor: token('--accent'),
          hoverBackgroundColor: token('--accent-hover'),
          borderRadius: { topLeft: 4, topRight: 4 },
          borderSkipped: 'bottom',
          maxBarThickness: 28,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: token('--surface'),
          titleColor: token('--text'),
          bodyColor: token('--text'),
          borderColor: token('--border-strong'),
          borderWidth: 1,
          padding: 8,
          displayColors: false,
          callbacks: { label: (ctx) => `${ctx.parsed.y} ${unit}` },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { color: grid }, ticks: { color: text, font: { family: 'Inter' } } },
        y: {
          beginAtZero: true,
          grid: { color: grid },
          border: { display: false },
          ticks: { color: text, font: { family: 'Inter' }, precision: 1, maxTicksLimit: 5 },
        },
      },
    },
  });
}

// Focus minutes per local day: { 'YYYY-MM-DD': minutes }
export async function focusMinutesByDay() {
  const sessions = await getAll('pomodoro_sessions');
  const byDay = {};
  sessions.forEach((s) => {
    const d = dateKey(s.startedAt);
    byDay[d] = (byDay[d] || 0) + (s.minutes || 0);
  });
  return byDay;
}

// Monday of the week that contains `date`.
export function startOfWeek(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
