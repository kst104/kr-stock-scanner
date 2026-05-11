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
      const targetPrice = toNumber(cells[3]);
      const currentClose = toNumber(cells[4]);
      const title = stripTags(cells[5]);

      if (!Number.isFinite(targetPrice) || !Number.isFinite(currentClose)) return null;
      return {
        stockName,
        code,
        broker,
        opinion,
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
  const html = await fetchWiseReportHtml(requestedDate);
  const reportDate = selectedDateFromHtml(html, requestedDate);
  const allReports = parseReportRows(html);
  const results = allReports
    .filter(
      (row) => isBuyOpinion(row.opinion) && row.targetPrice > row.currentClose
    )
    .sort((a, b) => b.upsidePct - a.upsidePct);

  return {
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
