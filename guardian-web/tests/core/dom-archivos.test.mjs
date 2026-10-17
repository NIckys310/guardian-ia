import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dataURLtoBlob } from '../../js/core/dom.js';

test('dataURLtoBlob() convierte la foto en un archivo con su tipo', async () => {
  const texto = 'hola guardián';
  const url = 'data:text/plain;base64,' + Buffer.from(texto).toString('base64');
  const blob = dataURLtoBlob(url);
  assert.equal(blob.type, 'text/plain');
  assert.equal(await blob.text(), texto);
});

test('dataURLtoBlob() respeta el tamaño de una imagen JPEG', () => {
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const blob = dataURLtoBlob('data:image/jpeg;base64,' + bytes.toString('base64'));
  assert.equal(blob.type, 'image/jpeg');
  assert.equal(blob.size, bytes.length);
});
