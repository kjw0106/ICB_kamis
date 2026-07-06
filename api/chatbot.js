export default function handler(req, res) {
  if (req.method === 'POST') {
    // 1. 카카오 챗봇이 보낸 데이터에서 사용자의 발화(질문) 추출
    const userRequest = req.body.userRequest.utterance;
    
    let answer = "죄송해요, 어떤 가격을 찾으시는지 모르겠어요.";
    
    // 2. 간단한 조건문으로 답변 설정
    if (userRequest.includes("배추")) {
      answer = "오늘 배추 가격은 3,500원입니다."; // 여기에 실제 KAMIS 데이터 연동 로직 추가 가능
    } else if (userRequest.includes("무")) {
      answer = "오늘 무 가격은 1,200원입니다.";
    }

    // 3. 추출한 답변을 챗봇으로 전송
    res.status(200).json({
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": answer
            }
          }
        ]
      }
    });
  } else {
    res.status(405).send('Method Not Allowed');
  }
}
