# 첫 화면 · 직원 화면 파비콘 (시안 r34 2번 = 사무소로고.png 그림만, 남색 둥근 네모) — 실행: py tools/make_favicon_office.py
# 결과 o2_64.png → public/favicon.png · o2_180.png → public/apple-touch-icon.png
import os
from PIL import Image, ImageDraw
src = Image.open('소스/사무소로고.png').convert('RGBA')
NAVY = (0, 34, 72, 255); OUT = 'public/preview/favicon'
def framed(crop, size, shape, pad):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    if shape == 'circle': d.ellipse([0, 0, S - 1, S - 1], fill=NAVY)
    else: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .22), fill=NAVY)
    c = src.crop(crop); inner = int(S * (1 - 2 * pad)); k = inner / max(c.size)
    c = c.resize((int(c.size[0] * k), int(c.size[1] * k)), Image.LANCZOS)
    im.alpha_composite(c, ((S - c.size[0]) // 2, (S - c.size[1]) // 2))
    return im.resize((size, size), Image.LANCZOS)
for s in (64, 180):
    src.resize((s, s), Image.LANCZOS).save(f'{OUT}/o1_{s}.png')                 # 1 원 그대로
    framed((62, 22, 338, 272), s, 'round', .10).save(f'{OUT}/o2_{s}.png')      # 2 그림만 (건물 · 0 · 화살표 · 집)
    framed((62, 22, 338, 330), s, 'circle', .17).save(f'{OUT}/o3_{s}.png')     # 3 그림 + '원 부동산'
im = Image.new('RGB', (640, 300), (245, 245, 247))
for i, k in enumerate(('o1', 'o2', 'o3')):
    b = Image.open(f'{OUT}/{k}_180.png'); im.paste(b, (20 + i * 210, 10), b)
    for j, s in enumerate((16, 32, 64)):
        m = Image.open(f'{OUT}/{k}_64.png').resize((s, s), Image.LANCZOS); im.paste(m, (20 + i * 210 + j * 50, 210), m)
im.save(os.environ['TMP'] + '/off_sheet.png')
