# 동별 유니트배치 창 (단지배치 → 동 누르기) 그림 · 누르는 영역 만들기
# - 소스/평면/단지_NNN동_유니트배치.jpg 의 오른쪽 위 "기준층 확대"(분홍 테두리 상자)만 잘라 public/daelasoo/assets/hwip/units/NNN.jpg
# - 상자 안 분홍 테두리 유니트 = 호 라인 (아래 왼쪽 1 · 아래 오른쪽 2 · 위 오른쪽 3 · 위 왼쪽 4, 두 라인 동은 왼쪽 1 · 오른쪽 2)
# - 라인 평면은 배치된 방향(좌우·상하 뒤집힘)을 그림에서 찾아 units/plan/타입_단지_방향.jpg 로 저장 (로고 새김)
#   뒤집으면 방 이름 글자도 거울처럼 되므로 tools/plan_words.json 의 글자 상자만 원래 방향으로 다시 붙임
# - 결과(누르는 영역 % · 평면 파일 · 비율)는 site.json 의 siteplan.units 한 덩어리만 바꿔 씀 (다른 내용·줄바꿈 그대로)
# 실행: 프로젝트 폴더에서  python tools/make_units.py   (numpy · pillow 필요)
import json, re, sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageOps

sys.path.insert(0, str(Path(__file__).resolve().parent))
from watermark import SRC, OUT, LOGO, FILES, QUALITY, stamp, flat

SITE = OUT.parent.parent / 'data' / 'site.json'
DONGS = ['101', '102', '103', '104', '201', '202', '203', '204']
PLAN_W = 1400
# 배치 방향 후보: (이름, 바꾸는 방법) — 그림 속 유니트와 가장 닮은 것을 고른다
# 기준층 확대 그림은 평면을 눕히지 않고 뒤집기만 함 (84B·69 세로, 나머지 가로)
# 모양이 대칭이라 자동으로 못 가리는 것 — 그림 보고 직접 정함 (동, 라인): 방향
FIX = {('204', 1): '', ('204', 2): 'm', ('204', 3): 'r', ('204', 4): 'v'}
TF = [('', None), ('m', Image.Transpose.FLIP_LEFT_RIGHT), ('v', Image.Transpose.FLIP_TOP_BOTTOM), ('r', Image.Transpose.ROTATE_180)]


def pink(a):
    r, g, b = (a[..., i].astype(int) for i in range(3))
    return (r > 150) & (g < 110) & (b > 50) & (b < 180) & (r - g > 80)


def longest(m):
    out = []
    for row in m:
        d = np.diff(np.concatenate([[0], row.astype(int), [0]]))
        s, e = np.where(d == 1)[0], np.where(d == -1)[0]
        out.append((e - s).max() if len(s) else 0)
    return np.array(out)


def comps(m):
    # 이어진 분홍 덩어리마다 [x0, y0, x1, y1, 점 수]
    H, W = m.shape
    seen, out = np.zeros((H, W), bool), []
    for y, x in zip(*np.nonzero(m)):
        if seen[y, x]:
            continue
        q, seen[y, x], pts = deque([(y, x)]), True, []
        while q:
            cy, cx = q.popleft(); pts.append((cy, cx))
            for ny in (cy - 1, cy, cy + 1):
                for nx in (cx - 1, cx, cx + 1):
                    if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True; q.append((ny, nx))
        ys, xs = [p[0] for p in pts], [p[1] for p in pts]
        out.append([min(xs), min(ys), max(xs) + 1, max(ys) + 1, len(pts)])
    return out


def inset(im):
    a = np.asarray(im)[:1500]
    m = pink(a)
    rows, cols = np.where(longest(m) > 400)[0], np.where(longest(m.T) > 300)[0]
    return int(cols.min()) + 14, int(rows.min()) + 14, int(cols.max()) - 14, int(rows.max()) - 14


def number(boxes):
    # 위치로 호 라인 번호 매기기
    if len(boxes) == 2:
        return sorted(boxes, key=lambda b: b[0])
    cy = sorted(b[1] + b[3] for b in boxes)
    mid = (cy[1] + cy[2]) / 2
    top = sorted([b for b in boxes if b[1] + b[3] < mid], key=lambda b: b[0])
    bot = sorted([b for b in boxes if b[1] + b[3] >= mid], key=lambda b: b[0])
    return [bot[0], bot[1], top[1], top[0]]


