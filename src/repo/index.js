// DB 통역기 고르기 (설계서 4.2) — 업무 코드는 env.DB(D1 모양) · repo(env).함수이름 만 부른다
//   DB_DRIVER = 'd1'(기본) | 'supabase'(P8) — supabase 면 pg.js 가 PostgreSQL 을 D1 모양으로 흉내 내서 env.DB 자리에 넣는다
import { d1 } from './d1.js';
import { pgD1 } from './pg.js';
import { pgExec } from './supabase.js';

export function repo(env) {
  return d1(env.DB);
}

// 요청 하나에 쓸 DB 열기 → { db, close } (못 열면 null)
//   env.PG_TEST: 시험용 연결(PGlite) — tests/harness.js 에서만 넣음
export function openDb(env) {
  const drv = env.DB_DRIVER || 'd1';
  if (drv === 'd1') return env.DB ? { db: env.DB, close: async () => {} } : null;
  if (drv !== 'supabase') return null;
  const url = env.HYPERDRIVE ? env.HYPERDRIVE.connectionString : env.SUPABASE_DB_URL;
  const ex = env.PG_TEST || (url && pgExec(url));
  if (!ex) return null;
  return { db: pgD1(ex, env.PG_TEST ? env.PG_TEST.key : 'supabase'), close: () => ex.close ? ex.close() : null };
}
