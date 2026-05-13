const fs = require("fs/promises");
const path = require("path");

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const DEFAULT_BASE_DIR =
  process.platform === "win32"
    ? "C:\\증권리포트분석"
    : path.join("/tmp", "증권리포트분석");
const BASE_DIR = process.env.REPORT_BASE_DIR || DEFAULT_BASE_DIR;
const NAVER_RESEARCH = "https://finance.naver.com/research";

function kstDateParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type).value;
  return {
    yyyy: get("year"),
    mm: get("month"),
    dd: get("day"),
  };
}

function todayFormats(date = new Date()) {
  const { yyyy, mm, dd } = kstDateParts(date);
  return {
    folder: `${yyyy}${mm}${dd}`,
    naver: `${yyyy.slice(2)}.${mm}.${dd}`,
  };
}

function dateFromValue(value) {
  return new Date(`${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T00:00:00+09:00`);
}

function normalizeDate(value) {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (/^\d{8}$/.test(String(value))) return dateFromValue(String(value));
  return new Date(value);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&middot;/g, "·")
    .replace(/&lsquo;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function stripTags(value) {
  return decodeHtml(String(value || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFileName(value) {
  return stripTags(value)
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`Fetch failed ${response.status}: ${url}`);
  const buffer = await response.arrayBuffer();
  return new TextDecoder("euc-kr").decode(buffer);
}

async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`PDF download failed ${response.status}: ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function parseRows(html, type, page) {
  const rows = [...html.matchAll(/<tr>\s*([\s\S]*?)\s*<\/tr>/g)].map((match) => match[1]);
  return rows
    .map((row) => {
      const cells = [...row.matchAll(/<td(?:\s[^>]*)?>([\s\S]*?)<\/td>/g)].map((match) => match[1]);
      if (cells.length < 6) return null;

      const titleMatch = cells[1].match(/<a\s+href="([^"]+)">([\s\S]*?)<\/a>/);
      const pdfMatch = cells[3].match(/<a\s+href="([^"]+\.pdf)"[^>]*>/);
      const date = stripTags(cells[4]);
      if (!titleMatch || !date) return null;

      const title = stripTags(titleMatch[2]);
      const category = stripTags(cells[0]);
      const detailPath = decodeHtml(titleMatch[1]);
      const detailUrl = detailPath.startsWith("http")
        ? detailPath
        : `${NAVER_RESEARCH}/${detailPath}`;

      return {
        type,
        category,
        subjectName: category,
        companyName: type === "company" ? category : "",
        industryName: type === "industry" ? category : "",
        title,
        securities: stripTags(cells[2]),
        date,
        detailUrl,
        pdfUrl: pdfMatch ? decodeHtml(pdfMatch[1]) : "",
        page,
      };
    })
    .filter(Boolean);
}

async function collectList(type, todayNaver) {
  const listPath = type === "industry" ? "industry_list.naver" : "company_list.naver";
  const collected = [];

  for (let page = 1; page <= 20; page += 1) {
    const html = await fetchText(`${NAVER_RESEARCH}/${listPath}?page=${page}`);
    const rows = parseRows(html, type, page);
    if (!rows.length) break;

    collected.push(...rows.filter((row) => row.date === todayNaver));
    if (rows.some((row) => row.date && row.date !== todayNaver)) break;
  }

  return collected;
}

async function downloadReports(reports, baseDir, folderDate) {
  const dayDir = path.join(baseDir, folderDate);
  const dirs = {
    industry: path.join(dayDir, "산업리포트"),
    company: path.join(dayDir, "기업리포트"),
  };
  await fs.mkdir(dirs.industry, { recursive: true });
  await fs.mkdir(dirs.company, { recursive: true });

  const output = [];
  for (const report of reports) {
    if (!report.pdfUrl) {
      output.push({ ...report, downloaded: false, filePath: "", error: "PDF link not found" });
      continue;
    }

    const prefix = report.type === "industry" ? "산업" : "기업";
    const subject = sanitizeFileName(report.subjectName || report.category || "");
    const subjectPart = subject ? `_${subject}` : "";
    const fileName = `${prefix}${subjectPart}_${report.securities}_${sanitizeFileName(report.title)}.pdf`;
    const filePath = path.join(dirs[report.type], fileName);

    try {
      const buffer = await fetchBuffer(report.pdfUrl);
      await fs.writeFile(filePath, buffer);
      output.push({ ...report, downloaded: true, filePath, error: "" });
    } catch (error) {
      output.push({ ...report, downloaded: false, filePath, error: error.message });
    }
  }
  return output;
}

async function collectReportsForDate(date) {
  const formats = todayFormats(date);
  const [industry, company] = await Promise.all([
    collectList("industry", formats.naver),
    collectList("company", formats.naver),
  ]);
  return { formats, industry, company, allReports: [...industry, ...company] };
}

async function runReportCollection(options = {}) {
  const fallbackDays = Number(options.fallbackDays || 0);
  const requestedDate = normalizeDate(options.date || new Date());
  let collected = null;

  for (let offset = 0; offset <= fallbackDays; offset += 1) {
    collected = await collectReportsForDate(addDays(requestedDate, -offset));
    if (collected.allReports.length || fallbackDays === 0) break;
  }

  const baseDir = options.baseDir || BASE_DIR;
  const reports = options.download === false
    ? collected.allReports
    : await downloadReports(collected.allReports, baseDir, collected.formats.folder);

  const summary = {
    requestedDate: todayFormats(requestedDate).folder,
    date: collected.formats.folder,
    naverDate: collected.formats.naver,
    baseDir,
    dayDir: path.join(baseDir, collected.formats.folder),
    industryCount: reports.filter((report) => report.type === "industry").length,
    companyCount: reports.filter((report) => report.type === "company").length,
    downloadedCount: reports.filter((report) => report.downloaded).length,
    reports,
    updatedAt: new Date().toISOString(),
  };

  await fs.mkdir(summary.dayDir, { recursive: true });
  await fs.writeFile(
    path.join(summary.dayDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
    "utf8"
  );

  return summary;
}

if (require.main === module) {
  runReportCollection()
    .then((summary) => {
      console.log(
        `Reports saved: industry=${summary.industryCount}, company=${summary.companyCount}, downloaded=${summary.downloadedCount}`
      );
      console.log(summary.dayDir);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  runReportCollection,
};
