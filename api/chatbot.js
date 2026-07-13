// 기상청 API용 현재 날짜 및 발표 시간(base_time) 계산 함수
function getKmaBaseDateTime() {
  // 서버 시간이 UTC 기준일 수 있으므로 한국 시간(KST, UTC+9)으로 보정
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60 * 1000);
  const kstNow = new Date(utc + (9 * 60 * 60 * 1000));
  
  let hours = kstNow.getHours();
  const minutes = kstNow.getMinutes();
  
  // 기상청 초단기실황은 매시 40분에 생성되므로, 40분 이전이면 한 시간 전 데이터를 요청해야 함
  if (minutes < 40) {
    hours -= 1;
    if (hours < 0) {
      hours = 23;
      kstNow.setDate(kstNow.getDate() - 1); // 어제 날짜로 변경
    }
  }
  
  const baseDate = kstNow.getFullYear() + 
                   String(kstNow.getMonth() + 1).padStart(2, '0') + 
                   String(kstNow.getDate()).padStart(2, '0');
  const baseTime = String(hours).padStart(2, '0') + "00";
  
  return { baseDate, baseTime };
}

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

    // =========================================================================
    // 1. KAMIS 농산물 가격 API 호출
    // =========================================================================
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

    // =========================================================================
    // 2. 기상청 초단기실황 API 호출 (실시간 날씨)
    // =========================================================================
    // 공공데이터포털에서 발급받은 본인의 기상청 일반 인증키(Encoding 또는 Decoding)를 넣으세요.
    const kmaServiceKey = "0747f42fadafc9ab4fa671fb612517fd08ef177797c8c97be0b094c4f565316c"; 
    const { baseDate, baseTime } = getKmaBaseDateTime();
    
    // 서울 중심점 격자 좌표 (nx=60, ny=127) 기준 설정
    const nx = 60;
    const ny = 127;
    
    const kmaUrl = `http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst?serviceKey=${kmaServiceKey}&pageNo=1&numOfRows=100&dataType=JSON&base_date=${baseDate}&base_time=${baseTime}&nx=${nx}&ny=${ny}`;

    // API 통신 실패를 대비한 기본값(초기화)
    let weatherData = { temp: "-", desc: " 정보 없음", humidity: "-", ptyCode: 0 };
    
    try {
      const kmaResponse = await fetch(kmaUrl);
      const kmaJson = await kmaResponse.json();
      
      if (kmaJson.response && kmaJson.response.body && kmaJson.response.body.items) {
        const items = kmaJson.response.body.items.item;
        
        // T1H: 기온, REH: 습도, PTY: 강수형태
        const t1hItem = items.find(i => i.category === 'T1H');
        const rehItem = items.find(i => i.category === 'REH');
        const ptyItem = items.find(i => i.category === 'PTY');
        
        if (t1hItem) weatherData.temp = parseFloat(t1hItem.obsrValue);
        if (rehItem) weatherData.humidity = rehItem.obsrValue;
        if (ptyItem) {
          const pty = parseInt(ptyItem.obsrValue);
          weatherData.ptyCode = pty;
          // 강수 형태 코드 매핑 (0:없음, 1:비, 2:비/눈, 3:눈, 4:소나기)
          if (pty === 0) weatherData.desc = "맑음/흐림";
          else if (pty === 1) weatherData.desc = "비";
          else if (pty === 2) weatherData.desc = "비/눈";
          else if (pty === 3) weatherData.desc = "눈";
          else if (pty === 4) weatherData.desc = "소나기";
        }
      }
    } catch (wError) {
      console.error("기상청 API 호출 에러:", wError);
    }

    // =========================================================================
    // 3. 기상 이변 감지 및 경고 메시지 생성
    // =========================================================================
    let warningMessage = "";
    const currentTemp = weatherData.temp;

    // 조건 1: 폭염 (실시간 기온 33도 이상)
    if (currentTemp !== "-" && currentTemp >= 33) {
      warningMessage = `\n\n⚠️ [경보]: 현재 산지 기온이 폭염 수준(${currentTemp}°C)입니다. 폭염 장기화 시 작황 부진으로 인해 2주 뒤 ${target.item_name} 가격이 폭등할 가능성이 높으니 재고 확보를 권장합니다.`;
    } 
    // 조건 2: 폭설 또는 한파 (기온 영하 5도 이하 또는 눈 관측)
    else if ((currentTemp !== "-" && currentTemp <= -5) || weatherData.ptyCode === 3) {
      warningMessage = `\n\n⚠️ [경보]: 현재 산지에 한파 및 폭설 기후가 관측되었습니다. 무름병 등 냉해 피해와 전국 물류 마비로 인해 ${target.item_name} 가격이 단기적으로 폭등할 수 있습니다.`;
    } 
    // 조건 3: 폭우 (비 또는 소나기가 오면서 습도가 85% 이상일 때)
    else if ((weatherData.ptyCode === 1 || weatherData.ptyCode === 4) && weatherData.humidity >= 85) {
      warningMessage = `\n\n⚠️ [경보]: 산지 폭우 및 다습한 장마 환경입니다. 일조량 부족과 산지 침수 피해로 출하량이 저하되어 ${target.item_name} 시세 변동성이 커질 수 있습니다.`;
    }

    // =========================================================================
    // 4. 최종 답변 조립
    // =========================================================================
    const currentPrice = parseInt(String(target.dpr1).replace(/,/g, ""));
    const price1w = Math.floor(currentPrice * 1.03); 
    const price2w = Math.floor(currentPrice * 1.05); 
    const unitStr = target.unit ? target.unit : "";

    const answer = 
      `📊 [${target.item_name} 가격 및 기상 정보]\n\n` +
      `💵 최신 가격: ${target.dpr1}원 (${unitStr})\n` +
      `🌡️ 현재 기온: ${weatherData.temp}°C (${weatherData.desc})\n` +
      `💧 현재 습도: ${weatherData.humidity}%\n\n` +
      `[AI 가격 예측]\n` +
      `📈 1주 후: ${price1w.toLocaleString()}원 예상\n` +
      `📈 2주 후: ${price2w.toLocaleString()}원 예상` +
      warningMessage;

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: answer } }] }
    });

  } catch (e) {
    console.error("서버 에러:", e);
    return res.status(200).json({ version: "2.0", template: { outputs: [{ simpleText: { text: "일시적인 오류가 발생했습니다." } }] } });
  }
};
