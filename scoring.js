const fs = require("fs");
const path = require("path");

// 상승가능성 점수 계산.
// 입력 데이터(컨센서스/수급 리스트)는 scoring-input.json 에 저장되며
// 웹 UI 또는 파일로 매일 갱신할 수 있다.

const INPUT_FILE = path.join(__dirname, "scoring-input.json");

const CONSENSUS_CATEGORIES = ["상향전환", "상향가속", "상향둔화"];
const CONSENSUS_POINTS = { 상향전환: 50, 상향가속: 40, 상향둔화: 30 };
const NETBUY_BONUS = 25; // 기관/외인 연속순매수 각각
const BULL_BONUS = 25; // 상승장(기술적 분석)

function normalize(name) {
  return String(name || "").replace(/\s+/g, "").toLowerCase();
}

function defaultInput() {
  return {
    consensus: { 상향전환: [], 상향가속: [], 상향둔화: [] },
    기관연속순매수: [],
    외인연속순매수: [],
  };
}

function sanitizeList(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  // 문자열이면 쉼표/줄바꿈으로 분리
  return String(value || "")
    .split(/[,\n\r]+/)
    .map((v) => v.trim())
    .filter(Boolean);
}

function sanitizeInput(raw) {
  const base = defaultInput();
  if (raw && typeof raw === "object") {
    if (raw.consensus && typeof raw.consensus === "object") {
      for (const cat of CONSENSUS_CATEGORIES) {
        base.consensus[cat] = sanitizeList(raw.consensus[cat]);
      }
    }
    base.기관연속순매수 = sanitizeList(raw.기관연속순매수);
    base.외인연속순매수 = sanitizeList(raw.외인연속순매수);
  }
  return base;
}

function readInput() {
  try {
    return sanitizeInput(JSON.parse(fs.readFileSync(INPUT_FILE, "utf8")));
  } catch {
    return defaultInput();
  }
}

function writeInput(raw) {
  const clean = sanitizeInput(raw);
  fs.writeFileSync(INPUT_FILE, `${JSON.stringify(clean, null, 2)}\n`, "utf8");
  return clean;
}

// 종목명 + 장세(phase)로 점수 산출
function scoreFor(stockName, phase, input) {
  const data = input || readInput();
  const target = normalize(stockName);
  const inList = (arr) => (arr || []).some((x) => normalize(x) === target);

  let consensusCategory = null;
  for (const cat of CONSENSUS_CATEGORIES) {
    if (inList(data.consensus?.[cat])) {
      consensusCategory = cat;
      break;
    }
  }
  const consensusPoints = consensusCategory ? CONSENSUS_POINTS[consensusCategory] : 0;
  const institution = inList(data.기관연속순매수);
  const foreign = inList(data.외인연속순매수);
  const bull = phase === "bull";

  const institutionPoints = institution ? NETBUY_BONUS : 0;
  const foreignPoints = foreign ? NETBUY_BONUS : 0;
  const bullPoints = bull ? BULL_BONUS : 0;
  const total = consensusPoints + institutionPoints + foreignPoints + bullPoints;

  return {
    total,
    consensusCategory,
    consensusPoints,
    institution,
    institutionPoints,
    foreign,
    foreignPoints,
    bull,
    bullPoints,
  };
}

module.exports = {
  CONSENSUS_CATEGORIES,
  CONSENSUS_POINTS,
  NETBUY_BONUS,
  BULL_BONUS,
  readInput,
  writeInput,
  scoreFor,
  defaultInput,
};
