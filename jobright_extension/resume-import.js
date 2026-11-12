/* Local resume extraction using mammoth (DOCX) + pdf.js (PDF). No remote calls. */
(function (root) {
  'use strict';
  const MAX_BYTES = 10 * 1024 * 1024;
  const clean = value => String(value).replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();

  // Simple structured text converter for JSON resumes
  function structuredText(value, path = '') {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return `${path ? path + ': ' : ''}${value}`;
    if (Array.isArray(value)) return value.map(item => structuredText(item, path)).filter(Boolean).join('\n');
    if (typeof value === 'object') return Object.entries(value).map(([key, item]) => structuredText(item, path ? `${path} / ${key}` : key)).filter(Boolean).join('\n');
    return '';
  }

  // DOCX parsing via mammoth
  async function wordText(bytes) {
    try {
      // mammoth is bundled - available as global from bundle
      const mammoth = root.mammoth;
      if (!mammoth) throw new Error('mammoth not loaded');
      const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      const result = await mammoth.extractRawText({ arrayBuffer });
      const text = clean(result.value);
      if (!text || !/[\p{L}\p{N}]/u.test(text)) throw new Error('No readable text in DOCX');
      return text;
    } catch (err) {
      const msg = err?.message || String(err);
      if (msg.includes('Paste') || msg.includes('paste')) throw err;
      throw new Error('This DOCX could not be read. Paste your resume text or upload another copy.');
    }
  }

  // PDF parsing via pdf.js
  let pdfLibraryPromise;
  async function pdfText(bytes) {
    let task;
    try {
      if (!pdfLibraryPromise) {
        // Load pdf.js from vendor (copied by build)
        const pdfjsUrl = root.chrome?.runtime?.getURL('vendor/pdf.min.mjs');
        if (!pdfjsUrl) throw new Error('Extension PDF parser unavailable');
        pdfLibraryPromise = import(pdfjsUrl).then(library => {
          library.GlobalWorkerOptions.workerSrc = root.chrome.runtime.getURL('vendor/pdf.worker.min.mjs');
          return library;
        });
      }
      const library = await pdfLibraryPromise;
      task = library.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true, stopAtErrors: true });
      const document = await task.promise;
      const pages = [];
      for (let index = 1; index <= document.numPages; index++) {
        const page = await document.getPage(index);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim());
        page.cleanup();
      }
      const text = clean(pages.join('\n\n'));
      if (!/[\p{L}\p{N}]/u.test(text)) throw new Error('No readable text');
      return text;
    } catch (err) {
      throw new Error('This PDF could not be read or contains scanned images. Paste your resume text, or upload a text-based PDF or DOCX.');
    } finally {
      if (task) await task.destroy().catch(() => {});
    }
  }

  async function extract(file) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Choose a resume file first.');
    if (file.size > MAX_BYTES) throw new Error('Resume files must be 10 MB or smaller.');
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (!['txt', 'md', 'json', 'pdf', 'docx'].includes(extension)) throw new Error('Supported resume files: TXT, MD, JSON, PDF, and DOCX.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error('Resume files must be 10 MB or smaller.');
    let text;
    if (extension === 'pdf') text = await pdfText(bytes);
    else if (extension === 'docx') text = await wordText(bytes);
    else {
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new Error('This file is not readable UTF-8 text. Paste your resume text.'); }
      if (extension === 'json') {
        try { text = structuredText(JSON.parse(text)); } catch { throw new Error('Invalid resume JSON. Upload valid JSON or paste your resume text.'); }
      }
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('This file contains binary data. Paste your resume text.');
    }
    text = clean(text);
    if (!text || !/[\p{L}\p{N}]/u.test(text)) throw new Error('No readable resume text was found. Paste your resume text or choose another file.');
    return { text };
  }

  root.NextkinResumeImport = Object.freeze({ extract });
})(globalThis);