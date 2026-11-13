// DB 이관 · 비교 도구 (설계서 4.3, P8) — 대표 PC에서 실행
//   백업 파일 = 직원 화면 설정 › 내보내기 · 백업 › [전체 백업 받기] 로 받은 .hwipbak (비밀번호 잠금)
//
//   node tools/db_move.mjs to-supabase <백업파일> --pw <비밀번호>   D1 → Supabase 로 옮기고 바로 비교
//   node tools/db_move.mjs check       <백업파일> --pw <비밀번호>   지금 Supabase 내용 ↔ 백업파일 비교만
//   node tools/db_move.mjs compare     <파일A> <파일B> --pw <비밀번호>   백업파일 두 개 비교 (전환 전 D1 ↔ 전환 뒤 Supabase)
//   node tools/db_move.mjs to-d1       <백업파일> --pw <비밀번호> --out 되돌림.sql   Supabase → D1 로 되돌아갈 SQL 파일
//        → npx wrangler d1 execute hwip-db --remote --file 되돌림.sql
//
//   Supabase 주소는 .dev.vars 의 SUPABASE_DB_URL (git에 안 올라감)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { unpack } from '../src/backup/pack.js';
import { compare, report, toSqlite } from '../src/backup/compare.js';
import { init } from '../src/repo/schema.js';
import { d1 } from '../src/repo/d1.js';
import { dump, restore } from '../src/repo/backup.js';

// 옮긴 직후 비교에서 빼는 표 없음 — 이관은 표 전체(직원 명단 · 기기 · 감사기록 포함)를 그대로 옮긴다
export async function moveInto(db, data) {
  await init(db);
  await d1(db).ready();
  const done = await restore(db, data, { all: true });
  const after = await dump(db, '이관 확인');
  return { done, check: await compare(data, after) };
}

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const readBak = async f => unpack(new Uint8Array(readFileSync(f)), arg('--pw'));
function dbUrl() {
  if (process.env.SUPABASE_DB_URL) return process.env.SUPABASE_DB_URL;
  if (existsSync('.dev.vars')) { const m = readFileSync('.dev.vars', 'utf8').match(/^SUPABASE_DB_URL\s*=\s*"?([^"\r\n]+)/m); if (m) return m[1]; }
  throw new Error('SUPABASE_DB_URL 이 없습니다 (.dev.vars 에 한 줄 넣기)');
}
async function supabase() {
  const { pgExec } = await import('../src/repo/supabase.js');
  const { pgD1 } = await import('../src/repo/pg.js');
  const ex = pgExec(dbUrl());
  return { db: pgD1(ex, 'supabase'), close: ex.close };
}

async function main() {
  const [cmd, a, b] = process.argv.slice(2);
  if (cmd === 'to-supabase' || cmd === 'check') {
    const data = await readBak(a), s = await supabase();
    try {
      let c;
      if (cmd === 'to-supabase') { const r = await moveInto(s.db, data); c = r.check; console.log('옮김: ' + Object.keys(r.done).length + '개 표'); }
      else c = await compare(data, await dump(s.db, '비교'));
      console.log('백업파일 ↔ Supabase\n' + report(c));
      process.exitCode = c.same ? 0 : 1;
    } finally { await s.close(); }
  } else if (cmd === 'compare') {
    const c = await compare(await readBak(a), await readBak(b), ['audit']);
    console.log('파일A ↔ 파일B (감사기록은 받는 순간마다 늘어 빼고 비교)\n' + report(c));
    process.exitCode = c.same ? 0 : 1;
  } else if (cmd === 'to-d1') {
    const out = arg('--out', '되돌림.sql');
    writeFileSync(out, toSqlite(await readBak(a)));
    console.log(out + ' 만듦 → npx wrangler d1 execute hwip-db --remote --file ' + out);
  } else {
    console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//')).join('\n'));
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error('오류: ' + (e.message === 'pw' ? '비밀번호가 맞지 않습니다' : e.message === 'nopw' ? '--pw 비밀번호를 넣어 주세요' : e.message)); process.exitCode = 1; });
