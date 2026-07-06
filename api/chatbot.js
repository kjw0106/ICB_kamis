module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const query = utterance.replace("가격", "").trim();

    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const KAMIS_ID = "8483";

    // 1. 현재 가격 가져오기 (기존)
    const salesUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;
    const salesRes = await fetch(salesUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const salesJson = await salesRes.json();
    const target = (salesJson.price || []).find(i => i.item_name && i.item_name.includes(query));

    if (!target) return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: `'${query}'를 찾을 수 없습니다.` } }] } });

    // 2. 가격 예측 데이터 가져오기 (predictPriceList)
    // 품목 코드(target.item_code)와 종류 코드(target.kind_code)를 사용
    const predictUrl = `http://www.kamis.or.kr/service/price/xml.do?action=predictPriceList&p_itemcode=${target.item_code}&p_kindcode=${target.kind_code}&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;
    const predictRes = await fetch(predictUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const predictJson = await predictRes.json();

    // 3. 예측값 추출 (KAMIS 예측 데이터 구조: predict.item[0].caption에 1주/2주 후 가격 포함)
    const pred = predictJson.price && predictJson.price.item ? predictJson.price.item[0] : null;
    
    let answer = `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.`;
    if (pred) {
      answer += `\n\n[예측 가격]\n1주 후: ${pred.caption.split('/')[0]}원\n2주 후: ${pred.caption.split('/')[1]}원`;
    }

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (e) {
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "예측 정보를 가져오는 중 오류 발생" } }] } });
  }
};
