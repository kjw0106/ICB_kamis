module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userRequest = body.userRequest ? body.userRequest.utterance : "";
    const query = userRequest.replace("가격", "").replace("어때", "").replace("알려줘", "").trim();

    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const KAMIS_ID = "8483";
    
    // 카테고리 코드(p_item_category_code)를 빼버려서 전체 품목을 가져옵니다.
    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=02&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;

    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // 데이터가 price.item 안에 들어있는지 확인
    const items = json.price ? json.price.item : [];
    const target = items.find(i => i.item_name && i.item_name.includes(query));

    const answer = target 
      ? `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.`
      : `'${query}'를 찾을 수 없습니다. (KAMIS 데이터에 오늘 등록된 품목만 검색 가능합니다.)`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (error) {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "서버 오류입니다." } }] }
    });
  }
};
