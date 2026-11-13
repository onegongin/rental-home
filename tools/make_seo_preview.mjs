// 검색 노출 시안용 — 실제 서버 코드(src/seo/pages.js)에 가짜 매물을 넣어 preview/seo-*.html 로 뽑는다
//   실행: node tools/make_seo_preview.mjs
import fs from 'fs';
import { listingPage, listPage } from '../src/seo/pages.js';

const base = 'https://rental-home.onegongin.workers.dev/daelasoo', now = Date.parse('2026-11-03T14:00:00+09:00');
const R = (id, o) => Object.assign({ id, block: '1단지', kind: '아파트', rent: null, ask: null, dep: null, term: '', mgmt_na: 0, mgmt_items: '["일반관리비","수도"]', basis: '거실', rooms: 3, baths: 2,
  approval: '2027-01 예정 (사용승인 전)', parking: '공동주택 519대 (세대당 약 1.33대)', urgent: 0, badge: '', contact: '제니스원부동산', tel: '1800-7240', at: now, updated: now }, o);
const rows = [
  R('01JC0000000000000000000001', { deal: 'jeonse', dong: 103, label: '103동 중층/38층', band: '중층', type: '84A', exclusive: 84.641, supply: 116.551, dep: 52000, move: '2027-02 협의', mgmt: 22, facing: '남' }),
  R('01JC0000000000000000000002', { deal: 'sale', dong: 102, label: '102동 고층/39층', band: '고층', type: '84B', exclusive: 84.93, supply: 117.2, ask: 78000, move: '즉시', mgmt: 24, facing: '남', badge: '계약 진행중' }),
  R('01JC0000000000000000000003', { deal: 'wolse', dong: 202, block: '2단지', label: '202동 저층/36층', band: '저층', type: '84D', exclusive: 84.77, supply: 116.9, dep: 5000, rent: 150, move: '2027-03', mgmt: 0, mgmt_na: 1, facing: '남동' })
];
const noindex = h => h.replace('<meta charset="utf-8">', '<meta charset="utf-8"><meta name="robots" content="noindex">');
fs.writeFileSync('public/preview/seo-listing.html', noindex(listingPage(base, rows[0])));
fs.writeFileSync('public/preview/seo-list.html', noindex(listPage(base, rows)));
console.log('ok');
