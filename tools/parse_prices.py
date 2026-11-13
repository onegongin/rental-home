# 모집공고 PDF(소스/공고/모집공고_아파트_1·2단지.pdf)의 '공급금액 및 납부일정' 표를 읽어
# public/daelasoo/data/prices.json 으로 저장한다. (분양가표·호실 분양금액에 씀)
# - 한 줄 = 주택형 · 층 구간 · 동/호 라인 묶음 → 대지비 · 건축비 · 부가세 · 합계 · 계약금 1·2차 · 중도금 1~6차 · 잔금
# - 검산: 각 줄의 세대수 = 그 줄의 동·라인·층에 해당하는 실제 세대수(site.json), 합계 = 대지비+건축비+부가세 = 납부금 합
# + 오피스텔: 소스/공고/광주_화정_아이파크_오피스텔_분양가.xlsx (대표가 오피스텔 공고 그림에서 옮긴 표, 납부일정 포함)
# 실행: 프로젝트 폴더에서  python tools/parse_prices.py   (처음 한 번: py -m pip install --user pymupdf openpyxl)
import json, re
from pathlib import Path
import pymupdf

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / '소스' / '공고'
PDFS = [('1단지', '모집공고_아파트_1단지.pdf', range(4, 7)), ('2단지', '모집공고_아파트_2단지.pdf', range(4, 8))]
NUM = re.compile(r'^\d{1,3}(,\d{3})+$')
TYPE = re.compile(r'^(\d{3})\.(\d{4})([A-Z]?)$')   # 084.6410A → 84A, 148.0490 → 148
FLOOR = re.compile(r'^(\d+)(?:~(\d+))?층$')


def tokens(pdf, pages):
    d = pymupdf.open(SRC / pdf)
    out = []
    for i in pages:
        if i >= len(d):
            continue
        t = d[i].get_text()
        if '공급금액' not in t and '084.' not in t and '148.' not in t:
            continue
        t = t.replace('\x01', ' ').replace('　', ' ')   # PDF 안 보이지 않는 구분 문자 제거
        out += [re.sub(r'\s+', ' ', x).strip() for x in t.split('\n') if x.strip()]
    return out


def units_of(text):
    # '101동 4호,103동 3호' · '104동 3,4호' · '101동 1,2,103동 2' → [(101,[4]),(103,[3])]
    res = []
    for m in re.finditer(r'(\d{3})동\s*([\d,\s]+?)(?=,\s*\d{3}동|호|$)', text):
        res.append((int(m.group(1)), [int(x) for x in re.findall(r'\d+', m.group(2))]))
    return res


TYPE_ORDER = ['84A', '84B', '84C', '84D', '148', '218']


