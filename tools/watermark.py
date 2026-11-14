# 단지 사진에 사무소 로고를 새겨 public/daelasoo/assets/dls/ 에 저장한다 (설계서 9.4)
# - 원본: 소스/DAELASOO/소스/ (2026-11-13 대표가 옮김) · 로고: 소스/사무소로고.png (모든 단지 공통, 아이파크와 같은 파일)
# - FILES = 대라수1차 사진 목록 (R1, 2026-11-13). 소스의 84A · 84B 파일은 80A · 80B 로 읽는다 (대표 확정)
# - 사진 정중앙, 사진 안에 꽉 차게(높이·폭 중 맞는 쪽 기준), 진하기 3% (2026-10-27 8%→3%, 그림이 잘 보이게)
# - 사진은 폭 MAX_W · 높이 MAX_H 픽셀 이하로 (세로로 긴 안내 그림은 폭 유지) 줄이고 JPG(품질 82)로 저장. 원본(소스/)은 건드리지 않는다
# 실행: 프로젝트 폴더에서  python tools/watermark.py   (처음 한 번: py -m pip install --user pillow)
from pathlib import Path
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / '소스' / 'DAELASOO' / '소스', ROOT / 'public' / 'daelasoo' / 'assets' / 'dls'
LOGO = ROOT / '소스' / '사무소로고.png'
OPACITY, MAX_W, MAX_H, QUALITY = 0.03, 1600, 6000, 82

