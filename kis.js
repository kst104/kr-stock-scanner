const fs = require("fs");
const path = require("path");

// 한국투자증권 KIS Open API 연동 (네이버금융 데이터 부족시 폴백)
// 자격증명은 환경변수(KIS_APP_KEY / KIS_APP_SECRET) 또는
// 로컬 미추적 파일(kis-config.json)에서 읽는다. 저장소에 커밋하지 않는다.

const CONFIG_FILE = path.join(__dirname, "kis-config.json");
const TOKEN_FILE = path.join(__dirname, ".kis-token.json");
const BASE = process.env.KIS_BASE || "https://openapi.koreainvestment.com:9443";

function loadConfig() {
  let appkey = process.env.KIS_APP_KEY;
  let appsecret = process.env.KIS_APP_SECRET;
  if ((!appkey || !appsecret) && fs.existsSync(CONFIG_FILE)) {
    try {
      const j = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
      appkey = appkey || j.appkey || j.appKey || j.KIS_APP_KEY;
      appsecret = appsecret || j.appsecret || j.appSecret || j.KIS_APP_SECRET;
    } catch {
      /* ignore malformed config */
    }
  }
  return { appkey, appsecret };
}

function isConfigured() {
  const { appkey, appsecret } = loadConfig();
  return Boolean(appkey && appsecret);
}

let memToken = null; // { token, expiresAt }

function readTokenFile() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, "utf8"));
  } catch {
    return null;
  }
}

function writeTokenFile(data) {
  try {
    fs.writeFileSync(TOKEN_FILE, JSON.stringify(data));
  } catch {
    /* best effort - token cache is optional */
  }
}

// KIS 접근토큰은 24시간 유효하고 발급은 분당 1회로 제한되므로
// 메모리 + 로컬파일에 캐시해 재사용한다.
async function getToken() {
  const now = Date.now();
  if (memToken && memToken.expiresAt - 60000 > now) return memToken.token;

  const cached = readTokenFile();
  if (cached && cached.token && cached.expiresAt - 60000 > now) {
    memToken = cached;
    return cached.token;
  }

  const { appkey, appsecret } = loadConfig();
  if (!appkey || !appsecret) throw new Error("KIS 자격증명이 설정되지 않았습니다.");

  const res = await fetch(`${BASE}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", appkey, appsecret }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`KIS 토큰 발급 실패 ${res.status}: ${text}`);
  const json = JSON.parse(text);
  if (!json.access_token) throw new Error(`KIS 토큰 응답 이상: ${text}`);

  const expiresInMs = (Number(json.expires_in) || 86400) * 1000;
  memToken = { token: json.access_token, expiresAt: now + expiresInMs };
  writeTokenFile(memToken);
  return memToken.token;
}

function seoulYmd(offsetDays = 0) {
  const target = new Date(Date.now() + offsetDays * 86400000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(target);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("year")}${get("month")}${get("day")}`;
}

// 국내주식 기간별 일봉 시세 (FHKST03010100). 최근 약 100거래일 반환.
async function fetchDailyChart(code) {
  const token = await getToken();
  const { appkey, appsecret } = loadConfig();
  const url = new URL(
    `${BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice`
  );
  url.searchParams.set("FID_COND_MRKT_DIV_CODE", "J");
  url.searchParams.set("FID_INPUT_ISCD", code);
  url.searchParams.set("FID_INPUT_DATE_1", seoulYmd(-200));
  url.searchParams.set("FID_INPUT_DATE_2", seoulYmd(0));
  url.searchParams.set("FID_PERIOD_DIV_CODE", "D");
  url.searchParams.set("FID_ORG_ADJ_PRC", "0");

  const res = await fetch(url, {
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
      appkey,
      appsecret,
      tr_id: "FHKST03010100",
      custtype: "P",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`KIS 시세 조회 실패 ${res.status}: ${text}`);
  const json = JSON.parse(text);
  if (json.rt_cd && json.rt_cd !== "0") {
    throw new Error(`KIS 오류 ${json.msg_cd || ""}: ${json.msg1 || text}`);
  }

  const out = Array.isArray(json.output2) ? json.output2 : [];
  return out
    .filter((r) => r && r.stck_bsop_date && Number(r.stck_clpr) > 0)
    .map((r) => ({
      date: r.stck_bsop_date,
      open: Number(r.stck_oprc),
      high: Number(r.stck_hgpr),
      low: Number(r.stck_lwpr),
      close: Number(r.stck_clpr),
      volume: Number(r.acml_vol),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

module.exports = {
  isConfigured,
  getToken,
  fetchDailyChart,
  loadConfig,
};
