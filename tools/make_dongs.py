# 단지배치도에서 동 누르는 칸 + 동을 누르면 뜨는 '유니트 배치' 확대 그림을 만든다 (대라수1차, 2026-11-13 · 2026-11-16 시안 r36 확정으로 바꿈)
# - 동 누르는 칸: 단지배치도(siteplan.jpg) 기준 % — 아래 DONGS
# - 확대 그림: 소스/DAELASOO/소스/단지_{동}동_유니트배치.png 의 '기준층 확대'(분홍 테두리 안쪽)만 잘라 public/daelasoo/assets/dls/units/{동}.jpg (사무소 로고 새김)
# - 라인 누르는 자리 = 세대 모양 그대로(다각형, 확대 그림 픽셀 좌표) → site.json siteplan.units[동].spots[] = { line, box(바깥 네모 %), clip(네모 안 다각형 %), plan(3D 평면), ar }
#   라인을 누르면 그 타입의 3D 평면(plans/main3d_타입.jpg) — 104동 1라인 → 59A
# 실행: 프로젝트 폴더에서  py tools/make_dongs.py   — site.json 은 "siteplan" 덩어리만 바꿔 씀 (다른 칸 줄 모양 그대로)
import json, sys
from pathlib import Path
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from watermark import SRC, OUT, LOGO, stamp, QUALITY

ROOT = Path(__file__).resolve().parent.parent
SITE = ROOT / 'public' / 'daelasoo' / 'data' / 'site.json'
# 동: 배치도 위 누르는 칸 [왼쪽, 위, 폭, 높이] %
DONGS = {101: [58, 52, 24, 31], 102: [21, 52, 25, 31], 103: [23, 13, 23, 28], 104: [60, 13, 21, 28]}
# 유니트배치.png 안 분홍 테두리 상자 (x0, y0, x1, y1) — 테두리 두께만큼 안쪽
CROP = {101: (806, 312, 1505, 883), 102: (806, 312, 1505, 883), 103: (806, 312, 1505, 874), 104: (806, 312, 1505, 866)}
# 라인 1 · 2 · 3 세대 모양 (잘라낸 그림 픽셀 좌표) — 그림 보고 잡음 (2026-11-16)
POLY = {
    101: [[(418, 140), (475, 76), (627, 205), (512, 345), (450, 280), (430, 205)], [(240, 335), (290, 280), (450, 280), (512, 345), (395, 478), (275, 410)], [(28, 160), (135, 32), (330, 240), (290, 280), (240, 335), (95, 210)]],
    102: [[(412, 200), (545, 68), (645, 182), (480, 350), (420, 285)], [(218, 322), (275, 268), (400, 262), (480, 350), (355, 470), (248, 400)], [(92, 205), (225, 68), (300, 130), (300, 245), (218, 322)]],
    103: [[(395, 120), (460, 65), (610, 235), (500, 330), (420, 240)], [(250, 358), (320, 290), (470, 270), (500, 330), (445, 400), (335, 465)], [(98, 180), (188, 102), (245, 140), (320, 290), (250, 358)]],
    104: [[(400, 298), (525, 120), (545, 112), (625, 198), (465, 378)], [(212, 325), (285, 272), (400, 298), (465, 378), (368, 478), (255, 412)], [(96, 232), (245, 68), (335, 128), (300, 245), (212, 325), (190, 322)]],
}
PLAN_AR = 1.6667   # plans/main3d_*.jpg = 5:3 (watermark.py 'P')


def main():
    text = SITE.read_text(encoding='utf-8')
    D = json.loads(text)
    typeOf = {b['no']: {l['line']: l['type'] for l in b['lines']} for b in D['units']['buildings']}
    logo = Image.open(LOGO).convert('RGBA')
    (OUT / 'units').mkdir(parents=True, exist_ok=True)
    units = {}
    for no, box in CROP.items():
        crop = Image.open(SRC / f'단지_{no}동_유니트배치.png').convert('RGB').crop(box)
        W, H = crop.size
        stamp(crop, logo).save(OUT / 'units' / f'{no}.jpg', 'JPEG', quality=88, optimize=True, progressive=True)
        spots = []
        for i, pts in enumerate(POLY[no]):
            xs, ys = [x for x, _ in pts], [y for _, y in pts]
            x0, y0, x1, y1 = min(xs), min(ys), max(xs), max(ys)
            ty = typeOf[no][i + 1]
            spots.append({'line': i + 1, 'box': [round(x0 / W * 100, 2), round(y0 / H * 100, 2), round((x1 - x0) / W * 100, 2), round((y1 - y0) / H * 100, 2)],
                          'clip': [[round((x - x0) / (x1 - x0) * 100, 1), round((y - y0) / (y1 - y0) * 100, 1)] for x, y in pts],
                          'plan': 'plans/main3d_' + ty + '.jpg', 'ar': PLAN_AR})
        units[str(no)] = {'ar': round(W / H, 4), 'spots': spots}
        print(f'units/{no}.jpg {W}x{H}', ' · '.join(f"{s['line']}라인 {typeOf[no][s['line']]}" for s in spots))
    sp = dict(D.get('siteplan') or {})
    sp['note'] = '단지배치도(assets/dls/siteplan.jpg) 위 동 누르는 칸 [왼쪽%, 위%, 폭%, 높이%] · units = 동을 누르면 뜨는 유니트배치 확대 그림 + 세대 모양 누르는 자리(box + clip) → 3D 평면 — tools/make_dongs.py 가 만듦'
    sp['dongs'] = {str(k): v for k, v in DONGS.items()}
    sp['units'] = units
    # "siteplan": { … } 덩어리만 바꿔 씀
    i = text.index('"siteplan"'); j = text.index('{', i); depth = 0
    for k in range(j, len(text)):
        depth += {'{': 1, '}': -1}.get(text[k], 0)
        if depth == 0: break
    ind = text[text.rindex('\n', 0, i) + 1:i]
    body = json.dumps(sp, ensure_ascii=False, indent=2).replace('\n', '\n' + ind)
    SITE.write_text(text[:j] + body + text[k + 1:], encoding='utf-8', newline='')
    print('site.json siteplan 갱신')

if __name__ == '__main__':
    main()
