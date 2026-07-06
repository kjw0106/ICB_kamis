module.exports = async (req, res) => {
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const query = (body.userRequest ? body.userRequest.utterance : "배추").replace("가격", "").trim();

    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // 데이터를 찾지 못하는 이유를 챗봇에 직접 출력합니다.
    let debugInfo = "";
    if (!json.price || !json.price.item) {
        debugInfo = "API 데이터 구조가 예상과 다릅니다.";
    } else {
        const item = json.price.item.find(i => i.item_name.includes(query));
        debugInfo = item ? `${item.item_name} 가격: ${item.dpr1}원` : `데이터에 '${query}'가 없습니다. 전체 품목 수: ${json.price.item.length}`;
    }

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: debugInfo } }] }
    });
  } catch (e) {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "에러: " + e.message } }] }
    });
  }
};
