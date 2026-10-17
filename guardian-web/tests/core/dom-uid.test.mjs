import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uid } from '../../js/core/dom.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test('uid() crea identificadores con formato UUID v4 (como Supabase)', () => {
  assert.match(uid(), UUID);
});

test('uid() no repite identificadores', () => {
  const muchos = new Set(Array.from({ length: 2000 }, uid));
  assert.equal(muchos.size, 2000);
});
