# 소스/공고/광주_화정_아이파크_유상옵션_추가선택품목표.xlsx → public/daelasoo/data/options.json (옵션계산기)
#   + 발코니 확장비 → public/daelasoo/data/site.json 의 prices.balcony.byType
# - 시트 '1단지_추가선택품목' · '2단지_추가선택품목' 을 합친다 (같은 타입·품목인데 단지마다 값이 다르면 알려 줌)
# - '공통(전타입)' 은 아파트 전 타입, '218 상층부/하층부' 는 218 전용 품목으로 나눔. 오피스텔은 옵션 없음
# 실행: 프로젝트 폴더에서  python tools/make_options.py   (처음 한 번: py -m pip install --user openpyxl)
import json, re
from pathlib import Path
import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT / '소스' / '공고' / '광주_화정_아이파크_유상옵션_추가선택품목표.xlsx'
SITE = ROOT / 'public' / 'daelasoo' / 'data' / 'site.json'
OUT = ROOT / 'public' / 'daelasoo' / 'data' / 'options.json'
APT = ['84A', '84B', '84C', '84D', '148', '218']


def rows():
    wb = openpyxl.load_workbook(XLSX, data_only=True)
    for name in ('1단지_추가선택품목', '2단지_추가선택품목'):
        ws = wb[name]
        for r in ws.iter_rows(values_only=True):
            r = [c for c in r[1:]]
            if not r[0] or r[0] == '구분(대분류)' or str(r[0]).startswith(('■', '※')) or not isinstance(r[6], (int, float)):
                continue
            yield name[:3], dict(zip(['cat', 'item', 'type', 'model', 'q', 'maker', 'p', 'note'], r))


def main():
    items, balcony, warn = {}, {}, []
    for blk, r in rows():
        types = APT if str(r['type']).startswith('공통') else [str(r['type']).split(' ')[0]]
        part = re.search(r'(상층부|하층부)', str(r['type']))
        if r['cat'] == '발코니 확장':
            for t in types:
                if balcony.get(t, r['p']) != r['p']:
                    warn.append(f'발코니 확장 {t}: 단지마다 금액 다름')
                balcony[t] = int(r['p'])
            continue
        # 품목 이름 · 선택안 나누기
        name, dims, dn, d, q = r['item'], [], [], str(r['model'] or ''), str(r['q'] or '')
        if r['item'] == '중문':
            name = str(r['model'])            # 현관 중문 · 주방 중문 · 가족실 중문
            d = q; q = '1개소'
        elif r['item'] == '시스템에어컨' or r['cat'] == '시스템에어컨':
            name = '시스템에어컨'
            kind = '공기청정' if '공기청정' in str(r['item']) else '일반'
            m = re.match(r'(전체|기본)\((\d+)대\)', d)
            dims, dn = [kind, m.group(1) if m else d], ['형식', '설치']
            q = (m.group(2) + '대') if m else ''
            d = str(r['q'])
        elif r['item'] == '빌트인 냉장고':
            dims, dn = [re.sub(r'.*\((.*)\).*', r'\1', d)], ['모델']
        elif r['item'] == '식기세척기':
            dims, dn = [str(r['maker'])], ['제조사']
        if part:
            name = f"{name} · {part.group(1)}"
        key = (r['cat'], name)
        it = items.setdefault(key, {'cat': r['cat'], 'name': name, 'dimNames': dn, 'variants': {}})
        v = it['variants'].setdefault('|'.join(dims) or '-|-', {'dims': dims, 't': {}})
        for t in types:
            cell = {'p': int(r['p']), 'd': d, 'q': q, 'n': str(r['note'] or '')}
            old = v['t'].get(t)
            if old and old['p'] != cell['p']:
                warn.append(f"{name} {t} {'|'.join(dims)}: 단지마다 금액 다름 ({old['p']} / {cell['p']})")
            v['t'][t] = cell
    paid = []
    for i, it in enumerate(items.values()):
        paid.append({'id': f'p{i}', 'cat': it['cat'], 'name': it['name'], 'perUnit': False, 'dimNames': it['dimNames'],
                     'variants': [{'k': k, 'dims': v['dims'], 't': v['t']} for k, v in it['variants'].items()]})
    ws = openpyxl.load_workbook(XLSX, data_only=True)['납부계좌_및_유의사항']   # 유의사항 (• 로 시작하는 줄)
    notes = [str(c).lstrip('• ').strip() for r in ws.iter_rows(values_only=True) for c in r if c and str(c).startswith('•')]
    OUT.write_text(json.dumps({'source': XLSX.name, 'notes': notes, 'paid': paid, 'free': []}, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    # 발코니 확장비 → site.json (다른 내용은 그대로, 이 값만 바꿈)
    s = SITE.read_bytes().decode('utf-8')   # 줄바꿈(CRLF) 그대로 유지
    site = json.loads(s)
    site.setdefault('prices', {})['balcony'] = {'byType': balcony, 'note': '발코니 확장 공사비 (VAT 포함, 일괄확장)'}
    new = re.sub(r'"prices": \{.*?\}(?=\s*\r?\n\})', '"prices": ' + json.dumps(site['prices'], ensure_ascii=False), s, flags=re.S)
    json.loads(new)
    SITE.write_bytes(new.encode('utf-8'))
    print('품목', len(paid), '·', ', '.join(f"{p['name']}({len(p['variants'])})" for p in paid))
    print('발코니 확장비', balcony)
    for w in warn:
        print('확인:', w)


if __name__ == '__main__':
    main()
