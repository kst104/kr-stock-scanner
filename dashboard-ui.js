function renderDashboard() {
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
      --accent2: #334155;
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
    h1 {
      margin: 0 0 4px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0;
    }
    .sub { color: var(--muted); font-size: 13px; }
    main {
      padding: 18px 24px 28px;
      display: grid;
      gap: 14px;
    }
    .toolbar, .emailbar {
      display: grid;
      gap: 10px;
      align-items: end;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .toolbar { grid-template-columns: repeat(4, minmax(120px, 1fr)) auto auto auto; }
    .emailbar { grid-template-columns: minmax(220px, 1fr) auto minmax(260px, 2fr); }
    .reportbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .reportbar h2 {
      margin: 0 0 4px;
      font-size: 16px;
      letter-spacing: 0;
    }
    .reportActions {
      display: flex;
      gap: 8px;
      align-items: end;
      justify-content: flex-end;
      flex-wrap: wrap;
    }
    .reportActions label { min-width: 160px; }
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
    button, .download {
      height: 38px;
      border: 0;
      border-radius: 6px;
      padding: 0 14px;
      background: var(--accent);
      color: #fff;
      font-weight: 700;
      cursor: pointer;
      display: inline-grid;
      place-items: center;
      text-decoration: none;
      white-space: nowrap;
    }
    .secondary { background: var(--accent2); }
    .ghost {
      background: #fff;
      color: var(--accent2);
      border: 1px solid var(--line);
    }
    button:disabled { opacity: .55; cursor: wait; }
    .status {
      min-height: 22px;
      color: var(--muted);
      font-size: 13px;
    }
    .recipients {
      align-self: center;
      color: var(--muted);
      font-size: 13px;
      line-height: 1.5;
      overflow-wrap: anywhere;
    }
    .tableWrap {
      overflow: auto;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
    }
    .reportGrid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      align-items: stretch;
    }
    .reportGrid.resizable {
      grid-template-columns: minmax(320px, var(--report-left, 50%)) 10px minmax(320px, 1fr);
      gap: 0;
    }
    .reportGrid .tableWrap {
      min-width: 0;
    }
    .reportGrid.resizable .tableWrap {
      border-radius: 0;
    }
    .reportGrid.resizable .tableWrap:first-child {
      border-radius: 8px 0 0 8px;
    }
    .reportGrid.resizable .tableWrap:last-child {
      border-radius: 0 8px 8px 0;
    }
    .reportResizer {
      cursor: col-resize;
      background: linear-gradient(90deg, transparent 0 3px, var(--line) 3px 7px, transparent 7px 10px);
      touch-action: none;
    }
    .reportResizer:hover,
    .reportGrid.resizing .reportResizer {
      background: linear-gradient(90deg, transparent 0 2px, var(--accent) 2px 8px, transparent 8px 10px);
    }
    .reportGrid table { min-width: 720px; }
    .reportGrid h3 {
      margin: 0;
      padding: 10px 12px;
      font-size: 14px;
      background: #f9fafb;
      border-bottom: 1px solid var(--line);
    }
    .reportGrid th:first-child,
    .reportGrid td:first-child {
      position: sticky;
      left: 0;
      min-width: 150px;
      max-width: 220px;
      background: #fff;
      box-shadow: 1px 0 0 var(--line);
      z-index: 2;
      white-space: normal;
      word-break: keep-all;
      overflow-wrap: anywhere;
    }
    .reportGrid th:first-child {
      background: #f9fafb;
      z-index: 3;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 1220px;
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
    th:nth-child(3), td:nth-child(3) { text-align: left; }
    .up { color: var(--up); font-weight: 700; }
    .muted { color: var(--muted); }
    a { color: inherit; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .trendbar {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 10px;
      align-items: center;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 14px;
    }
    .trendbar h2 { margin: 0 0 4px; font-size: 18px; }
    .trendActions { display: flex; gap: 8px; align-items: center; }
    .summary {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
    }
    .summary .card {
      flex: 1 1 120px;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px 14px;
      display: grid;
      gap: 4px;
    }
    .summary .card .n { font-size: 24px; font-weight: 800; }
    .summary .card.bull { border-left: 4px solid #d92626; }
    .summary .card.bear { border-left: 4px solid #1d4ed8; }
    .summary .card.side { border-left: 4px solid #687583; }
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
    #trendTable { min-width: 1080px; }
    #trendTable td:nth-child(2), #trendTable th:nth-child(2) { text-align: left; }
    @media (max-width: 980px) {
      header, main { padding-left: 14px; padding-right: 14px; }
      .toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .emailbar { grid-template-columns: 1fr; }
      .reportbar { grid-template-columns: 1fr; }
      .reportActions { justify-content: stretch; }
      .reportActions label { min-width: 0; }
      .reportGrid, .reportGrid.resizable { grid-template-columns: 1fr; gap: 14px; }
      .reportGrid .tableWrap { border-radius: 8px; }
      .reportResizer { display: none; }
      button, .download { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <h1>KR Stock Scanner</h1>
    <div class="sub">오늘 제외 최근 20거래일에서 처음 발생한 10% 이상 양봉만 기준봉으로 인정하고, 이후 5일선 이탈 없이 금일 저가가 3/5일선 근처인 종목을 검색합니다.</div>
  </header>
  <main>
    <section class="trendbar">
      <div>
        <h2>장세파악 (8종목)</h2>
        <div class="sub">KODEX200 · 삼성전자 · 삼성전기 · SK하이닉스 · 삼성물산 · SK스퀘어 · SK텔레콤 · 삼성생명 — 전일까지의 일봉으로 60/20일 이평, ADX(14)·DI, RSI(14)를 계산해 상승/하락/횡보장을 판정합니다.</div>
      </div>
      <div class="trendActions">
        <button id="trendRun" type="button">장세 새로고침</button>
      </div>
    </section>
    <div class="summary" id="trendSummary">
      <div class="card bull"><span class="muted">상승장</span><span class="n" id="cntBull">-</span></div>
      <div class="card bear"><span class="muted">하락장</span><span class="n" id="cntBear">-</span></div>
      <div class="card side"><span class="muted">횡보장</span><span class="n" id="cntSide">-</span></div>
    </div>
    <div class="status" id="trendStatus">매일 오전 8시 30분에 자동으로 갱신됩니다. (페이지 로드시 즉시 계산)</div>
    <div class="tableWrap">
      <table id="trendTable">
        <thead>
          <tr>
            <th>장세</th><th>종목</th><th>기준일</th><th>종가</th><th>MA20</th><th>MA60</th>
            <th>종가-MA60</th><th>MA20 기울기</th><th>ADX(14)</th><th>+DI</th><th>-DI</th><th>RSI(14)</th>
            <th>추세</th><th>ADX/DI</th><th>RSI판정</th>
          </tr>
        </thead>
        <tbody id="trendBody">
          <tr><td colspan="15" class="muted">장세 계산 중...</td></tr>
        </tbody>
      </table>
    </div>
    <form class="toolbar" id="form">
      <label>시총 최소(억원)<input name="minMarketCapEok" type="number" min="0" value="3000"></label>
      <label>기준봉 기간(거래일)<input name="windowDays" type="number" min="2" max="20" value="5"></label>
      <label>기준봉 상승률(%)<input name="minRisePct" type="number" step="0.1" value="10"></label>
      <label>이평 허용폭(%)<input name="touchPct" type="number" step="0.1" value="1"></label>
      <button id="run" type="submit">검색</button>
      <button id="realtime" class="secondary" type="button">실시간 검색 시작</button>
      <a id="download" class="download ghost" href="/api/scan.csv">CSV 다운로드</a>
    </form>
    <form class="emailbar" id="emailForm">
      <label>추가 수신 이메일<input id="email" name="email" type="email" placeholder="name@example.com"></label>
      <button type="submit" class="secondary">이메일 추가</button>
      <div id="recipients" class="recipients">수신자 불러오는 중</div>
    </form>
    <div class="status" id="status">검색 버튼을 누르면 최신 데이터를 읽습니다.</div>
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>종목</th><th>코드</th><th>시장</th><th>일자</th><th>시총(억원)</th>
            <th>시가</th><th>저가</th><th>종가</th><th>기준봉일</th><th>기준봉 상승률</th>
            <th>기준봉 이후</th><th>전일대비</th><th>3MA</th><th>5MA</th>
            <th>저가-3MA</th><th>저가-5MA</th><th>터치</th><th>거래량</th>
          </tr>
        </thead>
        <tbody id="tbody">
          <tr><td colspan="18" class="muted">아직 결과가 없습니다.</td></tr>
        </tbody>
      </table>
    </div>
    <section class="reportbar">
      <div>
        <h2>매수추천</h2>
        <div class="sub">WiseReport 기업 리포트에서 검색일 기준 투자의견이 매수이고 목표주가가 상향된 종목만 추립니다.</div>
      </div>
      <div class="reportActions">
        <label>검색일<input id="buyDate" type="date"></label>
        <button id="buyRun" type="button" class="secondary">매수추천 검색</button>
        <a id="buyDownload" class="download ghost" href="/api/buy-recommendations.csv">CSV 다운로드</a>
      </div>
    </section>
    <div class="status" id="buyStatus">검색 버튼을 누르면 WiseReport 매수추천 목록을 읽습니다.</div>
    <div class="tableWrap">
      <table>
        <thead>
          <tr>
            <th>종목명</th><th>코드</th><th>투자의견</th><th>목표주가변동</th><th>목표가격</th><th>현재종가</th>
            <th>상승여력</th><th>상승률</th><th>증권사</th><th>리포트명</th>
          </tr>
        </thead>
        <tbody id="buyRecommendations">
          <tr><td colspan="10" class="muted">아직 검색 결과가 없습니다.</td></tr>
        </tbody>
      </table>
    </div>
    <section class="reportbar">
      <div>
        <h2>증권리포트</h2>
        <div class="sub">네이버 증권 산업리포트/기업리포트를 오늘 날짜 기준으로 수집해 C:\\증권리포트분석에 저장합니다.</div>
      </div>
      <button id="reportRun" type="button" class="secondary">리포트 수집</button>
    </section>
    <div class="status" id="reportStatus">매일 오전 10시에 자동 수집되도록 설정됩니다.</div>
    <div class="reportGrid">
      <div class="tableWrap">
        <h3>산업리포트</h3>
        <table>
          <thead><tr><th>산업명</th><th>리포트명</th><th>증권사</th><th>날짜</th><th>링크</th></tr></thead>
          <tbody id="industryReports"><tr><td colspan="5" class="muted">아직 수집 결과가 없습니다.</td></tr></tbody>
        </table>
      </div>
      <div class="tableWrap">
        <h3>기업리포트</h3>
        <table>
          <thead><tr><th>기업명</th><th>리포트명</th><th>증권사</th><th>날짜</th><th>링크</th></tr></thead>
          <tbody id="companyReports"><tr><td colspan="5" class="muted">아직 수집 결과가 없습니다.</td></tr></tbody>
        </table>
      </div>
    </div>
  </main>
  <script>
    const form = document.querySelector("#form");
    const emailForm = document.querySelector("#emailForm");
    const run = document.querySelector("#run");
    const realtime = document.querySelector("#realtime");
    const download = document.querySelector("#download");
    const statusEl = document.querySelector("#status");
    const tbody = document.querySelector("#tbody");
    const recipientsEl = document.querySelector("#recipients");
    const reportRun = document.querySelector("#reportRun");
    const reportStatus = document.querySelector("#reportStatus");
    const reportGrid = document.querySelector(".reportGrid");
    const industryReports = document.querySelector("#industryReports");
    const companyReports = document.querySelector("#companyReports");
    const buyDate = document.querySelector("#buyDate");
    const buyRun = document.querySelector("#buyRun");
    const buyDownload = document.querySelector("#buyDownload");
    const buyStatus = document.querySelector("#buyStatus");
    const buyRecommendations = document.querySelector("#buyRecommendations");
    const trendRun = document.querySelector("#trendRun");
    const trendStatus = document.querySelector("#trendStatus");
    const trendBody = document.querySelector("#trendBody");
    const cntBull = document.querySelector("#cntBull");
    const cntBear = document.querySelector("#cntBear");
    const cntSide = document.querySelector("#cntSide");
    const fmt = new Intl.NumberFormat("ko-KR");
    let realtimeTimer = null;
    let realtimeOn = false;
    let trendDailyTimer = null;

    const pct = (n) => Number.isFinite(n) ? n.toFixed(2) + "%" : "";
    const price = (n) => Number.isFinite(n) ? fmt.format(Math.round(n)) : "";
    const params = () => new URLSearchParams(new FormData(form));

    function setupReportResizer() {
      if (!reportGrid || reportGrid.dataset.resizerReady === "1") return;
      const resizer = document.createElement("div");
      resizer.className = "reportResizer";
      resizer.id = "reportResizer";
      resizer.setAttribute("role", "separator");
      resizer.setAttribute("aria-label", "리포트 표 너비 조절");
      resizer.setAttribute("aria-orientation", "vertical");
      resizer.tabIndex = 0;
      reportGrid.insertBefore(resizer, reportGrid.children[1]);
      reportGrid.classList.add("resizable");
      reportGrid.dataset.resizerReady = "1";

      const saved = localStorage.getItem("reportGridLeft");
      if (saved) reportGrid.style.setProperty("--report-left", saved);

      function setLeftFromClientX(clientX) {
        const rect = reportGrid.getBoundingClientRect();
        const pctValue = Math.min(75, Math.max(25, ((clientX - rect.left) / rect.width) * 100));
        const value = pctValue.toFixed(1) + "%";
        reportGrid.style.setProperty("--report-left", value);
        localStorage.setItem("reportGridLeft", value);
      }

      resizer.addEventListener("pointerdown", (event) => {
        if (window.matchMedia("(max-width: 980px)").matches) return;
        event.preventDefault();
        resizer.setPointerCapture(event.pointerId);
        reportGrid.classList.add("resizing");
      });
      resizer.addEventListener("pointermove", (event) => {
        if (!reportGrid.classList.contains("resizing")) return;
        setLeftFromClientX(event.clientX);
      });
      resizer.addEventListener("pointerup", (event) => {
        reportGrid.classList.remove("resizing");
        if (resizer.hasPointerCapture(event.pointerId)) resizer.releasePointerCapture(event.pointerId);
      });
      resizer.addEventListener("keydown", (event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const current = parseFloat(getComputedStyle(reportGrid).getPropertyValue("--report-left")) || 50;
        const next = current + (event.key === "ArrowRight" ? 2 : -2);
        const value = Math.min(75, Math.max(25, next)).toFixed(1) + "%";
        reportGrid.style.setProperty("--report-left", value);
        localStorage.setItem("reportGridLeft", value);
      });
    }

    function syncDownload() {
      download.href = "/api/scan.csv?" + params().toString();
    }

    function todayInputValue() {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Seoul",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const get = (type) => parts.find((part) => part.type === type).value;
      return get("year") + "-" + get("month") + "-" + get("day");
    }

    function buyDateValue() {
      return (buyDate.value || todayInputValue()).replaceAll("-", "");
    }

    function syncBuyDownload() {
      buyDownload.href = "/api/buy-recommendations.csv?date=" + encodeURIComponent(buyDateValue()) + "&fallbackDays=7";
    }

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

    async function loadRecipients() {
      const res = await fetch("/api/recipients");
      const data = await res.json();
      recipientsEl.textContent = "Gmail 수신자: " + data.recipients.join(", ");
    }

    function reportRowHtml(row) {
      const link = row.pdfUrl || row.detailUrl;
      const subject = row.subjectName || row.companyName || row.industryName || row.category || "";
      return "<tr>" +
        "<td>" + subject + "</td>" +
        "<td>" + row.title + "</td>" +
        "<td>" + row.securities + "</td>" +
        "<td>" + row.date + "</td>" +
        "<td><a href='" + link + "' target='_blank' rel='noreferrer'>열기</a></td>" +
      "</tr>";
    }

    function renderReports(reports) {
      const industry = reports.filter((row) => row.type === "industry");
      const company = reports.filter((row) => row.type === "company");
      industryReports.innerHTML = industry.length
        ? industry.map(reportRowHtml).join("")
        : "<tr><td colspan='5' class='muted'>오늘 산업리포트가 없습니다.</td></tr>";
      companyReports.innerHTML = company.length
        ? company.map(reportRowHtml).join("")
        : "<tr><td colspan='5' class='muted'>오늘 기업리포트가 없습니다.</td></tr>";
    }

    function buyRowHtml(row) {
      const url = "https://finance.naver.com/item/main.naver?code=" + row.code;
      return "<tr>" +
        "<td><a href='" + url + "' target='_blank' rel='noreferrer'>" + row.stockName + "</a></td>" +
        "<td>" + row.code + "</td>" +
        "<td>" + row.opinion + "</td>" +
        "<td class='up'>" + row.targetPriceChange + "</td>" +
        "<td>" + price(row.targetPrice) + "</td>" +
        "<td>" + price(row.currentClose) + "</td>" +
        "<td class='up'>" + price(row.upsideAmount) + "</td>" +
        "<td class='up'>" + pct(row.upsidePct) + "</td>" +
        "<td>" + row.broker + "</td>" +
        "<td>" + row.title + "</td>" +
      "</tr>";
    }

    function renderBuyRecommendations(rows) {
      buyRecommendations.innerHTML = rows.length
        ? rows.map(buyRowHtml).join("")
        : "<tr><td colspan='10' class='muted'>검색일에 조건을 만족하는 매수추천 종목이 없습니다.</td></tr>";
    }

    async function runBuyRecommendations() {
      syncBuyDownload();
      buyRun.disabled = true;
      buyStatus.textContent = "WiseReport 매수추천 목록을 읽는 중입니다...";
      buyRecommendations.innerHTML = "<tr><td colspan='10' class='muted'>로딩 중</td></tr>";
      try {
        const started = performance.now();
        const res = await fetch("/api/buy-recommendations?date=" + encodeURIComponent(buyDateValue()) + "&fallbackDays=7");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        renderBuyRecommendations(data.results);
        buyStatus.textContent =
          "검색일 " + data.reportDate + " / 리포트 " + fmt.format(data.scanned) +
          "건 중 목표주가 상향 매수추천 " + fmt.format(data.results.length) + "건 / " + seconds + "초";
      } catch (error) {
        buyStatus.textContent = "매수추천 검색 오류: " + error.message;
        buyRecommendations.innerHTML = "<tr><td colspan='10' class='muted'>검색 실패</td></tr>";
      } finally {
        buyRun.disabled = false;
      }
    }

    async function runReports() {
      reportRun.disabled = true;
      reportStatus.textContent = "오늘 리포트를 수집하고 PDF를 다운로드하는 중입니다...";
      try {
        const res = await fetch("/api/reports/run?fallbackDays=7", { method: "POST" });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        renderReports(data.reports);
        reportStatus.textContent =
          "저장 완료: 산업리포트 " + data.industryCount + "개, 기업리포트 " +
          data.companyCount + "개, PDF " + data.downloadedCount + "개 / " + data.dayDir;
      } catch (error) {
        reportStatus.textContent = "리포트 수집 오류: " + error.message;
      } finally {
        reportRun.disabled = false;
      }
    }

    async function runScan(event, source = "manual") {
      event?.preventDefault();
      syncDownload();
      run.disabled = true;
      statusEl.textContent = source === "realtime"
        ? "실시간 검색 중입니다..."
        : "검색 중입니다...";
      tbody.innerHTML = "<tr><td colspan='18' class='muted'>로딩 중</td></tr>";

      try {
        const started = performance.now();
        const res = await fetch("/api/scan?" + params().toString());
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        const seconds = ((performance.now() - started) / 1000).toFixed(1);
        const realtimeText = realtimeOn ? " / 실시간 검색 켜짐(10분)" : "";
        statusEl.textContent =
          "후보 " + fmt.format(data.scanned) + "개 검사, 결과 " +
          fmt.format(data.results.length) + "개 / " + seconds + "초 / 서버시각 " +
          new Date(data.updatedAt).toLocaleString("ko-KR") + realtimeText;
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

    function toggleRealtime() {
      realtimeOn = !realtimeOn;
      realtime.textContent = realtimeOn ? "실시간 검색 중지" : "실시간 검색 시작";
      realtime.classList.toggle("ghost", realtimeOn);
      if (realtimeTimer) clearInterval(realtimeTimer);
      if (realtimeOn) {
        runScan(null, "realtime");
        realtimeTimer = setInterval(() => runScan(null, "realtime"), 10 * 60 * 1000);
      }
    }

    const phaseClass = { bull: "bull", bear: "bear", sideways: "side" };
    const num1 = (n) => Number.isFinite(n) ? n.toFixed(1) : "-";
    const num2 = (n) => Number.isFinite(n) ? n.toFixed(2) : "-";
    const chk = (ok) => ok
      ? "<span class='chk ok'>충족</span>"
      : "<span class='chk no'>미충족</span>";

    function trendRowHtml(row) {
      if (row.error) {
        return "<tr><td class='muted'>-</td><td>" + row.name + "</td>" +
          "<td colspan='13' class='muted'>" + row.error + "</td></tr>";
      }
      const cls = phaseClass[row.phase] || "side";
      const url = "https://finance.naver.com/item/main.naver?code=" + row.code;
      const slopeArrow = row.slope20 > 0 ? "▲" : (row.slope20 < 0 ? "▼" : "—");
      const slopeCls = row.slope20 > 0 ? "up" : "muted";
      const b = row.checks.bull;
      const be = row.checks.bear;
      // 판정에 실제로 쓰인 방향의 충족 여부를 표시
      const trendOk = row.phase === "bear" ? be.trend : b.trend;
      const adxOk = row.phase === "bear" ? be.adx : b.adx;
      const rsiOk = row.phase === "bear" ? be.rsi : b.rsi;
      return "<tr>" +
        "<td><span class='badge " + cls + "'>" + row.phaseLabel + "</span></td>" +
        "<td><a href='" + url + "' target='_blank' rel='noreferrer'>" + row.name + "</a></td>" +
        "<td>" + (row.date || "-") + "</td>" +
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

    async function runTrend() {
      trendRun.disabled = true;
      trendStatus.textContent = "8종목 장세를 계산하는 중입니다...";
      trendBody.innerHTML = "<tr><td colspan='15' class='muted'>로딩 중</td></tr>";
      try {
        const res = await fetch("/api/market-trend");
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        trendBody.innerHTML = data.results.map(trendRowHtml).join("");
        cntBull.textContent = data.summary.bull;
        cntBear.textContent = data.summary.bear;
        cntSide.textContent = data.summary.sideways;
        trendStatus.textContent =
          "기준일 " + (data.asOfDate || "-") + " (전일까지) / 계산시각 " +
          new Date(data.updatedAt).toLocaleString("ko-KR") +
          " / 매일 08:30 자동 갱신";
      } catch (error) {
        trendStatus.textContent = "장세 계산 오류: " + error.message;
        trendBody.innerHTML = "<tr><td colspan='15' class='muted'>계산 실패</td></tr>";
      } finally {
        trendRun.disabled = false;
      }
    }

    // 매일 오전 8시 30분(Asia/Seoul)에 자동 갱신되도록 예약
    function msUntilNextSeoul(hour, minute) {
      const now = new Date();
      const fmtParts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Seoul",
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).formatToParts(now);
      const get = (t) => Number(fmtParts.find((p) => p.type === t).value);
      const nowSec = ((get("hour") % 24) * 3600) + (get("minute") * 60) + get("second");
      const targetSec = (hour * 3600) + (minute * 60);
      let delta = targetSec - nowSec;
      if (delta <= 0) delta += 24 * 3600;
      return delta * 1000;
    }

    function scheduleDailyTrend() {
      if (trendDailyTimer) clearTimeout(trendDailyTimer);
      const wait = msUntilNextSeoul(8, 30);
      trendDailyTimer = setTimeout(() => {
        runTrend();
        scheduleDailyTrend();
      }, wait);
    }

    trendRun.addEventListener("click", runTrend);

    form.addEventListener("submit", runScan);
    form.addEventListener("input", syncDownload);
    realtime.addEventListener("click", toggleRealtime);
    reportRun.addEventListener("click", runReports);
    buyRun.addEventListener("click", runBuyRecommendations);
    buyDate.addEventListener("input", syncBuyDownload);
    emailForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const email = document.querySelector("#email").value.trim();
      if (!email) return;
      const res = await fetch("/api/recipients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        statusEl.textContent = "이메일 추가 오류: " + await res.text();
        return;
      }
      document.querySelector("#email").value = "";
      await loadRecipients();
      statusEl.textContent = "수신 이메일을 추가했습니다. 다음 Gmail 자동 발송부터 포함됩니다.";
    });

    syncDownload();
    setupReportResizer();
    runTrend();
    scheduleDailyTrend();
    buyDate.value = todayInputValue();
    syncBuyDownload();
    loadRecipients().catch(() => {
      recipientsEl.textContent = "수신자 목록을 불러오지 못했습니다.";
    });
  </script>
</body>
</html>`;
}

module.exports = {
  renderDashboard,
};
