# 입지환경 보드 사진의 보드 칸 · 확대 창용 큰 그림을 만든다 (2026-10-31 시작, m7 확정 2026-11-01)
# - 신세계몰 조감도 · 광천권역 교통대책: 원본 안 아래쪽에 (출처)를 연회색 글씨로 새김 (조감도 오른쪽 한 줄 · 교통대책 왼쪽 두 줄 크게)
# - 현재: 소스/안내/신세계몰항공_AI.png(AI 생성 항공뷰) → 보드 칸(loc_now_ai.jpg) · 확대 창(loc_now_ai_big.jpg). 글씨(현재 · 제목 · 설명) · 표시(신세계몰 공사부지 · 유스퀘어 터미널) · 'AI 생성 이미지' 표기(보드 칸만 — 확대 창은 화면 글씨)를 새김. 실제 항공사진은 저작권 때문에 안 씀
# - 글씨는 키운 뒤에 그려서 또렷하게. 마지막에 사무소 로고(3%)를 watermark.py 와 같은 방법으로 넣음
# 실행: 프로젝트 폴더에서  py tools/make_board_big.py
import sys
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
import watermark as W

S = 2                                   # 키우는 배율
RED, INK = (232, 56, 46), (29, 29, 31)
BOLD, REG = 'C:/Windows/Fonts/malgunbd.ttf', 'C:/Windows/Fonts/malgun.ttf'


