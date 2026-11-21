// scripts/shoot.mjs (run: node --test scripts/*.test.mjs): reading shots.json and where each shot points.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { readShots, urlFor } from './shoot.mjs';

test('readShots fills in the defaults and takes a list or {defaults, shots}', () => {
  assert.deepEqual(readShots('[{"name":"a"}]'), [{ name: 'a', width: 1440, height: 900, full: false, click: [] }]);
  const [s] = readShots('{"defaults":{"theme":"dark","path":"/x"},"shots":[{"name":"b","width":390,"click":"#m"}]}');
  assert.equal(s.theme, 'dark');
  assert.equal(s.path, '/x');
  assert.equal(s.width, 390);
  assert.deepEqual(s.click, ['#m']);
});

test('readShots rejects shots it cannot take', () => {
  assert.throws(() => readShots('[{}]'), /no name/);
  assert.throws(() => readShots('[{"name":"a","path":"/","file":"m.html"}]'), /not both/);
  assert.throws(() => readShots('[{"name":"a","theme":"blue"}]'), /dark or light/);
  assert.throws(() => readShots('{"x":1}'), /must be a list/);
});

test('urlFor joins the path to BASE_URL, or opens a local file', () => {
  assert.equal(urlFor({ name: 'a', path: '/devices?x=1' }, 'http://localhost:8080', '.'), 'http://localhost:8080/devices?x=1');
  assert.equal(urlFor({ name: 'a', path: 'devices' }, 'http://h/app', '.'), 'http://h/app/devices');
  assert.equal(urlFor({ name: 'a' }, 'http://h:1', '.'), 'http://h:1/');
  assert.match(urlFor({ name: 'a', file: 'mockup.html' }, '', path.resolve('docs')), /^file:\/\/.*docs\/mockup\.html$/);
  assert.throws(() => urlFor({ name: 'a', path: '/' }, '', '.'), /BASE_URL/);
});
