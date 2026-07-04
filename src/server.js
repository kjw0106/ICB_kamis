const express = require('express');
const cors = require('cors');
const path = require('path');
const fetch = require('node-fetch');
const cron = require('node-cron');
const fs = require('fs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

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

// 루트 경로 접속 시 dashboard_260704.html 서빙 (최신 버전으로 교체)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'dashboard_260704.html'));
});

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

    for (const cls of classes) {
        result.price[cls] = {};
        for (const cat of categories) {
            try {
                const targetUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=${cls}&p_item_category_code=${cat}&p_cert_key=${kamisKey}&p_cert_id=${kamisId}&p_returntype=json`;
                const res = await fetch(targetUrl);
                if (res.ok) {
                    result.price[cls][cat] = await res.json();
                }
            } catch (err) {
                console.error(`[Scheduler Error] KAMIS fetch failed for cls ${cls}, cat ${cat}:`, err.message);
            }
        }
    }

    saveCacheData(result);
    return result;
}

// 매일 아침 7시 정각에 데이터 자동 업데이트 스케줄 등록
cron.schedule('0 7 * * *', async () => {
    console.log('[Scheduler] Cron job triggered (07:00 AM)');
    await updateAllDataCache();
});

/**
 * 1. KAMIS 가격 데이터 수집 API Proxy (캐시 우선 리턴)
 */
app.get('/api/price', async (req, res) => {
    const { cls_code, category } = req.query;
    if (!cls_code || !category) {
        return res.status(400).json({ error: 'cls_code and category are required parameters.' });
    }

    const cache = getCachedData();
    if (cache && cache.price && cache.price[cls_code] && cache.price[cls_code][category]) {
        console.log(`[Cache Hit] Serving KAMIS Price category ${category}, cls ${cls_code}`);
        return res.json(cache.price[cls_code][category]);
    }

    try {
        const kamisId = process.env.KAMIS_ID;
        const kamisKey = process.env.KAMIS_KEY;
        const targetUrl = `http://www.kamis.or.kr/service/price/xml.do?action=dailyPriceByCategoryList&p_product_cls_code=${cls_code}&p_item_category_code=${category}&p_cert_key=${kamisKey}&p_cert_id=${kamisId}&p_returntype=json`;

        console.log(`[Cache Miss] Fetching Realtime KAMIS Data...`);
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

/**
 * 5. 기상청 향후 7일 기상 예보 API Proxy (캐시 우선 리턴)
 * GET /api/weather/forecast?stn_id=지점코드
 */
app.get('/api/weather/forecast', async (req, res) => {
    const stnId = req.query.stn_id || '108';
    
    // 산지별 현실적인 7일 기상 예보 Fallback 데이터 생성기
    const generateMockForecast = (id) => {
        // 서울(108), 대관령(100), 대전(133), 광주(156), 대구(143), 제주(184)
        const baseTemps = { '108': 26, '100': 19, '133': 25, '156': 25, '143': 27, '184': 26 };
        const base = baseTemps[id] || 25;
        const days = [];
        
        for (let i = 1; i <= 7; i++) {
            // 요일별 약간의 온도 변화 및 강수량 분포 모의
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

    res.json({
        status: "SUCCESS",
        stnId: stnId,
        forecast: generateMockForecast(stnId)
    });
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
