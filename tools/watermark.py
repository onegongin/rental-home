# 단지 사진에 사무소 로고를 새겨 public/daelasoo/assets/dls/ 에 저장한다 (설계서 9.4)
# - 원본: 소스/DAELASOO/소스/ (2026-11-13 대표가 옮김) · 로고: 소스/사무소로고.png (모든 단지 공통, 아이파크와 같은 파일)
# - ⚠ 아래 FILES 목록은 아직 아이파크 것 — R1 에서 대라수 사진 목록으로 바꾼다
# - 사진 정중앙, 사진 안에 꽉 차게(높이·폭 중 맞는 쪽 기준), 진하기 3% (2026-10-27 8%→3%, 그림이 잘 보이게)
# - 사진은 폭 MAX_W · 높이 MAX_H 픽셀 이하로 (세로로 긴 안내 그림은 폭 유지) 줄이고 JPG(품질 82)로 저장. 원본(소스/)은 건드리지 않는다
# 실행: 프로젝트 폴더에서  python tools/watermark.py   (처음 한 번: py -m pip install --user pillow)
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / '소스' / 'DAELASOO' / '소스', ROOT / 'public' / 'daelasoo' / 'assets' / 'dls'
LOGO = ROOT / '소스' / '사무소로고.png'
OPACITY, MAX_W, MAX_H, QUALITY = 0.03, 1600, 6000, 82

