// 서버에서 가리기 (설계서 7.3) — 권한 없는 사람에게 보내기 직전에 통과시킨다
export const maskPhone = p => { if (!p) return ''; const d = String(p).replace(/\D/g, ''); return d.length >= 9 ? d.slice(0, 3) + '-****-****' : '****'; };
export const maskName = n => { n = String(n || ''); return n.length <= 1 ? (n ? '*' : '') : n.length === 2 ? n[0] + '*' : n[0] + '*'.repeat(n.length - 2) + n[n.length - 1]; };

// 글 속에 섞인 전화번호 · 메일
export const maskText = t => String(t)
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '***@***')
  .replace(/\+?\d[\d\s.\-()]{7,}\d/g, m => { const n = m.replace(/\D/g, ''); return n.length >= 9 && n.length <= 13 ? n.slice(0, 3) + '-****-****' : m; });

const DROP = new Set(['memo', 'birth']);          // 민감 칸: 비워서 보냄
const NAME = /^(name|owner|tenant)$/;
const PHONE = /phone|tel/i;

export function maskDeep(v, key) {
  if (Array.isArray(v)) return v.map(x => maskDeep(x, key));
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = maskDeep(v[k], k); return o; }
  if (typeof v !== 'string' || !v) return v;
  if (DROP.has(key)) return '';
  if (PHONE.test(key || '')) return maskPhone(v);
  if (NAME.test(key || '')) return maskName(v);
  return maskText(v);
}

// 가린 값을 받은 직원이 그대로 돌려보내면 원래 값으로 되돌린다 (가린 글자가 원본을 덮어쓰지 않게)
export function unmask(inc, stored) {
  const walk = (a, s, m) => {
    if (Array.isArray(a) && Array.isArray(s)) return a.map((x, i) => i < s.length ? walk(x, s[i], m[i]) : x);
    if (a && s && typeof a === 'object' && typeof s === 'object' && !Array.isArray(a) && !Array.isArray(s)) {
      const o = {};
      for (const k of Object.keys(a)) o[k] = k in s ? walk(a[k], s[k], m[k]) : a[k];
      for (const k of Object.keys(s)) if (!(k in a) && JSON.stringify(m[k]) !== JSON.stringify(s[k])) o[k] = s[k];
      return o;
    }
    return a === m && a !== s ? s : a;
  };
  return walk(inc, stored, maskDeep(stored));
}
