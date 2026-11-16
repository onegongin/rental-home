// 관심단지 목록 읽기 (손님용 /api/public/complexes 전용) — cfg 의 'complexes' · 'complexDef' 두 칸만 읽음
// 게스트 API 는 repo/kv.js(아무 칸이나 읽는 함수)를 쓰지 않는다 (tests/security.test.js)
import { complexList } from '../core/complexes.js';

const val = v => { try { return JSON.parse(v); } catch (e) { return null; } };

export async function readComplexes(db) {
  const r = await db.prepare("SELECT k, v FROM kv WHERE s = 'cfg' AND k IN ('complexes', 'complexDef')").all();
  const m = {};
  for (const x of (r && r.results) || []) m[x.k] = val(x.v);
  return complexList(m.complexes, m.complexDef);
}