# (원본 경로, 저장 경로, 로고 새김 여부[, 'R' = 오른쪽으로 90도 돌림 · 'G' = 제미나이 별 지움 · 'H' = 큰 화면용 폭 2400 · 'U' = 작은 원본을 커뮤니티 사진 크기(1600x1195)로 키움 · 'X' = 작은 원본을 메인 사진 폭 2400으로 키움 · (x0, y0, x1, y1) = 그 부분만 잘라 씀]) — 로고·안내문 그림처럼 새기면 안 되는 것은 False
FILES = [
    ('투시도/신세계몰_투시도.png', 'hero_mall.jpg', True, 'H'),   # 소개 첫 화면 메인 (2026-10-28)
    ('투시도/신세계몰_미래항공_노을.png', 'hero_sunset.jpg', True, 'H'),   # 소개 첫 화면 1번째 (2026-10-28 오후)
    ('투시도/신세계몰_미래항공_야경.png', 'hero_nightair.jpg', True, 'H'),  # 소개 첫 화면 2번째
    ('투시도/투시도1.jpg', 'hero1.jpg', True, 'X'),
    ('투시도/조감도_주간.jpg', 'aerial_day.jpg', True, 'X'),   # 사업개요 사진 4컷의 메인 (원본 1170x700 → 폭 2400)
    ('안내/사업개요_야간투시도.jpg', 'hero_night.jpg', True, (0, 155, 1160, 905), 'X'),   # 안내 그림 위쪽 단지 야간 투시도만 (소개 첫 화면 3번째)
    ('투시도/투시도2.jpg', 'hero2.jpg', True),
    ('배치/단지배치도.png', 'siteplan.jpg', True),
    ('배치/동호배치도_아파트.jpg', 'dongho.jpg', True),
    # 단지배치 오른쪽 동 · 호 배치도 — 동마다 잘라 씀(동 아래 주택형 · 세대수 표는 뺌) + 동호개요 표 (시안 preview/dongho-layout D · 같은 칸, 2026-10-30)
    ('배치/동호배치도_아파트.jpg', 'dongho/101.jpg', True, (346, 80, 544, 710)),
    ('배치/동호배치도_아파트.jpg', 'dongho/102.jpg', True, (583, 248, 687, 710)),
    ('배치/동호배치도_아파트.jpg', 'dongho/103.jpg', True, (730, 80, 928, 710)),
    ('배치/동호배치도_아파트.jpg', 'dongho/104.jpg', True, (962, 80, 1160, 710)),
    ('배치/동호배치도_아파트.jpg', 'dongho/201.jpg', True, (112, 848, 310, 1478)),
    ('배치/동호배치도_아파트.jpg', 'dongho/202.jpg', True, (428, 1013, 532, 1478)),
    ('배치/동호배치도_아파트.jpg', 'dongho/203.jpg', True, (650, 848, 848, 1478)),
    ('배치/동호배치도_아파트.jpg', 'dongho/204.jpg', True, (962, 1075, 1160, 1478)),
    ('배치/안내_단지배치_세대수.jpg', 'dongho/sum.jpg', False, (0, 795, 1160, 1024)),
    # 단지배치 아래 단지 조경 사진 4장 (시안 preview/dongho-layout 조경 A)
    ('배치/단지002.jpg', 'garden/002.jpg', True),
    ('배치/단지003.jpg', 'garden/003.jpg', True),
    ('배치/단지004.jpg', 'garden/004.jpg', True),
    ('배치/단지005.jpg', 'garden/005.jpg', True),
    ('입지/위치도_광역.jpg', 'location.jpg', True),  # 다른 번호가 든 위치도_단지주변은 대표가 삭제
    ('책자_구자료참고/구판_주변환경편의시설.jpg', 'around.jpg', True),
    ('안내/커뮤니티.jpg', 'community.jpg', True),
    ('안내/조경.jpg', 'landscape.jpg', True),
    ('안내/인테리어.jpg', 'interior.jpg', True),
    ('안내/스마트시스템.jpg', 'system.jpg', True),
    ('안내/입지환경_보드.png', 'board.jpg', True),  # 단지소개 사업지 오른쪽 보드
    # 입지환경 보드(사업지 오른쪽)는 글자를 화면에서 다시 짜고, 사진 3장만 보드 그림에서 잘라 씀 (2026-10-28)
    # '현재' 칸(board/loc_now_ai.jpg)은 AI 항공뷰로 tools/make_board_big.py 가 만듦 — 실제 항공사진은 저작권 때문에 안 씀 (2026-11-01)
    ('안내/입지환경_보드.png', 'board/loc_mall.jpg', True, (588, 100, 1120, 502)),     # 신세계몰 예상 투시도
    ('안내/입지환경_보드.png', 'board/loc_traffic.jpg', True, (1140, 98, 1674, 388)),  # 광천권역 교통 노선도
    # 입지환경 보드 사진을 누르면 뜨는 큰 그림 3장(loc_now_big · loc_mall_big · loc_traffic_big)은 tools/make_board_big.py 가 만듦 (글씨 · 출처 새김)
    # 평면도(기본 평면): 소스/평면/ — 타입_1 = 1단지, 타입(2단지) = 2단지, 오피스텔은 타입_1OT_동번호동. 저장 이름은 타입_단지
    # (_2·_3 = 방 이름이 적힌 상세 평면, 타입소개 = 소개 카드 — 지금은 화면에 안 씀)
    # 타입소개 그림(상단 타입 칩 → 평면 창): 아파트 = 타입_타입소개_A, 오피스텔 = 타입OT_타입 (2026-10-28)
    ('평면/84A_타입소개_A.png', 'plans/intro_84A.jpg', True),
    ('평면/84B_타입소개_A.png', 'plans/intro_84B.jpg', True),
    ('평면/84C_타입소개_A.png', 'plans/intro_84C.jpg', True),
    ('평면/84D_타입소개_A.png', 'plans/intro_84D.jpg', True),
    ('평면/148_타입소개_A.png', 'plans/intro_148.jpg', True),
    ('평면/218_타입소개_A.png', 'plans/intro_218.jpg', True),
    ('평면/69OT_타입_키맵.png', 'plans/intro_69.jpg', True),   # KEY MAP을 아파트처럼 고친 것 (tools/make_keymap.py)
    ('평면/79OT_타입_키맵.png', 'plans/intro_79.jpg', True),
    # 타입 평면 창 오른쪽 작은 평면: 확장형 = _1, 기본형 = _3(없으면 _2) (2026-10-28)
    ('평면/84A_1.png', 'plans/ext_84A.jpg', True),
    ('평면/84A_3.png', 'plans/basic_84A.jpg', True),
    ('평면/84B_1.png', 'plans/ext_84B.jpg', True),
    ('평면/84B_2.png', 'plans/basic_84B.jpg', True),
    ('평면/84C_1.png', 'plans/ext_84C.jpg', True),
    ('평면/84C_3.png', 'plans/basic_84C.jpg', True),
    ('평면/84D_1.png', 'plans/ext_84D.jpg', True),
    ('평면/84D_3.png', 'plans/basic_84D.jpg', True),
    ('평면/148_1.png', 'plans/ext_148.jpg', True),
    ('평면/148_2.png', 'plans/basic_148.jpg', True),
    ('평면/218_1(1단지300).png', 'plans/ext_218.jpg', True),
    ('평면/218_2.png', 'plans/basic_218.jpg', True),
    # 실내 사진(평면 창): 소스/실내/타입_방이름.jpg → interior/타입_번호.jpg (84A · 84B는 평면 아래, 79OT는 오른쪽, 2026-10-28)
    ('실내/84A_거실.jpg', 'interior/84A_1.jpg', True),
    ('실내/84A_침실.jpg', 'interior/84A_2.jpg', True),
    ('실내/84A_욕실.jpg', 'interior/84A_3.jpg', True),
    ('실내/84B_거실.jpg', 'interior/84B_1.jpg', True),
    ('실내/84B_주방.jpg', 'interior/84B_2.jpg', True),
    ('실내/84B_드레스룸.jpg', 'interior/84B_3.jpg', True),
    ('실내/84B_수납장.jpg', 'interior/84B_4.jpg', True),
    ('실내/84B_화장실.jpg', 'interior/84B_5.jpg', True),
    ('실내/79_거실.jpg', 'interior/79_1.jpg', True),
    ('실내/79_주방.jpg', 'interior/79_2.jpg', True),
    ('실내/79_침실.jpg', 'interior/79_3.jpg', True),
    ('실내/79_침실2.jpg', 'interior/79_4.jpg', True),
    ('실내/79_화장실.jpg', 'interior/79_5.jpg', True),
    ('평면/84A_1.png', 'plans/84A_1.jpg', True),
    ('평면/84B_1.png', 'plans/84B_1.jpg', True),
    ('평면/84C_1.png', 'plans/84C_1.jpg', True),
    ('평면/148_1.png', 'plans/148_1.jpg', True),
    ('평면/218_1(1단지300).png', 'plans/218_1.jpg', True),  # 복층: 한 장에 상부·하부
    ('평면/79_1OT_102동.png', 'plans/79_1.jpg', True),
    ('평면/84A(2단지).png', 'plans/84A_2.jpg', True),
    ('평면/84B(2단지).png', 'plans/84B_2.jpg', True),
    ('평면/84C(2단지).png', 'plans/84C_2.jpg', True),
    ('평면/84D_1.png', 'plans/84D_2.jpg', True),  # 84D는 2단지에만 있음
    ('평면/148(2단지).png', 'plans/148_2.jpg', True),
    ('평면/218_1(2단지299).png', 'plans/218_2.jpg', True),
    ('평면/69_1OT_204동.png', 'plans/69_2.jpg', True),
    # 커뮤니티·스카이라운지 사진 (단지배치 커뮤니티/스카이라운지 창 오른쪽)
    # 커뮤니티 · 스카이라운지 창 사진: 대표가 제미나이 별을 직접 지운 원본(2026-10-28)이라 'G' 안 씀
    ('안내/community_011.png', 'community/fitness.jpg', True),
    ('안내/community_012.png', 'community/library.jpg', True),
    ('안내/community_013.png', 'community/senior.jpg', True),
    ('안내/community_010.png', 'community/sky_photo.jpg', True),
    ('안내/community_003.jpg', 'community/sky_terrace.jpg', True, 'U'),   # 스카이라운지 옥상 테라스 (원본이 작음 374x250 → 옆 사진 크기로 키움)
    # 동별 유니트 배치 (단지배치에서 동을 누르면 뜨는 창) → tools/make_units.py 가 기준층 확대 부분만 잘라 units/ 에 만듦
    ('브랜드/IPARK_머리글.png', 'logo.png', False),  # 머리글 로고 = IPARK (tools/make_logo.py 로 만듦). 사진 워터마크는 위 LOGO(사무소로고) 그대로
    ('브랜드/IPARK_광주센테니얼아이파크.png', 'brand/ipark-centennial.png', False),  # 앞으로 쓸 로고 (세로형)
    ('브랜드/IPARK_광주센테니얼아이파크_가로.png', 'brand/ipark-centennial-wide.png', False),  # (가로형)
]


