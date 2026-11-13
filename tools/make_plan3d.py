# 타입소개 그림(소스/평면/*_타입소개_A.png · *OT_타입_키맵.png)에서 3D 평면만 잘라 public/daelasoo/assets/hwip/plans/3d_타입.png (바깥은 투명 — 어떤 바탕에도 얹을 수 있게)
# - 진한 부분(벽·바닥) 중 가는 선(안내 상자 연결선 · 글자)을 지운 뒤 가장 큰 덩어리 = 3D 평면 (218은 위·아래층 2덩어리)
# - 왼쪽 글자 칸(타입 이름 · 면적표 · KEY MAP)과 위쪽 안내 상자((유상옵션) 바닥타일 등)는 빼고, 덩어리 밖은 흰색으로
# - 사진 로고 새김(tools/watermark.py 의 stamp)
# 실행: 프로젝트 폴더에서  python tools/make_plan3d.py
import sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(Path(__file__).resolve().parent))
from watermark import SRC, OUT, LOGO, stamp

TYPES = {'84A': '84A_타입소개_A', '84B': '84B_타입소개_A', '84C': '84C_타입소개_A', '84D': '84D_타입소개_A',
         '148': '148_타입소개_A', '218': '218_타입소개_A', '69': '69OT_타입_키맵', '79': '79OT_타입_키맵'}
LEFT = 200     # 왼쪽 글자 칸 폭 (픽셀) — 이 안은 보지 않음
PAD = 14


def blobs(m):
    # 이어진 덩어리 [점 수, x0, y0, x1, y1, 점들]
    H, W = m.shape
    seen, out = np.zeros((H, W), bool), []
    for y, x in zip(*np.nonzero(m)):
        if seen[y, x]:
            continue
        q, seen[y, x], pts = deque([(y, x)]), True, []
        while q:
            cy, cx = q.popleft(); pts.append((cy, cx))
            for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                if 0 <= ny < H and 0 <= nx < W and m[ny, nx] and not seen[ny, nx]:
                    seen[ny, nx] = True; q.append((ny, nx))
        ys, xs = zip(*pts)
        out.append([len(pts), min(xs), min(ys), max(xs) + 1, max(ys) + 1, pts])
    return sorted(out, key=lambda b: -b[0])


def plan3d(img, two=False):
    a = np.asarray(img.convert('L'))
    f = 2   # 반으로 줄여 계산
    small = Image.fromarray(((a < 200) * 255).astype('uint8')).resize((a.shape[1] // f, a.shape[0] // f), Image.BOX)
    m = np.asarray(small.filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MaxFilter(9))) > 60   # 가는 선 · 글자 지우고 덩어리만
    m[:, :LEFT // f] = False
    bs = blobs(m)
    keep = [b for b in bs[:2 if two else 1] if b[0] > 0.25 * bs[0][0]]
    mask = np.zeros_like(m)
    for b in keep:
        ys, xs = zip(*b[5]); mask[ys, xs] = True
    mask = np.asarray(Image.fromarray((mask * 255).astype('uint8')).filter(ImageFilter.MaxFilter(9)).resize((a.shape[1], a.shape[0]), Image.NEAREST)) > 0
    ys, xs = np.nonzero(mask)
    x0, y0, x1, y1 = max(0, xs.min() - PAD), max(0, ys.min() - PAD), min(a.shape[1], xs.max() + PAD), min(a.shape[0], ys.max() + PAD)
    rgb = np.asarray(img.convert('RGB')).copy()
    # 빨간 강조 동그라미(84B 드레스룸 표시)는 주변 색으로 메움
    r, g, b = (rgb[..., i].astype(int) for i in range(3))
    red = (r > 150) & (r - g > 70) & (r - b > 70)
    if red.any():
        red = np.asarray(Image.fromarray((red * 255).astype('uint8')).filter(ImageFilter.MaxFilter(5))) > 0
        val, img2 = ~red, rgb.astype(float)   # 바깥에서 안으로 주변 색을 번져 채움
        while not val.all():
            acc, cnt = np.zeros_like(img2), np.zeros(val.shape)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    acc += np.roll(np.roll(img2 * val[..., None], dy, 0), dx, 1); cnt += np.roll(np.roll(val, dy, 0), dx, 1)
            new = ~val & (cnt > 0)
            img2[new] = acc[new] / cnt[new][:, None]; val = val | new
        rgb = img2.astype('uint8')
    rgb[~mask] = 255
    return Image.fromarray(rgb).crop((x0, y0, x1, y1))


def cutout(p):
    # 가장자리에서 이어진 흰 바탕만 투명하게 (평면 안쪽 흰 벽은 그대로), 경계는 1px 부드럽게
    a = np.asarray(p.convert('L'))
    white = a > 238
    H, W = a.shape
    out = np.zeros((H, W), bool)
    q = deque([(y, x) for y in range(H) for x in (0, W - 1) if white[y, x]] + [(y, x) for x in range(W) for y in (0, H - 1) if white[y, x]])
    for y, x in q:
        out[y, x] = True
    while q:
        y, x = q.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < H and 0 <= nx < W and white[ny, nx] and not out[ny, nx]:
                out[ny, nx] = True; q.append((ny, nx))
    alpha = Image.fromarray(((~out) * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.7))
    rgba = p.convert('RGBA'); rgba.putalpha(alpha)
    return rgba


def main():
    logo = Image.open(LOGO).convert('RGBA')
    for t, name in TYPES.items():
        src = SRC / '평면' / f'{name}.png'
        if not src.exists():
            print('없음:', src.name); continue
        p = plan3d(Image.open(src), two=(t == '218'))
        q = OUT / 'plans' / f'3d_{t}.png'
        cutout(stamp(p, logo)).save(q, optimize=True)
        print(f'{q.name:12s} {p.size[0]}x{p.size[1]}')


if __name__ == '__main__':
    main()