# (원본 경로, 저장 경로, 로고 새김 여부[, 'R' = 오른쪽으로 90도 돌림 · 'G' = 제미나이 별 지움 · 'H' = 큰 화면용 폭 2400 · 'U' = 작은 원본을 커뮤니티 사진 크기(1600x1195)로 키움 · 'X' = 작은 원본을 메인 사진 폭 2400으로 키움 · 'S' = 작은 사진(폭 240)도 t/ 폴더에 · 'O' = 링크 미리보기 크기(1200x630)로 · (x0, y0, x1, y1) = 그 부분만 잘라 씀]) — 로고·안내문 그림처럼 새기면 안 되는 것은 False
FILES = [
    ('대라수1차.jpg', 'hero.jpg', True),                 # 첫 화면 카드 · 단지 소개 메인
    ('투시가로.png', 'hero_wide.jpg', True, 'X'),         # 단지 화면 맨 위 큰 사진 (가로 투시도, 2026-11-14 대표 요청 · 시안 r7-hero)
    ('투시가로.png', 'og.jpg', True, (116, 0, 880, 401), 'O'),  # 링크 미리보기(카톡 · 검색) 그림 1200x630 — 가운데 건물 부분만 (시안 r8-og)
    ('(1차)단지배치도.png', 'siteplan.jpg', True),        # 단지배치도 · 단지 개요 그림 (2026-11-14 대표 요청으로 새 그림, 동 위치는 예전 (1차)배치도.jpg 와 같음)
    ('(1차)동호배치도.jpg', 'dongho.jpg', True),          # 동 · 호 배치도
    ('층개요.jpg', 'floors.jpg', True),                   # 층 개요
    ('쌍암공원벚꽃.jpg', 'park.jpg', True),               # 사업지 옆 사진 · 59㎡ 칸 배경
    # 입지환경 지도 아래 사진 칩 (대표 imweb 페이지 사진 그대로, 시안 r9-map B안 확정 2026-11-14) — 누르면 그 장소 카카오맵
    ('인프라_롯데마트.jpg', 'infra/lotte.jpg', True),
    ('인프라_쌍암공원.jpg', 'infra/park.jpg', True),
    ('인프라_빛고을대로.jpg', 'infra/road.jpg', True),
    # 타입 평면 (평면 창 · 검색용 /plan 페이지)
    ('(1차)80A.jpg', 'plans/80A.jpg', True),
    ('(1차)80B.jpg', 'plans/80B.jpg', True),
    ('(1차)59A.jpg', 'plans/59A.jpg', True),
    ('(1차)59B.jpg', 'plans/59B.jpg', True),
    ('(1차)59C.jpg', 'plans/59C.jpg', True),
    # 평면 창 (plan-pop.js): 왼쪽 큰 그림 intro_ = 타입 평면 · 오른쪽 두 칸 ext_ = 입체 평면 · basic_ = 위에서 본 평면 (이름은 site.json types.views)
    # 3D 평면 원본: 84A · 84B = 80A · 80B (대표 확정). _1 · _2 · _3 중 비스듬한 것 = 입체, 위에서 본 것 = 위에서 (2026-11-13 대표 요청으로 내용 확인)
    ('(1차)80A.jpg', 'plans/intro_80A.jpg', True),
    ('(1차)80B.jpg', 'plans/intro_80B.jpg', True),
    ('(1차)59A.jpg', 'plans/intro_59A.jpg', True),
    ('(1차)59B.jpg', 'plans/intro_59B.jpg', True),
    ('(1차)59C.jpg', 'plans/intro_59C.jpg', True),
    # 평면 창 메인 그림을 새 3D 평면으로 (대표가 소스에 넣은 80A_3D … 59C_3D, 2026-11-14 · 시안 r12-planpop)
    ('80A_3D.png', 'plans/main3d_80A.jpg', True, 'P'),
    ('80B_3D.png', 'plans/main3d_80B.jpg', True, 'P'),
    ('59A_3D.png', 'plans/main3d_59A.jpg', True, 'P'),
    ('59B_3D.png', 'plans/main3d_59B.jpg', True, 'P'),
    ('59C_3D.png', 'plans/main3d_59C.jpg', True, 'P'),
    # 평면 창 오른쪽 '| 평면 |' 칸 그림 (대표가 소스에 넣은 *_001, 2026-11-14 · 시안 r12-planpop. 84A_001 은 없어 80A 는 80A_001)
    ('80A_001.png', 'plans/plan_80A.jpg', True),
    ('80B_001.jpg', 'plans/plan_80B.jpg', True),
    ('59A_001.png', 'plans/plan_59A.jpg', True),
    ('59B_001.png', 'plans/plan_59B.jpg', True),
    ('59C_001.png', 'plans/plan_59C.jpg', True),
    ('84A_2.png', 'plans/ext_80A.jpg', True),   ('84A_1.png', 'plans/basic_80A.jpg', True),
    ('84B_2.png', 'plans/ext_80B.jpg', True),   ('84B_1.png', 'plans/basic_80B.jpg', True),
    ('59A_3.png', 'plans/ext_59A.jpg', True),   ('59A_1.png', 'plans/basic_59A.jpg', True),   # 59A 위에서 본 3D(59A_2)는 작아서(600x400) 컬러 평면(_1)을 씀
    ('59B_3.png', 'plans/ext_59B.jpg', True),   ('59B_2.png', 'plans/basic_59B.jpg', True),
    ('59C_3.png', 'plans/ext_59C.jpg', True),   ('59C_2.png', 'plans/basic_59C.jpg', True),
    # 평면안내 칸 타입 미니보드 (화면 · /plan 카드) = 입체 평면
    ('84A_2.png', 'plans/3d_80A.png', True),
    ('84B_2.png', 'plans/3d_80B.png', True),
    ('59A_3.png', 'plans/3d_59A.png', True),
    ('59B_3.png', 'plans/3d_59B.png', True),
    ('59C_3.png', 'plans/3d_59C.png', True),
    # 분양전환 혜택 · 입지 안내 그림 (기존 사이트 자료 daelasoo1_B0xx) — 사업개요 사진 칸 · 입지환경 보드
    ('daelasoo1_B005b.jpg', 'info/benefit.jpg', True),        # 잔여세대 분양 혜택
    ('daelasoo1_B005P.png', 'info/benefit2.jpg', True),       # 첫 분양전환 특혜 & 시세 상승
    ('daelasoo1_B007.jpg', 'info/life.jpg', True),            # 생활권 · 교통 · 분양전환 혜택 요약
    ('daelasoo1_B008.jpg', 'info/road.jpg', True),            # 북광주IC · 빛고을대로 · 산월IC
    ('daelasoo1_B011a.png', 'info/cheomdan3.jpg', True),      # 첨단3지구 AI특화 복합도시
    ('daelasoo1_B011b.png', 'info/metro2.jpg', True),         # 도시철도 2호선 쌍암역
    ('daelasoo1_B011c.png', 'info/shopping.jpg', True),       # 더현대 · 신세계 · 스타필드
    ('daelasoo1_B011d.png', 'info/invest.jpg', True),         # 서남권 896조원 투자계획
    ('daelasoo1_B011e.png', 'info/airport.jpg', True),        # 군공항 이전 & 재건축
    ('daelasoo1_B011f.png', 'info/samsung.jpg', True),        # 하남 삼성전자 AI공조시스템
    # 실내 사진 (소스/DAELASOO/내부, 2026-11-14 대표 확정 시안 r6-interior A안) — 저장 이름에 호수 안 넣음(공개 원칙), 영상은 안 씀(대표 결정)
    ('../내부/2-1601_84A001.jpg', 'interior/80A_01.jpg', True, 'S'),
    ('../내부/2-1601_84A002.jpg', 'interior/80A_02.jpg', True, 'S'),
    ('../내부/2-1601_84A003.jpg', 'interior/80A_03.jpg', True, 'S'),
    ('../내부/2-1601_84A004.jpg', 'interior/80A_04.jpg', True, 'S'),
    ('../내부/2-1601_84A005.jpg', 'interior/80A_05.jpg', True, 'S'),
    ('../내부/2-1601_84A006.jpg', 'interior/80A_06.jpg', True, 'S'),
    ('../내부/2-1601_84A007.jpg', 'interior/80A_07.jpg', True, 'S'),
    ('../내부/4-1301_59A001.jpg', 'interior/59A_01.jpg', True, 'S'),
    ('../내부/4-1301_59A002.jpg', 'interior/59A_02.jpg', True, 'S'),
    ('../내부/4-1301_59A003.jpg', 'interior/59A_03.jpg', True, 'S'),
    ('../내부/4-1301_59A004.jpg', 'interior/59A_04.jpg', True, 'S'),
    ('../내부/4-1301_59A005.jpg', 'interior/59A_05.jpg', True, 'S'),
    ('../내부/4-1301_59A006.jpg', 'interior/59A_06.jpg', True, 'S'),
    ('../내부/4-1301_59A007.jpg', 'interior/59A_07.jpg', True, 'S'),
    ('../내부/4-1301_59A008.jpg', 'interior/59A_08.jpg', True, 'S'),
    ('../내부/4-1301_59A009.jpg', 'interior/59A_09.jpg', True, 'S'),
    ('../내부/3-2002_59B001.jpg', 'interior/59B_01.jpg', True, 'S'),
    ('../내부/3-2002_59B002.jpg', 'interior/59B_02.jpg', True, 'S'),
    ('../내부/3-2002_59B003.jpg', 'interior/59B_03.jpg', True, 'S'),
    ('../내부/3-2002_59B004.jpg', 'interior/59B_04.jpg', True, 'S'),
    ('../내부/3-2002_59B005.jpg', 'interior/59B_05.jpg', True, 'S'),
    ('../내부/3-2002_59B006.jpg', 'interior/59B_06.jpg', True, 'S'),
    # 머리글 로고 (새기지 않음)
    ('logo.png', 'logo.png', False),
    ('logo1.png', 'logo1.png', False),
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
    for src, dst, wm, *opt in FILES:
        srcs, q = src if isinstance(src, list) else [src], OUT / dst
        miss = [s for s in srcs if not (SRC / s).exists()]
        if miss:
            print('없음:', ', '.join(miss))
            continue
        q.parent.mkdir(parents=True, exist_ok=True)
        img = stack([flat(Image.open(SRC / s)) for s in srcs]) if len(srcs) > 1 else Image.open(SRC / srcs[0])
        img = ImageOps.exif_transpose(img)   # 휴대폰 사진의 '돌려서 보기' 표시대로 바로 세움 (59B 6번째 사진, 2026-11-14)
        for box in (o for o in opt if isinstance(o, tuple)):
            img = img.crop(box)
        if 'R' in opt:  # 세로로 그려진 평면(84B·69)을 다른 타입처럼 가로로 맞춤
            img = img.transpose(Image.Transpose.ROTATE_270)
        if not wm:
            img.save(q)
        else:
            img = flat(img)
            if 'P' in opt:   # 평면 창 메인(5:3 칸)에 잘리지 않게 흰 여백으로 5:3 맞춤 (새 3D 평면, 2026-11-14 시안 r12-planpop)
                W, H = (img.width, round(img.width * 3 / 5)) if img.width * 3 >= img.height * 5 else (round(img.height * 5 / 3), img.height)
                bg = Image.new('RGB', (W, H), (255, 255, 255)); bg.paste(img, ((W - img.width) // 2, (H - img.height) // 2)); img = bg
            if 'U' in opt:   # 커뮤니티 사진(2400x1792)과 같은 비율로 왼쪽을 조금 자르고(오른쪽 아래 '이미지 컷' 글자 유지) 키운 뒤 살짝 선명하게
                from PIL import ImageFilter
                w = round(img.height * 2400 / 1792)
                if w < img.width:
                    img = img.crop((img.width - w, 0, img.width, img.height))
                img = img.resize((MAX_W, round(MAX_W * img.height / img.width)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 60, 2))
            if 'X' in opt:   # 메인(첫 화면) 사진: 첫 장(신세계몰 2400)과 같은 폭으로 키우고 살짝 선명하게
                from PIL import ImageFilter
                img = img.resize((MAX_W * 3 // 2, round(MAX_W * 3 // 2 * img.height / img.width)), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 50, 2))
            if 'O' in opt:   # 링크 미리보기: 카톡 · 페이스북 권장 크기로 키우고 살짝 선명하게
                from PIL import ImageFilter
                img = img.resize((1200, 630), Image.LANCZOS).filter(ImageFilter.UnsharpMask(2, 50, 2))
            if 'G' in opt:
                img = ungemini(img)
            img.thumbnail((MAX_W * 3 // 2 if 'H' in opt or 'X' in opt else MAX_W, MAX_H), Image.LANCZOS)
            out = stamp(img, logo)
            if q.suffix == '.png':   # 미니보드: 폭 600 으로 줄여 PNG
                out.thumbnail((600, 600), Image.LANCZOS); out.save(q, 'PNG', optimize=True)
            else:
                out.save(q, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
            if 'S' in opt:   # 실내 사진 아래 작은 사진 줄용
                t = q.parent / 't' / q.name
                t.parent.mkdir(parents=True, exist_ok=True)
                sm = out.copy(); sm.thumbnail((240, 240), Image.LANCZOS); sm.save(t, 'JPEG', quality=75, optimize=True)
        print(f'{dst:22s} {q.stat().st_size // 1024:5d} KB  {img.size[0]}x{img.size[1]}')


if __name__ == '__main__':
    main()