def stamp(img, logo):
    w, h = img.size
    s = min(w / logo.width, h / logo.height)
    lg = logo.resize((max(1, round(logo.width * s)), max(1, round(logo.height * s))), Image.LANCZOS)
    a = lg.getchannel('A').point(lambda v: round(v * OPACITY))
    lg.putalpha(a)
    base = img.convert('RGBA')
    base.alpha_composite(lg, ((w - lg.width) // 2, (h - lg.height) // 2))
    return base.convert('RGB')


def flat(img):
    # 투명한 부분이 있는 그림(218 평면 PNG 등)은 흰 바탕에 얹는다 — 그냥 RGB로 바꾸면 투명한 곳이 검게 나옴
    if img.mode in ('RGBA', 'LA') or (img.mode == 'P' and 'transparency' in img.info):
        img = img.convert('RGBA')
        bg = Image.new('RGBA', img.size, 'white')
        bg.alpha_composite(img)
        return bg.convert('RGB')
    return img.convert('RGB')


def stack(imgs):
    # 여러 장을 위아래로 이어 붙인다 (복층 아래층 + 위층)
    out = Image.new('RGB', (max(i.width for i in imgs), sum(i.height for i in imgs)), 'white')
    y = 0
    for i in imgs:
        out.paste(i, (0, y))
        y += i.height
    return out


# 커뮤니티 평면(소스/안내/community_001=1단지, 002=2단지)
# - 1단지 그림 오른쪽 가운데 블록 = 스카이라운지(101·201동 39층) → 따로 잘라 sky.jpg, 1단지 그림에서는 그 블록과 범례 ⑤ 줄을 흰색으로 지움
# - 1단지 · 2단지를 나란히 붙여 plan.jpg (커뮤니티 창 왼쪽 그림)
SKY_BOX = (562, 210, 940, 500)       # community_001.jpg 안 스카이라운지 블록 (픽셀)
SKY_CLEAN = (0, 0, 76, 30)           # 잘라 낸 그림 왼쪽 위에 걸친 옆 건물 조각 → 흰색
LEGEND5 = (805, 728, 1100, 766)      # 범례 ⑤ 스카이라운지 줄


def community(logo):
    a, b = SRC / '안내' / 'community_001.jpg', SRC / '안내' / 'community_002.jpg'
    if not (a.exists() and b.exists()):
        print('없음: 커뮤니티 평면')
        return
    one, two = Image.open(a).convert('RGB'), Image.open(b).convert('RGB')
    (OUT / 'community').mkdir(parents=True, exist_ok=True)
    sky = one.crop(SKY_BOX)
    from PIL import ImageDraw
    ImageDraw.Draw(sky).rectangle(SKY_CLEAN, fill='white')
    stamp(sky, logo).save(OUT / 'community' / 'sky.jpg', 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    from PIL import ImageDraw
    d = ImageDraw.Draw(one)
    d.rectangle(SKY_BOX, fill='white'); d.rectangle(LEGEND5, fill='white')
    gap, pad = 40, 20
    w, h = one.width + two.width + gap + pad * 2, max(one.height, two.height) + pad * 2
    out = Image.new('RGB', (w, h), 'white')
    od = ImageDraw.Draw(out)
    for x, im in ((pad, one), (pad + one.width + gap, two)):
        out.paste(im, (x, pad)); od.rectangle((x - 1, pad - 1, x + im.width, pad + im.height), outline='#e5e5ea', width=2)
    out.thumbnail((MAX_W * 2, MAX_H))
    stamp(out, logo).save(OUT / 'community' / 'plan.jpg', 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    print(f"community/plan.jpg {out.size[0]}x{out.size[1]} · community/sky.jpg {sky.size[0]}x{sky.size[1]}")


# 제미나이(Gemini)로 만든 사진의 오른쪽 아래 별 표시 지우기 ('G')
# - 별 = 흰색을 약 48% 진하기로 겹친 것 → 겹치기 전 색으로 되돌림 (별 모양: tools/gemini_star.png, 2400x1792 사진 기준 자리)
# - 테두리 1~2 픽셀은 주변 색(중간값)으로 메움
def ungemini(img):
    import numpy as np
    from PIL import ImageFilter
    star = Image.open(Path(__file__).resolve().parent / 'gemini_star.png').convert('L')
    w, h = img.size
    s = w / 2400
    if abs(h / w - 1792 / 2400) > 0.01:
        print('확인: 제미나이 별 — 사진 비율이 달라 건너뜀'); return img
    if s != 1:
        star = star.resize((round(star.width * s), round(star.height * s)), Image.LANCZOS)
    x0, y0 = round(2160 * s), round(1560 * s)
    a = 0.49 * np.asarray(star.filter(ImageFilter.GaussianBlur(1.0 * s)), float)[..., None] / 255
    band = (np.asarray(star.filter(ImageFilter.MaxFilter(3))) > 127) & ~(np.asarray(star.filter(ImageFilter.MinFilter(3))) > 127)
    box = (x0, y0, x0 + star.width, y0 + star.height)
    reg = np.asarray(img.crop(box), float)
    fix = np.clip((reg - a * 255) / (1 - a), 0, 255).astype('uint8')
    med = np.asarray(Image.fromarray(fix).filter(ImageFilter.MedianFilter(5)))
    fix[band] = med[band]
    img = img.copy()
    img.paste(Image.fromarray(fix), box[:2])
    return img


def main():
    logo = Image.open(LOGO).convert('RGBA')
    community(logo)
    for src, dst, wm, *opt in FILES:
        srcs, q = src if isinstance(src, list) else [src], OUT / dst
        miss = [s for s in srcs if not (SRC / s).exists()]
        if miss:
            print('없음:', ', '.join(miss))
            continue
        q.parent.mkdir(parents=True, exist_ok=True)
        img = stack([flat(Image.open(SRC / s)) for s in srcs]) if len(srcs) > 1 else Image.open(SRC / srcs[0])
        for box in (o for o in opt if isinstance(o, tuple)):
            img = img.crop(box)
        if 'R' in opt:  # 세로로 그려진 평면(84B·69)을 다른 타입처럼 가로로 맞춤
            img = img.transpose(Image.Transpose.ROTATE_270)
        if not wm:
            img.save(q)
        else:
            img = flat(img)
            if 'U' in opt:   # 커뮤니티 사진(2400x1792)과 같은 비율로 왼쪽을 조금 자르고(오른쪽 아래 '이미지 컷' 글자 유지) 키운 뒤 살짝 선명하게
                from PIL import ImageFilter
                w = round(img.height * 2400 / 1792)
                if w < img.width:
                    img = img.crop((img.width - w, 0, img.width, img.height))
                img = img.resize((MAX_W, round(MAX_W * img.height / img.width)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 60, 2))
            if 'X' in opt:   # 메인(첫 화면) 사진: 첫 장(신세계몰 2400)과 같은 폭으로 키우고 살짝 선명하게
                from PIL import ImageFilter
                img = img.resize((MAX_W * 3 // 2, round(MAX_W * 3 // 2 * img.height / img.width)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 50, 2))
            if 'G' in opt:
                img = ungemini(img)
            img.thumbnail((MAX_W * 3 // 2 if 'H' in opt or 'X' in opt else MAX_W, MAX_H), Image.LANCZOS)
            stamp(img, logo).save(q, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        print(f'{dst:22s} {q.stat().st_size // 1024:5d} KB  {img.size[0]}x{img.size[1]}')


if __name__ == '__main__':
    main()
