// 단지 설정(data/site.json)을 화면보다 먼저 읽어 window.__SITE 에 넣는다.
// 브라우저 저장본을 바로 쓰고 뒤에서 새로 확인 (_headers /data/* — 바뀐 내용은 다음 열 때 반영, 2026-11-05 속도)
// 화면(dashboard)이 처음 그려질 때 이 값으로 동·호·타입을 만든다 (buildSite).
(function () {
  try {
    var x = new XMLHttpRequest();
    x.open('GET', 'data/site.json', false);
    x.send();
    if (x.status === 200) window.__SITE = JSON.parse(x.responseText);
    // 모집공고 공급금액 표 (tools/parse_prices.py 로 만듦) → 호실별 분양금액
    var y = new XMLHttpRequest();
    y.open('GET', 'data/prices.json', false);
    y.send();
    if (y.status === 200 && window.__SITE) window.__SITE.priceTable = JSON.parse(y.responseText);
  } catch (e) {}
})();
