// router.js: plain hash routing (#/dashboard, #/roadmap, #/viewer/<id>?page=3 ...).
// Each page module exports render(container, { param, query }) and may return a cleanup function.

let routes = {};
let container = null;
let cleanup = null;
let onChange = () => {};

export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#\/?/, '');
  const [pathPart, queryPart = ''] = raw.split('?');
  const [name = '', param = ''] = pathPart.split('/');
  return { name: name || 'dashboard', param: decodeURIComponent(param), query: new URLSearchParams(queryPart) };
}

async function render() {
  const { name, param, query } = parseHash();
  const page = routes[name];
  if (!page) {
    location.hash = '#/dashboard';
    return;
  }
  if (typeof cleanup === 'function') {
    try {
      cleanup();
    } catch (err) {
      console.error(err);
    }
  }
  cleanup = null;
  onChange(name);
  container.innerHTML = '';
  container.scrollTop = 0;
  window.scrollTo(0, 0);
  try {
    cleanup = await page.render(container, { param, query });
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="page"><div class="alert alert-error" role="alert">Something went wrong while loading this page. Try reloading. (${String(err.message).replace(/</g, '&lt;')})</div></div>`;
  }
  // Move focus to the page heading for screen-reader and keyboard users.
  const heading = container.querySelector('h1');
  if (heading) {
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
  }
}

export function startRouter(target, routeTable, changed) {
  container = target;
  routes = routeTable;
  onChange = changed || onChange;
  window.addEventListener('hashchange', render);
  render();
}

export function navigate(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

// Re-render the current page (after data changes).
export function refresh() {
  render();
}
