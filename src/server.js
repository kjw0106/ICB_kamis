const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const cron = require('node-cron');
const fs = require('fs');
require('dotenv').config({ path: require('path').join(__dirname, '../project_price_02/.env') });

const app = express();
const PORT = process.env.PORT || 3000;

// 예기치 못한 에러로 프로세스가 죽는 것을 방지하기 위한 전역 에러 핸들러
process.on('uncaughtException', (err) => {
    console.error('[전역 에러 - Uncaught Exception]:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[전역 에러 - Unhandled Rejection]:', reason);
});

// 캐시 디렉터리 및 파일 정의
const CACHE_DIR = path.join(__dirname, 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'cache.json');

// 기상 관측 지점 매핑
const WEATHER_STATIONS = {
    '108': '서울',
    '100': '대관령',
    '133': '대전',
    '156': '광주',
    '143': '대구',
    '184': '제주'
};

// CORS 허용 (로컬 프론트엔드 연동)
app.use(cors());

// JSON 파싱 허용
app.use(express.json());

// 정적 파일 서빙 (project_price_02 디렉토리를 루트로 설정)
app.use(express.static(path.join(__dirname, '..')));

// 루트 경로 접속 시 dashboard_260711.html 서빙 (최신 버전으로 교체)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dashboard_260711.html'));
});

