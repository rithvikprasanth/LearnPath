// Copies the few library files the browser needs from node_modules into public/vendor.
// Run with: npm run vendor  (the copied files are committed, so Vercel needs no build step)
import { copyFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'vendor');
mkdirSync(join(out, 'fonts'), { recursive: true });

const files = [
  ['pdfjs-dist/build/pdf.min.mjs', 'pdf.min.mjs'],
  ['pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs'],
  ['chart.js/dist/chart.umd.min.js', 'chart.umd.min.js'],
  ['@fontsource/inter/files/inter-latin-400-normal.woff2', 'fonts/inter-400.woff2'],
  ['@fontsource/inter/files/inter-latin-500-normal.woff2', 'fonts/inter-500.woff2'],
  ['@fontsource/inter/files/inter-latin-600-normal.woff2', 'fonts/inter-600.woff2'],
  ['@fontsource/inter/files/inter-latin-700-normal.woff2', 'fonts/inter-700.woff2'],
  ['@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-400-normal.woff2', 'fonts/atkinson-400.woff2'],
  ['@fontsource/atkinson-hyperlegible/files/atkinson-hyperlegible-latin-700-normal.woff2', 'fonts/atkinson-700.woff2'],
];

for (const [from, to] of files) {
  copyFileSync(join(root, 'node_modules', from), join(out, to));
  console.log('copied', to);
}
