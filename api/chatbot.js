module.exports = async (req, res) => {
  try {
    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // 핵심: API가 주는 JSON의 구조를 챗봇에 강제로 띄워봅니다.
    // 첫 번째 항목의 이름과 가격이 어디 있는지 확인하기 위함입니다.
    let debugText = "구조 확인 불가";
    if (json.price && json.price.item) {
        const item = json.price.item[0];
        debugText = `첫 품목: ${item.item_name || '이름없음'}, 가격: ${item.dpr1 || '가격없음'}`;
    } else {
        debugText = JSON.stringify(json).substring(0, 100);
    }

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: debugText } }] }
    });
  } catch (e) {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "에러: " + e.message } }] }
    });
  }
};
