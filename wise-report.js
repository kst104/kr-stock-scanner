const WISE_REPORT_URL =
  "https://comp.wisereport.co.kr/wiseReport/summary/ReportSummary.aspx";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function kstDateValue(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}${get("month")}${get("day")}`;
}

function dateFromValue(value) {
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00+09:00`);
}

function addDaysValue(value, days) {
  const date = dateFromValue(value);
  date.setUTCDate(date.getUTCDate() + days);
  return kstDateValue(date);
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function toNumber(value) {
  const cleaned = stripTags(value).replace(/,/g, "").trim();
  return cleaned ? Number(cleaned) : NaN;
}

function parseTargetPriceChange(value) {
  const text = decodeHtml(value);
  if (/typ1\.gif|목표주가\s*상향/.test(text)) return "상향";
  if (/typ3\.gif|목표주가\s*하향/.test(text)) return "하향";
  if (/typ2\.gif|변동없음/.test(text)) return "변동없음";
  return "";
}

async function fetchWiseReportHtml(dateValue) {
  const url = new URL(WISE_REPORT_URL);
  url.searchParams.set("fmt", "1");
  if (dateValue) url.searchParams.set("ee", dateValue);

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`WiseReport fetch failed ${response.status}`);
  return response.text();
}

function selectedDateFromHtml(html, fallback) {
  const selected = html.match(/<option\s+selected="selected"\s+value="(\d{8})">/);
  return selected ? selected[1] : fallback;
}

function parseReportRows(html) {
  const rows = [...html.matchAll(/<tr[^>]*class="itm_t[^"]*"[^>]*>([\s\S]*?)<\/tr>/g)];
  return rows
    .map((match) => {
      const cells = [...match[1].matchAll(/<(?:th|td)\b[^>]*>([\s\S]*?)<\/(?:th|td)>/g)].map(
        (cell) => cell[1]
      );
      if (cells.length < 7) return null;

      const stockMatch =
        cells[0].match(/title="([^"]+)\(([0-9A-Z]+)\)"/) ||
        cells[0].match(/<span[^>]*>([^<]+)<\/span>[\s\S]*?\(([0-9A-Z]+)\)/);
      if (!stockMatch) return null;

      const stockName = stripTags(stockMatch[1]);
      const code = stockMatch[2];
      const broker = stripTags(cells[1]).replace(/\[[^\]]+\]/g, "").trim();
      const opinion = stripTags(cells[2]);
      const targetPriceChange = parseTargetPriceChange(cells[3]);
      const targetPrice = toNumber(cells[3]);
      const currentClose = toNumber(cells[4]);
      const title = stripTags(cells[5]);

      if (!Number.isFinite(targetPrice) || !Number.isFinite(currentClose)) return null;
      return {
        stockName,
        code,
        broker,
        opinion,
        targetPriceChange,
        targetPriceRaised: targetPriceChange === "상향",
        targetPrice,
        currentClose,
        upsideAmount: targetPrice - currentClose,
        upsidePct: ((targetPrice - currentClose) / currentClose) * 100,
        title,
      };
    })
    .filter(Boolean);
}

function isBuyOpinion(opinion) {
  return /매수|buy/i.test(opinion);
}

async function fetchBuyRecommendations(params = new URLSearchParams()) {
  const requestedDate = params.get("date") || kstDateValue();
  const fallbackDays = Number(params.get("fallbackDays") || 0);
  let html = "";
  let reportDate = requestedDate;
  let allReports = [];
  let results = [];

  for (let offset = 0; offset <= fallbackDays; offset += 1) {
    const dateValue = addDaysValue(requestedDate, -offset);
    html = await fetchWiseReportHtml(dateValue);
    reportDate = selectedDateFromHtml(html, dateValue);
    allReports = parseReportRows(html);
    results = allReports
      .filter(
        (row) =>
          isBuyOpinion(row.opinion) &&
          row.targetPriceRaised &&
          row.targetPrice > row.currentClose
      )
      .sort((a, b) => b.upsidePct - a.upsidePct);

    if (results.length || fallbackDays === 0) break;
  }

  return {
    requestedDate,
    reportDate,
    sourceUrl: `${WISE_REPORT_URL}?fmt=1&ee=${reportDate}`,
    updatedAt: new Date().toISOString(),
    scanned: allReports.length,
    results,
  };
}

module.exports = {
  fetchBuyRecommendations,
};
