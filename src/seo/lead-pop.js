// 검색용 페이지(/plan · /dongho · /location · /listings …) 전용 관심등록 · 방문상담 예약 창 — 시안 r35 B안 확정 (2026-11-16)
// 페이지 안의 [관심등록] · [방문상담 예약] 링크(/?reg=… · /?visit=1)를 누르면 단지 화면으로 넘어가지 않고 그 자리에서 짧은 창을 띄운다.
// 보내는 곳은 단지 화면 창과 같은 /api/public/lead (서버 cleanLead · 로봇 막기 · 텔레그램 알림 그대로). 손님 구분은 신규고객(client) → 직원 화면 '관심등록 대기'
// 스크립트가 안 돌면 링크가 원래대로 단지 화면 창을 연다. ⚠ 이 글 안에 href="/ · src="/ 를 쓰지 말 것 (withBase 가 주소를 바꿈)
import SITE from '../../public/daelasoo/data/site.json' with { type: 'json' };
import { DEFAULT_COMPLEX } from '../core/complexes.js';

const O = SITE.office || {};
const e = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const TEL = O.tel || '';

// 개인정보 안내 — 단지 화면 창(dashboard.dc.html '개인정보 수집 및 이용 동의' 팝업)과 같은 글. 고칠 땐 두 곳 같이
const PRIV = [
  ['[필수] 개인정보 수집 및 이용 동의', ['수집 목적: 분양 문의·상담 처리, 방문 예약 확인 및 맞춤 상담 안내', '수집 항목: 성명, 휴대전화번호, 생년월일(선택), 희망 평형/타입, 매매의향', '보유 및 이용 기간: 상담 완료 및 해당 사업지 분양/계약 종료 시까지 (또는 동의 철회 시 즉시 파기)', '동의 거부 권리 및 불이익: 귀하는 개인정보 수집 및 이용 동의를 거부할 권리가 있습니다. 단, 필수 항목 동의 거부 시 분양 상담 및 방문 안내 서비스 이용이 제한됩니다.']],
  ['[선택] 마케팅 활용 및 광고성 정보 수신 동의', ['수집 목적: 신규 분양 정보 안내, 관심 지역 맞춤형 부동산 매물 추천, 프로모션/이벤트 안내, MGM 등록 및 관련 혜택 제공', '수집 항목: 성명, 휴대전화번호, 생년월일(선택), 거주 지역(시/구 단위)', '보유 및 이용 기간: 동의일로부터 2년 또는 동의 철회 시까지', '동의 거부 권리 및 불이익: 선택 항목 동의를 거부하시더라도 기본 분양 상담 및 안내 서비스는 정상적으로 이용 가능합니다.']],
  ['[선택] 개인정보 제3자 제공 동의', ['제공받는 자: 부동산광고, 그외 분양현장의 분양대행사', '제공받는 자의 이용 목적: 분양 사업지 현장 방문 예약 접수, 계약 관련 안내, 공식 이벤트 참여 확인 및 MGM 등록', '제공하는 항목: 성명, 휴대전화번호, 생년월일(MGM등록 및 이벤트 참여시 작성)', '제공받는 자의 보유 및 이용 기간: 해당 분양 프로젝트 종료 시 또는 제공 동의 철회 시까지', '동의 거부 권리 및 불이익: 제3자 제공 동의를 거부하실 수 있으며, 미동의 시에도 기본 상담은 가능하나 대행사를 통한 현장 공식 이벤트 참여나 프로모션 대상에서 제외될 수 있습니다.']]
];
const privHtml = PRIV.map(([h, L], i) => '<b>' + (i + 1) + '. ' + e(h) + '</b><ul>' + L.map(x => '<li>' + e(x) + '</li>').join('') + '</ul>').join('') +
  '<b>■ 개인정보 보호책임자</b><ul><li>' + e(O.name || '') + (O.ceo ? ' ' + e(O.ceo) : '') + '</li><li>연락처: ' + e(TEL) + '</li></ul>';

