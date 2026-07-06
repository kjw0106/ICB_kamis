// api/chatbot.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).send('Method Not Allowed');
  }

  try {
    // 1. 사용자 질문 가져오기
    const userRequest = req.body.userRequest.utterance;
    
    // 2. 검색할 품목 키워드 추출 (질문에 포함된 단어 찾기)
    const keywords = ["배추", "무", "마늘", "대파", "딸기", "양파"];
    const foundKeyword = keywords.find(k => userRequest.includes(k));

    if (!foundKeyword) {
      return res.status(200).json({
        version: "2.0",
        template: {
          outputs: [{ simpleText: { text: "죄송해요, 배추, 무, 마늘, 대파, 딸기, 양파 중에서만 확인 가능합니다." } }]
        }
      });
    }

    // 3. KAMIS API 호출
    const KAMIS_ID = "8483";
    const KAMIS_KEY = "a0f97f70-c17b-4b27-ae96-7a87859fa37e";
    const kamisUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=02&p_item_category_code=200&p_cert_key=${KAMIS_KEY}&p_cert_id=${KAMIS_ID}&p_returntype=json`;

    // KAMIS API 호출 부분만 아래로 교체하세요
const response = await fetch(kamisUrl, {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
});

// 응답 상태 확인
if (!response.ok) {
  throw new Error(`KAMIS API 응답 실패: ${response.status}`);
}
const json = await response.json();

// 응답 상태 확인
if (!response.ok) {
  throw new Error(`KAMIS API 응답 실패: ${response.status}`);
}
const json = await response.json();

    // 4. 데이터에서 해당 품목 가격 찾기
    const items = json.data.item;
    const targetItem = items.find(i => i.item_name.includes(foundKeyword));
    
    const priceText = targetItem 
      ? `${targetItem.item_name}의 오늘 가격은 ${targetItem.dpr1}원입니다.`
      : `${foundKeyword}의 가격 정보를 찾을 수 없습니다.`;

    // 5. 카카오 챗봇 응답 반환
    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: priceText } }]
      }
    });

  } catch (error) {
    console.error(error);
    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: "가격 정보를 가져오는 중 오류가 발생했습니다." } }]
      }
    });
  }
}
