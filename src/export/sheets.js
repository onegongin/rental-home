// 엑셀 내보내기 자료 묶음 (설계서 13.1, P7) — 서버가 표 모양(칸 이름 + 줄)까지 만들어 보내고, 화면은 SheetJS 로 파일만 만든다
//   칸: base = 기본 칸 세트(처음부터 체크), 나머지는 [추가 칸]. ph / nm = 가림 옵션 대상(전화번호 · 이름)
//   조건(f): from · to(작성일 YYYY-MM-DD) · dong · deal · mgr · status — 그 묶음에 맞는 조건만 적용
import * as X from '../repo/export.js';
import { maskName } from '../core/mask.js';
import { DEALS } from '../core/listings.js';

const KIND = { buyer: '분양권 매수', seller: '분양권 매도', client: '신규고객', owner: '소유자' };
const day = v => String(v || '').slice(0, 10);
const ymd = t => t ? new Date(Number(t) + 9 * 3600e3).toISOString().slice(0, 10) : '';
const unitText = id => { const m = String(id || '').match(/^(\d+)-(\d+)$/); return m ? m[1] + '동 ' + m[2] + '호' : ''; };
const dongOf = id => Number(String(id || '').split('-')[0]) || 0;
const digits = p => String(p || '').replace(/\D/g, '');
// 외부 전달용 가림 — 화면의 가림(010-****-****)과 달리 끝 4자리는 남겨 같은 사람인지 알아볼 수 있게
export const maskPh = p => { const d = digits(p); return d.length >= 9 ? d.slice(0, 3) + '-****-' + d.slice(-4) : (p ? '****' : ''); };
const cardDeals = c => [...Object.keys((c.trades && typeof c.trades === 'object') ? c.trades : {}).filter(k => c.trades[k]), ...(Array.isArray(c.wants) ? c.wants : [])];
const inRange = (d, f) => (!f.from || d >= f.from) && (!f.to || d <= f.to);
const C = (k, label, base, o) => Object.assign({ k, label, base: !!base }, o);