const CSS = '.lp-dim{position:fixed;inset:0;z-index:100;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}' +
  '.lp-dim[hidden]{display:none}.lp{width:100%;max-width:520px;max-height:calc(100vh - 32px);overflow:auto;background:#fff;border-radius:18px;font-size:14px}' +
  '.lp-h{display:flex;align-items:center;padding:14px 18px;border-bottom:1px solid #ececf0;position:sticky;top:0;background:#fff;z-index:1}.lp-h b{font-size:17px}' +
  '.lp-x{margin-left:auto;width:32px;height:32px;border:0;border-radius:50%;background:#f2f2f5;font-size:15px;cursor:pointer}' +
  '.lp-b{padding:12px 18px 18px}.lp label.f{display:block;font-size:12px;color:#424245;margin:10px 0 5px}.lp label.f em{color:#c8381e;font-style:normal}' +
  '.lp input.i,.lp select.i,.lp textarea.i{box-sizing:border-box;width:100%;height:42px;border:1px solid #d2d2d7;border-radius:10px;padding:0 10px;font:inherit;font-size:16px;color:#1d1d1f;background:#fff}' +
  '.lp textarea.i{height:76px;padding:8px 10px;resize:vertical}.lp-r2{display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
  '.lp-v{background:#fdf0ed;border-radius:12px;padding:2px 10px 10px;margin-top:10px}' +
  '.lp-ag{background:#f5f5f7;border-radius:12px;padding:8px 12px;margin-top:12px;font-size:13px}.lp-ag label{display:flex;gap:8px;align-items:center;padding:5px 0;cursor:pointer}' +
  '.lp-ag label input{width:18px;height:18px;margin:0;flex:none}.lp-ag .all{font-weight:700;border-bottom:1px solid #e3e3e8;padding-bottom:8px;margin-bottom:2px}.lp-ag em{color:#c8381e;font-style:normal}' +
  '.lp-ag details{font-size:12px;color:#6e6e73;margin-top:4px}.lp-ag summary{cursor:pointer;color:#0066cc}.lp-ag ul{margin:4px 0 8px;padding-left:18px}' +
  '.lp-ag small{display:block;color:#86868b;font-size:11px;margin-top:4px}.lp-err{color:#d2264b;font-size:13px;margin-top:10px}' +
  '.lp-go{width:100%;height:48px;border:0;border-radius:12px;background:#0066cc;color:#fff;font:inherit;font-weight:800;font-size:15px;margin-top:12px;cursor:pointer}.lp-go:disabled{opacity:.6;cursor:default}' +
  '.lp-ok{text-align:center;padding:30px 18px 22px}.lp-ok i{display:inline-block;width:44px;height:44px;border-radius:50%;background:#e8f5ec;color:#157a3f;font-style:normal;font-size:22px;font-weight:800;line-height:44px}' +
  '.lp-ok b{display:block;font-size:17px;margin:10px 0 4px}' +
  '@media(max-width:380px){.lp-r2{grid-template-columns:1fr}}@media(max-width:560px){.lp-dim{padding:0;align-items:flex-end}.lp{max-width:none;border-radius:18px 18px 0 0;max-height:92vh}}';

