// 표 준비 표시 (2026-11-19): 한 번 다 준비한 DB 는 서버가 새로 떠도 meta 한 줄만 읽고 끝 — 첫 요청 8~10초 → 1초 안
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { init, SCHEMA_VER } from '../src/repo/schema.js';
import { d1 } from '../src/repo/d1.js';
import { restore, dump } from '../src/repo/backup.js';

// node:sqlite 를 D1 모양으로 — key 를 바꾸면 '새로 뜬 서버'처럼 보임. n = DB 에 보낸 문장 수
function wrap(s, key) {
  const w = { key, n: 0 };
  const st = (sql, a = []) => ({
    sql, a, bind: (...x) => st(sql, x),
    async all() { w.n++; const p = s.prepare(sql); return /^\s*(SELECT|PRAGMA)/i.test(sql) ? { results: p.all(...a) } : { results: [], meta: { changes: Number(p.run(...a).changes) } }; },
    async run() { return this.all(); },
    async first() { return (await this.all()).results[0] || null; }
  });
  w.prepare = sql => st(sql);
  w.batch = async l => { s.exec('BEGIN'); try { const o = []; for (const x of l) o.push(await x.all()); s.exec('COMMIT'); return o; } catch (e) { s.exec('ROLLBACK'); throw e; } };
  return w;
}

test('처음엔 전부 준비 → 다시 뜬 서버는 2번만 읽음 · 복구 뒤엔 다시 전부', async () => {
  const s = new DatabaseSync(':memory:');
  const a = wrap(s, 'ready-a');
  await init(a); await d1(a).ready();
  assert.ok(a.n > 30, '처음은 전부: ' + a.n);
  assert.equal(s.prepare("SELECT v FROM meta WHERE k = 'schema'").get().v, SCHEMA_VER);

  const b = wrap(s, 'ready-b');
  await init(b); await d1(b).ready();
  assert.equal(b.n, 2);

  await restore(a, await dump(a, '시험'));
  assert.equal(s.prepare('SELECT COUNT(*) n FROM meta').get().n, 0);
  const c = wrap(s, 'ready-c');
  await init(c); await d1(c).ready();
  assert.ok(c.n > 30, '복구 뒤 전부: ' + c.n);
});
