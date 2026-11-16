// 관심단지 목록 (시안 r37 확정 2026-11-16) — 손님 방문예약 · 관심등록 창 · 상담카드의 '관심단지' 고르기
// 저장: kv cfg 'complexes' = ["첨단대라수1차", …] · cfg 'complexDef' = 기본 단지 이름 (직원 화면 설정 › 게스트, 대표 · 관리자 · 권한자)
// 없으면 단지 이름(site.json site.name) 하나
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

export const DEFAULT_COMPLEX = ((SITE.site || {}).name) || '첨단대라수1차';

export function complexList(list, def) {
  const L = (Array.isArray(list) ? list : []).map(x => String(x == null ? '' : x).trim().slice(0, 40)).filter(Boolean);
  const out = [...new Set(L)].slice(0, 30);
  const names = out.length ? out : [DEFAULT_COMPLEX];
  const d = typeof def === 'string' && names.includes(def.trim()) ? def.trim() : names[0];
  return { list: names, def: d };
}