def parse(blk, pdf, pages):
    # 글자 위치로 줄을 묶는다: 금액 칸들이 같은 높이에 12~13개 있으면 한 줄(가격 줄).
    # 동·호 칸(여러 줄일 수 있음)과 세대수 칸은 높이가 가장 가까운 가격 줄에 붙인다.
    # 합친 칸(주택형·층)은 위치가 줄과 어긋나므로 층 구간 목록만 모으고, 타입·층은 assign()에서 정한다
    d = pymupdf.open(SRC / pdf)
    rows, bands = [], []
    for pi in pages:
        if pi >= len(d):
            continue
        L = []
        for bl in d[pi].get_text('dict')['blocks']:
            for ln in bl.get('lines', []):
                t = re.sub(r'\s+', ' ', ''.join(sp['text'] for sp in ln['spans']).replace('\x01', ' ').replace('　', ' ')).strip()
                if t:
                    x0, y0, x1, y1 = ln['bbox']; L.append((t, x0, (y0 + y1) / 2))
        for t, x, y in L:
            m = FLOOR.match(t)
            if m:
                fb = [int(m.group(1)), int(m.group(2) or m.group(1))]
                if fb not in bands:
                    bands.append(fb)
        nums = []
        for t, x, y in L:
            parts = t.split(' ')
            if all(NUM.match(p) for p in parts):
                w = len(t) or 1
                for k, p in enumerate(parts):
                    nums.append((x + k * 0.01, y, int(p.replace(',', ''))))
        # 같은 높이(±3)끼리 묶기
        nums.sort(key=lambda v: v[1])
        groups = []
        for v in nums:
            if groups and abs(groups[-1][-1][1] - v[1]) <= 3:
                groups[-1].append(v)
            else:
                groups.append([v])
        prow = [g for g in groups if len(g) >= 12]
        if not prow:
            continue
        ys = [sum(v[1] for v in g) / len(g) for g in prow]
        dxs = [x for t, x, y in L if re.search(r'\d{3}동', t)]
        dx = min(dxs, default=0)
        # 표의 가로선 높이(동·호 칸, 세대수 칸 위치에서) → 합친 칸의 위아래 경계
        def edges(xc):
            e = set()
            for dr in d[pi].get_drawings():
                for it in dr['items']:
                    if it[0] == 'l':
                        a, b = it[1], it[2]
                        if abs(a.y - b.y) < 1 and min(a.x, b.x) - 1 <= xc <= max(a.x, b.x) + 1:
                            e.add(round(a.y, 1))
                    elif it[0] == 're':
                        r = it[1]
                        if r.x0 - 1 <= xc <= r.x1 + 1:
                            if r.height < 2:
                                e.add(round((r.y0 + r.y1) / 2, 1))
                            else:
                                e.update((round(r.y0, 1), round(r.y1, 1)))
            return sorted(e)
        def cell(eg, y):
            k = 0
            while k < len(eg) and eg[k] <= y:
                k += 1
            return k
        eD, eC = edges(dx + 15), edges(dx - 15)
        dong = {i: [] for i in range(len(prow))}; cnt = {}
        for t, x, y in sorted(L, key=lambda v: v[2]):
            if re.search(r'\d{3}동', t):
                c = cell(eD, y)
                hit = [i for i in range(len(prow)) if cell(eD, ys[i]) == c]
                for i in hit:
                    dong[i].append(t)
                if not hit and y < ys[0] and rows and rows[-1]['blk'] == blk:   # 앞 쪽 마지막 줄의 칸이 이 쪽 맨 위로 이어짐
                    r = rows[-1]; r['where'] += ' ' + t; r['units'] = units_of(r['where'].replace(' ', ','))
            elif re.fullmatch(r'\d{1,3}', t) and dx - 60 < x < dx:
                c = cell(eC, y)
                for i in range(len(prow)):
                    if cell(eC, ys[i]) == c:
                        cnt[i] = int(t)
        for i, g in enumerate(prow):
            v = [n for x, y, n in sorted(g)]
            if len(v) == 12:   # 부가세 칸이 빈 줄(84형) → 0
                v.insert(2, 0)
            if len(v) != 13 or i not in cnt:
                print('읽기 실패:', blk, pi + 1, cnt.get(i), dong[i], v); continue
            w = ','.join(dong[i])
            rows.append({'blk': blk, 'n': cnt[i], 'where': ' '.join(dong[i]), 'units': units_of(w),
                         'land': v[0], 'build': v[1], 'vat': v[2], 'total': v[3], 'pay': v[4:13]})
    return rows, bands


def unit_types(site, dong, line, f):
    # 그 동·라인·층 세대의 타입 (넓은 세대는 대표 라인만, 복층 위층은 없음)
    b = next((b for b in site['units']['buildings'] if b['no'] == dong), None)
    if not b or f in b.get('skip', []):
        return None
    for w in b.get('wide', []):
        if w['from'] <= f <= w['to'] and line in w['lines']:
            return w['type'] if line == w['line'] and (not w.get('duplex') or f == w['from']) else None
    ln = next((l for l in b['lines'] if l['line'] == line and l['from'] <= f <= l['to']), None)
    return ln['type'] if ln else None


def assign(rows, bands, site):
    # 줄 순서대로, (타입 순서, 층 구간)이 앞 줄보다 같거나 뒤이면서 세대수가 딱 맞는 첫 후보를 고른다
    prev, used = (0, 0), set()   # used: 이미 금액이 붙은 세대 (같은 세대에 두 줄이 붙지 않게)
    for r in rows:
        best = None
        for ti, t in enumerate(TYPE_ORDER):
            for fb in bands:
                key = (ti, fb[0])
                if key < prev:
                    continue
                us = [(d, L, f) for d, ls in r['units'] for L in ls for f in range(fb[0], fb[1] + 1)]
                got = [(r['blk'], d, L, f) for d, L, f in us if unit_types(site, d, L, f) == t]
                if len(got) == r['n'] and got and not used.intersection(got):
                    best = (key, t, fb, got); break
            if best:
                break
        if not best:
            print('타입·층을 못 정함:', r['blk'], r['n'], r['where'], r['total']); r['type'] = None; continue
        prev, r['type'], r['floors'] = best[0], best[1], best[2]; used.update(best[3])
    return [r for r in rows if r.get('type')]


