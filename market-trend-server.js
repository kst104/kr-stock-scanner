const http = require("http");
const { URL } = require("url");
const { computeMarketTrend } = require("./market-trend");

// 장세파악 전용 독립 서버 (기존 KR Stock Scanner와 분리, 별도 포트)
const PORT = process.env.TREND_PORT || 3100;

function noStoreHeaders(headers = {}) {
  return {
    ...headers,
    "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    Pragma: "no-cache",
    Expires: "0",
    "Surrogate-Control": "no-store",
  };
}

function renderPage() {
  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>장세파악 · 8종목</title>
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
    h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; }
    .sub { color: var(--muted); font-size: 13px; line-height: 1.5; }
    main { padding: 18px 24px 28px; display: grid; gap: 14px; }
    .bar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .actions { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
    button {
      height: 38px;
      border: 0;
      border-radius: 6px;
      padding: 0 16px;
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
    }
    button.ghost {
      background: #fff;
      color: var(--accent);
      border: 1px solid var(--line);
    }
    button:disabled { opacity: .55; cursor: wait; }
    .summary { display: flex; gap: 10px; flex-wrap: wrap; }
    .summary .card {
      flex: 1 1 120px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px 14px;
      display: grid;
      gap: 4px;
    }
    .summary .card .n { font-size: 26px; font-weight: 800; }
    .summary .card.bull { border-left: 4px solid #d92626; }
    .summary .card.bear { border-left: 4px solid #1d4ed8; }
    .summary .card.side { border-left: 4px solid #687583; }
    .status { min-height: 22px; color: var(--muted); font-size: 13px; }
    .tableWrap {
      overflow: auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    table { width: 100%; border-collapse: collapse; min-width: 1080px; font-size: 13px; }
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
    th:nth-child(1), td:nth-child(1),
    th:nth-child(2), td:nth-child(2) { text-align: left; }
    .up { color: var(--up); font-weight: 700; }
    .muted { color: var(--muted); }
    a { color: inherit; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-weight: 800;
      font-size: 13px;
      color: #fff;
    }
    .badge.bull { background: #d92626; }
    .badge.bear { background: #1d4ed8; }
    .badge.side { background: #687583; }
    .chk { font-weight: 700; }
    .chk.ok { color: #16a34a; }
    .chk.no { color: #b91c1c; }
    .src {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 4px;
      background: #eef2ff;
      color: #4338ca;
      font-size: 11px;
      font-weight: 700;
    }
    @media (max-width: 820px) {
      header, main { padding-left: 14px; padding-right: 14px; }
      button { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <h1>장세파악 · 8종목</h1>
    <div class="sub">KODEX200 · 삼성전자 · 삼성전기 · SK하이닉스 · 삼성물산 · SK스퀘어 · SK텔레콤 · 삼성생명<br>
    전일까지의 일봉으로 60/20일 이평선, 20일 이평 기울기, ADX(14)·+DI/-DI, RSI(14)를 계산해 상승/하락/횡보장을 판정합니다. 네이버금융 데이터가 부족하면 한국투자증권 KIS API로 자동 보완합니다.</div>
  </header>
  <main>
    <section class="bar">
      <div class="sub">매일 오전 8시 30분(Asia/Seoul)에 자동 갱신 · 페이지 로드시 즉시 계산</div>
      <div class="actions">
        <button id="fetch" type="button">데이터 받아오기</button>
        <button id="run" type="button" class="ghost">장세 새로고침</button>
      </div>
    </section>
    <div class="summary">
      <div class="card bull"><span class="muted">상승장</span><span class="n" id="cntBull">-</span></div>
      <div class="card bear"><span class="muted">하락장</span><span class="n" id="cntBear">-</span></div>
      <div class="card side"><span class="muted">횡보장</span><span class="n" id="cntSide">-</span></div>
    </div>
    <div class="status" id="status">장세 계산 중...</div>
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>장세</th><th>종목</th><th>기준일</th><th>종가</th><th>MA20</th><th>MA60</th>
            <th>종가-MA60</th><th>MA20 기울기</th><th>ADX(14)</th><th>+DI</th><th>-DI</th><th>RSI(14)</th>
            <th>추세</th><th>ADX/DI</th><th>RSI판정</th>
          </tr>
        </thead>
        <tbody id="tbody">
          <tr><td colspan="15" class="muted">장세 계산 중...</td></tr>
        </tbody>
      </table>
    </div>
  </main>
  <script>
    const runBtn = document.querySelector("#run");
    const fetchBtn = document.querySelector("#fetch");
    const statusEl = document.querySelector("#status");
    const tbody = document.querySelector("#tbody");
    const cntBull = document.querySelector("#cntBull");
    const cntBear = document.querySelector("#cntBear");
    const cntSide = document.querySelector("#cntSide");
    const fmt = new Intl.NumberFormat("ko-KR");
    let dailyTimer = null;

    const pct = (n) => Number.isFinite(n) ? n.toFixed(2) + "%" : "";
    const price = (n) => Number.isFinite(n) ? fmt.format(Math.round(n)) : "";
    const num1 = (n) => Number.isFinite(n) ? n.toFixed(1) : "-";
    const num2 = (n) => Number.isFinite(n) ? n.toFixed(2) : "-";
    const phaseClass = { bull: "bull", bear: "bear", sideways: "side" };
    const chk = (ok) => ok
      ? "<span class='chk ok'>충족</span>"
      : "<span class='chk no'>미충족</span>";

    function rowHtml(row) {
      if (row.error) {
        return "<tr><td class='muted'>-</td><td>" + row.name + "</td>" +
          "<td colspan='13' class='muted'>" + row.error + "</td></tr>";
      }
      const cls = phaseClass[row.phase] || "side";
      const srcTag = row.source === "kis" ? " <span class='src'>KIS</span>" : "";
      const url = "https://finance.naver.com/item/main.naver?code=" + row.code;
      const slopeArrow = row.slope20 > 0 ? "▲" : (row.slope20 < 0 ? "▼" : "—");
      const slopeCls = row.slope20 > 0 ? "up" : "muted";
      const b = row.checks.bull;
      const be = row.checks.bear;
      const trendOk = row.phase === "bear" ? be.trend : b.trend;
      const adxOk = row.phase === "bear" ? be.adx : b.adx;
      const rsiOk = row.phase === "bear" ? be.rsi : b.rsi;
      return "<tr>" +
        "<td><span class='badge " + cls + "'>" + row.phaseLabel + "</span></td>" +
        "<td><a href='" + url + "' target='_blank' rel='noreferrer'>" + row.name + "</a></td>" +
        "<td>" + (row.date || "-") + srcTag + "</td>" +
        "<td>" + price(row.close) + "</td>" +
        "<td>" + price(row.ma20) + "</td>" +
        "<td>" + price(row.ma60) + "</td>" +
        "<td class='" + (row.closeVsMa60Pct >= 0 ? "up" : "muted") + "'>" + pct(row.closeVsMa60Pct) + "</td>" +
        "<td class='" + slopeCls + "'>" + slopeArrow + " " + num2(row.slope20PctPerDay) + "%</td>" +
        "<td>" + num1(row.adx) + "</td>" +
        "<td>" + num1(row.plusDI) + "</td>" +
        "<td>" + num1(row.minusDI) + "</td>" +
        "<td>" + num1(row.rsi) + "</td>" +
        "<td>" + chk(trendOk) + "</td>" +
        "<td>" + chk(adxOk) + "</td>" +
        "<td>" + chk(rsiOk) + "</td>" +
      "</tr>";
    }

    async function run(force = false) {
      runBtn.disabled = true;
      fetchBtn.disabled = true;
      statusEl.textContent = force
        ? "네이버/KIS에서 데이터를 새로 받아오는 중입니다..."
        : "8종목 장세를 계산하는 중입니다...";
      tbody.innerHTML = "<tr><td colspan='15' class='muted'>로딩 중</td></tr>";
      try {
        const started = performance.now();
        const res = await fetch("/api/market-trend" + (force ? "?force=1" : ""));
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        tbody.innerHTML = data.results.map(rowHtml).join("");
        cntBull.textContent = data.summary.bull;
        cntBear.textContent = data.summary.bear;
        cntSide.textContent = data.summary.sideways;
        statusEl.textContent =
          (force ? "새로 받아옴 · " : "") +
          "기준일 " + (data.asOfDate || "-") + " (전일까지) / 계산시각 " +
          new Date(data.updatedAt).toLocaleString("ko-KR") +
          " / " + seconds + "초 / 매일 08:30 자동 갱신";
      } catch (error) {
        statusEl.textContent = "장세 계산 오류: " + error.message;
        tbody.innerHTML = "<tr><td colspan='15' class='muted'>계산 실패</td></tr>";
      } finally {
        runBtn.disabled = false;
        fetchBtn.disabled = false;
      }
    }

    function msUntilNextSeoul(hour, minute) {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(new Date());
      const get = (t) => Number(parts.find((p) => p.type === t).value);
      const nowSec = ((get("hour") % 24) * 3600) + (get("minute") * 60) + get("second");
      let delta = (hour * 3600 + minute * 60) - nowSec;
      if (delta <= 0) delta += 24 * 3600;
      return delta * 1000;
    }

    function scheduleDaily() {
      if (dailyTimer) clearTimeout(dailyTimer);
      dailyTimer = setTimeout(() => {
        run(true);
        scheduleDaily();
      }, msUntilNextSeoul(8, 30));
    }

    fetchBtn.addEventListener("click", () => run(true));
    runBtn.addEventListener("click", () => run(false));
    run();
    scheduleDaily();
  </script>
</body>
</html>`;
}

function startServer() {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    try {
      if (url.pathname === "/api/market-trend") {
        const force =
          url.searchParams.get("force") === "1" ||
          url.searchParams.get("refresh") === "1";
        const data = await computeMarketTrend({ force });
        res.writeHead(200, noStoreHeaders({ "Content-Type": "application/json; charset=utf-8" }));
        res.end(JSON.stringify(data));
        return;
      }
      res.writeHead(200, noStoreHeaders({ "Content-Type": "text/html; charset=utf-8" }));
      res.end(renderPage());
    } catch (error) {
      res.writeHead(500, noStoreHeaders({ "Content-Type": "text/plain; charset=utf-8" }));
      res.end(error.stack || error.message);
    }
  });

  server.listen(PORT, () => {
    console.log(`장세파악 서버 실행: http://localhost:${PORT}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = { startServer, renderPage };
