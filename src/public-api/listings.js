// 공개 매물 (설계서 9.2 · 10.4) — 게스트용. 공개용 사본과 사무소 표시만 보낸다
//   GET /api/public/listings?deal=sale|jeonse|wolse|short
import { J } from '../lib/http.js';
import { listPublic, listDone } from '../repo/public-listings.js';
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

const DEALS = ['sale', 'jeonse', 'wolse', 'short'];

export async function publicListings(req, env, url) {
  if (req.method !== 'GET') return J({ ok: false, err: 'notfound' }, 404);
  const deal = url.searchParams.get('deal') || '';
  if (deal && !DEALS.includes(deal)) return J({ ok: false, err: 'input' }, 400);
  const o = SITE.office || {};
  // 끝난 매물은 바로 사라져야 하므로 캐시 안 함 (J 가 no-store)
  return J({ ok: true, rows: await listPublic(env.DB, deal), done: await listDone(env.DB), office: { name: o.name, ceo: o.ceo, regNo: o.regNo, address: o.address, tel: o.tel } });
}
