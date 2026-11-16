# 단지 화면 파비콘 (시안 r33 B안 = 빨간 바탕 + 흰 DS) — 실행: py tools/make_favicon_ds.py 소스/DAELASOO/참고만_CD_DaelaSoo1-main/public/apple-touch-icon.png public/preview/favicon
# 결과 b_64.png → public/daelasoo/favicon.png · b_180.png → public/daelasoo/apple-touch-icon.png
import sys, base64, io
from PIL import Image, ImageDraw, ImageFilter
src = Image.open(sys.argv[1]).convert('RGB')
# 빨강 글자 → 투명 마스크 (흰 바탕은 G=255, 빨강은 G≈46)
g = src.split()[1]
mask = g.point(lambda v: max(0, min(255, int((255 - v) * 255 / 209))))
bb = mask.getbbox(); mask = mask.crop(bb)
RED = (238, 46, 36); OUT = sys.argv[2]
def make(size, bg, fg, radius, pad):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if bg:
        ImageDraw.Draw(im).rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius), fill=bg + (255,))
    w, h = mask.size; pad = pad * (0.45 if size <= 64 else 1); inner = int(S * (1 - 2 * pad)); k = inner / max(w, h)
    mm = mask.filter(ImageFilter.MaxFilter(5)) if size <= 64 else mask
    m = mm.resize((max(1, int(w * k)), max(1, int(h * k))), Image.LANCZOS)
    layer = Image.new('RGBA', m.size, fg + (255,)); layer.putalpha(m)
    im.alpha_composite(layer, ((S - m.size[0]) // 2, (S - m.size[1]) // 2))
    return im.resize((size, size), Image.LANCZOS)
V = {'a': ((255, 255, 255), RED, 0.0, 0.08), 'b': (RED, (255, 255, 255), 0.22, 0.14), 'c': ((29, 29, 31), (255, 255, 255), 0.22, 0.14)}
for k, (bg, fg, r, p) in V.items():
    for s in (64, 180):
        make(s, bg, fg, r if s == 64 or k != 'a' else 0, p).save(f'{OUT}/{k}_{s}.png')
