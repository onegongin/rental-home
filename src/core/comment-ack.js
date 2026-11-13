// 호실 이야기 [확인] 자동 답글 (시안 cmt-ack A안 확정 2026-11-04) — 직원이 답글 없이 [확인]만 누르면 글 내용에 맞는 안내를 사무소 이름으로
//   문구는 설정 › 댓글 관리에서 고침 (cfg cmtAck). 손님은 관심등록 때 연락처를 남겼으므로 '연락드리겠습니다'
export const ACK0 = {
  broker: '요청 확인했습니다. 담당 공인중개사가 연락드리겠습니다.',
  sell: '매도 문의 확인했습니다. 담당 공인중개사가 시세와 진행 방법을 연락드려 안내하겠습니다.',
  buy: '문의 확인했습니다. 조건에 맞는 매물이 나오면 담당 공인중개사가 연락드리겠습니다.',
  etc: '문의 확인했습니다. 내용 확인 후 담당 공인중개사가 연락드리겠습니다.'
};
export const ACK_KO = { broker: '중개요청', sell: '매도 문의', buy: '매수 · 임차 문의', etc: '그 밖의 질문' };

export function ackKind(c) {
  if (c.broker) return 'broker';
  const t = String(c.text || '');
  if (/팔|매도|내놓|매각|시세/.test(t)) return 'sell';
  if (/매수|전세|월세|단기|구해|구합|찾|나오면/.test(t)) return 'buy';
  return 'etc';
}
export function ackText(c, cfg) {
  const kind = ackKind(c), v = cfg && typeof cfg === 'object' && typeof cfg[kind] === 'string' ? cfg[kind].trim() : '';
  return { kind, text: (v || ACK0[kind]).slice(0, 300) };
}
