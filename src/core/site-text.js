// 단지 공통 글 — 검색 페이지 · 광고 글이 같이 쓴다 (R1, 2026-11-13: 아이파크에 박혀 있던 '구 화정아이파크' · '1 · 2단지 동일' · 오피스텔 문구를 site.json 값으로)
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

const S = SITE.site || {};
// 단지 사진 폴더 (public/daelasoo/assets/{site.code}/)
export const ASSET = '/assets/' + (S.code || 'site') + '/';
// '첨단대라수1차 (대라수1차)' — 별칭이 이름과 같거나 없으면 이름만
export const nameX = (sep = ' ') => (S.name || '') + (S.alias && S.alias !== S.name ? sep + '(' + S.alias + ')' : '');
// '아파트 300세대' · '아파트 705세대 + 오피스텔 142실'
export const scaleText = (join = ' + ') => '아파트 ' + (S.households || 0) + '세대' + (S.officetels ? join + '오피스텔 ' + S.officetels + '실' : '');
// 입주 글 — 단지가 여럿이고 같으면 '(… 동일)', 값이 없으면 ''
export function moveInText() {
  const B = Object.entries(S.blocks || {}), m = (B[0] || [])[1] ? B[0][1].moveIn : '';
  if (!m) return '';
  const same = B.length > 1 && B.every(([, v]) => v.moveIn === m);
  return '입주 ' + m + (same ? ' (' + B.map(([k]) => k).join(' · ') + ' 동일)' : '');
}
