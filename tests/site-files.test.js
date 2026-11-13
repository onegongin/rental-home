// S0 박힌 단지 이름 정리 — 고정 화면 파일이 site.json 과 맞는지 · 다른 단지로 바꾸면 옛 이름이 안 남는지
// 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from '../tools/apply_site.mjs';

const FILES = ['public/daelasoo/data/site.json', 'wrangler.jsonc', 'public/daelasoo/index.html', 'public/daelasoo/staff/index.html', 'public/daelasoo/maps/location.html', 'public/robots.txt'];

test('고정 화면 파일 = site.json (다르면 node tools/apply_site.mjs)', () => {
  assert.deepEqual(Object.keys(build()), []);
});

test('다른 단지 이름 · 주소로 바꾸면 고정 화면에 옛 이름이 남지 않음', () => {
  const dir = mkdtempSync(join(tmpdir(), 'site0-'));
  try {
    FILES.forEach(f => { mkdirSync(join(dir, f, '..'), { recursive: true }); writeFileSync(join(dir, f), readFileSync(f)); });
    const D = JSON.parse(readFileSync('public/daelasoo/data/site.json', 'utf8'));
    const OLD = /센테니얼|화정|hwajeong/;
    // 새 단지 값으로 바꿈: 옛 이름이 든 글자는 모두 '새단지'로
    const swap = v => typeof v === 'string' ? (OLD.test(v) ? '새단지' : v) : Array.isArray(v) ? v.map(swap) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)])) : v;
    D.site = swap(D.site); D.seo = swap(D.seo);
    writeFileSync(join(dir, 'public/daelasoo/data/site.json'), JSON.stringify(D));
    writeFileSync(join(dir, 'wrangler.jsonc'), readFileSync('wrangler.jsonc', 'utf8').replace(/"SITE_URL": "[^"]+"/, '"SITE_URL": "https://new.example.kr"'));
    const out = build(dir);
    ['public/daelasoo/index.html', 'public/daelasoo/staff/index.html', 'public/daelasoo/maps/location.html', 'public/robots.txt'].forEach(f => {
      assert.ok(out[f], f + ' 가 다시 써져야 함');
      assert.ok(!OLD.test(out[f]), f + ' 에 옛 이름이 남음: ' + (out[f].match(new RegExp('.{0,30}(' + OLD.source + ').{0,30}')) || [])[0]);
    });
    assert.match(out['public/daelasoo/index.html'], /<link rel="canonical" href="https:\/\/new\.example\.kr\/">/);
    assert.match(out['public/robots.txt'], /Sitemap: https:\/\/new\.example\.kr\/sitemap\.xml/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
