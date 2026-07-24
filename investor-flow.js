// KRX 개별종목 투자자별 거래실적(순매수 거래대금)을 조회해
// 개인 / 기관 / 외인 수급을 억원 단위로 돌려주는 모듈.
//
// 데이터 출처: KRX 정보데이터시스템(data.krx.co.kr)
//   - finder_stkisu       : 6자리 단축코드 -> ISIN(표준코드) 변환
//   - MDCSTAT02301        : 개별종목 투자자별 거래실적(일별)
//
// KRX 응답은 조회 옵션에 따라 요약뷰(기관합계/기타법인/개인/외국인/기타외국인)
// 또는 상세뷰(금융투자~기타외국인 12개 항목)로 내려오므로, 어느 형태가 오더라도
// TRDVAL 컬럼 개수를 보고 개인/기관/외인 위치를 잡도록 방어적으로 파싱한다.

const KRX_URL = "http://data.krx.co.kr/comm/bldAttendant/getJsonData.cmd";
const KRX_REFERER =
  "http://data.krx.co.kr/contents/MDC/MDI/mdiLoader/index.cmd";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const CACHE_MS = 1000 * 60 * 10;
const isinCache = new Map();
const flowCache = new Map();

function now() {
  return Date.now();
}

function cached(store, key, loader) {
  const hit = store.get(key);
  if (hit && now() - hit.time < CACHE_MS) return hit.value;
  const value = loader().then((data) => {
    store.set(key, { time: now(), value: Promise.resolve(data) });
    return data;
  });
  store.set(key, { time: now(), value });
  return value;
}

function krstDate(offsetDays = 0) {
  const base = new Date(now() - offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(base);
  const get = (type) => parts.find((part) => part.type === type).value;
  return `${get("year")}${get("month")}${get("day")}`;
}

async function krxPost(params) {
  const response = await fetch(KRX_URL, {
    method: "POST",
    headers: {
      "User-Agent": USER_AGENT,
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      Referer: KRX_REFERER,
    },
    body: new URLSearchParams(params).toString(),
  });
  if (!response.ok) throw new Error(`KRX fetch failed ${response.status}`);
  return response.json();
}

async function resolveIsin(code) {
  return cached(isinCache, code, async () => {
    const data = await krxPost({
      bld: "dbms/comm/finder/finder_stkisu",
      locale: "ko_KR",
      mktsel: "ALL",
      typeNo: "0",
      searchText: code,
    });
    const rows = data.block1 || data.output || [];
    const match =
      rows.find((row) => row.short_code === code) ||
      rows.find((row) => (row.full_code || "").slice(3, 9) === code) ||
      rows[0];
    return match ? match.full_code : null;
  });
}

function toNumber(value) {
  if (value == null) return NaN;
  const cleaned = String(value).replace(/,/g, "").trim();
  return cleaned === "" || cleaned === "-" ? NaN : Number(cleaned);
}

// KRX 투자자별 순매수 거래대금(원) 한 행에서 개인/기관/외인을 추출한다.
// 상세뷰: TRDVAL1~7=기관 세부, 8=기관합계, 9=기타법인, 10=개인, 11=외국인, 12=기타외국인
// 요약뷰: TRDVAL1=기관합계, 2=기타법인, 3=개인, 4=외국인, 5=기타외국인
function extractFlow(row) {
  let maxIndex = 0;
  for (const key of Object.keys(row)) {
    const m = /^TRDVAL(\d+)$/.exec(key);
    if (m) maxIndex = Math.max(maxIndex, Number(m[1]));
  }
  const val = (index) => toNumber(row[`TRDVAL${index}`]);
  let institution;
  let individual;
  let foreign;
  if (maxIndex >= 10) {
    institution = val(8);
    individual = val(10);
    const foreignMain = val(11);
    const foreignEtc = val(12);
    foreign =
      Number.isFinite(foreignMain) || Number.isFinite(foreignEtc)
        ? (Number.isFinite(foreignMain) ? foreignMain : 0) +
          (Number.isFinite(foreignEtc) ? foreignEtc : 0)
        : NaN;
  } else {
    institution = val(1);
    individual = val(3);
    const foreignMain = val(4);
    const foreignEtc = val(5);
    foreign =
      Number.isFinite(foreignMain) || Number.isFinite(foreignEtc)
        ? (Number.isFinite(foreignMain) ? foreignMain : 0) +
          (Number.isFinite(foreignEtc) ? foreignEtc : 0)
        : NaN;
  }
  const toEok = (won) => (Number.isFinite(won) ? won / 1e8 : NaN);
  return {
    flowDate: row.TRD_DD ? String(row.TRD_DD).replace(/\//g, ".") : "",
    individualEok: toEok(individual),
    institutionEok: toEok(institution),
    foreignEok: toEok(foreign),
  };
}

// 최근 거래일의 개인/기관/외인 순매수(억원)를 조회한다.
// 실패하면 값이 빈(NaN) 객체를 돌려주어 스캔 자체는 중단되지 않게 한다.
async function fetchInvestorFlow(code) {
  const dayKey = krstDate(0);
  return cached(flowCache, `${code}:${dayKey}`, async () => {
    try {
      const isin = await resolveIsin(code);
      if (!isin) throw new Error("ISIN not found");
      const data = await krxPost({
        bld: "dbms/MDC/STAT/standard/MDCSTAT02301",
        locale: "ko_KR",
        isuCd: isin,
        strtDd: krstDate(10),
        endDd: krstDate(0),
        trdVolVal: "2", // 2 = 거래대금
        askBid: "3", // 3 = 순매수
        detailView: "1",
        share: "1",
        money: "1",
        csvxls_isNo: "false",
      });
      const rows = data.output || data.OutBlock_1 || [];
      const withDate = rows.filter((row) => row.TRD_DD);
      if (!withDate.length) throw new Error("no rows");
      // 최신 거래일 행 선택(응답 정렬에 의존하지 않도록 날짜 최대값 사용).
      const latest = withDate.reduce((best, row) =>
        String(row.TRD_DD) > String(best.TRD_DD) ? row : best
      );
      return extractFlow(latest);
    } catch (error) {
      return {
        flowDate: "",
        individualEok: NaN,
        institutionEok: NaN,
        foreignEok: NaN,
      };
    }
  });
}

module.exports = {
  fetchInvestorFlow,
};
