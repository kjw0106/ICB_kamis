module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userRequest = body.userRequest ? body.userRequest.utterance : "";
    const query = userRequest.replace("가격", "").replace("어때", "").replace("알려줘", "").trim();

    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const KAMIS_ID = "8483";
    
    // 1. URL 구성 (필수 파라미터 확인)
    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=02&p_item_category_code=200&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;

    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // 2. 디버깅: 어떤 데이터가 들어오는지 로그에 다 출력
    console.log("데이터 전체 구조 확인:", JSON.stringify(json, null, 2).substring(0, 2000));

    // 3. 데이터 탐색 (KAMIS 데이터 구조가 다를 수 있음)
    // 데이터가 json.price.item 인지 확인
    let items = [];
    if (json.price && json.price.item) {
        items = json.price.item;
    } else if (json.data && json.data.item) {
        items = json.data.item;
    }

    const target = items.find(i => i.item_name && i.item_name.includes(query));

    const answer = target 
      ? `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.`
      : `'${query}'를 찾을 수 없습니다. (API 데이터에 품목이 없습니다.)`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (error) {
    console.error("최종 에러:", error);
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "서버 API 통신 오류" } }] }
    });
  }
};
