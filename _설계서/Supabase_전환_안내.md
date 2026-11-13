# Supabase 전환 안내 (P8 — 필요해질 때만)

지금은 D1 그대로 씁니다. 아래는 나중에 Supabase로 바꾸고 싶을 때의 순서입니다. (설계서 4.3)
전환해도 직원 · 손님 화면은 그대로이고, 바뀌는 것은 `wrangler.jsonc` 의 `DB_DRIVER` 한 줄입니다.

## 1. Supabase 준비 (한 번)
1. supabase.com 가입 → 새 프로젝트 (지역: **Seoul**)
2. 왼쪽 **SQL Editor** 에서 아래를 실행 (비밀번호는 새로 정함)
   ```sql
   CREATE ROLE hwip LOGIN PASSWORD '여기에-긴-비밀번호';
   CREATE SCHEMA hwip AUTHORIZATION hwip;
   ALTER ROLE hwip SET search_path = hwip;
   ```
   - 표는 `hwip` 칸에만 만들어집니다. Supabase 기본 `public` 칸은 인터넷(REST)으로 열려 있어서 쓰지 않습니다.
   - 연결해 보니 `hwip` 칸이 아니면 서버가 표를 만들기 전에 멈춥니다 (실수 방지).
3. 위쪽 **Connect** → **Transaction pooler** 주소를 복사하고, 사용자 이름을 `hwip.<프로젝트번호>` 로, 비밀번호를 2번 것으로 바꿉니다.
   예: `postgresql://hwip.abcd1234:비밀번호@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres`
4. 이 PC의 `.dev.vars` 에 한 줄: `SUPABASE_DB_URL=위 주소` (git에 안 올라감)

## 2. 옮기기
1. 직원 화면 › 설정 › 내보내기 · 백업 › **[전체 백업 받기]** (비밀번호 정함) → `.hwipbak` 파일
2. 그 순간부터 직원들 입력 잠시 멈춤
3. `node tools/db_move.mjs to-supabase 받은파일.hwipbak --pw 비밀번호`
   → 표마다 `✔ 건수 ↔ 건수`, 마지막 줄 **`→ 100% 일치`** 가 나와야 다음으로
4. Cloudflare 비밀값 등록: `npx wrangler secret put SUPABASE_DB_URL`
5. `wrangler.jsonc` 의 `"DB_DRIVER": "d1"` → `"supabase"` 로 바꾸고 배포
6. 직원들 다시 로그인 (출입증은 옮기지 않음) → 화면 확인
7. (확인용) 새로 [전체 백업 받기] → `node tools/db_move.mjs compare 전환전.hwipbak 전환후.hwipbak --pw 비밀번호`
8. D1 은 1주일간 그대로 두었다가 정리

## 3. 되돌아가기 (Supabase → D1)
1. [전체 백업 받기] → `node tools/db_move.mjs to-d1 받은파일.hwipbak --pw 비밀번호 --out 되돌림.sql`
2. `npx wrangler d1 execute hwip-db --remote --file 되돌림.sql`
3. `DB_DRIVER` 를 `"d1"` 로 바꾸고 배포

## 참고
- 비용: Supabase 무료판은 7일간 접속이 없으면 일시정지 · DB 500MB. 실사용이면 Pro(월 $25 수준).
- 더 빠르게: Cloudflare **Hyperdrive** 를 붙이면 (`wrangler.jsonc` 에 `hyperdrive` 칸, binding `HYPERDRIVE`) 서버가 그 주소를 먼저 씁니다.
- 시험: `npm run test:supabase` — 모든 자동 시험을 PostgreSQL 로 돌립니다 (PGlite). `tests/migrate.test.js` 가 D1 → Supabase → D1 100% 일치(설계서 1.4 기준 6)를 확인합니다.