export const SETS = {
  customers: {
    label: '고객DB', note: '같은 연락처의 상담카드를 한 사람으로 묶음',
    cols: [C('name', '성명', 1, { nm: 1 }), C('phone', '연락처', 1, { ph: 1 }), C('kinds', '구분', 1), C('n', '상담 수', 1), C('first', '첫 상담', 1), C('last', '최근 상담', 1), C('mgr', '담당', 1), C('mkt', '광고 수신 동의', 1), C('carrier', '통신사'), C('birth', '생년월일'), C('inflow', '유입경로'), C('units', '관련 호실')],
    async rows(db, f) {
      const by = {};
      for (const c of await X.cards(db)) {
        const d = digits(c.phone); if (!d) continue;
        if (!inRange(day(c.at), f) || (f.mgr && c.mgr !== f.mgr) || (f.dong && dongOf(c.unit) !== f.dong) || (f.deal && !cardDeals(c).includes(f.deal))) continue;
        (by[d] = by[d] || []).push(c);
      }
      return Object.values(by).map(cs => {
        cs.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
        const z = cs[cs.length - 1];
        return { name: z.name || '', phone: z.phone || '', kinds: [...new Set(cs.map(c => KIND[c.kind] || c.kind))].join(' · '), n: cs.length, first: day(cs[0].at), last: day(z.at), mgr: z.mgr || '',
          mkt: z.consent ? (z.consent.mkt ? 'Y' : 'N') : '', carrier: z.carrier || '', birth: z.birth || '', inflow: z.inflowText || '', units: [...new Set(cs.map(c => unitText(c.unit)).filter(Boolean))].join(', ') };
      }).sort((a, b) => b.last.localeCompare(a.last));
    }
  },
  consults: {
    label: '상담이력', note: '상담카드 한 장 = 한 줄',
    cols: [C('at', '작성일시', 1), C('writer', '작성자', 1), C('kind', '구분', 1), C('unit', '호실', 1), C('name', '성명', 1, { nm: 1 }), C('phone', '연락처', 1, { ph: 1 }), C('text', '상담내용', 1), C('mgr', '담당', 1), C('changes', '변동사항'), C('interest', '관심'), C('deals', '거래'), C('want', '희망 동 · 층 · 타입'), C('budget', '예산'), C('visit', '방문일시'), C('inflow', '유입경로'), C('mkt', '광고 수신 동의')],
    async rows(db, f) {
      return (await X.cards(db)).filter(c => inRange(day(c.at), f) && (!f.mgr || c.mgr === f.mgr) && (!f.dong || dongOf(c.unit) === f.dong) && (!f.deal || cardDeals(c).includes(f.deal)))
        .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')))
        .map(c => { const w = c.want || {}; return { at: c.at || '', writer: c.writer || '', kind: (KIND[c.kind] || c.kind || '') + (c.visit ? ' · 방문예약' : ''), unit: unitText(c.unit), name: c.name || '', phone: c.phone || '', text: c.text || '', mgr: c.mgr || '',
          changes: Array.isArray(c.changes) ? c.changes.join(' / ') : '', interest: c.interest || '', deals: cardDeals(c).map(k => DEALS[k] || k).join(' · '), want: [w.dong, w.floor, w.type].filter(Boolean).join(' · '), budget: w.budget || '', visit: c.visit || '', inflow: c.inflowText || '', mkt: c.consent ? (c.consent.mkt ? 'Y' : 'N') : '' }; });
    }
  },
  listings: {
    label: '매물', note: '지운 매물 제외',
    cols: [C('id', '매물번호'), C('unit', '호실', 1), C('type', '타입', 1), C('deal', '거래', 1), C('status', '상태', 1), C('pub', '공개', 1), C('price', '가격(만원)', 1), C('mgr', '담당', 1), C('writer', '등록자'), C('owner', '소유자', 0, { nm: 1 }), C('phone', '소유자 연락처', 0, { ph: 1 }), C('move', '입주 가능'), C('mgmt', '관리비(만원)'), C('facing', '향'), C('created', '등록일', 1), C('updated', '수정일'), C('memo', '메모')],
    async rows(db, f) {
      const cs = {}; (await X.cards(db)).forEach(c => { if (c.id) cs[c.id] = c; });
      return (await X.listings(db)).filter(l => inRange(ymd(l.created_at), f) && (!f.mgr || l.mgr === f.mgr) && (!f.dong || l.dong === f.dong) && (!f.deal || l.deal === f.deal) && (!f.status || l.status === f.status))
        .map(l => { const o = cs[l.card_id] || {}; return { id: l.id, unit: l.dong + '동 ' + l.ho + '호', type: l.type, deal: DEALS[l.deal] || l.deal, status: l.status, pub: { on: '공개', req: '공개 요청', off: '비공개' }[l.pub] || l.pub,
          price: l.deal === 'sale' ? l.ask || '' : [l.dep, l.rent].filter(x => x != null && x !== '').join(' / '), mgr: l.mgr || '', writer: l.writer || '', owner: o.name || '', phone: o.phone || '', move: l.move || '',
          mgmt: l.mgmt_na ? '확인 불가' : (l.mgmt ?? ''), facing: [l.facing, l.basis].filter(Boolean).join(' · '), created: ymd(l.created_at), updated: ymd(l.at), memo: l.memo || '' }; });
    }
  },
  units: {
    label: '세대현황', note: '동 · 호 · 거주형태 · 지금 소유자',
    cols: [C('dong', '동', 1), C('ho', '호', 1), C('type', '타입', 1), C('block', '단지'), C('occ', '거주형태', 1), C('checked', '확인일'), C('name', '소유자', 1, { nm: 1 }), C('phone', '소유자 연락처', 1, { ph: 1 }), C('carrier', '통신사'), C('contacts', '추가 연락처', 0, { ph: 1 }), C('share', '지분'), C('since', '취득일'), C('cause', '취득원인')],
    async rows(db, f) {
      return (await X.units(db)).filter(u => !f.dong || u.dong === f.dong).map(u => {
        let cts = []; try { cts = JSON.parse(u.contacts || '[]') || []; } catch (e) {}
        return { dong: u.dong, ho: u.ho, type: u.type, block: u.block || '', occ: u.occupancy || '', checked: u.checked_at || '', name: u.name || '', phone: u.phone || '', carrier: u.carrier || '',
          contacts: cts.map(c => [c.rel === '기타' ? c.etc || '기타' : c.rel, c.phone].filter(Boolean).join(' ')).join(' / '), share: u.share || '', since: u.since || '', cause: u.cause || '' };
      });
    }
  },
  tenancies: {
    label: '임대차 · 만기', note: '지금 살고 있는 계약 (만기 빠른 순)',
    cols: [C('dong', '동', 1), C('ho', '호', 1), C('type', '타입'), C('kind', '유형', 1), C('name', '임차인', 1, { nm: 1 }), C('phone', '임차인 연락처', 1, { ph: 1 }), C('deposit', '보증금(만원)', 1), C('rent', '월세(만원)', 1), C('contract', '계약일'), C('moveIn', '입주일'), C('end', '만기일', 1), C('left', '남은 일수', 1), C('renewal', '갱신청구권'), C('party', '계약주체'), C('memo', '메모')],
    async rows(db, f) {
      const today = ymd(Date.now()), dd = e => e ? Math.round((Date.parse(e) - Date.parse(today)) / 86400e3) : '';
      return (await X.tenancies(db, false)).filter(t => (!f.dong || t.dong === f.dong) && (!f.from || (t.end_date || '') >= f.from) && (!f.to || (t.end_date || '') <= f.to))
        .map(t => ({ dong: t.dong, ho: t.ho, type: t.type, kind: t.kind || '', name: t.name || '', phone: t.phone || '', deposit: t.deposit ?? '', rent: t.rent ?? '', contract: t.contract_date || '', moveIn: t.move_in || '', end: t.end_date || '', left: dd(t.end_date),
          renewal: t.renewal_right || '', party: t.party_name || t.party || '', memo: t.memo || '' }));
    }
  },
  leads: {
    label: '관심등록 원본', note: '사이트에서 손님이 직접 넣은 그대로 (직원이 고치기 전)',
    cols: [C('at', '접수일시', 1), C('kind', '구분', 1), C('name', '성명', 1, { nm: 1 }), C('phone', '연락처', 1, { ph: 1 }), C('birth', '생년월일'), C('unit', '호실', 1), C('interest', '관심', 1), C('visit', '방문 희망', 1), C('text', '문의', 1), C('req', '필수 동의'), C('mkt', '광고 수신 동의', 1), C('third', '제3자 제공 동의'), C('agreeAt', '동의 일시')],
    async rows(db, f) {
      const gs = (await X.cards(db)).filter(c => c.guest && inRange(day(c.at), f) && (!f.dong || dongOf(c.unit) === f.dong));
      const first = await X.firstVersions(db, gs.map(c => String(c.id)));
      return gs.sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))).map(c0 => { const c = first[c0.id] || c0, k = c.consent || {}; return { at: c.at || '', kind: (KIND[c.kind] || c.kind || '') + (c.visit ? ' · 방문예약' : ''), name: c.name || '', phone: c.phone || '', birth: c.birth || '', unit: unitText(c.unit), interest: c.interest || '', visit: c.visit || '', text: c.text || '',
        req: k.req || c.agree ? 'Y' : '', mkt: k.mkt ? 'Y' : 'N', third: k.third ? 'Y' : 'N', agreeAt: k.at || '' }; });
    }
  }
};

