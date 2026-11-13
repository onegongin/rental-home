# 사이트 사진 가볍게 (속도 ③, 2026-11-05) — public/daelasoo/assets/hwip 안의 사진을 같은 이름으로 다시 저장 (화면 코드 · site.json 은 그대로)
#   JPEG: 가로 1920 넘으면 1920 으로 줄이고 품질 76 · 점진 저장 (사무소 로고 새김은 이미 들어 있으니 그대로 유지)
#   3D 평면 PNG(바깥 투명): 256색으로 줄여 저장 (투명 유지)
#   휴대폰용: 첫 화면 큰 사진(hero_* · hero1 · aerial_*)은 가로 960 짜리를 m/ 폴더에 따로 (화면이 760 이하면 이것을 씀 — dashboard.dc.html 의 P)
#   더 작아질 때만 바꿈. tools/watermark.py · make_plan3d.py 로 사진을 다시 만든 뒤에도 이것을 한 번 돌린다
#   실행: python tools/slim_images.py            (바꾸기)
#         python tools/slim_images.py --dry      (얼마나 줄지 보기만)
import io, sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / 'public' / 'daelasoo' / 'assets' / 'hwip'
MAX_W, QUALITY, MOB_W, MOB_Q = 1920, 76, 960, 72
import re
MOB = re.compile(r'^(hero_|hero1|aerial_)[^/]*\.jpg$')
DRY = '--dry' in sys.argv


def slim_jpg(p):
    im = Image.open(p)
    im.load()
    if im.mode != 'RGB':
        im = im.convert('RGB')
    if im.width > MAX_W:
        im = im.resize((MAX_W, round(im.height * MAX_W / im.width)), Image.LANCZOS)
    b = io.BytesIO()
    im.save(b, 'JPEG', quality=QUALITY, optimize=True, progressive=True)
    return b.getvalue()


def slim_png(p):
    im = Image.open(p)
    im.load()
    if im.mode != 'RGBA':
        im = im.convert('RGBA')
    q = im.quantize(colors=256, method=Image.Quantize.FASTOCTREE, dither=Image.Dither.FLOYDSTEINBERG)
    b = io.BytesIO()
    q.save(b, 'PNG', optimize=True)
    return b.getvalue()


def main():
    before = after = 0
    for p in sorted(ROOT.rglob('*')):
        ext = p.suffix.lower()
        if ext in ('.jpg', '.jpeg'):
            data = slim_jpg(p)
        elif ext == '.png' and p.parent.name == 'plans' and p.name.startswith('3d_'):
            data = slim_png(p)
        else:
            continue
        old = p.stat().st_size
        if p.parent == ROOT and MOB.match(p.name):
            im = Image.open(p).convert('RGB')
            im = im.resize((MOB_W, round(im.height * MOB_W / im.width)), Image.LANCZOS)
            b = io.BytesIO(); im.save(b, 'JPEG', quality=MOB_Q, optimize=True, progressive=True)
            print(f'  휴대폰용 {len(b.getvalue()) // 1024:>4}KB  m/{p.name}')
            if not DRY:
                (ROOT / 'm').mkdir(exist_ok=True); (ROOT / 'm' / p.name).write_bytes(b.getvalue())
        if p.parent.name == 'm':
            continue
        if len(data) < old * 0.9:   # 10% 넘게 줄 때만
            before += old
            after += len(data)
            print(f'{old // 1024:>5}KB → {len(data) // 1024:>4}KB  {p.relative_to(ROOT)}')
            if not DRY:
                p.write_bytes(data)
    print(f'합계 {before // 1024}KB → {after // 1024}KB' + (' (보기만)' if DRY else ''))


if __name__ == '__main__':
    main()