const HTML = '<div class="lp-dim" id="lp" hidden><div class="lp" role="dialog" aria-modal="true" aria-labelledby="lp-t">' +
  '<div class="lp-h"><b id="lp-t">관심등록</b><button type="button" class="lp-x" data-lp-x aria-label="닫기">✕</button></div>' +
  '<form class="lp-b" id="lp-f" novalidate>' +
  // 관심단지 | 관심 호실 (시안 r37) — 목록은 /api/public/complexes 에서 받아 바꿈 (못 받으면 단지 이름 하나)
  '<div class="lp-r2"><label class="f">관심단지<select class="i" name="complex"><option selected>' + e(DEFAULT_COMPLEX) + '</option></select></label>' +
  '<label class="f">관심 호실 (자유기재)<input class="i" name="interest" maxlength="80" placeholder="예: 104동 고층, 80B 고층"></label></div>' +
  '<div class="lp-r2"><label class="f">성명 <em>*</em><input class="i" name="name" maxlength="30" autocomplete="name"></label>' +
  '<label class="f">연락처 <em>*</em><input class="i" name="phone" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000"></label></div>' +
  '<div class="lp-v" id="lp-v"><div class="lp-r2"><label class="f">방문일 <em>*</em><input class="i" type="date" name="vDate"></label>' +
  '<label class="f">방문 시간 <em>*</em><select class="i" name="vTime"></select></label></div></div>' +
  '<label class="f">문의 내용 (선택)<textarea class="i" name="text" maxlength="1000"></textarea></label>' +
  '<div class="lp-ag"><label class="all"><input type="checkbox" data-all> 전체 동의</label>' +
  '<label><input type="checkbox" name="req"> <span><em>[필수]</em> 개인정보 수집 및 이용 동의</span></label>' +
  '<label><input type="checkbox" name="mkt"> [선택] 마케팅 활용 및 광고성 정보 수신 동의</label>' +
  '<label><input type="checkbox" name="third"> [선택] 개인정보 제3자 제공 동의</label>' +
  '<details><summary>내용 보기</summary>' + privHtml + '</details>' +
  '<small>* 미동의 시 방문예약, 혜택 및 현장 이벤트 사은품 지급 대상에서 제외될 수 있습니다</small></div>' +
  '<div class="lp-err" id="lp-e" hidden></div><button class="lp-go" id="lp-go">등록하기</button></form>' +
  '<div class="lp-ok" id="lp-ok" hidden><i>✓</i><b>작성되었습니다</b><span style="color:#6e6e73">담당자가 곧 연락드리겠습니다<br>상담문의 : <b style="display:inline;font-size:14px">' + e(TEL) + '</b></span>' +
  '<button type="button" class="lp-go" data-lp-x style="max-width:200px">닫기</button></div></div></div>';

// 손님 브라우저에서 도는 부분 (글자 그대로 페이지에 들어감)
const JS = `(function(){
var dim=document.getElementById('lp'),f=document.getElementById('lp-f'),ok=document.getElementById('lp-ok'),er=document.getElementById('lp-e'),go=document.getElementById('lp-go'),vb=document.getElementById('lp-v'),visit=false,last=null;
var p2=function(n){return String(n).padStart(2,'0')},ymd=function(d){return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate())};
var sel=f.vTime;sel.add(new Option('시간 선택',''));for(var m=600;m<=1020;m+=30)sel.add(new Option(p2(Math.floor(m/60))+':'+p2(m%60)));
f.vDate.min=ymd(new Date());
fetch('/api/public/complexes').then(function(r){return r.json()}).then(function(j){if(!j||!j.ok||!j.list||!j.list.length)return;var c=f.complex;c.innerHTML='';j.list.forEach(function(n){var o=new Option(n,n,n===j.def,n===j.def);c.add(o)})}).catch(function(){});
function tel(v){var d=v.replace(/\\D/g,'').slice(0,11);return d.length<4?d:d.length<8?d.slice(0,3)+'-'+d.slice(3):d.slice(0,3)+'-'+d.slice(3,d.length-4)+'-'+d.slice(-4)}
f.phone.addEventListener('input',function(){f.phone.value=tel(f.phone.value)});
var boxes=[f.req,f.mkt,f.third],all=f.querySelector('[data-all]');
all.addEventListener('change',function(){boxes.forEach(function(b){b.checked=all.checked})});
boxes.forEach(function(b){b.addEventListener('change',function(){all.checked=boxes.every(function(x){return x.checked})})});
function bad(t){er.textContent=t;er.hidden=false;go.disabled=false;go.textContent='등록하기'}
function open(u){visit=u.searchParams.get('visit')==='1';f.reset();er.hidden=true;ok.hidden=true;f.hidden=false;go.disabled=false;go.textContent='등록하기';
 document.getElementById('lp-t').textContent=visit?'방문상담 예약':'관심등록';vb.hidden=!visit;f.interest.value=String(u.searchParams.get('int')||'').slice(0,80);
 last=document.activeElement;dim.hidden=false;document.documentElement.style.overflow='hidden';setTimeout(function(){f.name.focus()},50)}
function close(){dim.hidden=true;document.documentElement.style.overflow='';if(last&&last.focus)last.focus()}
document.addEventListener('click',function(ev){var a=ev.target.closest&&ev.target.closest('a[href]');if(!a||ev.ctrlKey||ev.metaKey||ev.shiftKey)return;if(window.LP_SCOPE&&!a.closest(window.LP_SCOPE))return;var u;try{u=new URL(a.href)}catch(x){return}
 if(u.origin!==location.origin||!/\\/$/.test(u.pathname)||!(u.searchParams.get('reg')||u.searchParams.get('visit')==='1'))return;ev.preventDefault();open(u)});
dim.addEventListener('click',function(ev){if(ev.target===dim||ev.target.closest('[data-lp-x]'))close()});
document.addEventListener('keydown',function(ev){if(ev.key==='Escape'&&!dim.hidden)close()});
f.addEventListener('submit',function(ev){ev.preventDefault();er.hidden=true;
 var name=f.name.value.trim(),ph=f.phone.value,d=ph.replace(/\\D/g,'');
 if(!name)return bad('성명을 입력해 주세요');if(!/^01\\d{8,9}$/.test(d))return bad('연락처를 정확히 입력해 주세요 (예: 010-1234-5678)');
 if(visit&&(!f.vDate.value||!f.vTime.value))return bad('방문일과 방문 시간을 골라 주세요');
 if(!f.req.checked)return bad('[필수] 개인정보 수집 및 이용에 동의해 주세요');
 var n=new Date(),at=ymd(n)+' '+p2(n.getHours())+':'+p2(n.getMinutes()),v=visit?f.vDate.value+' '+f.vTime.value:'',t=f.text.value.trim();
 var card={id:'g'+Date.now(),kind:'client',at:at,interest:f.interest.value.trim(),complex:f.complex.value,name:name,phone:ph,birth:'',text:(visit?'[방문상담 예약] '+v+(t?'\\n':''):'')+t,visit:v||undefined,
  consent:{req:true,mkt:f.mkt.checked,third:f.third.checked,at:at}};
 go.disabled=true;go.textContent='보내는 중…';
 (window.hwipTs?window.hwipTs():Promise.resolve('')).then(function(ts){return fetch('/api/public/lead',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({card:card,ts:ts})})})
 .then(function(r){return r.json()}).then(function(j){if(!j.ok)return bad(j.err==='rate'?'접수가 너무 많습니다. 잠시 후 다시 시도하시거나 ${TEL}으로 전화 주세요':j.err==='robot'?'자동 등록 방지 확인에 실패했습니다. 새로고침 후 다시 시도해 주세요':'입력 내용을 확인해 주세요');
  f.hidden=true;ok.hidden=false})
 .catch(function(){bad('접수하지 못했습니다. 잠시 후 다시 시도하시거나 ${TEL}으로 전화 주세요')})});
})();`;

