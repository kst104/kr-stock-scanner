const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const { URL } = require("url");
const { renderDashboard } = require("./dashboard-ui");
const { runReportCollection } = require("./report-scraper");
const { fetchBuyRecommendations } = require("./wise-report");

const PORT = process.env.PORT || 3000;
const RECIPIENTS_FILE = path.join(__dirname, "recipients.json");
const DEFAULT_RECIPIENTS = ["promokorea@gmail.com"];
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const cache = new Map();
const CACHE_MS = 1000 * 60 * 10;

function now() {
  return Date.now();
}

function cached(key, loader) {
  const hit = cache.get(key);
  if (hit && now() - hit.time < CACHE_MS) return hit.value;
  const value = loader().then((data) => {
    cache.set(key, { time: now(), value: Promise.resolve(data) });
    return data;
  });
  cache.set(key, { time: now(), value });
  return value;
}

function toNumber(value) {
  if (value == null) return NaN;
  const cleaned = String(value).replace(/,/g, "").replace(/%/g, "").trim();
  return cleaned === "" || cleaned === "N/A" ? NaN : Number(cleaned);
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function isCommonStockName(name) {
  const blocked =
    /^(KODEX|TIGER|ACE|RISE|SOL|PLUS|KOSEF|HANARO|KBSTAR|TIMEFOLIO|FOCUS|ARIRANG|히어로즈|마이티|TREX|UNICORN|WON|1Q|VITA|BNK|HK|파워|신한|미래에셋|삼성|대신|메리츠|TRUE|QV|KB|한투|NH|교보|유안타|하나|키움|유진|IBK|DB|한국투자|현대차).*?(ETF|ETN|레버리지|인버스)|스팩|기업인수목적|리츠|우$|우B$|우선주/;
  return !blocked.test(name);
}

async function fetchText(url, encoding = "utf-8") {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  const buffer = await response.arrayBuffer();
  return new TextDecoder(encoding).decode(buffer);
}

async function fetchMarketPage(market, page) {
  const url = `https://finance.naver.com/sise/sise_market_sum.naver?sosok=${market}&page=${page}`;
  const html = await fetchText(url, "euc-kr");
  const rows = [...html.matchAll(/<tr[^>]*onMouseOver="mouseOver\(this\)"[\s\S]*?<\/tr>/g)];

  return rows
    .map((match) => {
      const row = match[0];
      const title = row.match(/\/item\/main\.naver\?code=(\d{6})" class="tltle">([^<]+)<\/a>/);
      if (!title) return null;
      const numbers = [...row.matchAll(/<td class="number">([\s\S]*?)<\/td>/g)].map((m) =>
        toNumber(stripTags(m[1]))
      );
      return {
        code: title[1],
        name: title[2].trim(),
        market: market === 0 ? "KOSPI" : "KOSDAQ",
        price: numbers[0],
        marketCapEok: numbers[4],
        volume: numbers[7],
      };
    })
    .filter((row) => row && Number.isFinite(row.marketCapEok));
}

async function fetchStocksByMarketCap(minMarketCapEok) {
  const result = [];
  for (const market of [0, 1]) {
    for (let page = 1; page <= 50; page += 1) {
      const rows = await cached(`market:${market}:${page}`, () => fetchMarketPage(market, page));
      if (!rows.length) break;
      result.push(
        ...rows.filter(
          (row) => row.marketCapEok >= minMarketCapEok && isCommonStockName(row.name)
        )
      );
      if (rows.some((row) => row.marketCapEok < minMarketCapEok)) break;
    }
  }
  return result;
}

async function fetchChart(code, count) {
  const url =
    `https://fchart.stock.naver.com/sise.nhn?symbol=${code}` +
    `&timeframe=day&count=${count}&requestType=0`;
  const xml = await cached(`chart:${code}:${count}`, () => fetchText(url, "euc-kr"));
  return [...xml.matchAll(/<item data="([^"]+)"/g)].map((match) => {
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
}

function movingAverage(rows, length) {
  if (rows.length < length) return NaN;
  const slice = rows.slice(-length);
  return slice.reduce((sum, row) => sum + row.close, 0) / length;
}

function movingAverageAt(rows, index, length) {
  if (index + 1 < length) return NaN;
  const slice = rows.slice(index + 1 - length, index + 1);
  return slice.reduce((sum, row) => sum + row.close, 0) / length;
}

function riseFromOpenPct(row) {
  return row.open > 0 ? ((row.close - row.open) / row.open) * 100 : -Infinity;
}

function isTriggerCandle(row, minRisePct) {
  return riseFromOpenPct(row) >= minRisePct && row.close > row.open;
}

function evaluate(stock, chart, options) {
  const today = chart.at(-1);
  const previous = chart.at(-2);
  if (!today || chart.length < Math.max(options.windowDays + 1, options.firstTriggerLookbackDays + 1, 5)) return null;
  if (!previous || previous.close <= 0) return null;
  if ([today.open, today.high, today.low, today.close].some((value) => value <= 0)) return null;

  const todayIndex = chart.length - 1;
  const windowStart = Math.max(0, todayIndex - options.windowDays);
  const firstTriggerStart = Math.max(0, todayIndex - options.firstTriggerLookbackDays);
  const rowsWithPct = chart
    .map((row, index) => ({
      ...row,
      index,
      pct: riseFromOpenPct(row),
    }));
  const firstTriggerInLookback = rowsWithPct
    .slice(firstTriggerStart, todayIndex)
    .find((row) => isTriggerCandle(row, options.minRisePct));
  const trigger =
    firstTriggerInLookback && firstTriggerInLookback.index >= windowStart
      ? firstTriggerInLookback
      : null;
  const ma3 = movingAverage(chart, 3);
  const ma5 = movingAverage(chart, 5);
  const lowToMa3Pct = ((today.low - ma3) / ma3) * 100;
  const lowToMa5Pct = ((today.low - ma5) / ma5) * 100;
  const hitMa3 = today.low <= ma3 * (1 + options.touchPct / 100);
  const hitMa5 = today.low <= ma5 * (1 + options.touchPct / 100);
  const bullish = today.close > today.open;
  const closesBelowMa5AfterTrigger = trigger
    ? chart
        .slice(trigger.index + 1)
        .map((row, offset) => ({
          row,
          ma5: movingAverageAt(chart, trigger.index + 1 + offset, 5),
        }))
        .filter(({ ma5 }) => Number.isFinite(ma5))
        .some(({ row, ma5 }) => row.close < ma5)
    : true;

  if (!trigger) return null;
  if (closesBelowMa5AfterTrigger) return null;
  if (!bullish) return null;
  if (!hitMa3 && !hitMa5) return null;

  return {
    ...stock,
    date: today.date,
    open: today.open,
    high: today.high,
    low: today.low,
    close: today.close,
    triggerDate: trigger.date,
    triggerRisePct: trigger.pct,
    triggerOpen: trigger.open,
    triggerClose: trigger.close,
    barsAfterTrigger: chart.length - trigger.index - 1,
    todayRisePct: ((today.close - previous.close) / previous.close) * 100,
    ma3,
    ma5,
    lowToMa3Pct,
    lowToMa5Pct,
    hit: [hitMa3 ? "3MA" : "", hitMa5 ? "5MA" : ""].filter(Boolean).join(", "),
  };
}

async function mapLimit(items, limit, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return output;
}

async function scan(params) {
  const options = {
    minMarketCapEok: Number(params.get("minMarketCapEok") || 3000),
    minRisePct: Number(params.get("minRisePct") || 10),
    windowDays: Number(params.get("windowDays") || 5),
    firstTriggerLookbackDays: Number(params.get("firstTriggerLookbackDays") || 20),
    touchPct: Number(params.get("touchPct") || 1),
  };
  options.chartCount = Math.max(40, options.firstTriggerLookbackDays + options.windowDays + 10);
  const stocks = await fetchStocksByMarketCap(options.minMarketCapEok);
  const rows = await mapLimit(stocks, 12, async (stock) => {
    try {
      const chart = await fetchChart(stock.code, options.chartCount);
      return evaluate(stock, chart, options);
    } catch (error) {
      return null;
    }
  });

  return {
    options,
    scanned: stocks.length,
    updatedAt: new Date().toISOString(),
    results: rows
      .filter(Boolean)
      .sort((a, b) => b.triggerRisePct - a.triggerRisePct)
      .slice(0, 300),
  };
}

async function readRecipients() {
  try {
    const parsed = JSON.parse(await fs.readFile(RECIPIENTS_FILE, "utf8"));
    const recipients = Array.isArray(parsed.recipients) ? parsed.recipients : [];
    return [...new Set([...DEFAULT_RECIPIENTS, ...recipients].map((email) => String(email).trim()).filter(Boolean))];
  } catch {
    return DEFAULT_RECIPIENTS;
  }
}

async function saveRecipient(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    throw new Error("Invalid email address");
  }
  const recipients = [...new Set([...(await readRecipients()), clean])];
  await fs.writeFile(RECIPIENTS_FILE, `${JSON.stringify({ recipients }, null, 2)}\n`, "utf8");
  return recipients;
}

function csvValue(value) {
  const text = value == null ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function scanToCsv(data) {
  const columns = [
    ["name", "종목"],
    ["code", "코드"],
    ["market", "시장"],
    ["date", "일자"],
    ["marketCapEok", "시총(억원)"],
    ["open", "시가"],
    ["low", "저가"],
    ["close", "종가"],
    ["triggerDate", "기준봉일"],
    ["triggerRisePct", "기준봉상승률"],
    ["barsAfterTrigger", "기준봉이후"],
    ["todayRisePct", "전일대비"],
    ["ma3", "3MA"],
    ["ma5", "5MA"],
    ["lowToMa3Pct", "저가-3MA"],
    ["lowToMa5Pct", "저가-5MA"],
    ["hit", "터치"],
    ["volume", "거래량"],
  ];
  const header = columns.map(([, label]) => csvValue(label)).join(",");
  const rows = data.results.map((row) =>
    columns.map(([key]) => csvValue(row[key])).join(",")
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

function buyRecommendationsToCsv(data) {
  const columns = [
    ["stockName", "종목명"],
    ["targetPrice", "목표가격"],
    ["currentClose", "현재종가"],
  ];
  const header = columns.map(([, label]) => csvValue(label)).join(",");
  const rows = data.results.map((row) =>
    columns.map(([key]) => csvValue(row[key])).join(",")
  );
  return `\uFEFF${[header, ...rows].join("\r\n")}\r\n`;
}

async function readRequestJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks).toString("utf8");
  return body ? JSON.parse(body) : {};
}

function formatHtml() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>KR Stock Scanner</title>
  <style>
    :root {
      color-scheme: light;
      --bg: #f5f7f9;
      --panel: #ffffff;
      --line: #d7dde4;
      --text: #17202a;
      --muted: #687583;
      --accent: #0f766e;
      --up: #d92626;
      --down: #1d4ed8;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, "Malgun Gothic", sans-serif;
      background: var(--bg);
      color: var(--text);
    }
    header {
      padding: 18px 24px 12px;
      border-bottom: 1px solid var(--line);
      background: #fff;
    }
    h1 {
      margin: 0 0 4px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .sub {
      color: var(--muted);
      font-size: 13px;
    }
    main {
      padding: 18px 24px 28px;
      display: grid;
      gap: 14px;
    }
    .toolbar {
      display: grid;
      grid-template-columns: repeat(5, minmax(130px, 1fr));
      gap: 10px;
      align-items: end;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    label {
      display: grid;
      gap: 5px;
      font-size: 12px;
      color: var(--muted);
    }
    input {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 9px 10px;
      font-size: 14px;
      color: var(--text);
      background: #fff;
    }
    button {
      height: 38px;
      border: 0;
      border-radius: 6px;
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    button:disabled {
      opacity: .55;
      cursor: wait;
    }
    .status {
      min-height: 22px;
      color: var(--muted);
      font-size: 13px;
    }
    .tableWrap {
      overflow: auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1080px;
      font-size: 13px;
    }
    th, td {
      padding: 9px 10px;
      border-bottom: 1px solid #edf0f3;
      white-space: nowrap;
      text-align: right;
    }
    th {
      position: sticky;
      top: 0;
      background: #f9fafb;
      color: #3c4652;
      font-weight: 700;
      z-index: 1;
    }
    th:first-child, td:first-child,
    th:nth-child(2), td:nth-child(2),
    th:nth-child(3), td:nth-child(3) {
      text-align: left;
    }
    .up { color: var(--up); font-weight: 700; }
    .muted { color: var(--muted); }
    a { color: inherit; text-decoration: none; }
    a:hover { text-decoration: underline; }
    @media (max-width: 820px) {
      header, main { padding-left: 14px; padding-right: 14px; }
      .toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      button { grid-column: span 2; }
    }
  </style>
</head>
<body>
  <header>
    <h1>KR Stock Scanner</h1>
    <div class="sub">오늘 제외 최근 20거래일에서 처음 발생한 10% 이상 양봉만 기준봉으로 잡고, 기준봉 이후 5일선 이탈 없이 당일 저가가 3/5일선 근처인 종목을 찾습니다.</div>
  </header>
  <main>
    <form class="toolbar" id="form">
      <label>시총 최소(억원)<input name="minMarketCapEok" type="number" min="0" value="3000"></label>
      <label>기준봉 기간(거래일)<input name="windowDays" type="number" min="2" max="20" value="5"></label>
      <label>일봉 상승률 최소(%)<input name="minRisePct" type="number" step="0.1" value="10"></label>
      <label>이평 허용폭(%)<input name="touchPct" type="number" step="0.1" value="1"></label>
      <button id="run" type="submit">검색</button>
    </form>
    <div class="status" id="status">검색 버튼을 누르면 최신 Naver Finance 데이터를 읽습니다.</div>
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>종목</th><th>코드</th><th>시장</th><th>일자</th><th>시총(억원)</th>
            <th>시가</th><th>저가</th><th>종가</th><th>기준봉일</th><th>기준봉 상승률</th><th>기준봉 이후</th><th>전일대비</th><th>3MA</th><th>5MA</th>
            <th>저가-3MA</th><th>저가-5MA</th><th>터치</th><th>거래량</th>
          </tr>
        </thead>
        <tbody id="tbody">
          <tr><td colspan="18" class="muted">아직 결과가 없습니다.</td></tr>
        </tbody>
      </table>
    </div>
  </main>
  <script>
    const form = document.querySelector("#form");
    const run = document.querySelector("#run");
    const statusEl = document.querySelector("#status");
    const tbody = document.querySelector("#tbody");
    const fmt = new Intl.NumberFormat("ko-KR");
    const pct = (n) => Number.isFinite(n) ? n.toFixed(2) + "%" : "";
    const price = (n) => Number.isFinite(n) ? fmt.format(Math.round(n)) : "";

    function rowHtml(row) {
      const url = "https://finance.naver.com/item/main.naver?code=" + row.code;
      return "<tr>" +
        "<td><a href='" + url + "' target='_blank' rel='noreferrer'>" + row.name + "</a></td>" +
        "<td>" + row.code + "</td>" +
        "<td>" + row.market + "</td>" +
        "<td>" + row.date + "</td>" +
        "<td>" + price(row.marketCapEok) + "</td>" +
        "<td>" + price(row.open) + "</td>" +
        "<td>" + price(row.low) + "</td>" +
        "<td>" + price(row.close) + "</td>" +
        "<td>" + row.triggerDate + "</td>" +
        "<td class='up'>" + pct(row.triggerRisePct) + "</td>" +
        "<td>" + row.barsAfterTrigger + "봉</td>" +
        "<td class='up'>" + pct(row.todayRisePct) + "</td>" +
        "<td>" + price(row.ma3) + "</td>" +
        "<td>" + price(row.ma5) + "</td>" +
        "<td>" + pct(row.lowToMa3Pct) + "</td>" +
        "<td>" + pct(row.lowToMa5Pct) + "</td>" +
        "<td>" + row.hit + "</td>" +
        "<td>" + price(row.volume) + "</td>" +
      "</tr>";
    }

    async function runScan(event) {
      event?.preventDefault();
      run.disabled = true;
      statusEl.textContent = "검색 중입니다. 시총 후보를 모은 뒤 개별 차트를 확인합니다...";
      tbody.innerHTML = "<tr><td colspan='18' class='muted'>로딩 중</td></tr>";

      try {
        const params = new URLSearchParams(new FormData(form));
        const started = performance.now();
        const res = await fetch("/api/scan?" + params.toString());
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        statusEl.textContent =
          "후보 " + fmt.format(data.scanned) + "개 검사, 결과 " +
          fmt.format(data.results.length) + "개 / " + seconds + "초 / 서버시각 " +
          new Date(data.updatedAt).toLocaleString("ko-KR");
        tbody.innerHTML = data.results.length
          ? data.results.map(rowHtml).join("")
          : "<tr><td colspan='18' class='muted'>조건에 맞는 종목이 없습니다.</td></tr>";
      } catch (error) {
        statusEl.textContent = "오류: " + error.message;
        tbody.innerHTML = "<tr><td colspan='18' class='muted'>검색 실패</td></tr>";
      } finally {
        run.disabled = false;
      }
    }

    form.addEventListener("submit", runScan);
  </script>
</body>
</html>`;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname === "/api/scan") {
        const data = await scan(url.searchParams);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
        return;
      }
      if (url.pathname === "/api/scan.csv") {
        const data = await scan(url.searchParams);
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"kr-stock-scanner.csv\"",
        });
        res.end(scanToCsv(data));
        return;
      }
      if (url.pathname === "/api/buy-recommendations") {
        const data = await fetchBuyRecommendations(url.searchParams);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
        return;
      }
      if (url.pathname === "/api/buy-recommendations.csv") {
        const data = await fetchBuyRecommendations(url.searchParams);
        res.writeHead(200, {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=\"buy-recommendations.csv\"",
        });
        res.end(buyRecommendationsToCsv(data));
        return;
      }
      if (url.pathname === "/api/recipients" && req.method === "GET") {
        const recipients = await readRecipients();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ recipients }));
        return;
      }
      if (url.pathname === "/api/recipients" && req.method === "POST") {
        const body = await readRequestJson(req);
        const recipients = await saveRecipient(body.email);
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify({ recipients }));
        return;
      }
      if (url.pathname === "/api/reports/run" && req.method === "POST") {
        const data = await runReportCollection();
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(data));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(renderDashboard());
    } catch (error) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(error.stack || error.message);
    }
  });

  server.listen(PORT, () => {
    console.log(`KR stock scanner running at http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = {
  scan,
  startServer,
};
