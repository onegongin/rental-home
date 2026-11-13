// Supabase 연결 (P8) — 요청 하나마다 연결 1개를 열고, 응답 · 뒷일(알림 등)이 다 끝나면 닫는다
//   주소: 비밀값 SUPABASE_DB_URL (Supabase › Connect › Transaction pooler, 포트 6543, 사용자 hwip.<프로젝트>)
//         또는 Cloudflare Hyperdrive 를 붙였으면 env.HYPERDRIVE (더 빠름, 선택)
//   표는 hwip 칸(schema)에만 만든다 — Supabase 기본 public 칸은 REST(anon 키)로 열려 있어서 쓰지 않음
//   전용 사용자 hwip 의 기본 칸을 hwip 으로 정해 둔다 (준비 SQL: _설계서/Supabase_전환_안내.md)
//   → 연결해 보니 hwip 칸이 아니면 표를 만들기 전에 멈춤
import postgres from 'postgres';

export const SCHEMA = 'hwip';
// 숫자 칸(NUMERIC · BIGINT)을 글자 대신 숫자로 받기 (SQLite 처럼)
const num = { to: 1700, from: [20, 1700], serialize: x => String(x), parse: x => Number(x) };

export function pgExec(url) {
  const sql = postgres(url, { prepare: false, max: 1, idle_timeout: 5, connect_timeout: 10, types: { num }, onnotice: () => {} });
  let checked = null;
  const check = () => checked || (checked = sql.unsafe('SELECT current_schema() AS s').then(r => {
    if (r[0].s !== SCHEMA) throw new Error('Supabase 준비 안 됨: 기본 칸이 ' + r[0].s + ' (hwip 이어야 함) — 안내서의 준비 SQL 을 먼저 실행');
  }));
  const q = s => async (text, params) => { const r = await s.unsafe(text, params); return { rows: Array.from(r), count: r.count }; };
  return {
    q: async (t, p) => { await check(); return q(sql)(t, p); },
    tx: async fn => { await check(); return sql.begin(s => fn(q(s))); },
    close: () => sql.end({ timeout: 5 })
  };
}
