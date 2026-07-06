module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userRequest = body.userRequest ? body.userRequest.utterance : "";
    const query = userRequest.replace("가격", "").replace("어때", "").replace("알려줘", "").trim();

    // 1. 코드를 모를 때는 카테고리 전체 조회로 품목을 먼저 찾습니다.
    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const KAMIS_ID = "8483";
    
    // 카테고리 전체 리스트 조회 URL
    const listUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=02&p_item_category_code=200&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;

    const response = await fetch(listUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // 2. 받은 데이터에서 사용자가 입력한 단어와 이름이 비슷한 항목 찾기
    const items = json.price ? json.price.item : [];
    const target = items.find(i => i.item_name.includes(query));

    // 3. 찾은 항목의 가격 정보 반환
    const answer = target 
      ? `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.`
      : `'${query}'를 찾을 수 없습니다. (입력 예: 배추, 무, 양파)`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (error) {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "데이터 조회 중 오류 발생" } }] }
    });
  }
};
