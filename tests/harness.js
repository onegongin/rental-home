// 시험 서버 고르기 — 보통은 wrangler(D1). TEST_DB=supabase 면 같은 시험을 PostgreSQL 로 (P8, 설계서 1.4 기준 6)
//   PostgreSQL 은 PGlite(진짜 PostgreSQL 을 Node 안에서 돌림)로 띄우고, Worker 코드를 그대로 불러 DB_DRIVER=supabase 로 돌린다
//   실행: npm run test:supabase
import { readFileSync } from 'node:fs';
import { createTestHarness as wranglerHarness } from 'wrangler';

export function createTestHarness(opt) {
  if (process.env.TEST_DB !== 'supabase') return wranglerHarness(opt);
  return pgHarness(opt.workers[0]);
}

let n = 0;
export async function pgTestExec() {
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite({ parsers: { 20: Number, 1700: Number } });
  await pg.exec('CREATE SCHEMA IF NOT EXISTS hwip; SET search_path TO hwip, public;');
  const q = s => async (text, params) => { const r = await s.query(text, params); return { rows: r.rows, count: r.affectedRows || 0 }; };
  return { key: 'pg-test-' + (++n), q: q(pg), tx: fn => pg.transaction(t => fn(q(t))), close: async () => {}, pg };
}

// R2 흉내 (백업 · 팝업 파일 저장소)
function memR2() {
  const m = new Map();
  return {
    async put(key, body, o = {}) { m.set(key, { body: new Uint8Array(body), meta: o.customMetadata || {}, at: new Date() }); },
    async get(key) { const v = m.get(key); return v ? { body: v.body.slice(), arrayBuffer: async () => v.body.slice().buffer } : null; },
    async list() { return { truncated: false, objects: [...m].map(([key, v]) => ({ key, size: v.body.length, uploaded: v.at, customMetadata: v.meta })) }; },
    async delete(keys) { [].concat(keys).forEach(k => m.delete(k)); }
  };
}

function pgHarness(w) {
  const cfg = JSON.parse(readFileSync(w.configPath, 'utf8').replace(/^\s*\/\/.*$/gm, ''));
  let env, worker;
  return {
    async listen() {
      worker = (await import('../src/worker.js')).default;
      env = Object.assign({}, cfg.vars, w.secrets, { DB_DRIVER: 'supabase', PG_TEST: await pgTestExec(), BACKUP: memR2(), MEDIA: memR2(), ASSETS: { fetch: async () => new Response('', { status: 404 }) } });
    },
    async fetch(url, init) {
      const jobs = [];
      const r = await worker.fetch(new Request(url, init), env, { waitUntil: p => jobs.push(p) });
      await Promise.all(jobs);                   // 알림 등 뒷일까지 끝내고 돌려줌
      return r;
    },
    async close() {}
  };
}
