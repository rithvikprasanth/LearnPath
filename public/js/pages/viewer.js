// Viewer page (placeholder: built in Phase 2).
import { emptyState } from '../ui.js';

export function render(root) {
  root.innerHTML = `<div class="page">
    <header class="page-header"><div><h1>Viewer</h1></div></header>
    ${emptyState({ iconName: 'info', title: 'Coming soon', text: 'This page is built in a later phase.' })}
  </div>`;
}
