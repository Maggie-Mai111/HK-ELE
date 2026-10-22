import assert from 'node:assert/strict';
import test from 'node:test';
import '../evidence_tokens.js';
const tokens=globalThis.HKELE_EVIDENCE_TOKENS;
test('root variants and gloss alternatives stay independent; phrases and punctuation within quotes are retained',()=>{
  assert.deepEqual(tokens.split('string / strict','root'),['string','strict']);
  assert.deepEqual(tokens.split('tight, upright, stiff','meaning'),['tight','upright','stiff']);
  assert.deepEqual(tokens.split('before, in front of, prior to; old','meaning'),['before','in front of','prior to','old']);
  assert.deepEqual(tokens.split('carry (bring, take), "go, move"','meaning'),['carry (bring, take)','"go, move"']);
  assert.deepEqual(tokens.split('"not to know, to be unacquainted; mistake, misunderstand','meaning'),['"not to know, to be unacquainted; mistake, misunderstand']);
});
test('whole subject names and text escaping survive badge rendering; absent evidence stays a dash',()=>{
  const html=tokens.chips(['English Grammar and Writing','Health','Science','Social Studies and History'],'subject');
  assert.equal((html.match(/class="evidence-token token-/g)||[]).length,4);
  assert.match(html,/Social Studies and History/);
  assert.doesNotMatch(tokens.chips('<script>','meaning'),/<script>/);
  assert.equal(tokens.chips(null,'root'),'—');
});
