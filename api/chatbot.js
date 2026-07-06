module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const query = utterance.replace("가격", "").trim();

    // 1. KAMIS 공식 API에서 실시간 가격 확인
    const kamisKey = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const kamisUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_cert_key=${kamisKey}&p_cert_id=8483&p_returntype=json`;
    const kamisRes = await fetch(kamisUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const kamisJson = await kamisRes.json();
    const target = (kamisJson.price || []).find(i => i.item_name && i.item_name.includes(query));

    if (!target) return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "정보를 찾을 수 없습니다." } }] } });

    // 2. 고객님의 대시보드 서버에서 예측 데이터 가져오기 (이 부분은 대시보드 API 구조에 맞게 수정 필요)
    let predictText = "예측 데이터 없음";
    try {
      // 대시보드 서버의 API URL로 요청
      const dashboardUrl = `https://icb-kamis.vercel.app/api/predict?item=${encodeURIComponent(query)}`;
      const dashRes = await fetch(dashboardUrl);
      const dashJson = await dashRes.json();
      
      // 대시보드 JSON 구조에 맞춰 파싱 (예: dashJson.price_1w, dashJson.price_2w)
      predictText = `\n\n[대시보드 예측]\n1주 후: ${dashJson.price_1w}원\n2주 후: ${dashJson.price_2w}원`;
    } catch (err) {
      predictText = "\n\n(예측 데이터를 불러올 수 없습니다)";
    }

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.${predictText}` } }] }
    });
  } catch (e) {
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "연동 오류" } }] } });
  }
};