def pill(d, cx, top, text, font, bg, fg, tail, u=S):
    # 둥근 이름표 + 아래쪽 꼬리(가리키는 곳) — cx 가운데, top 위쪽
    l, t, r, b = d.textbbox((0, 0), text, font=font)
    w, h = r - l + round(30 * u) // 2 * 2, b - t + round(18 * u) // 2 * 2
    x0, y0 = cx - w // 2, top
    d.rounded_rectangle((x0, y0, x0 + w, y0 + h), radius=h // 2 if tail else round(10 * u), fill=bg)
    d.text((x0 + (w - (r - l)) // 2 - l, y0 + (h - (b - t)) // 2 - t), text, font=font, fill=fg)
    if tail:
        d.polygon([(cx - round(9 * u), y0 + h - 1), (cx + round(9 * u), y0 + h - 1), (cx, y0 + h + round(10 * u))], fill=bg)


def main():
    # 현재: 소스/안내/신세계몰항공_AI.png (AI 생성 항공뷰, 2750x1536) — 보드 칸 · 확대 창 같은 부분 · 같은 글씨 (2026-11-01 대표 요청)
    src = Image.open(W.SRC / '안내' / '신세계몰항공_AI.png').convert('RGB')
    crop = src.crop(tuple(round(v * (src.width if k % 2 == 0 else src.height)) for k, v in enumerate(AI_BOX)))
    save(ai_tile(crop, 530 * S, S).resize((530, 402), Image.LANCZOS), 'loc_now_ai.jpg')
    save(ai_tile(crop, 1440, 1440 / 530, False), 'loc_now_ai_big.jpg')   # 확대 창: 'AI 생성 이미지' 표기는 그림에 안 새기고 창에서 연회색 글씨로(site.json note)
    # 원본 + 출처 한 줄
    for src, name, lines, color, side, div in SRC_NOTE:
        im = Image.open(W.SRC / '안내' / src).convert('RGB')
        if im.width > W.MAX_W:
            im = im.resize((W.MAX_W, round(im.height * W.MAX_W / im.width)), Image.LANCZOS)
        save(with_source(im, lines, color, side, div), name)



def ai_tile(crop, w, u, note=True):
    # AI 항공뷰를 폭 w 로 키우고(u = 530 칸 기준 배율) 위쪽을 어둡게 + 흰 글씨 — 옆 '신세계몰 예상 투시도' 칸과 같은 모양 · 크기
    h = round(w * crop.height / crop.width)
    im = crop.resize((w, h), Image.LANCZOS)
    sh = Image.new('L', (1, h))
    for y in range(h):
        sh.putpixel((0, y), round(175 if y < h * .32 else max(0, 175 * (1 - (y - h * .32) / (h * .18)))))
    im = Image.composite(Image.new('RGB', (w, h), (20, 24, 34)), im, sh.resize((w, h)))
    d = ImageDraw.Draw(im)
    F = lambda f, n: ImageFont.truetype(f, round(n * u))
    pill(d, round(46 * u), round(12 * u), '현재', F(BOLD, 17), RED, 'white', False, u)
    d.text((round(17 * u), round(70 * u)), '유스퀘어 · 신세계몰 부지', font=F(BOLD, 20), fill='white')
    d.text((round(18 * u), round(117 * u)), '단지 앞 도보권 항공뷰', font=F(REG, 16), fill=(235, 235, 240))
    for text, (fx, fy), bg, fg in AI_TAGS:
        pill(d, min(round(fx * w), w - round(78 * u)), round(fy * h - 45 * u), text, F(BOLD, 16), bg, fg, True, u)
    t, fs = 'AI 생성 이미지 · 실제와 다를 수 있음', F(REG, 10)   # 실제 사진으로 오해하지 않게 (note=False: 확대 창은 사진 아래 글씨로 대신)
    if note: d.text((w - round(8 * u) - d.textlength(t, font=fs), h - round(17 * u)), t, font=fs, fill=(235, 235, 240), stroke_width=max(1, round(u)), stroke_fill=(0, 0, 0))
    return im

# 현재 AI 항공뷰: 잘라낼 곳(원본 비율 왼 · 위 · 오른 · 아래, 530:402) · 표시(꼬리 끝, 잘라낸 그림 비율)
AI_BOX = (.23, .12, .863, .98)
AI_TAGS = [('신세계몰 공사부지', (.387, .55), RED, 'white'), ('유스퀘어 터미널', (.742, .62), 'white', INK)]

# (원본, 저장 이름, 출처 줄, 글씨 색, 위치, 글씨 크기=사진 폭 / 값) — 전남광주통합특별시청 보도자료
# 교통대책은 세로로 긴 그림이라 창에서 많이 줄어듦 → 왼쪽 아래에 크게 두 줄 (2026-10-31 대표 요청)
SRC_NOTE = [('신세계몰조감도.jpeg', 'loc_mall_big.jpg', ['(출처) 전남광주통합특별시청 보도자료 · 광주시-신세계, 광천터미널 복합화 3조 투자협약'], (232, 232, 236), 'right', 95),
            ('광천권역 교통대책.jpg', 'loc_traffic_big.jpg', ['(출처) 전남광주통합특별시청 보도자료', '광주시, 광천권역 대자보 교통대책 추진…도시철도-BRT(간선급행버스) 모두 도입'], (150, 150, 156), 'left', 46)]


def with_source(im, lines, color, side, div):
    # 사진 안 아래쪽(왼쪽 또는 오른쪽)에 출처 — 연한 회색
    w, h = im.size
    f = ImageFont.truetype(REG, max(12, round(w / div)))
    while max(f.getlength(t) for t in lines) > w * .92:
        f = ImageFont.truetype(REG, f.size - 1)
    pad, th = round(w / 80), f.getbbox('가')[3]
    lh, tw = round(th * 1.45), max(f.getlength(t) for t in lines)
    bx, by = round(th * .7), round(th * .45)
    bh = lh * (len(lines) - 1) + th
    x = pad + bx if side == 'left' else w - pad - bx - tw
    y = h - pad - by - bh
    if sum(color) > 600:   # 밝은 글씨(조감도)만 뒤에 어두운 반투명 띠 — 교통대책은 띠 없이 지도 위에 바로 (2026-10-31 대표 요청)
        band = Image.new('RGBA', im.size, (0, 0, 0, 0))
        ImageDraw.Draw(band).rounded_rectangle((x - bx, y - by, x + tw + bx, y + bh + by + 2), radius=min(th, (bh + 2 * by) // 2), fill=(0, 0, 0, 110))
        im = Image.alpha_composite(im.convert('RGBA'), band).convert('RGB')
    d = ImageDraw.Draw(im)
    for k, t in enumerate(lines):
        d.text((x, y + k * lh), t, font=f, fill=color)
    return im


def save(im, name):
    im = W.stamp(im, Image.open(W.LOGO).convert('RGBA'))
    out = W.OUT / 'board' / name
    im.save(out, quality=W.QUALITY, optimize=True)
    print(out.relative_to(W.ROOT), im.size)


if __name__ == '__main__':
    main()
