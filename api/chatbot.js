module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userRequest = body.userRequest ? body.userRequest.utterance : "";
    const query = userRequest.replace("가격", "").replace("어때", "").replace("알려줘", "").trim();

    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const KAMIS_ID = "8483";
    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;

    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // 핵심 수정: json.price 자체가 배열이므로 바로 find를 사용합니다.
    const items = json.price || []; 
    const target = items.find(i => i.item_name && i.item_name.includes(query));

    const answer = target 
      ? `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.`
      : `'${query}'의 가격 정보를 찾을 수 없습니다.`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (error) {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "데이터 해석 중 오류가 발생했습니다." } }] }
    });
  }
};
