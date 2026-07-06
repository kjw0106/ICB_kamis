module.exports = async (req, res) => {
  // 요청이 POST가 아니면 차단
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  try {
    // 1. 안전하게 데이터 가져오기 (req.body가 객체인지 확인)
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const userRequest = body.userRequest ? body.userRequest.utterance : "";
    
    // 로그 찍기 (Vercel Logs에서 확인 가능)
    console.log("받은 질문:", userRequest);

    // 2. KAMIS API 호출
    const KAMIS_ID = "8483";
    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const kamisUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=02&p_item_category_code=200&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;

    const response = await fetch(kamisUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    
    if (!response.ok) throw new Error("API 응답 실패");
    const json = await response.json();

    // 3. 데이터 찾기
    const query = userRequest.replace("가격", "").replace("어때", "").replace("알려줘", "").trim();
    const targetItem = json.data.item.find(i => i.item_name.includes(query));
    
    const answer = targetItem 
      ? `${targetItem.item_name}의 오늘 가격은 ${targetItem.dpr1}원입니다.`
      : `'${query}'의 가격 정보를 찾을 수 없습니다.`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });

  } catch (error) {
    console.error("상세 에러:", error); // Vercel Logs에 진짜 원인이 찍힙니다.
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "서버가 가격 정보를 가져오지 못했어요." } }] }
    });
  }
};
