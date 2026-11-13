# 단지 사진에 사무소 로고를 새겨 public/daelasoo/assets/dls/ 에 저장한다 (설계서 9.4)
# - 원본: 소스/DAELASOO/소스/ (2026-11-13 대표가 옮김) · 로고: 소스/사무소로고.png (모든 단지 공통, 아이파크와 같은 파일)
# - FILES = 대라수1차 사진 목록 (R1, 2026-11-13). 소스의 84A · 84B 파일은 80A · 80B 로 읽는다 (대표 확정)
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
    ('대라수1차.jpg', 'hero.jpg', True),                 # 첫 화면 카드 · 단지 소개 메인
    ('(1차)배치도.jpg', 'siteplan.jpg', True),            # 단지배치도
    ('(1차)동호배치도.jpg', 'dongho.jpg', True),          # 동 · 호 배치도
    ('층개요.jpg', 'floors.jpg', True),                   # 층 개요
    ('쌍암공원벚꽃.jpg', 'park.jpg', True),               # 사업지 옆 사진 · 59㎡ 칸 배경
    # 타입 평면 (평면 창 · 검색용 /plan 페이지)
    ('(1차)80A.jpg', 'plans/80A.jpg', True),
    ('(1차)80B.jpg', 'plans/80B.jpg', True),
    ('(1차)59A.jpg', 'plans/59A.jpg', True),
    ('(1차)59B.jpg', 'plans/59B.jpg', True),
    ('(1차)59C.jpg', 'plans/59C.jpg', True),
    # 평면안내 칸 타입 미니보드 (화면 · /plan 카드가 plans/3d_타입.png 를 씀) — 지금은 평면 그림을 줄여 씀, 3D 그림이 생기면 바꿈
    ('(1차)80A.jpg', 'plans/3d_80A.png', True),
    ('(1차)80B.jpg', 'plans/3d_80B.png', True),
    ('(1차)59A.jpg', 'plans/3d_59A.png', True),
    ('(1차)59B.jpg', 'plans/3d_59B.png', True),
    ('(1차)59C.jpg', 'plans/3d_59C.png', True),
    # 타입별 추가 그림 (_1 · _2 · _3) — 무슨 그림인지 대표 확인 전이라 화면에는 아직 안 씀. 84A · 84B = 80A · 80B
    ('84A_1.png', 'plans/more/80A_1.jpg', True),
    ('84A_2.png', 'plans/more/80A_2.jpg', True),
    ('84B_1.png', 'plans/more/80B_1.jpg', True),
    ('84B_2.png', 'plans/more/80B_2.jpg', True),
    ('59A_1.png', 'plans/more/59A_1.jpg', True),
    ('59A_2.jpg', 'plans/more/59A_2.jpg', True),
    ('59A_3.png', 'plans/more/59A_3.jpg', True),
    ('59B_1.png', 'plans/more/59B_1.jpg', True),
    ('59B_2.png', 'plans/more/59B_2.jpg', True),
    ('59B_3.png', 'plans/more/59B_3.jpg', True),
    ('59C_2.png', 'plans/more/59C_2.jpg', True),
    ('59C_3.png', 'plans/more/59C_3.jpg', True),
    # 기존 사이트 자료 그림 (daelasoo1_B0xx) — 내용 확인 전, 화면에는 아직 안 씀
    ('daelasoo1_B005b.jpg', 'more/B005b.jpg', True),
    ('daelasoo1_B005P.png', 'more/B005P.jpg', True),
    ('daelasoo1_B007.jpg', 'more/B007.jpg', True),
    ('daelasoo1_B008.jpg', 'more/B008.jpg', True),
    ('daelasoo1_B011a.png', 'more/B011a.jpg', True),
    ('daelasoo1_B011b.png', 'more/B011b.jpg', True),
    ('daelasoo1_B011c.png', 'more/B011c.jpg', True),
    ('daelasoo1_B011d.png', 'more/B011d.jpg', True),
    ('daelasoo1_B011e.png', 'more/B011e.jpg', True),
    ('daelasoo1_B011f.png', 'more/B011f.jpg', True),
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
            out = stamp(img, logo)
            if q.suffix == '.png':   # 미니보드: 폭 600 으로 줄여 PNG
                out.thumbnail((600, 600), Image.LANCZOS); out.save(q, 'PNG', optimize=True)
            else:
                out.save(q, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        print(f'{dst:22s} {q.stat().st_size // 1024:5d} KB  {img.size[0]}x{img.size[1]}')


if __name__ == '__main__':
    main()
