// Study Material page: upload PDFs (to a roadmap topic, or as general reading with no topic)
// and see reading progress per file.
import { getAll, getAllByIndex, put, del, delByIndex, get, uid } from '../db.js';
import { getActivePath, materialPercent } from '../progress.js';
import { openPdf, looksLikePdf, closePdf } from '../pdf-loader.js';
import { navigate, refresh } from '../router.js';
import { icon } from '../icons.js';
import { esc, toast, progressBar, emptyState, confirmModal, formatBytes, setLoading, skeleton, $ } from '../ui.js';

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

export async function render(root, { query }) {
  root.innerHTML = `<div class="page">${header()}<div class="card">${skeleton(4)}</div></div>`;
  // A topic link (from any roadmap) opens that topic's roadmap; otherwise use the active one.
  const linkedTopic = query.get('topic') ? await get('topics', query.get('topic')) : null;
  // No roadmap is needed: without one, every PDF is general reading.
  const path = linkedTopic ? await get('paths', linkedTopic.pathId) : await getActivePath();

  const topics = path ? (await getAllByIndex('topics', 'pathId', path.id)).sort((a, b) => a.week - b.week || a.order - b.order) : [];
  const topicFilter = query.get('topic') || '';
  // This roadmap's PDFs plus the general ones (no topic). General PDFs have no pathId,
  // so they are not in the pathId index; read them from the full list.
  const roadmapMaterials = path ? await getAllByIndex('materials', 'pathId', path.id) : [];
  const generalMaterials = (await getAll('materials')).filter((m) => !m.topicId);
  let materials = [...roadmapMaterials, ...generalMaterials].sort((a, b) => b.createdAt - a.createdAt);
  if (topicFilter) materials = materials.filter((m) => m.topicId === topicFilter);
  const percents = await Promise.all(materials.map((m) => materialPercent(m)));
  const lastPages = await Promise.all(materials.map(async (m) => (await get('settings', `reader:${m.id}`))?.value?.lastPage || 1));
  const topicName = (id) => (id ? topics.find((t) => t.id === id)?.title || 'Unknown topic' : 'General reading');

  const weeks = [...new Set(topics.map((t) => t.week))];
  const topicOptions = weeks
    .map((w) => `<optgroup label="Week ${w}">${topics.filter((t) => t.week === w).map((t) => `<option value="${t.id}" ${t.id === topicFilter ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</optgroup>`)
    .join('');

  root.innerHTML = `<div class="page">
    ${header()}
    <div class="stack-lg">
      <section class="card stack" aria-labelledby="upload-title">
        <div class="row-between">
          <h2 id="upload-title">Upload a PDF</h2>
          <span class="badge">${icon('lock')}Stored only in this browser</span>
        </div>
        <div class="grid-3">
          <div class="field">
            <label class="label" for="up-topic">Topic <span class="label-hint">(optional)</span></label>
            <select class="select" id="up-topic">
              <option value="" ${topicFilter ? '' : 'selected'}>No topic (general reading)</option>
              ${topicOptions}
            </select>
            <span class="hint">${path ? 'Link it to a topic to count it in your roadmap progress.' : 'Create a roadmap to link PDFs to topics.'}</span>
          </div>
          <div class="span-2">
            <label class="dropzone" id="dropzone" for="up-file">
              ${icon('upload')}
              <span class="dropzone-title">Click to choose a PDF, or drop it here</span>
              <span class="xs">PDF only, up to 20 MB. PowerPoint? Save it as PDF first.</span>
              <input type="file" id="up-file" class="sr-only" accept=".pdf,application/pdf,.ppt,.pptx">
            </label>
          </div>
        </div>
        <div id="upload-status" aria-live="polite"></div>
      </section>

      <section class="stack" aria-labelledby="mat-title">
        <div class="row-between">
          <h2 id="mat-title">${topicFilter ? `Material for "${esc(topicName(topicFilter))}"` : 'All material'}</h2>
          ${topicFilter ? `<a class="btn btn-ghost btn-sm" href="#/materials">Show all</a>` : ''}
        </div>
        ${materials.length
          ? `<div class="material-grid">${materials.map((m, i) => materialCard(m, percents[i], topicName(m.topicId), lastPages[i])).join('')}</div>`
          : emptyState({ iconName: 'file', title: 'No PDFs yet', text: 'Upload your notes, textbook chapters or slides (as PDF). Pages count as read after 5 seconds on the page.' })}
      </section>
    </div>
  </div>`;

  const page = root.firstElementChild;
  const fileInput = $('#up-file', page);
  const dropzone = $('#dropzone', page);

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0], $('#up-topic', page).value, path?.id, page);
    fileInput.value = '';
  });
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('is-over');
  });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file, $('#up-topic', page).value, path?.id, page);
  });

  page.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-delete]');
    if (!btn) return;
    const m = await get('materials', btn.dataset.delete);
    const ok = await confirmModal({ title: 'Delete this PDF?', message: `"${m.name}" and its reading progress will be removed from this browser.`, confirmLabel: 'Delete', danger: true });
    if (!ok) return;
    await delByIndex('page_progress', 'materialId', m.id);
    await del('settings', `reader:${m.id}`);
    await del('materials', m.id);
    toast('PDF deleted.', 'success');
    refresh();
  });
}

function header() {
  return `<header class="page-header"><div><h1>Study Material</h1><p>Read your PDFs inside LearnPath. Progress is counted from pages you really read.</p></div></header>`;
}

function materialCard(m, pct, topicTitle, lastPage) {
  return `<article class="card material-card card-interactive">
    <div class="row">
      <div class="file-icon">${icon('file')}</div>
      <div class="grow">
        <h3 class="material-name">${esc(m.name)}</h3>
        <p class="xs muted">${esc(topicTitle)} · ${m.totalPages} ${m.totalPages === 1 ? 'page' : 'pages'} · ${formatBytes(m.size)}</p>
      </div>
    </div>
    ${progressBar({ label: `Page ${lastPage} of ${m.totalPages}`, percent: pct, small: true })}
    <div class="row">
      <a class="btn btn-primary btn-sm grow" href="#/viewer/${m.id}">${icon('book')}${pct > 0 ? 'Continue reading' : 'Start reading'}</a>
      <button class="btn btn-ghost btn-sm btn-icon" data-delete="${m.id}" aria-label="Delete ${esc(m.name)}">${icon('trash')}</button>
    </div>
  </article>`;
}

async function handleFile(file, topicId, pathId, page) {
  const status = $('#upload-status', page);
  const name = file.name || 'file';
  const ext = name.split('.').pop().toLowerCase();

  if (ext === 'ppt' || ext === 'pptx') {
    status.innerHTML = `<div class="alert alert-warning" role="alert">${icon('alert')}<div><strong>PowerPoint files can't be opened here.</strong> Save it as PDF in PowerPoint or Google Slides (File -> Download -> PDF), then upload.</div></div>`;
    return;
  }
  if (ext !== 'pdf' && file.type !== 'application/pdf') {
    status.innerHTML = `<div class="alert alert-error" role="alert">${icon('alert')}<div>Only PDF files can be uploaded. "${esc(name)}" is not a PDF.</div></div>`;
    return;
  }
  if (file.size > MAX_BYTES) {
    status.innerHTML = `<div class="alert alert-error" role="alert">${icon('alert')}<div>This PDF is ${formatBytes(file.size)}. The limit is 20 MB. Try splitting or compressing it.</div></div>`;
    return;
  }

  status.innerHTML = `<div class="alert" role="status">${icon('upload')}<div>Reading "${esc(name)}"...</div></div>`;
  try {
    if (!(await looksLikePdf(file))) throw new Error('not-pdf');
    const pdf = await openPdf(file);
    const totalPages = pdf.numPages;
    closePdf(pdf);
    const blob = new Blob([await file.arrayBuffer()], { type: 'application/pdf' });
    const id = uid();
    // No topic = general reading: topicId and pathId stay null, so it never counts toward a roadmap.
    await put('materials', { id, topicId: topicId || null, pathId: topicId ? pathId : null, name, size: file.size, type: 'application/pdf', blob, totalPages, createdAt: Date.now() });
    toast(`"${name}" added (${totalPages} pages).`, 'success');
    navigate(`#/viewer/${id}`);
  } catch (err) {
    console.error(err);
    const quota = err?.name === 'QuotaExceededError';
    const msg = quota
      ? 'Your browser storage is full. Delete some old PDFs and try again.'
      : err?.name === 'PasswordException'
        ? 'This PDF is password-protected. Remove the password and upload it again.'
        : 'This file could not be opened as a PDF. It may be damaged.';
    status.innerHTML = `<div class="alert alert-error" role="alert">${icon('alert')}<div>${msg}</div></div>`;
  }
}
