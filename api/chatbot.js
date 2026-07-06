module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();

    // 데이터의 최상위 키들만 추출해서 보여줌
    const keys = Object.keys(json);
    const answer = `데이터 구조 키값: ${keys.join(", ")}`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (error) {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "에러 발생" } }] }
    });
  }
};
