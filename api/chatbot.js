const axios = require('axios');

module.exports = async (req, res) => {
  try {
    // 1. 카카오 챗봇 요청 데이터 확인 및 예외 처리
    if (!req.body || !req.body.action || !req.body.action.params) {
      return res.status(400).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "잘못된 요청입니다." } }] } });
    }

    // 카카오 챗봇에서 전달받은 농산물 파라미터 추출
    const { cropName, categoryCode } = req.body.action.params;

    if (!cropName) {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "농산물 이름을 파라미터로 전달받지 못했습니다." } }] } });
    }

    // 2. KAMIS API 실시간 업데이트 주기를 반영한 한국 시간(KST) 날짜 계산
    const now = new Date();
    const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // Vercel 서버(UTC)와 한국(KST) 시차 보정
    
    let day = kst.getDay(); // 0: 일요일, 1: 월요일 ... 6: 토요일
    let hours = kst.getHours();

    // 주말이나 평일 오후 2시 이전에는 데이터 공백을 방지하기 위해 가장 최근 영업일 데이터 요청
    if (day === 0) { 
      kst.setDate(kst.getDate() - 2); // 일요일 -> 금요일 데이터
    } else if (day === 6) { 
      kst.setDate(kst.getDate() - 1); // 토요일 -> 금요일 데이터
    } else if (day === 1 && hours < 14) { 
      kst.setDate(kst.getDate() - 3); // 월요일 오후 2시 전 -> 금요일 데이터
    } else if (hours < 14) { 
      kst.setDate(kst.getDate() - 1); // 화~금 오후 2시 전 -> 어제 데이터
    }

    const year = kst.getFullYear();
    const month = String(kst.getMonth() + 1).padStart(2, '0');
    const date = String(kst.getDate()).padStart(2, '0');
    const targetDate = `${year}-${month}-${date}`;

    // 환경 변수에서 KAMIS API 키 로드
    const KAMIS_API_KEY = process.env.KAMIS_API_KEY; 

    // 3. KAMIS API URL 조립 (대시보드와 일치하도록 등급 p_grade_code=04 고정 추가)
    const url = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList`
      + `&p_product_cls_code=01`
      + `&p_country_code=1101`
      + `&p_regday=${targetDate}`
      + `&p_convert_kg_yn=N`
      + `&p_item_category_code=${categoryCode || '100'}` // 소매 카테고리 기본값 적용
      + `&p_grade_code=04` // 대시보드 기준인 '상품' 등급 고정
      + `&p_cert_key=${KAMIS_API_KEY}`
      + `&p_cert_id=2752`
      + `&p_returntype=json`;

    // 4. KAMIS API 호출
    const response = await axios.get(url);
    const data = response.data;

    // API 응답 데이터 점검
    if (!data || !data.data || !Array.isArray(data.data.item)) {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: `${cropName}의 정보를 찾을 수 없습니다.` } }] } });
    }

    // 호출한 품목 이름과 정확히 매칭되는 아이템 찾기
    const items = data.data.item;
    const matchedItem = items.find(item => item.item_name && item.item_name.includes(cropName));

    if (!matchedItem) {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: `${cropName}의 실시간 가격 정보를 찾을 수 없습니다.` } }] } });
    }

    // 5. 카카오 챗봇 포맷으로 최종 응답 전송
    const replyText = `${matchedItem.item_name}/${matchedItem.kind_name}의 오늘 가격은 ${matchedItem.dpr1}원입니다.\n(조회일자: ${targetDate}, 등급: 상품)`;
    
    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [
          {
            simpleText: {
              text: replyText
            }
          }
        ]
      }
    });

  } catch (error) {
    console.error("챗봇 스킬 서버 에러 발생:", error);
    return res.status(500).json({
      version: "2.0",
      template: {
        outputs: [
          {
            simpleText: {
              text: "서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."
            }
          }
        ]
      }
    });
  }
};
