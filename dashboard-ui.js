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
    }
    .reportGrid table { min-width: 620px; }
    .reportGrid h3 {
      margin: 0;
      padding: 10px 12px;
      font-size: 14px;
      background: #f9fafb;
      border-bottom: 1px solid var(--line);
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
    @media (max-width: 980px) {
      header, main { padding-left: 14px; padding-right: 14px; }
      .toolbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .emailbar { grid-template-columns: 1fr; }
      .reportbar { grid-template-columns: 1fr; }
      .reportGrid { grid-template-columns: 1fr; }
      button, .download { width: 100%; }
    }
  </style>
</head>
<body>
  <header>
    <h1>KR Stock Scanner</h1>
    <div class="sub">기준봉 이후 5일선 이탈 없이, 금일 저가가 3/5일선 근처인 종목을 검색합니다.</div>
  </header>
  <main>
    <form class="toolbar" id="form">
      <label>시총 최소(억원)<input name="minMarketCapEok" type="number" min="0" value="3000"></label>
      <label>기간(거래일)<input name="windowDays" type="number" min="2" max="20" value="5"></label>
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
        <h2>증권리포트</h2>
        <div class="sub">네이버 증권 산업리포트/기업리포트를 오늘 날짜 기준으로 수집해 C:\\증권리포트분석에 저장합니다.</div>
      </div>
      <button id="reportRun" type="button" class="secondary">오늘 리포트 수집</button>
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
    const industryReports = document.querySelector("#industryReports");
    const companyReports = document.querySelector("#companyReports");
    const fmt = new Intl.NumberFormat("ko-KR");
    let realtimeTimer = null;
    let realtimeOn = false;

    const pct = (n) => Number.isFinite(n) ? n.toFixed(2) + "%" : "";
    const price = (n) => Number.isFinite(n) ? fmt.format(Math.round(n)) : "";
    const params = () => new URLSearchParams(new FormData(form));

    function syncDownload() {
      download.href = "/api/scan.csv?" + params().toString();
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

    async function runReports() {
      reportRun.disabled = true;
      reportStatus.textContent = "오늘 리포트를 수집하고 PDF를 다운로드하는 중입니다...";
      try {
        const res = await fetch("/api/reports/run", { method: "POST" });
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

    form.addEventListener("submit", runScan);
    form.addEventListener("input", syncDownload);
    realtime.addEventListener("click", toggleRealtime);
    reportRun.addEventListener("click", runReports);
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
