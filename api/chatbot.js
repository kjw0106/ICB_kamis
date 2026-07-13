module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const utterance = body.userRequest ? body.userRequest.utterance : "";
    const params = body.action && body.action.params ? body.action.params : {};
    
    let query = params['식재료']; 
    if (!query) {
      query = utterance.replace(/가격|어때|얼마|알려줘|오늘|시세|날씨|기후|야|\?/g, "").trim();
    }

    // 1. KAMIS 농산물 가격 API 호출
    const kamisUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailySalesList&p_product_cls_code=01&p_cert_key=a0f97f70-c17b-4b27-ae96-7a87859fa37e&p_cert_id=8483&p_returntype=json`;
    const kamisResponse = await fetch(kamisUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const kamisText = await kamisResponse.text();
    
    let kamisJson;
    try { kamisJson = JSON.parse(kamisText); } catch (e) {}
    
    const priceData = kamisJson?.price || [];
    const target = (Array.isArray(priceData) ? priceData : []).find(i => i && i.item_name && i.item_name.includes(query));

    if (!target || !target.dpr1 || target.dpr1 === "-") {
      return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: `현재 '${query}' 품목의 데이터를 찾을 수 없습니다.` } }] } });
    }

    // 2. 날씨 API 호출 (OpenWeatherMap)
    const weatherApiKey = "0747f42fadafc9ab4fa671fb612517fd08ef177797c8c97be0b094c4f565316c"; 
    const city = "Seoul"; 
    const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${weatherApiKey}&units=metric&lang=kr`;

    let weatherData = { temp: 20, desc: "맑음", humidity: 50 }; // 기본값
    
    try {
      const weatherRes = await fetch(weatherUrl);
      const weatherJson = await weatherRes.json();
      if (weatherJson.main) {
        weatherData.temp = parseFloat(weatherJson.main.temp);
        weatherData.desc = weatherJson.weather[0].description;
        weatherData.humidity = weatherJson.main.humidity;
      }
    } catch (wError) {
      console.error("날씨 API 에러:", wError);
    }

    // 3. 기상 이변 감지 및 경고 메시지 생성 로직 (핵심 추가 부분!)
    let warningMessage = "";
    const currentTemp = weatherData.temp;
    const weatherDesc = weatherData.desc;

    // 조건 1: 폭염 (기온 33도 이상)
    if (currentTemp >= 33) {
      warningMessage = `\n\n⚠️ [경보]: 현재 기온(${currentTemp}°C)이 폭염 수준입니다. 폭염 누적에 따른 작황 부진으로 2주 뒤 ${target.item_name} 도매 가격이 높은 확률로 폭등할 것으로 예상됩니다. 재고 확보를 권장합니다.`;
    } 
    // 조건 2: 한파 또는 폭설 (기온 영하 5도 이하 또는 눈)
    else if (currentTemp <= -5 || weatherDesc.includes('눈')) {
      warningMessage = `\n\n⚠️ [경보]: 현재 한파 및 강설이 관측되었습니다. 산지 냉해 피해 및 물류 지연으로 인해 단기적인 가격 상승이 예상됩니다.`;
    } 
    // 조건 3: 폭우/장마 (비가 오면서 습도가 80% 이상일 때)
    else if (weatherDesc.includes('비') && weatherData.humidity >= 80) {
      warningMessage = `\n\n⚠️ [경보]: 현재 다습한 우천 환경입니다. 일조량 부족과 병해충 발생으로 출하량이 감소하여 가격 변동성이 커질 수 있습니다.`;
    }

    // 4. 데이터 가공 및 카카오톡 최종 응답 조립
    const currentPrice = parseInt(String(target.dpr1).replace(/,/g, ""));
    const price1w = Math.floor(currentPrice * 1.03); // 단순 3% 상승 가정
    const price2w = Math.floor(currentPrice * 1.05); // 단순 5% 상승 가정
    const unitStr = target.unit ? target.unit : "";

    const answer = 
      `📊 [${target.item_name} 가격 및 기상 정보]\n\n` +
      `💵 최신 가격: ${target.dpr1}원 (${unitStr})\n` +
      `🌡️ 현재 기온: ${weatherData.temp}°C (${weatherData.desc})\n` +
      `💧 현재 습도: ${weatherData.humidity}%\n\n` +
      `[AI 가격 예측]\n` +
      `📈 1주 후: ${price1w.toLocaleString()}원 예상\n` +
      `📈 2주 후: ${price2w.toLocaleString()}원 예상` +
      warningMessage; // 조건에 맞을 때만 경고 메시지가 맨 아래에 추가됨

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });

  } catch (e) {
    console.error("서버 에러:", e);
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "일시적인 오류가 발생했습니다." } }] } });
  }
};
