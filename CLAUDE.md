# rental-home — 첨단대라수1차(DAELASOO) 사이트 작업 규칙

> **이 폴더만 고친다.** 아이파크(`../site_Ipark`) · 상무지구 OP(`../site_op`)와 완전히 따로 — 폴더 · GitHub 저장소 · Cloudflare 이름 · DB · 비밀값 모두 별개. 두 폴더는 읽기만(벤치마킹) — `.claude/settings.json` 이 고치기를 막음.
> 대화를 시작하면 **어느 사이트 작업인지 먼저 확인**한다 (2026-11-13 대표).
> 이 파일은 매 대화 시작 때 자동으로 읽힌다. **짧게 유지할 것.**

## 사이트 개요 (2026-11-13 대표 결정)
- 공개용 + 직원용 겸용. 공개는 **단지소개 · 관심등록이 중심**. 공실 · 분양 가능 세대는 **관리자 모드에서 골라** 공개.
- 기본틀 = site_Ipark 코드 복사 (보안 · 권한 · 가림 · 알림 · 백업 그대로). 기존 대라수 사이트 기능은 **B안**: `소스/DAELASOO/참고만_CD_DaelaSoo1-main/`(https://cd-daelasoo1.sangmooone.workers.dev 원본, **수정 금지 · git 에 안 올림**)을 보고 다시 만든다.
- 주소: 첫 화면 `https://rental-home.onegongin.workers.dev/` · 단지 `/daelasoo/` · 직원 `/daelasoo/staff/` · 검색용 `/daelasoo/plan` · `/daelasoo/sitemap.xml` 등 (서버가 SITE_URL 경로 아래에서만 만듦, `src/worker.js` subPath · withBase)
- GitHub 저장소 · Cloudflare 이름 **rental-home** · Cloudflare 계정 **onegonginn@gmail.com** (하위주소 onegongin) · DB rental-home-db · R2 rental-home-backup · rental-home-media

## 진행 상황 (단계가 끝날 때마다 이 표와 커밋을 갱신)
| 단계 | 상태 | 커밋 |
|---|---|---|
| R0 폴더 준비 | **완료 (2026-11-13)** — 아이파크 코드만 복사(사진 · 소스 · 설계서 · DB · 비밀값 · git 기록 안 가져옴) · 화면 전체를 `public/daelasoo/` 로 · 첫 화면 `public/index.html`(임시 카드 1개) · wrangler.jsonc 새 이름(database_id 는 0000… — 배포 전 금지) · Turnstile 시험 키 · 새 사무실 코드 `.dev.vars` · 경로 시험 `tests/base-path.test.js` · `npm test` 94개 통과. ⚠ 아직 `public/daelasoo/data/site.json` · 화면 문구 · 검색 페이지 내용 · 직원 화면 팝업 링크(`'/?reg=1'` 등, dashboard 4590줄 · 2171줄)는 아이파크 것 → R1. GitHub 저장소 연결은 대표가 저장소를 만든 뒤 | 3833cff |
| R1 공개 화면 | **완료 (2026-11-13)** — site.json 대라수로(code dls · 101~104동 1~3라인 4~28층 300세대 · 80A/80B/59A/59B/59C 면적 · 색은 참고 사이트 값 · 방3욕2는 기본값) · 사진 39장 로고 새김(watermark.py FILES, `assets/dls/`; 무슨 그림인지 모르는 `plans/more/` · `more/` 는 화면에 아직 안 씀) · prices · options · subtypes.json 은 빈 틀(분양가 · 옵션 모듈 꺼 둠, 월세 꺼 둠) · 검색 페이지 `src/seo/guide.js` · `pages.js` · 광고 글이 site.json 값으로(`src/core/site-text.js`, 분양가 · 입지 자료 없으면 /price · /location 안 만듦) · 직원 팝업 링크 단지 주소로(siteHref) · 시험 자료 대라수 호실로 · `npm test` 94개 통과. ⚠ 모르는 값(비워 둠): 정확한 주소 · 사용승인일 · 주차대수 · 향 · 단지배치도 누르는 칸 → 대표 확인 후 site.json | |
| (R1 원래 계획) | 첫 화면 `public/index.html` = 단지 카드 방식 (시안 home-first A안 확정 2026-11-13, 단지가 늘면 카드만 추가 · 카드 사진 `daelasoo/assets/dls/hero.jpg` = 대라수1차.jpg 에 로고 새김 완료 2026-11-13 — R1 에서 watermark.py FILES 에도 넣기). 확정(2026-11-13 대표): 타입 이름 **80A · 80B** (소스의 84A · 84B 파일 이름은 80A · 80B 로 읽음) · 사무소 **제니스원부동산**(아이파크와 같은 사무소). site.json 대라수로(300세대 · 101~104동 · 4~28층 · 80A/80B · 59A/59B/59C · 광폭테라스 101·104동 4층) · `소스/DAELASOO/소스` 사진에 로고 새기기(tools/watermark.py 의 SRC 경로도 이 폴더로) · 단지소개 + 관심등록 중심 화면 · 시험 자료를 대라수 호실로 · 첫 화면 모양 | |
| R2 직원 기본 | 세대DB 300호실 · 상담카드(분양전환 · 자금계획 · 계약 정보) · **공실 · 분양 가능 세대 공개 선택(관리자)** | |
| R3 대라수 전용 기능 | 참고 사이트 기준: KPI 보드 · 일일업무보고 · 요청함 · 상담참고/지시 · 사용 불편사항 · MGM · 수수료 청구서(3.3% · 부가세 10%) · 전세연장 계산 · 미상담 세대 | |
| R4 기존 자료 옮기기 | 기존 사이트 CSV · 구글시트 BACKUP → 엑셀 가져오기 (개인정보 — git 금지, `_자료/` 에 두기) | |
| R5 배포 | `npx.cmd wrangler login`(onegonginn) → D1 · R2 만들기 → Turnstile 위젯 · 비밀값(STAFF_KEY · TG_TOKEN 새 봇 · GEMINI_API_KEY) → deploy → 검색 등록. 순서는 `_설계서/다른단지_만들기.md` 5장 | |

- 작업 시작 전 `git pull`, 끝나면 커밋 + push (저장소 연결 뒤)
- 프로젝트 안에 `O:\` 같은 절대 경로를 쓰지 않는다
- 로컬 확인: `npx.cmd wrangler dev` → http://localhost:8787/daelasoo/ (직원 사무실 코드 = `.dev.vars` STAFF_KEY, PC마다 직접)

## 폴더
- `public/index.html` rental-home 첫 화면 · `public/daelasoo/` 단지 화면 전체(index · staff · dashboard.dc.html · data · assets · maps)
- `src/` 서버 · `tests/` 자동 시험 · `tools/` 자료 만드는 도구(경로는 public/daelasoo/ 기준)
- `소스/` 단지별 원본 자료 (2026-11-13 대표가 정리) — `소스/DAELASOO/소스/` 대라수 사진 · 평면 · 배치도(열지 말고 파일명 · 크기만 다룸) · `소스/DAELASOO/참고만_CD_DaelaSoo1-main/` 기존 사이트(참고만, git 에 안 올림). 다른 단지가 생기면 `소스/<단지>/` 로 · `소스/사무소로고.png` = **사진 워터마크 전용**(모든 단지 공통, 아이파크와 같은 파일 — 사진 정중앙 · 진하기 3% · 파일에 새김, `tools/watermark.py`, 실행은 `py tools/watermark.py`)
- `_설계서/` 다른단지_만들기 · Supabase_전환_안내 · 스타일 가이드

## 사용자
- 공인중개사 대표, 코딩 초보. 전문 용어는 괄호 안에 쉬운 말로. **답변 · 질문 · 보고는 한국어로.**
- 결정이 필요하면 2~3가지 선택지 + 추천안을 먼저 제시. 결과 보고는 짧게: 무엇이 바뀌었나 / 어디서 확인하나 / 다음 할 일 1개.

## 배포 모드
현재 기본값: **미리보기자동** (R5 배포 전까지는 커밋 · push 만) — 테스트 통과 시 `preview` 브랜치 push, 대표가 "본 사이트에 올려줘" 할 때만 `main`. push 전에 한 줄로 알림. 비밀값(.dev.vars · 토큰 · 키 · PIN)은 절대 커밋하지 않는다.

## 토큰 절약 · 화면 작업 순서
1. `public/daelasoo/dashboard.dc.html`(약 750KB) · 참고 사이트 `index.html`(약 800KB)은 **통째로 Read 금지** — grep 으로 찾고 필요한 줄만.
2. 사진은 열어보지 않는다 (대표가 요청할 때만).
3. 새 화면은 `public/preview/<이름>.html` 단독 시안 → 대표 확인 → "확정"이면 연결. 스타일은 `public/preview/style-tokens.css` (배경 #f5f5f7 · 글자 #1d1d1f · 링크 #0066cc · 선택 #c8381e · 카드 흰색 · 모서리 14px · Pretendard · 휴대폰 560px 이하도).
4. 한 대화 = 한 단계(R번호).

## 구조 원칙 (아이파크와 같음)
- 화면은 DB 직접 접속 금지, 모든 요청은 Worker(`src/`). 권한 검사 · 전화번호 가리기는 서버에서.
- 게스트 `src/public-api/` 와 직원 `src/staff-api/` 완전 분리. DB는 `src/repo/` 통해서만.
- 권한 · 가리기 관련 수정이면 `npm test` 후 결과 한 줄 보고. 화면 수정이면 휴대폰 폭도 확인.
