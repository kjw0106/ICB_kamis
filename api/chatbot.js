module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const query = utterance.replace("가격", "").trim();

    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();
    const target = (json.price || []).find(i => i.item_name && i.item_name.includes(query));

    if (!target) return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "정보를 찾을 수 없습니다." } }] } });

    // 가격 추출 (콤마 제거 후 숫자로 변환)
    const currentPrice = parseInt(target.dpr1.replace(/,/g, ""));
    
    // 단순 예측 로직 (예시: 1주 후 3% 상승, 2주 후 5% 상승 가정)
    const price1w = Math.floor(currentPrice * 1.03);
    const price2w = Math.floor(currentPrice * 1.05);

    const answer = `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.\n\n[예측 가격]\n1주 후: ${price1w.toLocaleString()}원\n2주 후: ${price2w.toLocaleString()}원`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (e) {
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "데이터 조회 오류" } }] } });
  }
};
