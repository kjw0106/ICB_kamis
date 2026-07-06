module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userRequest = body.userRequest ? body.userRequest.utterance : "";
    const query = userRequest.replace("가격", "").replace("어때", "").replace("알려줘", "").trim();

    // 품목 이름으로 itemCode를 매칭해야 합니다 (KAMIS API 특성)
    const itemCodes = { "배추": "111", "무": "112", "마늘": "131", "양파": "132" };
    const itemCode = itemCodes[query] || "111"; // 기본값 배추(111)

    const KAMIS_ID = "8483";
    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    // action을 가격 상세 조회로 변경
    const kamisUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByItemDetail&p_item_code=${itemCode}&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;

    const response = await fetch(kamisUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // 응답 데이터 확인 (json.price.item 확인)
    const item = json.price ? json.price.item[0] : null;
    
    const answer = item 
      ? `${item.item_name}의 오늘 가격은 ${item.dpr1}원입니다.`
      : `'${query}'의 상세 정보를 찾을 수 없습니다. (매칭 코드 확인 필요)`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (error) {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "서버 API 통신 오류입니다." } }] }
    });
  }
};
