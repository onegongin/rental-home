// 광고 초안 (설계서 11장, P6) — DB를 모르는 순수 함수만
//   공개용 사본 한 줄(publicRow) → 매체별 초안. 끝에는 필수 표시 블록(부록 A + 사무소)이 항상 붙고 직원이 뺄 수 없다
//   문장 틀 여러 개 중 seed 로 골라 매번 조금씩 다른 글 · 과장 표현은 경고 (cfg.adBan 으로 편집)
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

export const MEDIA = { blog: '네이버 블로그', karrot: '당근', insta: '인스타그램', sms: '문자 · 카톡', naver: '네이버부동산 등록' };
export const MEDIA_KEYS = Object.keys(MEDIA);
// 글쓰기 화면 (붙여넣기용). 네이버부동산은 매물 등록 업체 화면이라 주소 없음
const S = SITE.site || {}, O = SITE.office || {}, SEO = SITE.seo || {};
export const WRITE_URL = {
  blog: O.blog ? 'https://blog.naver.com/' + O.blog.split('/').pop() + '/postwrite' : '',
  karrot: 'https://business.daangn.com/', insta: 'https://www.instagram.com/', sms: '', naver: ''
};
// 과장 · 단정 표현 (설계서 11.1 · 18장). '급매'는 매물에 급매 표시가 있을 때만 허용
export const BAN0 = ['최저가', '최고가', '확정 수익', '확정수익', '수익 보장', '수익보장', '무조건', '100%', '프리미엄 보장', '시세보다 싼', '파격', '대박', '급매'];
export const BLOCK_HEAD = '──────── 중개대상물 표시 ────────';

const DEAL = { sale: '매매', jeonse: '전세', wolse: '월세', short: '단기임대' };
export const won = n => { n = Number(n) || 0; const e = Math.floor(n / 10000), m = n % 10000; return (e ? e + '억' : '') + (m ? (e ? ' ' : '') + m.toLocaleString('ko-KR') + '만' : '') + '원'; };
export const priceText = r => r.deal === 'sale' ? '매매 ' + won(r.ask) : r.deal === 'jeonse' ? '전세 ' + won(r.dep) : DEAL[r.deal] + ' ' + won(r.dep).replace(/원$/, '') + ' / ' + (Number(r.rent) || 0).toLocaleString('ko-KR') + '만원' + (r.term ? ' (' + r.term + ')' : '');
const py = m2 => m2 ? Math.round(m2 / 3.3058) : 0;
const items = v => { try { return JSON.parse(v || '[]'); } catch (e) { return []; } };
export const mgmtText = r => r.mgmt_na ? '미등기건물 · 신축건물 등 관리비 내역 확인 불가' : '월 ' + (Number(r.mgmt) || 0).toLocaleString('ko-KR') + '만원' + (items(r.mgmt_items).length ? ' (포함: ' + items(r.mgmt_items).join(', ') + ')' : '');
const top = r => (String(r.label || '').match(/\/(\d+)층/) || [])[1] || '';
const where = r => (S.name || '') + ' ' + String(r.label || '').replace(/\/\d+층$/, '');

// 필수 표시 블록 (부록 A) — 모든 초안 끝에 그대로
export function requiredBlock(r) {
  return [BLOCK_HEAD,
    '소재지: ' + (S.address || '') + ' ' + where(r),
    '종류 · 거래: ' + (r.kind || '공동주택') + ' · ' + DEAL[r.deal],
    '가격: ' + priceText(r),
    '면적: 전용 ' + r.exclusive + '㎡' + (r.supply ? ' (공급 ' + r.supply + '㎡)' : '') + ' · ' + r.type + '타입',
    '층: ' + String(r.label || '').split(' ').pop().replace('/', ' / 총 '),
    '방향: ' + r.facing + '향 (' + r.basis + ' 기준) · 방 ' + r.rooms + ' · 욕실 ' + r.baths,
    '입주 가능일: ' + r.move + ' · 관리비: ' + mgmtText(r),
    '사용승인일: ' + r.approval + ' · 주차: ' + r.parking,
    '─────────────────────────',
    // 담당 이름은 공인중개사일 때만 (contactOf) — 사무소명뿐이면 아래 줄과 겹쳐서 뺌
    ...(r.contact && r.contact !== O.name ? [r.contact] : []),
    '중개사무소: ' + O.name + ' · 대표 ' + O.ceo + ' · 등록번호 ' + O.regNo,
    '소재지: ' + O.address + ' · 대표번호 ' + (r.tel || O.tel)
  ].join('\n');
}

// 단지 공통 (사실만 — 자료에 있는 값)
const FACTS = [
  (S.name || '') + ' (구 ' + (S.alias || '') + ') · 아파트 ' + (S.households || '') + '세대 + 오피스텔 ' + (S.officetels || '') + '실',
  '입주 ' + ((S.blocks || {})['1단지'] || {}).moveIn + ' (1 · 2단지 동일)',
  (S.address || '').replace(/ 일원$/, '')
];

const pick = (arr, seed, k) => arr[Math.abs((seed | 0) + k * 7) % arr.length];
// 해시태그 (site.json seo.tags · instaTags) — {거래} · {타입} 은 매물 값으로 바꿈
const fill = (arr, r) => (arr || []).map(t => t.replace('{거래}', DEAL[r.deal]).replace('{타입}', r.type));
const tagsOf = (r, n) => fill(SEO.tags, r).slice(0, n);

