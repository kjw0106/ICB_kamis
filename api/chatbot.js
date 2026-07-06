module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const query = utterance.replace("가격", "").trim();

    // 1. 고객님의 대시보드 서버에서 모든 데이터를 가져옵니다 (대시보드 기준값 사용)
    // 주의: 대시보드 서버의 API 경로가 /api/predict 라면 이 주소를 사용하세요
    const dashboardUrl = `https://icb-kamis.vercel.app/api/predict?item=${encodeURIComponent(query)}`;
    const dashRes = await fetch(dashboardUrl);
    const data = await dashRes.json();

    // 2. 대시보드에서 받아온 데이터 구조에 맞춰 답변 구성
    // 데이터 구조에 따라 data.price, data.today_price 등으로 키값 수정이 필요할 수 있습니다.
    const answer = data.today_price 
      ? `${data.item_name}의 오늘 가격은 ${data.today_price}원입니다.\n\n[예측 가격]\n1주 후: ${data.price_1w}원\n2주 후: ${data.price_2w}원`
      : `'${query}'에 대한 정확한 데이터를 찾을 수 없습니다.`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (e) {
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "대시보드 데이터를 불러오지 못했습니다." } }] } });
  }
};
