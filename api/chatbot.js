module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userRequest = body.userRequest ? body.userRequest.utterance : "";
    const query = userRequest.replace("가격", "").replace("어때", "").replace("알려줘", "").trim();

    const KAMIS_ID = "8483";
    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const kamisUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=02&p_item_category_code=200&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;

    const response = await fetch(kamisUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // 1. 데이터 구조가 예상과 다를 때를 대비한 방어 로직
    // KAMIS API 응답은 보통 { data: { item: [...] } } 형식이지만, 
    // 때때로 계층 구조가 다를 수 있습니다.
    const items = json.price ? json.price.item : (json.data ? json.data.item : null);

    if (!items || !Array.isArray(items)) {
      console.error("받아온 데이터 구조:", JSON.stringify(json));
      throw new Error("데이터 구조가 올바르지 않습니다.");
    }

    // 2. 검색 및 결과 반환
    const targetItem = items.find(i => i.item_name && i.item_name.includes(query));
    
    const answer = targetItem 
      ? `${targetItem.item_name}의 오늘 가격은 ${targetItem.dpr1}원입니다.`
      : `'${query}'를 찾을 수 없습니다.`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });

  } catch (error) {
    console.error("에러 발생:", error.message);
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "서버가 가격 데이터를 해석하지 못했습니다." } }] }
    });
  }
};
