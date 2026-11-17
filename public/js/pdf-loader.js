// pdf-loader.js: loads PDF.js (from /vendor, no CDN) only when a PDF is actually needed.
let pdfjsPromise = null;

async function getPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('../vendor/pdf.min.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdf.worker.min.mjs', import.meta.url).href;
      return pdfjs;
    });
  }
  return pdfjsPromise;
}

// Open a PDF from a Blob/File. Returns the PDF.js document.
export async function openPdf(blob) {
  const pdfjs = await getPdfjs();
  // PDF.js moves the bytes to its worker, so give it its own copy.
  const data = new Uint8Array(await blob.arrayBuffer());
  return pdfjs.getDocument({ data }).promise;
}

// Close a document and free its worker memory (PDF.js 6: destroy lives on the loading task).
export function closePdf(pdf) {
  try {
    pdf?.loadingTask?.destroy();
  } catch {
    /* already closed */
  }
}

// Quick check: a real PDF file starts with "%PDF".
export async function looksLikePdf(file) {
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
  return String.fromCharCode(...head).startsWith('%PDF');
}

// Plain text of one page (for the Study Buddy). Empty string for scanned/image-only pages.
export async function pageText(page) {
  const content = await page.getTextContent();
  return content.items
    .map((item) => item.str || '')
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
