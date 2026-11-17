// Focus Blocks: plan study time (date, start, duration, topic), see it by day or week,
// and start a block to launch the Pomodoro for that topic.
import { getAll, put, del, get, getAllByIndex, uid } from '../db.js';
import { getActivePath } from '../progress.js';
import { startFocusFor } from '../timer.js';
import { barChart, focusMinutesByDay, startOfWeek, addDays } from '../charts.js';
import { navigate, refresh } from '../router.js';
import { icon } from '../icons.js';
import { esc, openModal, confirmModal, toast, emptyState, dateKey, formatMinutes, $ } from '../ui.js';

const STATUS_BADGE = { planned: 'badge-accent', done: 'badge-success', missed: 'badge-warning' };
const STATUS_LABEL = { planned: 'Planned', done: 'Done', missed: 'Missed' };

export async function render(root, { query }) {
  const view = query.get('view') === 'day' ? 'day' : 'week';
  const focusDate = query.get('date') ? new Date(`${query.get('date')}T00:00`) : new Date();
  const path = await getActivePath();
  const topics = path ? (await getAllByIndex('topics', 'pathId', path.id)).sort((a, b) => a.week - b.week || a.order - b.order) : [];
  const allTopics = new Map((await getAll('topics')).map((t) => [t.id, t]));

  // Blocks whose time has passed without being done become "missed".
  const blocks = await markMissed(await getAll('focus_blocks'));

  const weekStart = startOfWeek(focusDate);
  const days = view === 'week' ? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)) : [focusDate];
  const dayKeys = days.map((d) => dateKey(d));
  const visible = blocks.filter((b) => dayKeys.includes(b.date)).sort((a, b) => `${a.date}${a.start}`.localeCompare(`${b.date}${b.start}`));
  const plannedMin = visible.reduce((s, b) => s + b.duration, 0);
  const doneMin = visible.filter((b) => b.status === 'done').reduce((s, b) => s + b.duration, 0);
  const byDay = await focusMinutesByDay();
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  const step = view === 'week' ? 7 : 1;
  const rangeLabel = view === 'week'
    ? `${weekStart.toLocaleDateString([], { day: 'numeric', month: 'short' })} to ${addDays(weekStart, 6).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })}`
    : focusDate.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
  const link = (date, v = view) => `#/blocks?view=${v}&date=${dateKey(date)}`;
  const topicTitle = (id) => allTopics.get(id)?.title || 'Free study';

  root.innerHTML = `<div class="page">
    <header class="page-header">
      <div><h1>Focus Blocks</h1><p>Plan when you will study. Start a block to begin a Pomodoro for its topic.</p></div>
      <div class="page-actions"><button class="btn btn-primary" data-new>${icon('plus')}New block</button></div>
    </header>

    <div class="row-between toolbar-row">
      <div class="tabs" role="tablist" aria-label="View">
        <a class="tab" role="tab" href="${link(focusDate, 'day')}" aria-selected="${view === 'day'}">Day</a>
        <a class="tab" role="tab" href="${link(focusDate, 'week')}" aria-selected="${view === 'week'}">Week</a>
      </div>
      <div class="row">
        <a class="btn btn-ghost btn-icon btn-sm" href="${link(addDays(focusDate, -step))}" aria-label="Previous ${view}">${icon('chevronLeft')}</a>
        <span class="small strong nowrap">${esc(rangeLabel)}</span>
        <a class="btn btn-ghost btn-icon btn-sm" href="${link(addDays(focusDate, step))}" aria-label="Next ${view}">${icon('chevronRight')}</a>
        <a class="btn btn-secondary btn-sm" href="${link(new Date())}">Today</a>
      </div>
      <div class="row small muted"><span>${formatMinutes(plannedMin)} planned</span><span class="badge badge-success">${formatMinutes(doneMin)} done</span></div>
    </div>

    <div class="stack-lg">
      ${view === 'week' ? weekView(days, visible, topicTitle) : dayView(visible, topicTitle)}
      <section class="card">
        <div class="card-header"><h2>Focus hours (week of ${esc(weekStart.toLocaleDateString([], { day: 'numeric', month: 'short' }))})</h2>
          <span class="xs muted">From completed Pomodoro sessions</span></div>
        <div class="chart-box"><canvas id="blocks-chart"></canvas></div>
      </section>
    </div>
  </div>`;

  const page = root.firstElementChild;
  page.querySelector('[data-new]').addEventListener('click', () => openBlockForm({ date: dateKey(focusDate) }, topics));
  page.addEventListener('click', async (e) => {
    const target = e.target.closest('[data-block], [data-start], [data-add]');
    if (!target) return;
    if (target.dataset.add) return openBlockForm({ date: target.dataset.add }, topics);
    const block = await get('focus_blocks', target.dataset.block || target.dataset.start);
    if (!block) return;
    if (target.dataset.start) return startBlock(block);
    openBlockDetails(block, topics, topicTitle(block.topicId));
  });

  const labels = weekDays.map((d) => d.toLocaleDateString([], { weekday: 'short' }));
  const values = weekDays.map((d) => Math.round(((byDay[dateKey(d)] || 0) / 60) * 10) / 10);
  let chart = barChart($('#blocks-chart', page), labels, values, { unit: 'h', label: 'Focus hours' });
  const onTheme = () => {
    chart?.destroy();
    chart = barChart($('#blocks-chart', page), labels, values, { unit: 'h', label: 'Focus hours' });
  };
  window.addEventListener('theme-changed', onTheme);
  return () => {
    chart?.destroy();
    window.removeEventListener('theme-changed', onTheme);
  };
}

