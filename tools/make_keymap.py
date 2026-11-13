# 오피스텔 타입 그림(69OT · 79OT)의 KEY MAP을 아파트 타입처럼 '2단지 · 1단지' 지도 2장 나란히로 다시 그린다
# - 69OT 그림에는 2단지 지도(69OT 칠함), 79OT 그림에는 1단지 지도(79OT 칠함)만 있음
# - 다른 단지 지도는 상대 그림에서 가져와 칠한 색을 지우고(테두리만 남김) 옆에 놓음
# - 결과: 소스/평면/69OT_타입_키맵.png · 79OT_타입_키맵.png (원본은 그대로). 사이트 사본은 tools/watermark.py
# 실행: 프로젝트 폴더에서  python tools/make_keymap.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / '소스' / '평면'
MAP_BOX = (60, 488, 265, 690)      # 두 그림 모두 같은 자리: 북쪽 표시 + 단지 지도
CLEAR = (40, 486, 360, 716)        # 새 KEY MAP을 그릴 자리 (위 'KEY MAP ■ 69OT 2단지' 줄은 그대로)
FONT = 'C:/Windows/Fonts/malgunbd.ttf'
TAG_BG, LINE = (138, 138, 138), (140, 140, 140)


def unpaint(img, is_paint, edge_on=True):
    # 칠한 동을 흰색으로 지우고, (테두리도 같은 색이면) 지운 자리 둘레에 회색 테두리를 다시 그림
    a = np.asarray(img).astype(int)
    m = is_paint(a)
    mi = Image.fromarray((m * 255).astype('uint8'))
    edge = np.asarray(mi.filter(ImageFilter.MaxFilter(3))).astype(bool) & ~np.asarray(mi.filter(ImageFilter.MinFilter(3))).astype(bool)
    out = a.copy()
    out[m] = 255
    if edge_on:
        out[edge] = LINE
    return Image.fromarray(out.astype('uint8')).convert('L').convert('RGB')   # 다른 단지 지도는 색 없이 회색으로


def orange(a):  # 79OT 칠한 색 (주황)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 190) & (g > 80) & (g < 190) & (b < 110)


def yellow(a):  # 69OT 칠한 색 (연노랑)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    return (r > 225) & (g > 195) & (b < 238) & (r - b > 18)   # 가장자리 연한 노랑까지


def tag(draw, x, y, text, font):
    w = draw.textlength(text, font=font)
    draw.rectangle((x, y, x + w + 14, y + 18), fill=TAG_BG)
    draw.text((x + 7, y + 9), text, font=font, fill='white', anchor='lm')


def build(name, own_blk, own_map, other_map):
    src = Image.open(SRC / (name + '_타입.png')).convert('RGB')
    maps = {own_blk: own_map, ('1단지' if own_blk == '2단지' else '2단지'): other_map}
    d = ImageDraw.Draw(src)
    d.rectangle(CLEAR, fill='white')
    font = ImageFont.truetype(FONT, 12)
    W = 142  # 지도 한 장 폭 (아파트 KEY MAP 크기에 맞춤)
    for i, blk in enumerate(['2단지', '1단지']):   # 아파트와 같은 순서: 왼쪽 2단지 · 오른쪽 1단지
        m = maps[blk]
        m = m.resize((W, round(m.height * W / m.width)), Image.LANCZOS)
        x = 46 + i * (W + 18)
        tag(d, x, 498, blk, font)
        src.paste(m, (x, 526))
    out = SRC / (name + '_타입_키맵.png')
    src.save(out)
    print(out.name, src.size)


def main():
    m69 = Image.open(SRC / '69OT_타입.png').convert('RGB').crop(MAP_BOX)   # 2단지 지도 (69OT 칠함)
    m79 = Image.open(SRC / '79OT_타입.png').convert('RGB').crop(MAP_BOX)   # 1단지 지도 (79OT 칠함)
    build('69OT', '2단지', m69, unpaint(m79, orange))
    build('79OT', '1단지', m79, unpaint(m69, yellow, edge_on=False))   # 노란 동은 원래 회색 테두리가 있음


if __name__ == '__main__':
    main()
