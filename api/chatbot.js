module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // 1. 카카오톡 페이로드에서 사용자의 발화와 파라미터를 가져옵니다.
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const params = body.action && body.action.params ? body.action.params : {};
    
    // 2. 카카오 빌더에서 추출해준 파라미터 값을 먼저 우선으로 씁니다.
    // ※ 주의: 아래 '식재료' 부분은 빌더의 '파라미터명'과 똑같아야 합니다. (다르게 설정하셨다면 수정 필요)
    let query = params['식재료']; 

    // 3. 만약 빌더 설정 문제로 파라미터를 못 가져왔을 때를 대비한 보험(Fallback) 로직
    // 기존처럼 단어를 잘라내되, "가격" 외에 불필요한 조사와 단어들을 더 넓게 지워줍니다.
    if (!query) {
      query = utterance.replace(/가격|어때|얼마|알려줘|오늘|시세|야|\?/g, "").trim();
    }

    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=01&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const textData = await response.text();
    
    let json;
    try {
      json = JSON.parse(textData);
    } catch (parseError) {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "현재 해당 품목 가격은 알 수 없습니다. 다른 품목을 검색해주세요" } }] } });
    }
    
    const priceData = json.price || [];
    const target = (Array.isArray(priceData) ? priceData : []).find(i => i && i.item_name && i.item_name.includes(query));

    if (!target || !target.dpr1 || target.dpr1 === "-") {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "현재 해당 품목 가격은 알 수 없습니다. 다른 품목을 검색해주세요" } }] } });
    }

    const currentPriceStr = String(target.dpr1).replace(/,/g, "");
    const currentPrice = parseInt(currentPriceStr);
    
    const price1w = Math.floor(currentPrice * 1.03);
    const price2w = Math.floor(currentPrice * 1.05);

    const unitStr = target.unit ? target.unit : "";
    const answer = `${target.item_name}(${unitStr})의 오늘 가격은 ${target.dpr1}원입니다. (소매 기준)\n\n[예측 가격]\n1주 후: ${price1w.toLocaleString()}원\n2주 후: ${price2w.toLocaleString()}원`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });

  } catch (e) {
    console.error("서버 에러:", e);
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "현재 해당 품목 가격은 알 수 없습니다. 다른 품목을 검색해주세요" } }] } });
  }
};
