// AI로 다듬기 (설계서 11.1 · 17.0 #10) — 직원이 누를 때만 AI 한 번. Gemini · Claude 둘 다 (시안 ai-provider A안 · 가 확정 2026-11-04)
//   키: GEMINI_API_KEY · ANTHROPIC_API_KEY (.dev.vars · Cloudflare Secret). 고르기: cfg aiCfg { provider: auto|gemini|claude|off, model }
//     auto = Gemini 키가 있으면 Gemini, 없으면 Claude. 고른 쪽 키가 없으면 다른 쪽으로
//   보내는 것: 매물 조건이 담긴 초안 본문만 (필수 표시 블록은 떼고 보냄). 고객 · 소유자 이름 · 연락처는 초안에 없으므로 나가지 않는다
//   돌아온 글에는 블록을 다시 붙이고 금지 표현을 한 번 더 검사 (staff-api/ads.js)
import Anthropic from '@anthropic-ai/sdk';
import { MEDIA, BLOCK_HEAD } from './templates.js';

export const AI_MODEL = 'claude-opus-5-5';
export const GEMINI_MODEL = 'gemini-2.5-flash';   // 2026-11-04 실제 키로 확인: 3초 응답 (gemini-flash-latest 는 40초 넘게 답 없음). 광고 탭에서 다른 모델을 고를 수 있음
export const AI_NAME = { gemini: 'Gemini', claude: 'Claude' };
export const AI_CODE = { claude: 1, gemini: 2 };      // ad_drafts.ai (0 = 사람)
const TONE = {
  blog: '네이버 블로그 글. 제목 한 줄 + 본문 800~1,500자. 존댓말, 차분하고 믿음 가는 중개사무소 말투.',
  karrot: '당근 비즈프로필 소식. 짧고 친근한 동네 이웃 말투, 6~8줄.',
  insta: '인스타그램 캡션. 첫 줄에 눈에 띄는 한 줄, 이모지는 줄마다 하나 이하, 8~10줄.',
  sms: '문자 · 카톡. 3~4줄, 90자 안팎. 인사 한 줄 + 핵심 조건 + 연락 안내.',
  naver: '네이버부동산 매물 설명 칸. 2~3문장, 사실만.'
};
const SYSTEM = [
  '당신은 광주의 공인중개사무소 광고 글을 다듬는 편집자입니다.',
  '주어진 초안의 사실(가격 · 면적 · 층 · 향 · 입주일 · 관리비 · 단지 정보)은 숫자와 표현을 바꾸지 말고 그대로 둡니다. 없는 사실을 지어내지 않습니다.',
  '"최저가 · 확정 수익 · 무조건 · 100% · 파격 · 대박 · 시세보다 싼" 같은 과장 · 단정 표현은 쓰지 않습니다. 근거 없는 "급매"도 쓰지 않습니다.',
  '중개보조원 · 담당 직원 이름은 넣지 않습니다. 사무소 정보 · 표시 항목 블록은 시스템이 따로 붙이므로 쓰지 않습니다.',
  '결과는 다듬은 글만 출력합니다. 설명 · 머리말 · 따옴표 없이.'
].join('\n');