def officetel():
    # 엑셀 한 줄: 단지 · 타입 · 층별(4층 / 5-7층) · 동·호수(102동 1,2호) · 세대수 · 대지비 · 건축비 · 부가세 · 합계
    #           · 계약금 1·2차 · 중도금 1~6차 · 잔금 (칸이 없으면 납부일정 없이)
    import openpyxl
    ws = openpyxl.load_workbook(SRC / '광주_화정_아이파크_오피스텔_분양가.xlsx', data_only=True).worksheets[0]
    rows = []
    for r in list(ws.iter_rows(values_only=True))[1:]:
        if not r or not r[0]:
            continue
        m = re.match(r'(\d+)(?:-(\d+))?층', str(r[2]))
        rows.append({'blk': r[0], 'type': str(r[1]), 'floors': [int(m.group(1)), int(m.group(2) or m.group(1))], 'n': int(r[4]), 'where': str(r[3]),
                     'units': units_of(str(r[3])), 'land': int(r[5]), 'build': int(r[6]), 'vat': int(r[7]), 'total': int(r[8]),
                     'pay': [int(v) for v in r[9:18]] if len(r) >= 18 and all(isinstance(v, (int, float)) for v in r[9:18]) else []})
    return rows


def check(rows, site):
    bmap = {b['no']: b for b in site['units']['buildings']}
    bad = 0
    for r in rows:
        ok_sum = r['land'] + r['build'] + r['vat'] == r['total'] and (not r['pay'] or sum(r['pay']) == r['total'])   # 납부일정이 없는 줄은 합계만
        cnt = 0
        for dong, lines in r['units']:
            b = bmap.get(dong)
            if not b:
                continue
            skip = b.get('skip', [])
            for f in range(r['floors'][0], r['floors'][1] + 1):
                if f in skip:
                    continue
                for L in lines:
                    w = next((w for w in b.get('wide', []) if w['line'] == L and w['from'] <= f <= w['to']), None)
                    if w:
                        if w['type'] == r['type'] and (not w.get('duplex') or f == w['from']):
                            cnt += 1
                        continue
                    ln = next((l for l in b['lines'] if l['line'] == L and l['from'] <= f <= l['to']), None)
                    if ln and ln['type'] == r['type'] and not any(w['from'] <= f <= w['to'] and L in w['lines'] for w in b.get('wide', [])):
                        cnt += 1
        r['check'] = cnt
        if not ok_sum or cnt != r['n']:
            bad += 1
            print('확인 필요:', r['blk'], r['type'], r['floors'], r['where'], '공고', r['n'], '배치표', cnt, '합계OK' if ok_sum else '합계X')
    return bad


def main():
    site = json.loads((ROOT / 'public' / 'daelasoo' / 'data' / 'site.json').read_text(encoding='utf-8'))
    rows = []
    for blk, pdf, pages in PDFS:
        rs, bands = parse(blk, pdf, pages)
        rows += assign(rs, bands, site)
    rows += officetel()
    bad = check(rows, site)
    by = {}
    for r in rows:
        by[(r['blk'], r['type'])] = by.get((r['blk'], r['type']), 0) + r['n']
    for k, v in sorted(by.items()):
        h = site['types'][k[1]]['byBlock'][k[0]]['households']
        print(f'{k[0]} {k[1]:4s} 공고 줄 합 {v:4d} / 모집공고 세대수 {h:4d}', '' if v == h else '← 다름')
    print('줄', len(rows), '확인 필요', bad)
    out = {'source': '입주자모집공고 2019.05.24 (1·2단지) 공급금액 및 납부일정 · 오피스텔은 대표 정리 엑셀(공고 기준 납부일정 포함)', 'unit': '원',
           'payNames': ['계약금 1차', '계약금 2차', '중도금 1차', '중도금 2차', '중도금 3차', '중도금 4차', '중도금 5차', '중도금 6차', '잔금'],
           'rows': [{k: r[k] for k in ('blk', 'type', 'floors', 'n', 'where', 'units', 'land', 'build', 'vat', 'total', 'pay')} for r in rows]}
    (ROOT / 'public' / 'daelasoo' / 'data' / 'prices.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')


if __name__ == '__main__':
    main()