def shape(free):
    # 가장자리에서 빈칸(free)을 따라 닿지 않는 곳 = 유니트(평면) 모양
    H, W = free.shape
    out = np.zeros((H, W), bool)
    q = deque((y, x) for y in range(H) for x in (0, W - 1) if free[y, x])
    q.extend((y, x) for x in range(W) for y in (0, H - 1) if free[y, x])
    for y, x in q:
        out[y, x] = True
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < H and 0 <= nx < W and free[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; q.append((ny, nx))
    return ~out


SZ = (160, 160)


def plan_shape(im):
    return shape(np.asarray(ImageOps.grayscale(im).resize(SZ, Image.BILINEAR)) > 235)


def unit_shape(im):
    return shape(~pink(np.asarray(im.resize(SZ, Image.BILINEAR))))


WORDS = json.loads((Path(__file__).resolve().parent / 'plan_words.json').read_text(encoding='utf-8'))


def upright(t, pl, k, wd):
    # 뒤집은 평면 t 에서 방 이름만 원래 방향 글자로 다시 붙임 (글자 상자: tools/plan_words.json)
    if not wd:
        print('확인: 글자 상자 없음 — 뒤집힌 글자 그대로'); return t
    W, H = pl.size
    sx, sy, pad = W / wd['size'][0], H / wd['size'][1], 3
    for x, y, w, h, _ in wd['words']:
        x0, y0 = max(0, round(x * sx) - pad), max(0, round(y * sy) - pad)
        x1, y1 = min(W, round((x + w) * sx) + pad), min(H, round((y + h) * sy) + pad)
        nx = W - x1 if k in ('m', 'r') else x0
        ny = H - y1 if k in ('v', 'r') else y0
        t.paste(pl.crop((x0, y0, x1, y1)), (nx, ny))
    return t


def main():
    logo = Image.open(LOGO).convert('RGBA')
    site_s = SITE.read_bytes().decode('utf-8')
    site = json.loads(site_s)
    blds = {str(b['no']): b for b in site['units']['buildings']}
    plan_src = {dst: src for src, dst, *_ in FILES if isinstance(src, str)}
    (OUT / 'units' / 'plan').mkdir(parents=True, exist_ok=True)
    made, res = {}, {}
    for n in DONGS:
        im = Image.open(SRC / '평면' / f'단지_{n}동_유니트배치.jpg').convert('RGB')
        box = inset(im)
        crop = im.crop(box)
        f = 3
        bs = [[v * f for v in c[:4]] for c in comps(pink(np.asarray(crop))[::f, ::f]) if c[4] > 15]
        b = blds[n]
        types = {l['line']: l['type'] for l in b['lines']}
        if len(bs) != len(types):
            print(f'확인: {n}동 유니트 {len(bs)}개 · 라인 {len(types)}개'); continue
        W, H = crop.size
        spots = []
        for line, (x0, y0, x1, y1) in enumerate(number(bs), 1):
            t = types[line]
            dst = site['types'][t]['byBlock'][b['block']]['plan']
            src = SRC / plan_src[dst]
            unit = crop.crop((x0, y0, x1, y1))
            # 분홍 테두리 안 모양과 평면 바깥 모양이 가장 많이 겹치는 방향
            pl = flat(Image.open(src))
            us = unit_shape(unit)
            score = {}
            for k, op in TF:
                ps = plan_shape(pl if op is None else pl.transpose(op))
                score[k] = float((ps & us).sum() / (ps | us).sum())
            k = FIX.get((n, line), max(score, key=score.get))
            name = f"units/plan/{Path(dst).stem}{'_' + k if k else ''}.jpg"
            if name not in made:
                op = dict(TF)[k]
                p = pl if op is None else upright(pl.transpose(op), pl, k, WORDS.get(Path(dst).stem))
                p.thumbnail((PLAN_W, PLAN_W), Image.LANCZOS)
                stamp(p, logo).save(OUT / name, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
                made[name] = round(p.width / p.height, 4)
            spots.append({'line': line, 'box': [round(x0 / W * 100, 1), round(y0 / H * 100, 1), round((x1 - x0) / W * 100, 1), round((y1 - y0) / H * 100, 1)], 'plan': name, 'ar': made[name]})
            print(f'{n}동 {line}호 {t:4s} 방향 {k or "그대로":5s}', ' '.join(f'{a or "-"}:{v:.2f}' for a, v in sorted(score.items(), key=lambda x: -x[1])[:3]))
        stamp(crop, logo).save(OUT / 'units' / f'{n}.jpg', 'JPEG', quality=QUALITY, optimize=True, progressive=True)
        res[n] = {'ar': round(W / H, 4), 'spots': spots}
    # site.json 의 "units": { ... } (siteplan 안 한 줄)만 교체
    nl = '\r\n' if '\r\n' in site_s else '\n'
    body = (f'"units": {{ "note": "동별 유니트배치 창 — units/동.jpg(기준층 확대) 비율 ar · 호 라인 누르는 영역 box[왼쪽%, 위%, 폭%, 높이%] · 배치 방향 평면 (tools/make_units.py)",' + nl
            + (',' + nl).join(f'      "{n}": ' + json.dumps(v, ensure_ascii=False) for n, v in res.items()) + ' }')
    new, cnt = re.subn(r'"units": \{ "note": "동별 유니트배치.*?(?=,\r?\n\s*"spots")', lambda _: body, site_s, flags=re.S)
    if cnt != 1:
        print('확인: site.json siteplan.units 자리를 못 찾음'); return
    json.loads(new)
    SITE.write_bytes(new.encode('utf-8'))
    print('평면', len(made), '장 ·', ', '.join(made))


if __name__ == '__main__':
    main()
