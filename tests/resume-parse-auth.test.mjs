import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PDFDocument } from 'pdf-lib';
import { strToU8, zipSync } from 'fflate';
import { MAX_RESUME_BYTES, readResume, ResumeReadError } from '../src/lib/resumes/validation.ts';

const source = readFileSync(new URL('../src/app/api/resumes/parse/route.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const sizeLimit = MAX_RESUME_BYTES + 256 * 1024;

function fixture({ signedIn = true, allowed = true, readRealFile = false } = {}) {
  const parsed = [];
  const rateKeys = [];
  let multipartReads = 0;
  class TrackedResponse extends Response {
    formData() {
      multipartReads++;
      return super.formData();
    }
  }
  const dependencies = {
    '@/lib/http/protected-route': {
      protectedRoute: (_, handler) =>
        signedIn ? handler({ id: 'test-account' }) : Response.json({}, { status: 401 }),
    },
    '@/lib/rate-limit': {
      checkRateLimit(key) {
        rateKeys.push(key);
        return { allowed, resetInMs: 1250 };
      },
    },
    '@/lib/profile/resume-parser': {
      async parseResumeFile(bytes, name, size) {
        parsed.push({ bytes, name, size });
        const rawText = readRealFile ? (await readResume(bytes, name)).text : 'Fixture';
        return { profile: { contacts: { fullName: 'Fixture Candidate' } }, rawText };
      },
    },
    '@/lib/resumes/validation': { MAX_RESUME_BYTES, ResumeReadError },
  };
  const exports = {};
  runInNewContext(outputText, {
    exports,
    require: (name) => dependencies[name],
    Response: TrackedResponse,
    Buffer,
    File,
    Blob,
  });
  return { post: exports.POST, parsed, rateKeys, multipartReads: () => multipartReads };
}

function bodyRequest(chunks, { length, onRead = () => {}, onCancel = () => {} } = {}) {
  const headers = { 'content-type': 'multipart/form-data; boundary=fixture' };
  if (length !== undefined) headers['content-length'] = length;
  const body = new ReadableStream({
    pull(controller) {
      onRead();
      if (chunks.length) controller.enqueue(chunks.shift());
      else controller.close();
    },
    cancel: onCancel,
  }, { highWaterMark: 0 });
  return new Request('https://example.test/api/resumes/parse', { method: 'POST', headers, body, duplex: 'half' });
}

test('an unauthenticated upload never reads the request body', async () => {
  const { post, parsed, multipartReads, rateKeys } = fixture({ signedIn: false });
  const response = await post(bodyRequest([], { onRead: () => assert.fail('request body read') }));
  assert.equal(response.status, 401);
  assert.equal(multipartReads(), 0);
  assert.deepEqual(parsed, []);
  assert.deepEqual(rateKeys, []);
});

test('oversized Content-Length is rejected before body reads', async () => {
  const { post, multipartReads } = fixture();
  const response = await post(bodyRequest([], {
    length: String(sizeLimit + 1),
    onRead: () => assert.fail('request body read'),
  }));
  assert.equal(response.status, 413);
  assert.equal(multipartReads(), 0);
});

for (const length of [undefined, '5', 'invalid']) {
  test(`upload bytes are bounded with Content-Length ${length ?? 'absent'}`, async () => {
    const { post, parsed, multipartReads } = fixture();
    let canceled = false;
    const response = await post(bodyRequest([new Uint8Array(sizeLimit), new Uint8Array(1)], {
      length, onCancel: () => { canceled = true; },
    }));
    assert.equal(response.status, 413);
    assert.equal(canceled, true);
    assert.equal(multipartReads(), 0);
    assert.deepEqual(parsed, []);
  });
}

test('a rate-limited account does not reach multipart parsing', async () => {
  const { post, rateKeys, multipartReads } = fixture({ allowed: false });
  const response = await post(bodyRequest([], { onRead: () => assert.fail('request body read') }));
  assert.equal(response.status, 429);
  assert.equal(response.headers.get('Retry-After'), '2');
  assert.deepEqual(rateKeys, ['resume-parse:test-account']);
  assert.equal(multipartReads(), 0);
});

test('the file size limit is enforced inside an otherwise valid multipart envelope', async () => {
  const { post, parsed, multipartReads } = fixture();
  const form = new FormData();
  form.set('resume', new File([new Uint8Array(MAX_RESUME_BYTES + 1)], 'fixture.pdf'));
  const response = await post(new Request('https://example.test/api/resumes/parse', {
    method: 'POST', body: form,
  }));
  assert.equal(response.status, 413);
  assert.equal(multipartReads(), 1);
  assert.deepEqual(parsed, []);
});

for (const [name, mime] of [
  ['fixture.pdf', 'application/pdf'],
  ['fixture.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
]) {
  test(`an authenticated ${name} upload reaches the document reader intact`, async () => {
    const { post, parsed, rateKeys } = fixture({ readRealFile: true });
    let bytes;
    if (name.endsWith('.pdf')) {
      const pdf = await PDFDocument.create();
      pdf.addPage().drawText('Fixture Candidate', { x: 40, y: 720 });
      bytes = await pdf.save();
    } else {
      bytes = zipSync({
        '[Content_Types].xml': strToU8('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'),
        'word/document.xml': strToU8('<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Fixture Candidate</w:t></w:r></w:p></w:body></w:document>'),
      });
    }
    const form = new FormData();
    form.set('resume', new File([bytes], name, { type: mime }));
    const response = await post(new Request('https://example.test/api/resumes/parse', {
      method: 'POST', body: form,
    }));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.success, true);
    assert.match(result.rawText, /Fixture Candidate/);
    assert.deepEqual(parsed, [{ bytes: Buffer.from(bytes), name, size: bytes.length }]);
    assert.deepEqual(rateKeys, ['resume-parse:test-account']);
  });
}
