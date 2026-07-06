// api/chatbot.js
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const userRequest = req.body.userRequest ? req.body.userRequest.utterance : "";
    
    // KAMIS API 호출
    const KAMIS_ID = "8483";
    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const kamisUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=02&p_item_category_code=200&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;

    // node-fetch 대신 내장 fetch 사용 (최신 Node.js 버전에서 지원)
    const response = await fetch(kamisUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const json = await response.json();

    const query = userRequest.replace("가격", "").replace("어때", "").replace("알려줘", "").trim();
    const targetItem = json.data.item.find(i => i.item_name.includes(query));
    
    const answer = targetItem 
      ? `${targetItem.item_name}의 오늘 가격은 ${targetItem.dpr1}원입니다.`
      : `죄송해요, '${query}'에 대한 가격 정보를 찾을 수 없습니다.`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });

  } catch (error) {
    console.error("에러 발생:", error);
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "서버 통신 중 오류가 발생했습니다." } }] }
    });
  }
};
