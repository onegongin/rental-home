# 단지배치도에서 동 누르는 칸 + 동을 누르면 뜨는 '유니트 배치' 확대 그림을 만든다 (대라수1차, 2026-11-13)
# - 원본: 소스/DAELASOO/소스/(1차)배치도.jpg → public/daelasoo/assets/dls/units/{동}.jpg (사무소 로고 새김)
# - site.json siteplan.dongs[동] = 배치도 위 누르는 칸 [왼쪽%, 위%, 폭%, 높이%]
#   siteplan.units[동] = { ar, spots: [{ line, box(확대 그림 기준 %), plan, ar }] } — 라인을 누르면 그 타입 평면
# - 위치는 배치도의 동 이름표 · 라인 번호 동그라미를 보고 잡음 (배치도 전체 기준 %). 배치도가 바뀌면 아래 숫자만 고침
# 실행: 프로젝트 폴더에서  py tools/make_dongs.py
import json, sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from watermark import SRC, OUT, LOGO, stamp, QUALITY

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'public' / 'daelasoo' / 'data' / 'site.json'
PLAN = SRC / '(1차)배치도.jpg'

# 동: (누르는 칸 [왼쪽, 위, 폭, 높이] %, {라인: 동그라미 가운데 (x, y) %})
DONGS = {
    101: ([58, 52, 24, 31], {1: (75, 64.5), 2: (69, 74.5), 3: (64, 65.5)}),
    102: ([21, 52, 25, 31], {1: (39, 64.5), 2: (34, 74.5), 3: (28, 65.5)}),
    103: ([23, 13, 23, 28], {1: (39, 22), 2: (33.5, 33), 3: (28, 23)}),
    104: ([60, 13, 21, 28], {1: (76, 22), 2: (70, 33), 3: (64, 23)}),
}
SPOT_W, SPOT_H, PAD = 10, 13, 1.5   # 라인 칸 크기 · 확대 그림 여백 (배치도 전체 기준 %)


def main():
    D = json.loads(SITE.read_text(encoding='utf-8'))
    T = D['types']
    typeOf = {b['no']: {l['line']: l['type'] for l in b['lines']} for b in D['units']['buildings']}
    img = Image.open(PLAN).convert('RGB'); W, H = img.size
    logo = Image.open(LOGO).convert('RGBA')
    (OUT / 'units').mkdir(parents=True, exist_ok=True)
    dongs, units = {}, {}
    for no, (box, circles) in DONGS.items():
        l, t, w, h = box
        dongs[str(no)] = box
        x0, y0, x1, y1 = max(0, l - PAD), max(0, t - PAD), min(100, l + w + PAD), min(100, t + h + PAD)
        crop = img.crop((round(W * x0 / 100), round(H * y0 / 100), round(W * x1 / 100), round(H * y1 / 100)))
        crop.thumbnail((1400, 1400), Image.LANCZOS)
        stamp(crop, logo).save(OUT / 'units' / f'{no}.jpg', 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        cw, ch = x1 - x0, y1 - y0
        spots = []
        for line, (cx, cy) in sorted(circles.items()):
            sx0, sy0 = max(x0, cx - SPOT_W / 2), max(y0, cy - SPOT_H / 2)
            sx1, sy1 = min(x1, cx + SPOT_W / 2), min(y1, cy + SPOT_H / 2)
            ty = typeOf[no][line]
            spots.append({'line': line, 'box': [round((sx0 - x0) / cw * 100, 1), round((sy0 - y0) / ch * 100, 1), round((sx1 - sx0) / cw * 100, 1), round((sy1 - sy0) / ch * 100, 1)],
                          'plan': 'plans/intro_' + ty + '.jpg', 'ar': T[ty]['planAr']})
        units[str(no)] = {'ar': round(crop.width / crop.height, 4), 'spots': spots}
        print(f'units/{no}.jpg {crop.width}x{crop.height}', ' · '.join(f"{s['line']}라인 {typeOf[no][s['line']]}" for s in spots))
    D['siteplan']['dongs'] = dongs
    D['siteplan']['units'] = units
    D['siteplan']['note'] = '단지배치도(assets/dls/siteplan.jpg) 위 동 누르는 칸 [왼쪽%, 위%, 폭%, 높이%] · units = 동을 누르면 뜨는 확대 그림의 라인 칸 — tools/make_dongs.py 가 만듦'
    SITE.write_text(json.dumps(D, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print('site.json siteplan 갱신')


if __name__ == '__main__':
    main()