const cfgOf = c => Object.assign({ provider: 'auto', model: '' }, c && typeof c === 'object' ? c : {});
// 쓸 AI: 'gemini' | 'claude' | '' (없음 · 끔)
export function pickProvider(env, cfg) {
  const c = cfgOf(cfg), has = { gemini: !!env.GEMINI_API_KEY, claude: !!env.ANTHROPIC_API_KEY };
  if (c.provider === 'off') return '';
  if (has[c.provider]) return c.provider;
  return has.gemini ? 'gemini' : has.claude ? 'claude' : '';
}
export const geminiModel = (env, cfg) => (cfgOf(cfg).model || env.GEMINI_MODEL || GEMINI_MODEL).replace(/^models\//, '');

const userText = (media, text) => {
  const i = String(text).indexOf(BLOCK_HEAD), plain = (i >= 0 ? String(text).slice(0, i) : String(text)).trim().slice(0, 4000);
  return '매체: ' + MEDIA[media] + '\n형식: ' + TONE[media] + '\n\n초안:\n' + plain;
};

// { ok, text, by } | { ok:false, err:'nokey'|'refusal'|'busy'|'api', msg }
export async function polish(env, media, text, cfg) {
  const by = pickProvider(env, cfg);
  if (!by) return { ok: false, err: 'nokey', msg: cfgOf(cfg).provider === 'off' ? 'AI 다듬기가 꺼져 있습니다 (광고 탭 › AI 다듬기).' : 'AI 키가 없습니다 (.dev.vars 의 GEMINI_API_KEY 또는 ANTHROPIC_API_KEY).' };
  const r = by === 'gemini' ? await viaGemini(env, geminiModel(env, cfg), userText(media, text)) : await viaClaude(env, userText(media, text));
  return Object.assign(r, { by });
}

// ── Gemini (generateContent, 설치 없이 fetch) ─────────────
const gApi = env => (env.GEMINI_API || 'https://generativelanguage.googleapis.com') + '/v1beta/';
// 답 해석 — 막힘(안전) · 빈 답 · 글
export function readGemini(j) {
  if (j && j.promptFeedback && j.promptFeedback.blockReason) return { ok: false, err: 'refusal', msg: 'AI가 이 글을 다듬지 않았습니다. 초안을 그대로 쓰세요.' };
  const c = j && Array.isArray(j.candidates) ? j.candidates[0] : null;
  if (c && /SAFETY|PROHIBITED|BLOCKLIST|RECITATION/.test(c.finishReason || '')) return { ok: false, err: 'refusal', msg: 'AI가 이 글을 다듬지 않았습니다. 초안을 그대로 쓰세요.' };
  const out = c && c.content && Array.isArray(c.content.parts) ? c.content.parts.filter(p => typeof p.text === 'string' && !p.thought).map(p => p.text).join('').trim() : '';
  return out ? { ok: true, text: out } : { ok: false, err: 'api', msg: 'AI 답이 비었습니다.' };
}
export function geminiErr(status, j) {
  const m = String((j && j.error && (j.error.status + ' ' + j.error.message)) || '');
  if (status === 429 || status === 503 || status === 500) return { ok: false, err: 'busy', msg: 'AI가 바쁩니다 (무료 한도 또는 Google 쪽 사정). 잠시 뒤 다시 눌러 주세요.' };
  if (status === 404) return { ok: false, err: 'api', msg: 'Gemini 모델 이름을 찾을 수 없습니다 (광고 탭 › AI 다듬기에서 모델을 다시 고르세요).' };
  if (status === 401 || status === 403 || /API_KEY|PERMISSION/.test(m)) return { ok: false, err: 'api', msg: 'Gemini 키가 맞지 않습니다.' };
  return { ok: false, err: 'api', msg: 'AI 오류 (' + status + ')' };
}
async function viaGemini(env, model, text) {
  try {
    const r = await fetch(gApi(env) + 'models/' + encodeURIComponent(model) + ':generateContent', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text }] }], generationConfig: Object.assign({ maxOutputTokens: 4000 }, /^gemini-2\.5-flash/.test(model) ? { thinkingConfig: { thinkingBudget: 0 } } : {}) }),   // 다듬기는 생각 단계 없이 (빠르게)
      signal: AbortSignal.timeout(60e3)
    });
    const j = await r.json().catch(() => null);
    return r.ok ? readGemini(j) : geminiErr(r.status, j);
  } catch (e) { return { ok: false, err: 'busy', msg: 'AI 연결 실패 — 잠시 뒤 다시 눌러 주세요.' }; }
}
// 설정 화면 모델 고르기: 글을 만들 수 있는 Gemini 모델 목록
export async function geminiModels(env) {
  if (!env.GEMINI_API_KEY) return [];
  try {
    const r = await fetch(gApi(env) + 'models?pageSize=200', { headers: { 'x-goog-api-key': env.GEMINI_API_KEY }, signal: AbortSignal.timeout(15e3) });
    const j = r.ok ? await r.json() : null;
    return ((j && j.models) || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent') && /gemini/.test(m.name) && !/image|tts|embedding|audio|live/.test(m.name))
      .map(m => ({ id: m.name.replace(/^models\//, ''), name: m.displayName || m.name.replace(/^models\//, '') }));
  } catch (e) { return []; }
}

// ── Claude ─────────────────────────────────────────────
async function viaClaude(env, text) {
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 60e3 });
  try {
    const r = await client.beta.messages.create({
      model: AI_MODEL, max_tokens: 4000,
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
      system: SYSTEM,
      messages: [{ role: 'user', content: text }]
    });
    if (r.stop_reason === 'refusal') return { ok: false, err: 'refusal', msg: 'AI가 이 글을 다듬지 않았습니다. 초안을 그대로 쓰세요.' };
    const out = r.content.filter(b => b.type === 'text').map(b => b.text).join('').trim();
    return out ? { ok: true, text: out } : { ok: false, err: 'api', msg: 'AI 답이 비었습니다.' };
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) return { ok: false, err: 'api', msg: 'AI 키가 맞지 않습니다.' };
    if (e instanceof Anthropic.RateLimitError) return { ok: false, err: 'busy', msg: 'AI 요청이 많습니다. 잠시 뒤 다시 하세요.' };
    if (e instanceof Anthropic.APIError) return { ok: false, err: 'api', msg: 'AI 오류 (' + e.status + ')' };
    return { ok: false, err: 'api', msg: 'AI 연결 실패' };
  }
}