// ---------- views ----------
function weekView(days, blocks, topicTitle) {
  const today = dateKey();
  return `<div class="week-grid">${days
    .map((d) => {
      const key = dateKey(d);
      const dayBlocks = blocks.filter((b) => b.date === key);
      return `<section class="day-col ${key === today ? 'is-today' : ''}" aria-label="${d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}">
        <div class="day-head"><span class="day-name">${d.toLocaleDateString([], { weekday: 'short' })}</span><span class="day-num">${d.getDate()}</span></div>
        ${dayBlocks.map((b) => `<button class="block is-${b.status}" data-block="${b.id}">
            <span class="block-time">${b.start} · ${b.duration} min</span>
            <span>${esc(topicTitle(b.topicId))}</span>
            <span class="badge ${STATUS_BADGE[b.status]}">${STATUS_LABEL[b.status]}</span>
          </button>`).join('')}
        <button class="btn btn-ghost btn-sm" data-add="${key}" aria-label="Add a block on ${d.toLocaleDateString([], { weekday: 'long' })}">${icon('plus')}Add</button>
      </section>`;
    })
    .join('')}</div>`;
}

function dayView(blocks, topicTitle) {
  if (!blocks.length) {
    return emptyState({ iconName: 'calendar', title: 'No blocks this day', text: 'Add a focus block: pick a time, how long, and what you will study.' });
  }
  return `<div class="day-list">${blocks
    .map((b) => `<div class="block-row is-${b.status}">
      <span class="block-time">${b.start}</span>
      <div class="grow stack-sm">
        <span class="strong">${esc(topicTitle(b.topicId))}</span>
        <span class="xs muted">${b.duration} min</span>
      </div>
      <span class="badge ${STATUS_BADGE[b.status]}">${STATUS_LABEL[b.status]}</span>
      ${b.status === 'planned' ? `<button class="btn btn-primary btn-sm" data-start="${b.id}">${icon('play')}Start</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-block="${b.id}">${icon('edit')}Details</button>
    </div>`)
    .join('')}</div>`;
}

// ---------- actions ----------
async function markMissed(blocks) {
  const now = Date.now();
  for (const b of blocks) {
    const end = new Date(`${b.date}T${b.start}`).getTime() + b.duration * 60000;
    if (b.status === 'planned' && end < now) {
      b.status = 'missed';
      await put('focus_blocks', b);
    }
  }
  return blocks;
}

async function startBlock(block) {
  const topic = block.topicId ? await get('topics', block.topicId) : null;
  startFocusFor(block.topicId, topic?.pathId || null, block.id);
  toast('Focus block started. It is marked done when this focus session ends.', 'success');
  navigate('#/pomodoro');
}

function topicSelect(topics, selected) {
  const weeks = [...new Set(topics.map((t) => t.week))];
  return `<select class="select" id="bf-topic" name="topic"><option value="">Free study (no topic)</option>${weeks
    .map((w) => `<optgroup label="Week ${w}">${topics.filter((t) => t.week === w).map((t) => `<option value="${t.id}" ${t.id === selected ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</optgroup>`)
    .join('')}</select>`;
}

function openBlockForm(block, topics) {
  const isEdit = !!block.id;
  const nextHour = String(Math.min(23, new Date().getHours() + 1)).padStart(2, '0') + ':00';
  const body = `<form class="stack" id="block-form" novalidate>
    <div class="form-grid">
      <div class="field"><label class="label" for="bf-date">Date</label><input class="input" type="date" id="bf-date" name="date" value="${block.date || dateKey()}" required></div>
      <div class="field"><label class="label" for="bf-start">Start time</label><input class="input" type="time" id="bf-start" name="start" value="${block.start || nextHour}" required></div>
      <div class="field"><label class="label" for="bf-duration">Duration (minutes)</label><input class="input" type="number" id="bf-duration" name="duration" min="15" max="240" step="5" value="${block.duration || 50}" required></div>
      <div class="field"><label class="label" for="bf-topic">Topic</label>${topicSelect(topics, block.topicId)}</div>
    </div>
    <span class="field-error" id="bf-error" hidden></span>
  </form>`;

  openModal({
    title: isEdit ? 'Edit focus block' : 'New focus block',
    body,
    actions: [
      { label: 'Cancel', variant: 'secondary', value: null },
      {
        label: isEdit ? 'Save changes' : 'Add block',
        variant: 'primary',
        onClick: async (btn, el) => {
          const f = $('#block-form', el);
          const err = $('#bf-error', el);
          const duration = Number(f.duration.value);
          let msg = '';
          if (!f.date.value) msg = 'Pick a date.';
          else if (!f.start.value) msg = 'Pick a start time.';
          else if (!(duration >= 15 && duration <= 240)) msg = 'Duration must be between 15 and 240 minutes.';
          err.textContent = msg;
          err.hidden = !msg;
          if (msg) return false;
          const startsAt = new Date(`${f.date.value}T${f.start.value}`).getTime();
          const status = isEdit && block.status === 'done' ? 'done' : startsAt + duration * 60000 < Date.now() ? 'missed' : 'planned';
          await put('focus_blocks', {
            id: block.id || uid(),
            date: f.date.value,
            start: f.start.value,
            duration,
            topicId: f.topic.value || null,
            status,
            createdAt: block.createdAt || Date.now(),
          });
          toast(isEdit ? 'Block updated.' : 'Focus block added.', 'success');
          navigate(`#/blocks?view=${new URLSearchParams(location.hash.split('?')[1] || '').get('view') || 'week'}&date=${f.date.value}`);
          return true;
        },
      },
    ],
  });
}

function openBlockDetails(block, topics, topicName) {
  const when = new Date(`${block.date}T${block.start}`).toLocaleString([], { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
  const modal = openModal({
    title: 'Focus block',
    body: `<div class="stack">
      <div class="row"><span class="badge ${STATUS_BADGE[block.status]}">${STATUS_LABEL[block.status]}</span><span class="small">${esc(when)} · ${block.duration} min</span></div>
      <p class="strong">${esc(topicName)}</p>
      <div class="row wrap">
        ${block.status === 'planned' ? `<button class="btn btn-primary btn-sm" data-act="start">${icon('play')}Start now</button>` : ''}
        ${block.status !== 'done' ? `<button class="btn btn-secondary btn-sm" data-act="done">${icon('check')}Mark done</button>` : `<button class="btn btn-secondary btn-sm" data-act="planned">Mark as planned</button>`}
        <button class="btn btn-secondary btn-sm" data-act="edit">${icon('edit')}Edit</button>
        <button class="btn btn-ghost btn-sm" data-act="delete">${icon('trash')}Delete</button>
      </div>
    </div>`,
  });
  modal.el.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    modal.close();
    if (act === 'start') return startBlock(block);
    if (act === 'edit') return openBlockForm(block, topics);
    if (act === 'done' || act === 'planned') {
      await put('focus_blocks', { ...block, status: act });
      toast(act === 'done' ? 'Block marked done.' : 'Block set back to planned.', 'success');
      return refresh();
    }
    if (act === 'delete') {
      if (await confirmModal({ title: 'Delete this block?', message: 'This focus block will be removed.', confirmLabel: 'Delete', danger: true })) {
        await del('focus_blocks', block.id);
        toast('Block deleted.', 'success');
        refresh();
      }
    }
  });
}
