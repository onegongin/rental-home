// 직원 대시보드 코드 문법 검사 — 한 글자 오류로 직원 화면 전체가 안 열린 일(2026-11-22) 다시 막기
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

test('dashboard.dc.html 스크립트가 문법 오류 없이 읽힘', () => {
  const src = readFileSync(new URL('../public/daelasoo/dashboard.dc.html', import.meta.url), 'utf8');
  const m = src.match(/<script type="text\/x-dc" data-dc-script[^>]*>([\s\S]*)<\/script>/);
  assert.ok(m, '스크립트 찾음');
  assert.doesNotThrow(() => new vm.Script('class DCLogic {}\n' + m[1]), '문법 오류');
});
