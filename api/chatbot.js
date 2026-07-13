module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const query = utterance.replace("가격", "").trim();

    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=01&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const textData = await response.text();
    
    let json;
    try {
      json = JSON.parse(textData);
    } catch (parseError) {
      // API 서버 문제 시 멘트 통일
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "현재 해당 품목 가격은 알 수 없습니다. 다른 품목을 검색해주세요" } }] } });
    }
    
    const priceData = json.price || [];
    const target = (Array.isArray(priceData) ? priceData : []).find(i => i && i.item_name && i.item_name.includes(query));

    // 1. 정보를 못 가져오거나 가격이 없는 경우의 안내 멘트 적용
    if (!target || !target.dpr1 || target.dpr1 === "-") {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "현재 해당 품목 가격은 알 수 없습니다. 다른 품목을 검색해주세요" } }] } });
    }

    const currentPriceStr = String(target.dpr1).replace(/,/g, "");
    const currentPrice = parseInt(currentPriceStr);
    
    const price1w = Math.floor(currentPrice * 1.03);
    const price2w = Math.floor(currentPrice * 1.05);

    // 2. 재료 옆에 단위(target.unit)를 괄호로 추가하여 표기
    const unitStr = target.unit ? target.unit : "";
    const answer = `${target.item_name}(${unitStr})의 오늘 가격은 ${target.dpr1}원입니다. (소매 기준)\n\n[예측 가격]\n1주 후: ${price1w.toLocaleString()}원\n2주 후: ${price2w.toLocaleString()}원`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });

  } catch (e) {
    console.error("서버 에러:", e);
    // 코드 실행 중 에러가 발생해도 통일된 멘트 출력
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "현재 해당 품목 가격은 알 수 없습니다. 다른 품목을 검색해주세요" } }] } });
  }
};
