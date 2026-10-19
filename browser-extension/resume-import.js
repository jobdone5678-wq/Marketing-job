/* Local resume extraction. No uploads, remote libraries, or binary-to-text guesses. */
(function (root) {
  'use strict';
  const MAX_BYTES = 10 * 1024 * 1024;
  const WORD_NAMESPACE = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  let pdfLibrary;
  const clean = value => String(value).replace(/\r\n?/g, '\n').replace(/\u0000/g, '').trim();
  function structuredText(value, path = '') {
    if (value == null) return '';
    if (typeof value === 'string' || typeof value === 'number') return `${path ? path + ': ' : ''}${value}`;
    if (Array.isArray(value)) return value.map(item => structuredText(item, path)).filter(Boolean).join('\n');
    if (typeof value === 'object') return Object.entries(value).map(([key, item]) => structuredText(item, path ? `${path} / ${key}` : key)).filter(Boolean).join('\n');
    return '';
  }
  function checkRange(bytes, offset, size) {
    if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(size) || offset < 0 || size < 0 || offset + size > bytes.length) throw new Error('The DOCX file is damaged. Upload another copy or paste your resume text.');
  }
  async function wordText(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
      if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === bytes.length) { end = offset; break; }
    }
    if (end < 0) throw new Error('Invalid DOCX archive. Upload a valid DOCX or paste your resume text.');
    if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new Error('Multi-volume DOCX archives are unsupported. Paste your resume text.');
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    const directorySize = view.getUint32(end + 12, true);
    checkRange(bytes, offset, directorySize);
    for (let index = 0; index < count; index++) {
      checkRange(bytes, offset, 46);
      if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('Invalid DOCX directory. Paste your resume text.');
      const flags = view.getUint16(offset + 8, true), method = view.getUint16(offset + 10, true);
      const compressed = view.getUint32(offset + 20, true), expanded = view.getUint32(offset + 24, true);
      const nameLength = view.getUint16(offset + 28, true), extra = view.getUint16(offset + 30, true), comment = view.getUint16(offset + 32, true);
      checkRange(bytes, offset + 46, nameLength + extra + comment);
      const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      if (name === 'word/document.xml') {
        if (flags & 1) throw new Error('Encrypted DOCX files are unsupported. Paste your resume text.');
        if (expanded > 20 * 1024 * 1024) throw new Error('The DOCX text is too large. Paste the relevant resume text.');
        const local = view.getUint32(offset + 42, true);
        checkRange(bytes, local, 30);
        if (view.getUint32(local, true) !== 0x04034b50) throw new Error('Invalid DOCX document entry. Paste your resume text.');
        const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
        checkRange(bytes, start, compressed);
        let xmlBytes = bytes.subarray(start, start + compressed);
        if (method === 8) {
          const reader = new Blob([xmlBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
          const chunks = []; let size = 0;
          try {
            while (true) {
              const item = await reader.read(); if (item.done) break;
              size += item.value.length;
              if (size > 20 * 1024 * 1024) { await reader.cancel(); throw new Error('The DOCX text is too large. Paste your resume text.'); }
              chunks.push(item.value);
            }
          } finally { reader.releaseLock(); }
          xmlBytes = new Uint8Array(size); let position = 0;
          for (const chunk of chunks) { xmlBytes.set(chunk, position); position += chunk.length; }
        } else if (method !== 0) throw new Error('Unsupported DOCX compression. Paste your resume text.');
        if (xmlBytes.length !== expanded) throw new Error('The DOCX document is incomplete. Paste your resume text.');
        const xml = new DOMParser().parseFromString(new TextDecoder('utf-8', {fatal:true}).decode(xmlBytes), 'application/xml');
        if (xml.getElementsByTagName('parsererror').length || xml.doctype) throw new Error('Invalid DOCX document XML. Paste your resume text.');
        return [...xml.getElementsByTagNameNS(WORD_NAMESPACE, 'p')].map(paragraph => {
          let text = '';
          for (const node of paragraph.getElementsByTagNameNS(WORD_NAMESPACE, '*')) {
            if (node.localName === 't') text += node.textContent;
            else if (node.localName === 'tab') text += '\t';
            else if (node.localName === 'br' || node.localName === 'cr') text += '\n';
          }
          return text;
        }).join('\n');
      }
      offset += 46 + nameLength + extra + comment;
    }
    throw new Error('DOCX contains no readable document. Paste your resume text.');
  }
  async function pdfText(bytes) {
    let task;
    try {
      if (!pdfLibrary) {
        const url = root.chrome?.runtime?.getURL;
        if (!url) throw new Error('Extension PDF parser is unavailable');
        pdfLibrary = import(url('vendor/pdf.min.mjs')).then(library => {
          library.GlobalWorkerOptions.workerSrc = url('vendor/pdf.worker.min.mjs');
          return library;
        }).catch(error => { pdfLibrary = undefined; throw error; });
      }
      const library = await pdfLibrary;
      task = library.getDocument({data:bytes, isEvalSupported:false, useSystemFonts:true, stopAtErrors:true});
      const document = await task.promise;
      const pages = [];
      for (let index = 1; index <= document.numPages; index++) {
        const page = await document.getPage(index), content = await page.getTextContent();
        pages.push(content.items.map(item => typeof item.str === 'string' ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim());
        page.cleanup();
      }
      const text = clean(pages.join('\n\n'));
      if (!/[\p{L}\p{N}]/u.test(text)) throw new Error('No readable text');
      return text;
    } catch {
      throw new Error('This PDF could not be read or contains scanned images. Paste your resume text, or upload a text-based PDF or DOCX.');
    } finally { if (task) await task.destroy().catch(() => {}); }
  }
  async function extract(file) {
    if (!file || typeof file.arrayBuffer !== 'function') throw new Error('Choose a resume file first.');
    if (file.size > MAX_BYTES) throw new Error('Resume files must be 10 MB or smaller.');
    const extension = String(file.name || '').split('.').pop().toLowerCase();
    if (!['txt','md','json','pdf','docx'].includes(extension)) throw new Error('Supported resume files: TXT, MD, JSON, PDF, and DOCX.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (bytes.length > MAX_BYTES) throw new Error('Resume files must be 10 MB or smaller.');
    let text;
    if (extension === 'pdf') text = await pdfText(bytes);
    else if (extension === 'docx') {
      try { text = await wordText(bytes); } catch (error) { throw new Error(error.message.includes('Paste') || error.message.includes('paste') ? error.message : 'This DOCX could not be read. Paste your resume text or upload another copy.'); }
    } else {
      try { text = new TextDecoder('utf-8', {fatal:true}).decode(bytes); } catch { throw new Error('This file is not readable UTF-8 text. Paste your resume text.'); }
      if (extension === 'json') {
        try { text = structuredText(JSON.parse(text)); } catch { throw new Error('Invalid resume JSON. Upload valid JSON or paste your resume text.'); }
      }
      if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('This file contains binary data. Paste your resume text.');
    }
    text = clean(text);
    if (!text || !/[\p{L}\p{N}]/u.test(text)) throw new Error('No readable resume text was found. Paste your resume text or choose another file.');
    return {text};
  }
  root.NextkinResumeImport = Object.freeze({extract});
})(globalThis);