// 초안 1개: { media, title, body(필수 블록 포함), tags }
export function draft(media, r, seed = 0) {
  const W = where(r), P = priceText(r), area = '전용 ' + r.exclusive + '㎡(약 ' + py(r.supply) + '평형)';
  const urgent = r.urgent ? '[급매] ' : '';
  const badge = r.badge ? ' · ' + r.badge : '';
  const lines5 = ['📍 ' + W + ' ' + r.type, '💰 ' + P, '📐 ' + area + ' · 방 ' + r.rooms + ' / 욕실 ' + r.baths, '🧭 ' + r.facing + '향 (' + r.basis + ') · 총 ' + top(r) + '층', '📅 입주 ' + r.move];
  let title = '', body = '', tags = [];
  if (media === 'blog') {
    title = pick([
      urgent + S.name + ' ' + r.type + ' ' + DEAL[r.deal] + ' | ' + P + ' · ' + r.facing + '향',
      urgent + '[' + DEAL[r.deal] + '] ' + W + ' ' + r.type + ' — ' + P,
      urgent + S.short + ' ' + r.type + ' ' + DEAL[r.deal] + ' 매물 안내 (' + P + ')'
    ], seed, 0);
    body = [
      pick(['안녕하세요, ' + O.name + '입니다.', O.name + '에서 새 매물을 안내드립니다.', S.region + ' ' + S.town + ' ' + O.name + '입니다.'], seed, 1),
      '',
      pick([S.name + ' ' + r.type + '타입 ' + DEAL[r.deal] + ' 매물이 나왔습니다.', '이번에 소개드릴 매물은 ' + W + ' ' + r.type + '타입 ' + DEAL[r.deal] + '입니다.'], seed, 2),
      '',
      '■ 매물 요약', ...lines5.map(x => x.replace(/^\S+ /, '· ')), '· 관리비: ' + mgmtText(r) + badge,
      '',
      '■ 단지 안내', ...FACTS.map(x => '· ' + x),
      '',
      pick(['방문 상담은 미리 연락 주시면 자세히 안내드리겠습니다.', '궁금하신 점은 편하게 문의 주세요. 현장 안내 도와드립니다.'], seed, 3)
    ].join('\n');
    tags = tagsOf(r, 10);
  } else if (media === 'karrot') {
    title = urgent + S.short + ' ' + r.type + ' ' + DEAL[r.deal] + ' ' + P.replace(/^\S+ /, '');
    body = [pick(SEO.karrotHello, seed, 1), '', ...lines5, '', pick(['구경 오시기 전에 연락 주세요!', '편하게 채팅이나 전화 주세요.'], seed, 2)].join('\n');
  } else if (media === 'insta') {
    title = '';
    body = [urgent + '✨ ' + S.name + ' ' + r.type + ' ' + DEAL[r.deal], '', ...lines5, '', '📷 사진 순서 제안: 1 조감도(외관) → 2 타입 평면 → 3 실내(거실 · 주방) → 4 단지 조경 → 5 위치도', '', '문의는 프로필 링크 또는 대표번호로 📞'].join('\n');
    tags = tagsOf(r, 10).concat(fill(SEO.instaTags, r)).slice(0, 25);
  } else if (media === 'sms') {
    body = ['[' + O.name + '] ' + S.short + ' 새 매물 안내', W + ' ' + r.type + ' · ' + P, r.facing + '향 · 입주 ' + r.move + badge, '문의 ' + (r.tel || O.tel)].join('\n');
  } else if (media === 'naver') {
    title = '네이버부동산 등록 칸별 값';
    body = [
      '단지명: ' + S.name, '동: ' + r.dong + '동 · 층: ' + r.band + ' (총 ' + top(r) + '층)', '거래유형: ' + DEAL[r.deal],
      r.deal === 'sale' ? '매매가: ' + won(r.ask) : '보증금: ' + won(r.dep) + (r.rent ? ' · 월세: ' + r.rent + '만원' : ''),
      '타입: ' + r.type + ' · 전용 ' + r.exclusive + '㎡ · 공급 ' + r.supply + '㎡', '방/욕실: ' + r.rooms + ' / ' + r.baths, '방향: ' + r.facing + '향 (' + r.basis + ' 기준)',
      '입주가능일: ' + r.move, '관리비: ' + mgmtText(r), '사용승인일: ' + r.approval, '주차: ' + r.parking,
      '매물 설명: ' + S.name + ' ' + r.type + ' ' + DEAL[r.deal] + ' · ' + r.facing + '향 · 입주 ' + r.move
    ].join('\n');
  } else return null;
  // 문자는 짧게 — 필수 블록 대신 사무소 한 줄 + 대표번호 (설계서 11.1 문자 3~4줄). 나머지는 전부 블록
  const tail = media === 'sms' ? O.name + ' · 등록 ' + O.regNo + ' · 대표 ' + O.ceo : requiredBlock(r);
  return { media, title, body: body + '\n\n' + tail, tags };
}

// 직원이 고친 글 · AI가 다듬은 글에서 블록을 떼어 내고 다시 붙임 → 빼거나 고칠 수 없음
export function withBlock(media, text, r) {
  let t = String(text || '');
  const i = t.indexOf(BLOCK_HEAD);
  if (i >= 0) t = t.slice(0, i);
  if (media === 'sms') t = t.split('\n').filter(x => x.indexOf(O.regNo) < 0).join('\n');
  t = t.replace(/\s+$/, '');
  return t + '\n\n' + (media === 'sms' ? O.name + ' · 등록 ' + O.regNo + ' · 대표 ' + O.ceo : requiredBlock(r));
}

// 금지 표현 → 찾은 말 목록 (중복 없이)
export function banHits(text, list, urgent) {
  const t = String(text || '');
  return [...new Set((Array.isArray(list) && list.length ? list : BAN0).filter(w => w && !(urgent && w === '급매') && t.includes(w)))];
}