// 페이지 </body> 바로 앞에 붙일 덩어리. config.js · turnstile.js 는 단지 화면 것을 그대로 씀 (withBase 가 /daelasoo/ 아래로 바꿈)
// 단지 화면(index.html) '지금 입주 · 분양 가능한 세대' 칸 전용 (2026-11-18 대표): 그 칸 안 링크만 이 창으로 — 단지 화면 프로그램의 링크는 건드리지 않음.
//   config.js · turnstile.js 는 index.html 이 이미 불러 둠. tools/apply_site.mjs 가 <!-- site:leadpop --> 자리에 씀
export const leadPopIn = (scope, D) => { const s = '<style>' + CSS + '</style>' + HTML + '<script>window.LP_SCOPE=' + JSON.stringify(scope) + ';' + JS.replace(/<\/script/gi, '<\\/script') + '</script>';
  // D = 만드는 중인 site.json (다른 단지로 바꿔 만들 때 단지 이름 · 사무소가 따라가게)
  const n0 = DEFAULT_COMPLEX, n1 = ((D || {}).site || {}).name || n0, o1 = (D || {}).office || O;
  let out = s.split(n0).join(n1);
  if (O.name && o1.name) out = out.split(O.name).join(o1.name);
  if (TEL && o1.tel) out = out.split(TEL).join(o1.tel);
  return out;
};
export const leadPop = () => '<style>' + CSS + '</style>' + HTML +
  '<script src="/config.js"></script><script src="/turnstile.js"></script><script>' + JS.replace(/<\/script/gi, '<\\/script') + '</script>';
