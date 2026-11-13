# IPARK 로고를 소스/브랜드/IPARK_BI.jpg 에서 오려 투명 PNG로 만든다 (2026-10-27)
# - 만드는 파일 (소스/브랜드/):
#   IPARK_로고.png                    IPARK 글자만 (빨강, 투명 배경)
#   IPARK_광주센테니얼아이파크.png      IPARK 위 + 단지 이름 아래 (세로형)
#   IPARK_광주센테니얼아이파크_가로.png  IPARK 왼쪽 + 단지 이름 오른쪽 (가로형)
#   IPARK_머리글.png                  사이트 머리글용 (위아래 여백, 높이 34px 칸에 맞춤) → watermark.py 가 public/daelasoo/assets/hwip/logo.png 로 복사
#   IPARK_아이콘_64.png · _180.png     브라우저 탭 아이콘 · 휴대폰 홈 화면 아이콘 → public/favicon.png · apple-touch-icon.png 로 바로 저장
# - 사무소 로고(소스/브랜드/사무소로고.png)는 사진 워터마크에만 쓴다 (watermark.py)
# 실행: 프로젝트 폴더에서  python tools/make_logo.py   (처음 한 번: py -m pip install --user pillow)
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
BRAND = ROOT / '소스' / '브랜드'
SRC = BRAND / 'IPARK_BI.jpg'
BOX = (200, 520, 1190, 760)      # BI 그림에서 위쪽 '로고' IPARK 글자가 있는 영역 (원본 픽셀)
RED = (238, 45, 36)              # IPARK 빨강 #EE2D24 (BI에서 측정)
GRAY = (75, 82, 89)              # 단지 이름 글자색 (BI 슬로건 회색과 비슷하게)
NAME = '광주 센테니얼 아이파크'
FONT = 'C:/Windows/Fonts/malgunbd.ttf'


def wordmark():
    # 흰 바탕을 투명으로: 흰색에서 멀수록 진하게, 색은 IPARK 빨강으로 통일 (가장자리 부드럽게)
    img = Image.open(SRC).convert('RGB').crop(BOX)
    out = Image.new('RGBA', img.size, RED + (0,))
    src, dst = img.load(), out.load()
    for y in range(img.height):
        for x in range(img.width):
            r, g, b = src[x, y]
            a = max(0, min(255, round((255 - min(g, b)) * 255 / (255 - 45))))
            dst[x, y] = RED + (a if a > 8 else 0,)
    return out.crop(out.getbbox())


def text_img(h):
    font = ImageFont.truetype(FONT, h)
    l, t, r, b = font.getbbox(NAME)
    im = Image.new('RGBA', (r - l, b - t), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((-l, -t), NAME, font=font, fill=GRAY + (255,))
    return im


def canvas(w, h):
    return Image.new('RGBA', (w, h), (0, 0, 0, 0))


def main():
    wm = wordmark()
    wm.save(BRAND / 'IPARK_로고.png')

    # 세로형: 단지 이름 폭을 IPARK 폭에 맞춤
    t = text_img(round(wm.height * 0.42))
    t = t.resize((wm.width, round(t.height * wm.width / t.width)), Image.LANCZOS)
    gap = round(wm.height * 0.28)
    v = canvas(wm.width, wm.height + gap + t.height)
    v.alpha_composite(wm, (0, 0)); v.alpha_composite(t, (0, wm.height + gap))
    v.save(BRAND / 'IPARK_광주센테니얼아이파크.png')

    # 가로형: 이름 글자 높이 = IPARK 높이의 55%, 사이에 세로줄
    t = text_img(round(wm.height * 0.55))
    gap = round(wm.height * 0.35)
    hz = canvas(wm.width + gap * 2 + 4 + t.width, wm.height)
    hz.alpha_composite(wm, (0, 0))
    ImageDraw.Draw(hz).rectangle((wm.width + gap, round(wm.height * 0.12), wm.width + gap + 3, round(wm.height * 0.88)), fill=GRAY + (110,))
    hz.alpha_composite(t, (wm.width + gap * 2 + 4, (wm.height - t.height) // 2))
    hz.save(BRAND / 'IPARK_광주센테니얼아이파크_가로.png')

    # 머리글용: 높이 34px 칸에서 글자가 약 20px로 보이게 위아래 여백 (글자 높이의 35%씩)
    pad = round(wm.height * 0.35)
    hd = canvas(wm.width, wm.height + pad * 2)
    hd.alpha_composite(wm, (0, pad))
    hd = hd.resize((round(hd.width * 120 / hd.height), 120), Image.LANCZOS)  # 화면 3배 해상도(34px × 약 3.5)
    hd.save(BRAND / 'IPARK_머리글.png', optimize=True)

    # 아이콘: 브라우저 탭(64) = IPARK 첫 글자 'I', 휴대폰 홈 화면(180) = IPARK 전체. 흰 바탕 → public/ 에도 복사
    a = wm.getchannel('A')
    gap = next(x for x in range(10, wm.width) if not any(a.getpixel((x, y)) for y in range(wm.height)))
    mark = wm.crop((0, 0, gap, wm.height))
    for size, src, fill, name, pub in [(64, mark, 0.78, 'IPARK_아이콘_64.png', 'favicon.png'),
                                       (180, wm, 0.78, 'IPARK_아이콘_180.png', 'apple-touch-icon.png')]:
        s = min(size * fill / src.width, size * fill / src.height)
        g = src.resize((max(1, round(src.width * s)), max(1, round(src.height * s))), Image.LANCZOS)
        ic = Image.new('RGBA', (size, size), (255, 255, 255, 255))
        ic.alpha_composite(g, ((size - g.width) // 2, (size - g.height) // 2))
        ic.save(BRAND / name)
        ic.save(ROOT / 'public' / pub)

    for f in ['IPARK_로고.png', 'IPARK_광주센테니얼아이파크.png', 'IPARK_광주센테니얼아이파크_가로.png', 'IPARK_머리글.png', 'IPARK_아이콘_64.png', 'IPARK_아이콘_180.png']:
        im = Image.open(BRAND / f)
        print(f'{f:36s} {im.size[0]}x{im.size[1]}  {(BRAND / f).stat().st_size // 1024} KB')


if __name__ == '__main__':
    main()
