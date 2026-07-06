module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const query = (body.userRequest ? body.userRequest.utterance : "").replace("가격", "").trim();

    const dashboardUrl = `https://icb-kamis.vercel.app/api/predict?item=${encodeURIComponent(query)}`;
    const dashRes = await fetch(dashboardUrl);
    const data = await dashRes.json();

    // 데이터 구조를 확인하기 위해 전체 데이터를 챗봇에 출력
    const answer = `데이터 확인: ${JSON.stringify(data).substring(0, 500)}`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });
  } catch (e) {
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "에러 발생: " + e.message } }] } });
  }
};