// 화면에 보여 줄 목록 (칸 이름 · 기본 칸)
export const meta = () => Object.keys(SETS).map(k => ({ key: k, label: SETS[k].label, note: SETS[k].note, cols: SETS[k].cols.map(c => ({ k: c.k, label: c.label, base: c.base, ph: !!c.ph, nm: !!c.nm })) }));

// 조건 · 칸 · 가림 정리 (이상한 값은 버림)
export function cleanReq(b) {
  const f0 = (b && b.f) || {}, d = v => /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '';
  const f = { from: d(f0.from), to: d(f0.to), dong: Number(f0.dong) || 0, deal: DEALS[f0.deal] ? f0.deal : '', mgr: String(f0.mgr || '').slice(0, 20), status: String(f0.status || '').slice(0, 10) };
  const sets = [...new Set((Array.isArray(b && b.sets) ? b.sets : []).filter(k => SETS[k]))];
  const cols = {};
  sets.forEach(k => { const want = b.cols && Array.isArray(b.cols[k]) ? b.cols[k] : null; cols[k] = SETS[k].cols.filter(c => want ? want.includes(c.k) : c.base); if (!cols[k].length) cols[k] = SETS[k].cols.filter(c => c.base); });
  const mask = { phone: !!(b && b.mask && b.mask.phone), name: !!(b && b.mask && b.mask.name) };
  return { f, sets, cols, mask };
}

// → [{ key, name(시트 이름), cols: [칸 이름], rows: [[값]] }]
export async function build(db, q) {
  const out = [];
  for (const k of q.sets) {
    const cs = q.cols[k], rs = await SETS[k].rows(db, q.f);
    out.push({ key: k, name: SETS[k].label, cols: cs.map(c => c.label), rows: rs.map(r => cs.map(c => {
      const v = r[c.k] == null ? '' : r[c.k];
      if (q.mask.phone && c.ph) return c.k === 'contacts' ? String(v).replace(/\d[\d-]{7,}\d/g, maskPh) : maskPh(v);
      if (q.mask.name && c.nm) return maskName(v);
      return v;
    })) });
  }
  return out;
}
