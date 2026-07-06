module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userRequest = body.userRequest ? body.userRequest.utterance : "";
    const query = userRequest.replace("가격", "").replace("어때", "").replace("알려줘", "").trim();

    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // price 키를 사용하되, item이 객체인지 배열인지 확인
    const priceData = json.price;
    // KAMIS 데이터 구조가 { item: [...] } 형태인지 { item: {...} } 형태인지 대응
    const items = Array.isArray(priceData.item) ? priceData.item : [priceData.item];
    
    const target = items.find(i => i.item_name && i.item_name.includes(query));

    const answer = target 
      ? `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.`
      : `'${query}'를 찾을 수 없습니다. (가격 데이터 리스트 확인 필요)`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (error) {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "데이터 해석 실패" } }] }
    });
  }
};
