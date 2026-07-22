const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// 장세파악 대상 8종목 (네이버금융 종목코드)
const TREND_STOCKS = [
  { name: "KODEX200", code: "069500" },
  { name: "삼성전자", code: "005930" },
  { name: "삼성전기", code: "009150" },
  { name: "SK하이닉스", code: "000660" },
  { name: "삼성물산", code: "028260" },
  { name: "SK스퀘어", code: "402340" },
  { name: "SK텔레콤", code: "017670" },
  { name: "삼성생명", code: "032830" },
];

// 지표 계산에 필요한 일봉 수 (MA60 + ADX warmup + 여유분)
const CHART_COUNT = 180;
const CACHE_MS = 1000 * 60 * 30;

const cache = new Map();

async function fetchText(url, encoding = "utf-8") {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  const buffer = await response.arrayBuffer();
  return new TextDecoder(encoding).decode(buffer);
}

function seoulToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}${get("month")}${get("day")}`;
}

async function fetchDailyChart(code, count) {
  const key = `chart:${code}:${count}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.time < CACHE_MS) return hit.value;

  const url =
    `https://fchart.stock.naver.com/sise.nhn?symbol=${code}` +
    `&timeframe=day&count=${count}&requestType=0`;
  const xml = await fetchText(url, "euc-kr");
  const rows = [...xml.matchAll(/<item data="([^"]+)"/g)].map((match) => {
    const [date, open, high, low, close, volume] = match[1].split("|");
    return {
      date,
      open: Number(open),
      high: Number(high),
      low: Number(low),
      close: Number(close),
      volume: Number(volume),
    };
  });
  cache.set(key, { time: Date.now(), value: rows });
  return rows;
}

function sma(values, length, endIndex) {
  if (endIndex + 1 < length) return NaN;
  let sum = 0;
  for (let i = endIndex - length + 1; i <= endIndex; i += 1) sum += values[i];
  return sum / length;
}

