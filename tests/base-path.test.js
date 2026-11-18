// 단지 주소 앞머리 (/daelasoo, 2026-11-13 R0) — 검색용 주소는 앞머리 아래에서만, 페이지 속 링크도 앞머리 아래로
import test from 'node:test';
import assert from 'node:assert/strict';
import { subPath, withBase, moveTo } from '../src/worker.js';

test('앞머리 떼기: /daelasoo/plan → /plan · 앞머리 밖은 null · 앞머리 없으면 그대로', () => {
  assert.equal(subPath('/daelasoo/plan', '/daelasoo'), '/plan');
  assert.equal(subPath('/daelasoo', '/daelasoo'), '/');
  assert.equal(subPath('/daelasoo/', '/daelasoo'), '/');
  assert.equal(subPath('/plan', '/daelasoo'), null, '맨 앞 /plan 은 단지 검색 페이지가 아님');
  assert.equal(subPath('/daelasoo2/plan', '/daelasoo'), null);
  assert.equal(subPath('/plan', ''), '/plan');
});

test('검색용 HTML 링크를 앞머리 아래로, 주소 전체 · // · HTML 아닌 것은 그대로', async () => {
  const html = new Response('<a href="/plan">p</a><img src="/assets/a.jpg"><a href="https://x.kr/y">x</a><a href="//cdn/z">z</a>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  const t = await (await withBase(html, '/daelasoo')).text();
  assert.equal(t, '<a href="/daelasoo/plan">p</a><img src="/daelasoo/assets/a.jpg"><a href="https://x.kr/y">x</a><a href="//cdn/z">z</a>');
  const xml = new Response('<loc>/plan</loc> href="/x"', { headers: { 'content-type': 'application/xml' } });
  assert.equal(await (await withBase(xml, '/daelasoo')).text(), '<loc>/plan</loc> href="/x"');
});

test('대표 주소로 넘기기: 예전 workers.dev · www → rental-home.kr, 미리보기 · /api/ · 새 주소는 그대로', () => {
  const env = { SITE_URL: 'https://rental-home.kr/daelasoo' }, m = u => moveTo(new URL(u), env);
  assert.equal(m('https://rental-home.onegongin.workers.dev/daelasoo/plan?x=1'), 'https://rental-home.kr/daelasoo/plan?x=1');
  assert.equal(m('https://rental-home.onegongin.workers.dev/daelasoo/staff/'), 'https://rental-home.kr/daelasoo/staff/');
  assert.equal(m('https://www.rental-home.kr/daelasoo/#hedge'), 'https://rental-home.kr/daelasoo/');
  assert.equal(m('https://rental-home.onegongin.workers.dev/api/public/ping'), null, '예전 주소 API 는 그대로');
  assert.equal(m('https://stage1-rental-home.onegongin.workers.dev/daelasoo/'), null, '미리보기는 그대로');
  assert.equal(m('https://rental-home.kr/daelasoo/'), null);
  assert.equal(m('http://localhost:8787/daelasoo/'), null, '로컬은 그대로');
  assert.equal(moveTo(new URL('https://rental-home.onegongin.workers.dev/'), {}), null, 'SITE_URL 없으면 안 넘김');
});
