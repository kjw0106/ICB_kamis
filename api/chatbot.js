module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const query = utterance.replace("가격", "").trim();

    const KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const ID = "8483";

    // 1. 현재 가격 데이터 가져오기
    const salesUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=${KEY}&p_cert_id=${ID}&p_returntype=json`;
    const salesRes = await fetch(salesUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const salesJson = await salesRes.json();
    const target = (salesJson.price || []).find(i => i.item_name && i.item_name.includes(query));

    if (!target) {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: `'${query}'의 오늘 가격 정보를 찾을 수 없습니다.` } }] } });
    }

    let answer = `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.`;

    // 2. 예측 데이터 가져오기 (품목 코드와 종류 코드가 있을 때만 시도)
    if (target.item_code && target.kind_code) {
      const predictUrl = `http://www.kamis.or.kr/service/price/xml.do?action=predictPriceList&p_itemcode=${target.item_code}&p_kindcode=${target.kind_code}&p_cert_key=${KEY}&p_cert_id=${ID}&p_returntype=json`;
      const predictRes = await fetch(predictUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const predictJson = await predictRes.json();

      // 예측 데이터 구조 검증 및 파싱
      if (predictJson.price && predictJson.price.item && predictJson.price.item[0]) {
        const pred = predictJson.price.item[0];
        if (pred.caption) {
          const prices = pred.caption.split('/');
          answer += `\n\n[예측 가격]\n1주 후: ${prices[0] || '정보없음'}원\n2주 후: ${prices[1] || '정보없음'}원`;
        }
      }
    }

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (e) {
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "정보를 불러오는 중 문제가 발생했습니다." } }] } });
  }
};
