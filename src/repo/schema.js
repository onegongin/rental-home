// 표 만들기 (처음 요청 때 한 번). 세대 · 사람 · 소유 · 임대차 정식 표는 repo/d1.js (P3)
const ready = new Set();   // DB마다 한 번 (d1 · supabase · 시험 DB)
export async function init(db) {
  const key = db.key || 'd1';
  if (ready.has(key)) return;
  await db.batch([
    // 화면 공유 자료 (설정 cfg · 상담카드 c) — 챔피언스시티 방식 그대로. 세대(u)는 P3부터 units 표
    db.prepare('CREATE TABLE IF NOT EXISTS kv (s TEXT NOT NULL, k TEXT NOT NULL, v TEXT, at INTEGER, by TEXT, sv INTEGER, PRIMARY KEY (s, k))'),
    db.prepare('CREATE INDEX IF NOT EXISTS kv_sv ON kv (sv)'),
    db.prepare('CREATE TABLE IF NOT EXISTS hist (id INTEGER PRIMARY KEY AUTOINCREMENT, s TEXT, k TEXT, v TEXT, at INTEGER, by TEXT, sv INTEGER)'),
    // 직원 · 출입증(세션) · 등록 기기 · 감사기록 · 횟수 제한 (설계서 7장)
    db.prepare('CREATE TABLE IF NOT EXISTS staff (name TEXT PRIMARY KEY, role TEXT NOT NULL, hash TEXT, salt TEXT, must_change INTEGER DEFAULT 0, fails INTEGER DEFAULT 0, lock_until INTEGER DEFAULT 0, active INTEGER DEFAULT 1, at INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS sessions (tok TEXT PRIMARY KEY, name TEXT NOT NULL, dev TEXT, exp INTEGER, at INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS devices (tok TEXT PRIMARY KEY, label TEXT, at INTEGER, exp INTEGER, seen INTEGER, revoked INTEGER DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, who TEXT, act TEXT, target TEXT, detail TEXT, ip TEXT, dev TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS audit_at ON audit (at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS rate (k TEXT PRIMARY KEY, n INTEGER, reset INTEGER)'),
    // 게스트 댓글 (설계서 7.5) — 고객 · 소유자 · 임차인 표와 연결하지 않는다
    //   target: 'u:동-호' (P4에서 'l:매물id') · status: open 공개 | wait 승인 대기(금지어) | hidden 숨김
    db.prepare('CREATE TABLE IF NOT EXISTS guests (id TEXT PRIMARY KEY, tok TEXT UNIQUE, name TEXT, at INTEGER, exp INTEGER)'),
    db.prepare('CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, target TEXT NOT NULL, pid TEXT, author TEXT, staff TEXT, name TEXT, text TEXT, masked INTEGER DEFAULT 0, broker INTEGER DEFAULT 0, status TEXT DEFAULT \'open\', hide_by TEXT, reports INTEGER DEFAULT 0, ip TEXT, at INTEGER, edited INTEGER, del_at INTEGER)'),
    db.prepare('CREATE INDEX IF NOT EXISTS comments_t ON comments (target, at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS comment_hist (id INTEGER PRIMARY KEY AUTOINCREMENT, cid TEXT, at INTEGER, who TEXT, act TEXT, text TEXT)'),
    db.prepare('CREATE TABLE IF NOT EXISTS comment_reports (cid TEXT, who TEXT, at INTEGER, PRIMARY KEY (cid, who))'),
    // 매물 (설계서 8.4, P4) — 상담카드 '입주 후 거래' 칩마다 1건. pub: off 비공개 | req 공개 요청 | on 공개
    db.prepare("CREATE TABLE IF NOT EXISTS listings (id TEXT PRIMARY KEY, unit_id TEXT NOT NULL, deal TEXT NOT NULL, status TEXT NOT NULL DEFAULT '접수', pub TEXT NOT NULL DEFAULT 'off', pub_at INTEGER, req_by TEXT, req_at INTEGER, source TEXT NOT NULL DEFAULT 'card', card_id TEXT, writer TEXT, mgr TEXT, ask INTEGER, adj INTEGER, dep INTEGER, rent INTEGER, term TEXT, move TEXT, mgmt INTEGER, mgmt_items TEXT DEFAULT '[]', facing TEXT, basis TEXT, urgent INTEGER DEFAULT 0, memo TEXT, at INTEGER, created_at INTEGER, deleted_at INTEGER, ver INTEGER DEFAULT 1)"),
    db.prepare('CREATE INDEX IF NOT EXISTS listings_unit ON listings (unit_id, deal, status)'),
    db.prepare('CREATE TABLE IF NOT EXISTS listing_grants (listing_id TEXT, staff TEXT, perm TEXT, until TEXT, by TEXT, at INTEGER, PRIMARY KEY (listing_id, staff))'),
    db.prepare('CREATE TABLE IF NOT EXISTS listing_events (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id TEXT, at INTEGER, who TEXT, act TEXT, detail TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS listing_events_l ON listing_events (listing_id, id)'),
    // 공개용 사본 — 게스트는 이 표만 읽음. 사람 정보 · 호수 칸 없음
    db.prepare('CREATE TABLE IF NOT EXISTS public_listings (id TEXT PRIMARY KEY, deal TEXT, dong INTEGER, block TEXT, label TEXT, band TEXT, type TEXT, kind TEXT, exclusive REAL, supply REAL, ask INTEGER, dep INTEGER, rent INTEGER, term TEXT, move TEXT, mgmt INTEGER, mgmt_items TEXT, facing TEXT, basis TEXT, rooms INTEGER, baths INTEGER, approval TEXT, parking TEXT, urgent INTEGER, badge TEXT, contact TEXT, tel TEXT, at INTEGER, updated INTEGER)'),
    // 동시 수정 막기: 매물 저장 묶음 맨 앞에서 ver 가 다르면 여기에 1을 넣어 묶음 전체 취소
    db.prepare('CREATE TABLE IF NOT EXISTS listing_guard (ok INTEGER NOT NULL CHECK (ok = 0))'),
    // 공개 매물 중개요청 (2026-11-02): 손님 성명 · 연락처 · 문의 → 직원 알림, 처음 확인한 직원(claim_by)이 담당
    db.prepare('CREATE TABLE IF NOT EXISTS broker_reqs (id TEXT PRIMARY KEY, listing_id TEXT, cid TEXT, name TEXT, phone TEXT, msg TEXT, label TEXT, ip TEXT, at INTEGER, claim_by TEXT, claim_at INTEGER)'),
    db.prepare('CREATE INDEX IF NOT EXISTS broker_reqs_at ON broker_reqs (at)'),
    // 알림 발송기록 (설계서 8.5 · 12장, P5) — to_kind: group 그룹방 | dm 개인. status: held 조용한 시간 보류 | sent | fail | skip(봇 · 방 없음)
    db.prepare('CREATE TABLE IF NOT EXISTS notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, kind TEXT, to_kind TEXT, to_name TEXT, chat TEXT, text TEXT, urgent INTEGER DEFAULT 0, status TEXT, tries INTEGER DEFAULT 0, err TEXT, sent_at INTEGER)'),
    db.prepare('CREATE INDEX IF NOT EXISTS notifications_st ON notifications (status, at)'),
    // 직원 텔레그램 연결 코드 (10분짜리, 한 번 쓰면 지움)
    db.prepare('CREATE TABLE IF NOT EXISTS tg_links (code TEXT PRIMARY KEY, name TEXT, exp INTEGER)'),
    // 광고 초안 · 외부 게시기록 (설계서 8.5, P6) — 초안은 매체마다 버전을 쌓고, 게시기록은 내림 완료(down_at)까지 '게시 중'
    db.prepare('CREATE TABLE IF NOT EXISTS ad_drafts (id INTEGER PRIMARY KEY AUTOINCREMENT, listing_id TEXT, media TEXT, ver INTEGER, title TEXT, body TEXT, tags TEXT, ai INTEGER DEFAULT 0, by TEXT, at INTEGER)'),
    db.prepare('CREATE INDEX IF NOT EXISTS ad_drafts_l ON ad_drafts (listing_id, media, ver)'),
    db.prepare('CREATE TABLE IF NOT EXISTS ad_posts (id TEXT PRIMARY KEY, listing_id TEXT, media TEXT, url TEXT, posted_at INTEGER, by TEXT, down_at INTEGER, down_by TEXT)'),
    db.prepare('CREATE INDEX IF NOT EXISTS ad_posts_l ON ad_posts (listing_id, down_at)'),
    // 검색엔진 알림(IndexNow) 기록 — target: 받은 곳(네이버 · indexnow.org), status: 응답 번호 (0 = 연결 실패)
    db.prepare('CREATE TABLE IF NOT EXISTS seo_pings (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, target TEXT, urls TEXT, why TEXT, status INTEGER)'),
    // 팝업 그림 · 첨부파일 정보 (파일 자체는 R2 hwip-media 'm/번호') — kind: img | file · aud: guest | staff · dl: 받은 수
    db.prepare('CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, kind TEXT, aud TEXT, name TEXT, size INTEGER, at INTEGER, by TEXT, dl INTEGER DEFAULT 0)')
  ]);
  // 직원 개인 알림 받을 텔레그램 번호 (P5)
  try { await db.prepare('ALTER TABLE staff ADD COLUMN tg_id TEXT').run(); } catch (e) { /* 이미 있음 */ }
  // 직원 자격 (설계서 6.4): 개업공인중개사 · 소속공인중개사 · 중개보조원 — 공개 매물 이름 표시에 씀
  try { await db.prepare('ALTER TABLE staff ADD COLUMN license TEXT').run(); } catch (e) { /* 이미 있음 */ }
  // 관리비 확인 불가 (미등기 · 신축 등, 2026-11-02 대표 요청) — 금액 대신 표시
  for (const t of ['listings', 'public_listings']) { try { await db.prepare('ALTER TABLE ' + t + ' ADD COLUMN mgmt_na INTEGER DEFAULT 0').run(); } catch (e) { /* 이미 있음 */ } }
  // 배치도 기준으로 자동으로 넣은 향 (1 = 아직 확인 전, 매물 창에서 [맞음] → 0)
  try { await db.prepare('ALTER TABLE listings ADD COLUMN facing_auto INTEGER DEFAULT 0').run(); } catch (e) { /* 이미 있음 */ }
  // 중개요청 댓글: 직원이 처음 확인한 때 (게스트 화면 '담당자 확인' 표시)
  try { await db.prepare('ALTER TABLE comments ADD COLUMN bk_claim INTEGER').run(); } catch (e) { /* 이미 있음 */ }
  // 호실 이야기 [확인] (2026-11-04): 원글에 확인한 직원 · 시각, 자동 답글 표시, 게스트 출입증 → 관심등록 상담카드
  for (const [t, c] of [['comments', 'ack_by TEXT'], ['comments', 'ack_at INTEGER'], ['comments', 'auto INTEGER DEFAULT 0'], ['guests', 'card TEXT']]) { try { await db.prepare('ALTER TABLE ' + t + ' ADD COLUMN ' + c).run(); } catch (e) { /* 이미 있음 */ } }
  // 공개 매물 카드 '기타' · '옵션' (시안 listing-public2 A안 확정 2026-11-04): 직원이 적는 공개용 기타 내용 · 옵션 표시 끄기 / 공개 사본 memo · opts(JSON)
  for (const [t, c] of [['listings', 'memo_pub TEXT'], ['listings', 'opt_show INTEGER DEFAULT 1'], ['public_listings', 'memo TEXT'], ['public_listings', 'opts TEXT']]) { try { await db.prepare('ALTER TABLE ' + t + ' ADD COLUMN ' + c).run(); } catch (e) { /* 이미 있음 */ } }
  // 최근 거래완료 (시안 listing-done B안 2026-11-05): 계약 · 잔금완료 매물의 공개용 사본 — 타입 · 단지 · 면적만 (가격 · 동 · 층 · 날짜 안 보냄), 30일 지나면 안 보냄
  try { await db.prepare('CREATE TABLE IF NOT EXISTS public_done (id TEXT PRIMARY KEY, deal TEXT, type TEXT, block TEXT, kind TEXT, exclusive REAL, done_at INTEGER)').run(); } catch (e) { /* 이미 있음 */ }
  for (const c of ['done_at INTEGER', 'done_hide INTEGER DEFAULT 0']) { try { await db.prepare('ALTER TABLE listings ADD COLUMN ' + c).run(); } catch (e) { /* 이미 있음 */ } }
  // R2 세대 전환 상태 (시안 r2-public-pick 2026-11-13): 호실마다 상태 · 퇴거일 · 메모 / 공개 세대 사본 — 손님은 public_units 만 읽음 (호수 · 층 없음)
  try { await db.prepare('CREATE TABLE IF NOT EXISTS unit_conv (unit_id TEXT PRIMARY KEY, status TEXT, move_out TEXT, memo TEXT, at INTEGER, by TEXT)').run(); } catch (e) { /* 이미 있음 */ }
  try { await db.prepare('CREATE TABLE IF NOT EXISTS public_units (unit_id TEXT PRIMARY KEY, dong INTEGER, band TEXT, type TEXT, kind TEXT, exclusive REAL, at INTEGER, by TEXT)').run(); } catch (e) { /* 이미 있음 */ }
  // R2 상담카드 2종 (시안 r2-consult-card 2026-11-13): 카드 한 장 + 상담할 때마다 기록 한 줄. 지우기는 숨김(deleted_at · 사유)
  try { await db.prepare('CREATE TABLE IF NOT EXISTS consults (id TEXT PRIMARY KEY, kind TEXT NOT NULL, unit_id TEXT, name TEXT, phone TEXT, progress TEXT, mgr TEXT, writer TEXT, data TEXT, lead_id TEXT, created_at INTEGER, at INTEGER, by TEXT, deleted_at INTEGER, del_by TEXT, del_reason TEXT)').run(); } catch (e) { /* 이미 있음 */ }
  try { await db.prepare('CREATE TABLE IF NOT EXISTS consult_logs (id INTEGER PRIMARY KEY AUTOINCREMENT, consult_id TEXT NOT NULL, at INTEGER, by TEXT, date TEXT, channel TEXT, prob TEXT, memo TEXT, docs TEXT, next_date TEXT, progress TEXT)').run(); } catch (e) { /* 이미 있음 */ }
  try { await db.prepare('CREATE INDEX IF NOT EXISTS consult_logs_c ON consult_logs (consult_id)').run(); } catch (e) { /* 이미 있음 */ }
  ready.add(key);
}
