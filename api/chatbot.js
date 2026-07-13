module.exports = async (req, res) => {
  // POST 요청이 아니면 차단
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const query = utterance.replace("가격", "").trim();

    // 1. KAMIS API 원본 주소 복구 (파라미터 충돌 방지)
    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    
    // 기본 내장 fetch 사용 (require('node-fetch') 제거)
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    
    // 2. API가 JSON이 아닌 에러(XML/HTML)를 뱉을 때를 대비한 방어 로직
    const textData = await response.text();
    let json;
    try {
      json = JSON.parse(textData);
    } catch (parseError) {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "KAMIS 서버 점검 중이거나 응답 오류입니다." } }] } });
    }
    
    const priceData = json.price || [];
    const target = (Array.isArray(priceData) ? priceData : []).find(i => i && i.item_name && i.item_name.includes(query));

    if (!target) {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "정보를 찾을 수 없습니다." } }] } });
    }

    // 3. 가격 데이터가 없거나 "-" 로 표기된 경우의 에러 방지
    if (!target.dpr1 || target.dpr1 === "-") {
       return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: `${target.item_name}의 오늘 가격 정보가 아직 업데이트되지 않았습니다.` } }] } });
    }

    // 4. 가격 계산 로직
    const currentPriceStr = String(target.dpr1).replace(/,/g, "");
    const currentPrice = parseInt(currentPriceStr);
    
    const price1w = Math.floor(currentPrice * 1.03);
    const price2w = Math.floor(currentPrice * 1.05);

    const answer = `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.\n\n[예측 가격]\n1주 후: ${price1w.toLocaleString()}원\n2주 후: ${price2w.toLocaleString()}원`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });

  } catch (e) {
    console.error("서버 에러 상세:", e);
    // 에러 발생 시 '데이터 조회 오류' 대신 실제 에러 원인을 챗봇에 출력
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: `[에러 원인] ${e.message}` } }] } });
  }
};