// RSI(14) - Wilder smoothing
function rsiWilder(closes, period = 14) {
  if (closes.length < period + 1) return NaN;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i += 1) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  let avgGain = gain / period;
  let avgLoss = loss / period;
  for (let i = period + 1; i < closes.length; i += 1) {
    const diff = closes[i] - closes[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
  }
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

// ADX(14), +DI, -DI - Wilder smoothing
function adxWilder(highs, lows, closes, period = 14) {
  const n = closes.length;
  const result = { adx: NaN, plusDI: NaN, minusDI: NaN };
  if (n < period * 2 + 1) return result;

  const tr = [];
  const plusDM = [];
  const minusDM = [];
  for (let i = 1; i < n; i += 1) {
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
    tr.push(
      Math.max(
        highs[i] - lows[i],
        Math.abs(highs[i] - closes[i - 1]),
        Math.abs(lows[i] - closes[i - 1])
      )
    );
  }

  let trS = 0;
  let pS = 0;
  let mS = 0;
  for (let i = 0; i < period; i += 1) {
    trS += tr[i];
    pS += plusDM[i];
    mS += minusDM[i];
  }

  const diPair = () => {
    const plusDI = trS === 0 ? 0 : (100 * pS) / trS;
    const minusDI = trS === 0 ? 0 : (100 * mS) / trS;
    const sum = plusDI + minusDI;
    const dx = sum === 0 ? 0 : (100 * Math.abs(plusDI - minusDI)) / sum;
    return { plusDI, minusDI, dx };
  };

  let last = diPair();
  const dxSeries = [last.dx];
  for (let i = period; i < tr.length; i += 1) {
    trS = trS - trS / period + tr[i];
    pS = pS - pS / period + plusDM[i];
    mS = mS - mS / period + minusDM[i];
    last = diPair();
    dxSeries.push(last.dx);
  }

  result.plusDI = last.plusDI;
  result.minusDI = last.minusDI;
  if (dxSeries.length < period) return result;

  let adx = 0;
  for (let i = 0; i < period; i += 1) adx += dxSeries[i];
  adx /= period;
  for (let i = period; i < dxSeries.length; i += 1) {
    adx = (adx * (period - 1) + dxSeries[i]) / period;
  }
  result.adx = adx;
  return result;
}

function classify(indicators) {
  const { close, ma60, slope20, adx, plusDI, minusDI, rsi } = indicators;

  const bull = {
    trend: close > ma60 && slope20 > 0,
    adx: adx >= 22 && plusDI > minusDI,
    rsi: rsi > 50,
  };
  const bear = {
    trend: close < ma60 && slope20 < 0,
    adx: adx >= 22 && minusDI > plusDI,
    rsi: rsi < 50,
  };

  let phase = "sideways";
  if (adx < 20) {
    phase = "sideways";
  } else if (bull.trend && bull.adx && bull.rsi) {
    phase = "bull";
  } else if (bear.trend && bear.adx && bear.rsi) {
    phase = "bear";
  }

  return { phase, bull, bear };
}

const PHASE_LABEL = {
  bull: "상승장",
  bear: "하락장",
  sideways: "횡보장",
};

function evaluateStock(stock, rows) {
  const today = seoulToday();
  // "전일까지의 데이터" - 당일(미완성) 봉은 제외한다.
  const completed = rows.filter((row) => row.date < today);
  const chart = completed.length ? completed : rows;
  const n = chart.length;
  if (n < 61) {
    return {
      ...stock,
      error: "데이터 부족",
    };
  }

  const closes = chart.map((row) => row.close);
  const highs = chart.map((row) => row.high);
  const lows = chart.map((row) => row.low);
  const last = chart[n - 1];

  const close = last.close;
  const ma20 = sma(closes, 20, n - 1);
  const ma60 = sma(closes, 60, n - 1);
  // 20일 이평선 기울기: 최근 5거래일간 MA20 변화량 (부호로 상승/하락 판정)
  const slopeLookback = 5;
  const ma20Prev = sma(closes, 20, n - 1 - slopeLookback);
  const slope20 = ma20 - ma20Prev;
  const slope20PctPerDay =
    Number.isFinite(ma20Prev) && ma20Prev !== 0
      ? (slope20 / slopeLookback / ma20Prev) * 100
      : NaN;
  const rsi = rsiWilder(closes, 14);
  const { adx, plusDI, minusDI } = adxWilder(highs, lows, closes, 14);

  const indicators = { close, ma60, slope20, adx, plusDI, minusDI, rsi };
  const { phase, bull, bear } = classify(indicators);

  return {
    ...stock,
    date: last.date,
    close,
    ma20,
    ma60,
    slope20,
    slope20PctPerDay,
    closeVsMa60Pct: Number.isFinite(ma60) ? ((close - ma60) / ma60) * 100 : NaN,
    rsi,
    adx,
    plusDI,
    minusDI,
    phase,
    phaseLabel: PHASE_LABEL[phase],
    checks: {
      bull,
      bear,
    },
  };
}

async function computeMarketTrend() {
  const results = [];
  for (const stock of TREND_STOCKS) {
    try {
      const rows = await fetchDailyChart(stock.code, CHART_COUNT);
      results.push(evaluateStock(stock, rows));
    } catch (error) {
      results.push({ ...stock, error: error.message });
    }
  }

  const asOfDate =
    results.map((row) => row.date).filter(Boolean).sort().at(-1) || null;

  const summary = { bull: 0, bear: 0, sideways: 0 };
  for (const row of results) {
    if (row.phase) summary[row.phase] += 1;
  }

  return {
    updatedAt: new Date().toISOString(),
    asOfDate,
    summary,
    results,
  };
}

module.exports = {
  TREND_STOCKS,
  computeMarketTrend,
  // 테스트/재사용을 위해 지표 함수도 노출
  rsiWilder,
  adxWilder,
  classify,
};
