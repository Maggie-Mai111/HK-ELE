import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
function webApi() {
  let failPath = '';
  const context = vm.createContext({window: {}, location: {href: 'https://fixture.invalid/'},
    URL, TextEncoder, Blob, Response, DecompressionStream,
    fetch: async path => {
      if (path === failPath) { failPath = ''; return new Response('unavailable', {status: 503}); }
      return new Response(new Uint8Array(readFileSync(join(root, path))));
    }});
  vm.runInContext(readFileSync(join(root, 'static_api.js'), 'utf8'), context);
  return {api: context.window.HKELE_STATIC_API, fail: path => { failPath = path; }};
}

test('Web defaults to the full database and recovers failed manifest and letter loads', async () => {
  const {api, fail} = webApi();
  fail('data/manifest.json.gz');
  await assert.rejects(api.request('/families'), /503/);
  const page = await api.request('/families');
  assert.equal(page.scope, 'full');
  assert.equal(page.available_items, 163784);
  fail('data/search/n.json.gz');
  await assert.rejects(api.request('/search?q=NASA'), /503/);
  assert.equal((await api.request('/search?q=NASA')).status, 'RESOLVED');
});

test('Web uses registered grades and does not display raw VXGL decimals or ranges', () => {
  const {api} = webApi();
  assert.equal(api.teacherRecord({external_level_reference: '5.825',
    external_level_reference_teacher_display: 'Grades 5–6'}).external_level_reference, 'Grades 5–6');
  assert.equal(api.teacherRecord({external_level_reference_display: '0.1851851852–10.20383956',
    external_level_reference_teacher_display: 'Kindergarten–Grade 1',
    browse_external_level_reference: '0.1851851852–10.20383956'}).browse_external_level_reference, 'Kindergarten–Grade 1');
  assert.equal(api.teacherRecord({external_level_reference: '5.825'}).external_level_reference, null);
});
