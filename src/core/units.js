// 호실 목록 — site.json 의 동 · 라인 · 층에서 만든다 (화면 buildSite 와 같은 규칙)
//   lines = 라인별 층 범위 · wide = 두 라인 합친 세대(148 · 218) · duplex = 복층(아래층 호수 1개) · skip = 세대 없는 층
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };

export function buildUnits(S) {
  const out = [];
  (S.units.buildings || []).forEach(B => {
    const skip = B.skip || [], wide = B.wide || [];
    const add = (f, l, type) => { const ho = f * 100 + l; out.push({ id: B.no + '-' + ho, dong: B.no, ho, floor: f, line: l, type, block: B.block || '' }); };
    const inWide = (f, l) => wide.some(w => f >= w.from && f <= w.to && w.lines.includes(l));
    B.lines.forEach(L => { for (let f = L.from; f <= L.to; f++) if (!skip.includes(f) && !inWide(f, L.line)) add(f, L.line, L.type); });
    wide.forEach(w => { if (w.duplex) add(w.from, w.line, w.type); else for (let f = w.from; f <= w.to; f++) if (!skip.includes(f)) add(f, w.line, w.type); });
  });
  return out;
}

export const UNITS = buildUnits(SITE);
export const UNIT = Object.fromEntries(UNITS.map(u => [u.id, u]));