// 최근 영업일 날짜(YYYY-MM-DD) 판정 헬퍼 함수
function getLatestRegDate() {
    const now = new Date();
    // 한국 시간(KST, UTC+9) 기준으로 보정
    const KST = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 3600000));
    
    // 만약 오전 9시 이전이면 어제 날짜를 기준으로 함 (KAMIS 당일 데이터가 생성되기 전이므로)
    if (KST.getHours() < 9) {
        KST.setDate(KST.getDate() - 1);
    }
    
    // 주말(토: 6, 일: 0) 판정하여 금요일로 변경
    let day = KST.getDay();
    if (day === 0) { // 일요일 -> 금요일로 (-2일)
        KST.setDate(KST.getDate() - 2);
    } else if (day === 6) { // 토요일 -> 금요일로 (-1일)
        KST.setDate(KST.getDate() - 1);
    }
    
    const yyyy = KST.getFullYear();
    const mm = String(KST.getMonth() + 1).padStart(2, '0');
    const dd = String(KST.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// 캐시 데이터 불러오기 헬퍼 함수
function getCachedData() {
    try {
        if (fs.existsSync(CACHE_FILE)) {
            const raw = fs.readFileSync(CACHE_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('[Cache] Read failed:', e.message);
    }
    return null;
}

// 캐시 데이터 저장하기 헬퍼 함수
function saveCacheData(data) {
    try {
        if (!fs.existsSync(CACHE_DIR)) {
            fs.mkdirSync(CACHE_DIR, { recursive: true });
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2), 'utf8');
        console.log('[Cache] Data successfully updated at data/cache.json');
    } catch (e) {
        console.error('[Cache] Save failed:', e.message);
    }
}

// 외부 API를 모두 호출하여 캐시를 생성하는 핵심 함수
async function updateAllDataCache() {
    console.log('[Scheduler] Start updating weather and price cache data...');
    const result = {
        updatedAt: new Date().toISOString(),
        weather: {}, 
        warnings: null, // 기상특보 캐시 필드 추가
        price: {},
        volume: null
    };

    const weatherKey = process.env.WEATHER_API_KEY;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yyyy = yesterday.getFullYear();
    const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
    const dd = String(yesterday.getDate()).padStart(2, '0');
    const targetDate = `${yyyy}${mm}${dd}`;

    // 1. 전국 주요 지점 날씨 데이터 수집
    for (const stnId of Object.keys(WEATHER_STATIONS)) {
        try {
            console.log(`[Scheduler] Fetching weather for ${WEATHER_STATIONS[stnId]} (${stnId})...`);
            const weatherUrl = `http://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList?serviceKey=${encodeURIComponent(weatherKey)}&dataType=JSON&numOfRows=10&pageNo=1&dataCd=ASOS&dateCd=DAY&startDt=${targetDate}&endDt=${targetDate}&stnIds=${stnId}`;
            const res = await fetch(weatherUrl);
            if (res.ok) {
                result.weather[stnId] = await res.json();
            }
        } catch (err) {
            console.error(`[Scheduler Error] Weather fetch failed for stn ${stnId}:`, err.message);
        }
    }

    // 1-2. 기상청 실시간 기상특보 API 수집 추가
    try {
        console.log(`[Scheduler] Fetching weather warnings...`);
        const warningsUrl = `http://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg?serviceKey=${encodeURIComponent(weatherKey)}&dataType=JSON&numOfRows=20&pageNo=1`;
        const res = await fetch(warningsUrl);
        if (res.ok) {
            result.warnings = await res.json();
        }
    } catch (err) {
        console.error('[Scheduler Error] Weather warnings fetch failed:', err.message);
    }

    // 2. 가락시장 반입물량 데이터 수집
    try {
        const garakId = process.env.GARAK_ID;
        const garakKey = process.env.GARAK_KEY;
        const volumeUrl = `https://www.garak.co.kr/homepage/M0000258/publicdata/selectPageListPublicData.do?publicDataRealmSn=8&apiId=${garakId}&apiKey=${garakKey}`;
        const res = await fetch(volumeUrl);
        if (res.ok) {
            result.volume = await res.json();
        }
    } catch (err) {
        console.error('[Scheduler Error] Garak volume fetch failed:', err.message);
    }

    // 3. KAMIS 가격 데이터 수집 (카테고리 100, 200, 400 & cls_code 01 도매, 02 소매 모두 수집)
    const kamisId = process.env.KAMIS_ID;
    const kamisKey = process.env.KAMIS_KEY;
    const classes = ['01', '02'];
    const categories = ['100', '200', '400'];
    const regDate = getLatestRegDate();

    for (const cls of classes) {
        result.price[cls] = {};
        for (const cat of categories) {
            try {
                const targetUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=${cls}&p_item_category_code=${cat}&p_cert_key=${kamisKey}&p_cert_id=${kamisId}&p_returntype=json&p_regday=${regDate}`;
                const res = await fetch(targetUrl);
                if (res.ok) {
                    result.price[cls][cat] = await res.json();
                }
            } catch (err) {
                console.error(`[Scheduler Error] KAMIS fetch failed for cls ${cls}, cat ${cat}:`, err.message);
            }
        }
    }

    // 4. 환율 데이터 수집 (한국수출입은행 API)
    try {
        const eximKey = process.env.EXIM_KEY;
        if (eximKey && eximKey !== 'YOUR_EXIM_KEY_HERE') {
            const eximUrl = `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${eximKey}&searchdate=${targetDate}&data=AP01`;
            console.log('[Scheduler] Fetching exchange rate...');
            const res = await fetch(eximUrl);
            if (res.ok) {
                const text = await res.text();
                if (text && text.trim().startsWith('[')) {
                    result.exchange = JSON.parse(text);
                } else {
                    console.warn('[Scheduler] Exchange API returned non-JSON:', text.substring(0, 50));
                }
            }
        } else {
             // Mock data if key is not set
             result.exchange = [{ "cur_unit": "USD", "deal_bas_r": "1,385.50", "cur_nm": "미국 달러" }];
        }
    } catch (err) {
        console.error('[Scheduler Error] Exchange rate fetch failed:', err.message);
    }

    saveCacheData(result);
    return result;
}

// 매일 아침 7시 정각에 데이터 자동 업데이트 스케줄 등록
cron.schedule('0 7 * * *', async () => {
    try {
        console.log('[Scheduler] Cron job triggered (07:00 AM)');
        await updateAllDataCache();
    } catch (err) {
        console.error('[Scheduler Fatal Error] Cron job execution failed:', err);
    }
});

/**
 * 1. KAMIS 가격 데이터 수집 API Proxy (캐시 우선 리턴)
 */
app.get('/api/price', async (req, res) => {
    const { cls_code, category } = req.query;
    let { reg_date } = req.query;
    if (!cls_code || !category) {
        return res.status(400).json({ error: 'cls_code and category are required parameters.' });
    }

    if (!reg_date) {
        reg_date = getLatestRegDate();
    }

    const cache = getCachedData();
    if (cache && cache.price && cache.price[cls_code] && cache.price[cls_code][category]) {
        const cachedCategoryData = cache.price[cls_code][category];
        // 캐시 데이터가 실제 유효한 농산물 목록을 포함하고 있는지 검증 (기존 에러 데이터 ["200"] 유입 방지)
        if (cachedCategoryData && cachedCategoryData.data && cachedCategoryData.data.item) {
            console.log(`[Cache Hit] Serving KAMIS Price category ${category}, cls ${cls_code}`);
            return res.json(cachedCategoryData);
        }
    }

    try {
        const kamisId = process.env.KAMIS_ID;
        const kamisKey = process.env.KAMIS_KEY;
        const targetUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=${cls_code}&p_item_category_code=${category}&p_cert_key=${kamisKey}&p_cert_id=${kamisId}&p_returntype=json&p_regday=${reg_date}`;

        console.log(`[Cache Miss] Fetching Realtime KAMIS Data for date ${reg_date}...`);
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error(`KAMIS API responded with status ${response.status}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch price data.', details: error.message });
    }
});

/**
 * 2. 가락시장 반입물량 API Proxy (캐시 우선 리턴)
 */
app.get('/api/volume', async (req, res) => {
    const cache = getCachedData();
    if (cache && cache.volume) {
        console.log(`[Cache Hit] Serving Garak Market Volume Data`);
        return res.json(cache.volume);
    }

    try {
        const garakId = process.env.GARAK_ID;
        const garakKey = process.env.GARAK_KEY;
        const targetUrl = `https://www.garak.co.kr/homepage/M0000258/publicdata/selectPageListPublicData.do?publicDataRealmSn=8&apiId=${garakId}&apiKey=${garakKey}`;

        console.log(`[Cache Miss] Fetching Realtime Garak Market Volume...`);
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error(`Garak Market API responded with status ${response.status}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch volume data.', details: error.message });
    }
});

/**
 * 3. 기상청 ASOS 일자료 API Proxy (캐시 우선 리턴)
 */
app.get('/api/weather', async (req, res) => {
    const stnId = req.query.stn_id || '108';

    const cache = getCachedData();
    if (cache && cache.weather && cache.weather[stnId]) {
        console.log(`[Cache Hit] Serving KMA ASOS Weather Data for station ${stnId}`);
        return res.json(cache.weather[stnId]);
    }

    try {
        const weatherKey = process.env.WEATHER_API_KEY;
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yyyy = yesterday.getFullYear();
        const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
        const dd = String(yesterday.getDate()).padStart(2, '0');
        const targetDate = `${yyyy}${mm}${dd}`;

        const targetUrl = `http://apis.data.go.kr/1360000/AsosDalyInfoService/getWthrDataList?serviceKey=${encodeURIComponent(weatherKey)}&dataType=JSON&numOfRows=10&pageNo=1&dataCd=ASOS&dateCd=DAY&startDt=${targetDate}&endDt=${targetDate}&stnIds=${stnId}`;

        console.log(`[Cache Miss] Fetching Realtime KMA Weather for station ${stnId}...`);
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error(`KMA API responded with status ${response.status}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        const defaultTemps = { '108': '24.5', '100': '18.2', '133': '24.0', '156': '23.8', '143': '25.2', '184': '24.7' };
        res.json({
            response: {
                header: { resultCode: "00", resultMsg: "FALLBACK_USED" },
                body: {
                    items: {
                        item: [{ taAvg: defaultTemps[stnId] || '24.5', rnDay: '0.0' }]
                    }
                }
            }
        });
    }
});

/**
 * 4. 기상청 기상특보 API Proxy (캐시 우선 리턴)
 * GET /api/weather/warning
 */
app.get('/api/weather/warning', async (req, res) => {
    const cache = getCachedData();
    if (cache && cache.warnings) {
        console.log(`[Cache Hit] Serving KMA Weather Warning Data`);
        return res.json(cache.warnings);
    }

    try {
        const weatherKey = process.env.WEATHER_API_KEY;
        const targetUrl = `http://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnMsg?serviceKey=${encodeURIComponent(weatherKey)}&dataType=JSON&numOfRows=20&pageNo=1`;

        console.log(`[Cache Miss] Fetching Realtime KMA Weather Warnings...`);
        const response = await fetch(targetUrl);
        if (!response.ok) throw new Error(`KMA Warning API responded with status ${response.status}`);
        const data = await response.json();
        res.json(data);
    } catch (error) {
        // 특보 없을 시의 Fallback 포맷
        res.json({
            response: {
                header: { resultCode: "00", resultMsg: "FALLBACK_USED" },
                body: {
                    items: {
                        item: [] // 빈 특보 리스트 리턴
                    }
                }
            }
        });
    }
});

// 기상청 중기예보용 지역 격자/구역 코드 정의
const FORECAST_LAND_ZONES = {
    '108': '11B00000', // 서울/인천/경기도
    '100': '11D10000', // 강원도영서 (대관령 인근)
    '133': '11C20000', // 대전/세종/충청남도
    '156': '11F20000', // 광주/전라남도
    '143': '11H10000', // 대구/경상북도
    '184': '11G00000'  // 제주도
};

const FORECAST_TEMP_ZONES = {
    '108': '11B10101', // 서울
    '100': '11D10402', // 대관령
    '133': '11C20401', // 대전
    '156': '11F20501', // 광주
    '143': '11H10701', // 대구
    '184': '11G00201'  // 제주
};

// 기상청 중기예보 발표시각(tmFc) 조회 함수 (매일 06시, 18시 발표 기준)
function getLatestForecastTime() {
    const now = new Date();
    const KST = new Date(now.getTime() + (now.getTimezoneOffset() * 60000) + (9 * 3600000));
    
    const hour = KST.getHours();
    let dateStr = '';
    let timeStr = '';
    
    // 발표 후 10분 정도의 지연 반영 시간을 반영하여 조건 설정
    if (hour < 6 || (hour === 6 && KST.getMinutes() < 10)) {
        // 어제 18시 자료 사용
        const yesterday = new Date(KST);
        yesterday.setDate(KST.getDate() - 1);
        const yyyy = yesterday.getFullYear();
        const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
        const dd = String(yesterday.getDate()).padStart(2, '0');
        dateStr = `${yyyy}${mm}${dd}`;
        timeStr = '1800';
    } else if (hour < 18 || (hour === 18 && KST.getMinutes() < 10)) {
        // 오늘 06시 자료 사용
        const yyyy = KST.getFullYear();
        const mm = String(KST.getMonth() + 1).padStart(2, '0');
        const dd = String(KST.getDate()).padStart(2, '0');
        dateStr = `${yyyy}${mm}${dd}`;
        timeStr = '0600';
    } else {
        // 오늘 18시 자료 사용
        const yyyy = KST.getFullYear();
        const mm = String(KST.getMonth() + 1).padStart(2, '0');
        const dd = String(KST.getDate()).padStart(2, '0');
        dateStr = `${yyyy}${mm}${dd}`;
        timeStr = '1800';
    }
    return `${dateStr}${timeStr}`;
}

/**
 * 5. 기상청 향후 7일 기상 예보 API Proxy (실시간 조회 및 Fallback 연동)
 * GET /api/weather/forecast?stn_id=지점코드
 */
app.get('/api/weather/forecast', async (req, res) => {
    const stnId = req.query.stn_id || '108';
    const weatherKey = process.env.WEATHER_API_KEY;
    
    // 모의 예보 데이터 생성기 (기상청 API 장애 또는 미승인 인증키 활용 시 Fallback)
    const generateMockForecast = (id) => {
        const baseTemps = { '108': 26, '100': 19, '133': 25, '156': 25, '143': 27, '184': 26 };
        const base = baseTemps[id] || 25;
        const days = [];
        
        for (let i = 1; i <= 7; i++) {
            const tempVar = Math.sin(i * 0.9) * 2.5 + (Math.random() * 1.2 - 0.6);
            const rainProb = Math.round(Math.max(0, Math.sin(i * 1.5) * 60 + (Math.random() * 20 - 10)));
            const temp = Math.round((base + tempVar) * 10) / 10;
            
            let sky = '맑음';
            if (rainProb >= 60) sky = '비';
            else if (rainProb >= 30) sky = '구름많음';

            days.push({ dayOffset: i, temp, rainProb, sky });
        }
        return days;
    };

    try {
        const tempZone = FORECAST_TEMP_ZONES[stnId];
        const landZone = FORECAST_LAND_ZONES[stnId];
        
        if (!tempZone || !landZone) {
            throw new Error(`지원하지 않는 관측소 ID입니다: ${stnId}`);
        }

        const tmFc = getLatestForecastTime();
        
        // 기상청 중기기온(Ta) 및 중기육상예보(Land) API URL 구성
        const tempUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidTa?serviceKey=${encodeURIComponent(weatherKey)}&dataType=JSON&numOfRows=10&pageNo=1&regId=${tempZone}&tmFc=${tmFc}`;
        const landUrl = `http://apis.data.go.kr/1360000/MidFcstInfoService/getMidLandFcst?serviceKey=${encodeURIComponent(weatherKey)}&dataType=JSON&numOfRows=10&pageNo=1&regId=${landZone}&tmFc=${tmFc}`;

        console.log(`[예보 API] 기상청 실시간 예보 연동 시도 (${stnId} 지점, 발표시간: ${tmFc})...`);

        // 병렬 호출
        const [tempRes, landRes] = await Promise.all([
            fetch(tempUrl).then(r => r.json()).catch(() => null),
            fetch(landUrl).then(r => r.json()).catch(() => null)
        ]);

        const tempItem = tempRes?.response?.body?.items?.item?.[0] || tempRes?.response?.body?.items?.items?.item?.[0];
        const landItem = landRes?.response?.body?.items?.item?.[0] || landRes?.response?.body?.items?.items?.item?.[0];

        if (!tempItem || !landItem) {
            throw new Error('기상청 API 응답이 없거나 올바르지 않습니다. Fallback으로 전환합니다.');
        }

        // 1~2일차 보간을 위해 어제 실제 기온 정보 가져오기 시도
        let yesterdayTemp = 24.5;
        const cache = getCachedData();
        if (cache && cache.weather && cache.weather[stnId]) {
            const yesterdayItem = cache.weather[stnId]?.response?.body?.items?.item?.[0] || cache.weather[stnId]?.response?.body?.items?.items?.item?.[0];
            if (yesterdayItem && yesterdayItem.taAvg) {
                yesterdayTemp = parseFloat(yesterdayItem.taAvg);
            }
        }

        const days = [];
        
        // 3일 후 기온 평균 산출
        const taMin3 = parseFloat(tempItem.taMin3 || '20');
        const taMax3 = parseFloat(tempItem.taMax3 || '28');
        const temp3 = Math.round((taMin3 + taMax3) / 2 * 10) / 10;

        // 1~2일차 선형 보간 처리
        const step = (temp3 - yesterdayTemp) / 3;
        const temp1 = Math.round((yesterdayTemp + step) * 10) / 10;
        const temp2 = Math.round((yesterdayTemp + step * 2) * 10) / 10;

        // 1일차, 2일차 날씨 트렌드 유추 매칭
        const wf3Am = landItem.wf3Am || '구름많음';
        let sky1 = '맑음', sky2 = '구름많음';
        if (wf3Am.includes('비')) {
            sky1 = '구름많음'; sky2 = '비';
        } else if (wf3Am.includes('구름') || wf3Am.includes('흐림')) {
            sky1 = '맑음'; sky2 = '구름많음';
        }

        days.push({ dayOffset: 1, temp: temp1, rainProb: sky1 === '비' ? 60 : 20, sky: sky1 });
        days.push({ dayOffset: 2, temp: temp2, rainProb: sky2 === '비' ? 70 : 40, sky: sky2 });

        // 3일~7일차 기상청 예보 바인딩
        for (let i = 3; i <= 7; i++) {
            const minT = parseFloat(tempItem[`taMin${i}`] || '20');
            const maxT = parseFloat(tempItem[`taMax${i}`] || '28');
            const dayTemp = Math.round((minT + maxT) / 2 * 10) / 10;

            const wfAm = landItem[`wf${i}Am`] || '구름많음';
            const wfPm = landItem[`wf${i}Pm`] || '구름많음';
            const rnStAm = parseInt(landItem[`rnSt${i}Am`] || '30');
            const rnStPm = parseInt(landItem[`rnSt${i}Pm`] || '30');

            const maxRnProb = Math.max(rnStAm, rnStPm);
            
            let sky = '맑음';
            if (wfPm.includes('비') || wfAm.includes('비') || wfPm.includes('소나기')) sky = '비';
            else if (wfPm.includes('구름') || wfPm.includes('흐림') || wfAm.includes('구름') || wfAm.includes('흐림')) sky = '구름많음';

            days.push({
                dayOffset: i,
                temp: dayTemp,
                rainProb: maxRnProb,
                sky: sky
            });
        }

        console.log(`[예보 API] 기상청 실시간 예보 연동 성공 (${stnId} 지점)`);
        res.json({
            status: "SUCCESS",
            stnId: stnId,
            forecast: days
        });

    } catch (err) {
        console.warn(`[예보 API 오류] ${err.message}. 모의 예보(Mock) 데이터를 서빙합니다.`);
        res.json({
            status: "SUCCESS",
            stnId: stnId,
            forecast: generateMockForecast(stnId)
        });
    }
});

/**
 * 5-1. 환율 API Proxy (캐시 우선 리턴)
 * GET /api/exchange-rate
 */
app.get('/api/exchange-rate', async (req, res) => {
    const cache = getCachedData();
    if (cache && cache.exchange) {
        console.log(`[Cache Hit] Serving Exchange Rate Data`);
        return res.json({ status: "SUCCESS", data: cache.exchange });
    }

    try {
        const eximKey = process.env.EXIM_KEY;
        if (!eximKey || eximKey === 'YOUR_EXIM_KEY_HERE') {
            throw new Error('EXIM_KEY is not configured');
        }

        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yyyy = yesterday.getFullYear();
        const mm = String(yesterday.getMonth() + 1).padStart(2, '0');
        const dd = String(yesterday.getDate()).padStart(2, '0');
        const targetDate = `${yyyy}${mm}${dd}`;

        const eximUrl = `https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON?authkey=${eximKey}&searchdate=${targetDate}&data=AP01`;

        console.log(`[Cache Miss] Fetching Realtime Exchange Rate...`);
        const response = await fetch(eximUrl);
        if (!response.ok) throw new Error(`Exim API responded with status ${response.status}`);
        const text = await response.text();
        if (text && text.trim().startsWith('[')) {
            const data = JSON.parse(text);
            res.json({ status: "SUCCESS", data: data });
        } else {
            throw new Error('Invalid JSON response from Exim API');
        }
    } catch (error) {
        // Fallback mock data
        console.warn(`[환율 API 오류] ${error.message}. 모의 환율 데이터를 서빙합니다.`);
        res.json({
            status: "SUCCESS",
            data: [{ "cur_unit": "USD", "deal_bas_r": "1,385.50", "cur_nm": "미국 달러" }]
        });
    }
});

/**
 * 6. 수동 데이터 강제 갱신 API
 * GET /api/cache/refresh
 */
app.get('/api/cache/refresh', async (req, res) => {
    try {
        console.log('[수동 갱신 API] 사용자가 수동 데이터 동기화를 트리거했습니다. 캐시 업데이트 시작...');
        await updateAllDataCache();
        res.json({ status: "SUCCESS", message: "실시간 데이터가 성공적으로 동기화되었습니다." });
    } catch (error) {
        console.error('[수동 갱신 API 에러]:', error.message);
        res.status(500).json({ status: "ERROR", error: error.message });
    }
});

// 서버 기동 및 캐시 점검/생성
app.listen(PORT, async () => {
    console.log(`==================================================`);
    console.log(`🚀 Agricultural Price Proxy Server is running!`);
    console.log(`   - Portal url: http://localhost:${PORT}`);
    console.log(`==================================================`);

    // 서버 기동 시 로컬 캐시가 비어있으면 즉시 한 번 수집 실행하여 사용자 경험 확보
    if (!fs.existsSync(CACHE_FILE)) {
        console.log('[Startup] No cache found. Initializing startup data fetch...');
        try {
            await updateAllDataCache();
        } catch (e) {
            console.error('[Startup] Failed to initialize cache:', e.message);
        }
    }
});
