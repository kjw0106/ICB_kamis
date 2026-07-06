// api/chatbot.js
export default function handler(req, res) {
  if (req.method === 'POST') {
    res.status(200).json({
      "version": "2.0",
      "template": {
        "outputs": [
          {
            "simpleText": {
              "text": "안녕하세요! 가격 알림 챗봇입니다."
            }
          }
        ]
      }
    });
  } else {
    res.status(405).send('Method Not Allowed');
  }
}
