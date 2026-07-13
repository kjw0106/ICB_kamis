const fetch = require('node-fetch'); // 기존 코드의 fetch 기반 유지

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const query = utterance.replace("가격", "").trim();

    // 1. KAMIS API 실시간 업데이트 주기를 반영한 한국 시간(KST) 날짜 계산
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // Vercel 서버(UTC)와 한국(KST) 시차 보정
    
    let day = kst.getDay(); 
    let hours = kst.getHours();

    // 주말이나 평일 오후 2시 이전에는 전 영업일 데이터 요청
    if (day === 0) { 
      kst.setDate(kst.getDate() - 2); 
    } else if (day === 6) { 
      kst.setDate(kst.getDate() - 1); 
    } else if (day === 1 && hours < 14) { 
      kst.setDate(kst.getDate() - 3); 
    } else if (hours < 14) { 
      kst.setDate(kst.getDate() - 1); 
    }

    const year = kst.getFullYear();
    const month = String(kst.getMonth() + 1).padStart(2, '0');
    const date = String(kst.getDate()).padStart(2, '0');
    const targetDate = `${year}-${month}-${date}`;

    // 2. KAMIS API URL 조립 (기존 url 구조 유지 + p_regday 반영 및 대시보드 기준 p_grade_code=04 추가)
    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=02&p_regday=${targetDate}&p_grade_code=04&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    
    const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const json = await response.json();
    
    // 기존 데이터 구조 변경 없이 매칭 처리
    const priceData = json.price || [];
    const target = (Array.isArray(priceData) ? priceData : []).find(i => i && i.item_name && i.item_name.includes(query));

    if (!target) {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "정보를 찾을 수 없습니다." } }] } });
    }

    // 3. 기존 가격 추출 및 단순 예측 로직 그대로 유지
    const currentPrice = parseInt(target.dpr1.replace(/,/g, ""));
    const price1w = Math.floor(currentPrice * 1.03);
    const price2w = Math.floor(currentPrice * 1.05);

    // 4. 기존 답변 포맷 그대로 출력 (조회 기준 안내 멘트만 살짝 추가)
    const answer = `${target.item_name}의 오늘 가격은 ${target.dpr1}원입니다.\n\n[예측 가격]\n1주 후: ${price1w.toLocaleString()}원\n2주 후: ${price2w.toLocaleString()}원\n(조회일자: ${targetDate}, 상품 등급 기준)`;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });

  } catch (e) {
    console.error(e);
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "데이터 조회 오류" } }] } });
  }
};
