const crypto = require("crypto");
const fs = require("fs/promises");
const tls = require("tls");
const { scan } = require("./server");

const TEN_MINUTES = 10 * 60 * 1000;
const STATE_FILE = "monitor-state.json";
const RECIPIENT = process.env.MONITOR_EMAIL_TO || "promokorea@gmail.com";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.naver.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.NAVER_SMTP_USER || process.env.SMTP_USER;
const SMTP_PASS = process.env.NAVER_SMTP_PASS || process.env.SMTP_PASS;
const FROM = process.env.SMTP_FROM || SMTP_USER;

const scanParams = new URLSearchParams({
  minMarketCapEok: process.env.MIN_MARKET_CAP_EOK || "3000",
  windowDays: process.env.WINDOW_DAYS || "5",
  minRisePct: process.env.MIN_RISE_PCT || "10",
  touchPct: process.env.TOUCH_PCT || "1",
});

function formatNumber(value) {
  return Number.isFinite(value) ? Math.round(value).toLocaleString("ko-KR") : "";
}

function formatPercent(value) {
  return Number.isFinite(value) ? `${value.toFixed(2)}%` : "";
}

function signature(results) {
  const payload = results.map((row) => ({
    code: row.code,
    name: row.name,
    date: row.date,
    close: row.close,
    triggerDate: row.triggerDate,
    triggerRisePct: Number(row.triggerRisePct.toFixed(4)),
    hit: row.hit,
  }));
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function buildEmail(data, previousCount) {
  const rows = data.results;
  const title =
    previousCount == null
      ? `[KR Scanner] 최초 결과 ${rows.length}개`
      : `[KR Scanner] 결과 변경 ${previousCount}개 -> ${rows.length}개`;
  const lines = [
    title,
    "",
    `검색시각: ${new Date(data.updatedAt).toLocaleString("ko-KR")}`,
    `검사 후보: ${formatNumber(data.scanned)}개`,
    `조건 결과: ${formatNumber(rows.length)}개`,
    "",
    "조건: 시총 3,000억 이상 / 오늘 제외 최근 5거래일 내 기준봉 / 기준봉 이후 5일선 종가 이탈 없음 / 금일 양봉 / 금일 저가 3MA 또는 5MA 1% 이내",
    "",
  ];

  if (!rows.length) {
    lines.push("조건에 맞는 종목이 없습니다.");
  } else {
    lines.push("종목 | 코드 | 시장 | 종가 | 기준봉일 | 기준봉 상승률 | 기준봉 이후 | 터치");
    lines.push("-".repeat(78));
    for (const row of rows) {
      lines.push(
        [
          row.name,
          row.code,
          row.market,
          formatNumber(row.close),
          row.triggerDate,
          formatPercent(row.triggerRisePct),
          `${row.barsAfterTrigger}봉`,
          row.hit,
        ].join(" | ")
      );
    }
  }

  return {
    subject: title,
    text: lines.join("\r\n"),
  };
}

async function readState() {
  try {
    return JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

async function writeState(state) {
  await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function encodeHeader(value) {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function readSmtp(socket) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      const last = lines.at(-1);
      if (last && /^\d{3} /.test(last)) {
        socket.off("data", onData);
        const code = Number(last.slice(0, 3));
        if (code >= 400) reject(new Error(buffer.trim()));
        else resolve(buffer);
      }
    };
    socket.on("data", onData);
    socket.once("error", reject);
  });
}

async function sendSmtp(socket, command) {
  socket.write(`${command}\r\n`);
  return readSmtp(socket);
}

async function sendMail({ to, subject, text }) {
  if (!SMTP_USER || !SMTP_PASS || !FROM) {
    throw new Error(
      "SMTP 환경변수가 없습니다. NAVER_SMTP_USER와 NAVER_SMTP_PASS를 설정해야 메일을 보낼 수 있습니다."
    );
  }

  const socket = tls.connect({
    host: SMTP_HOST,
    port: SMTP_PORT,
    servername: SMTP_HOST,
  });

  await new Promise((resolve, reject) => {
    socket.once("secureConnect", resolve);
    socket.once("error", reject);
  });

  try {
    await readSmtp(socket);
    await sendSmtp(socket, `EHLO localhost`);
    await sendSmtp(socket, "AUTH LOGIN");
    await sendSmtp(socket, Buffer.from(SMTP_USER, "utf8").toString("base64"));
    await sendSmtp(socket, Buffer.from(SMTP_PASS, "utf8").toString("base64"));
    await sendSmtp(socket, `MAIL FROM:<${FROM}>`);
    await sendSmtp(socket, `RCPT TO:<${to}>`);
    await sendSmtp(socket, "DATA");

    const message = [
      `From: ${FROM}`,
      `To: ${to}`,
      `Subject: ${encodeHeader(subject)}`,
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "Content-Transfer-Encoding: 8bit",
      "",
      text.replace(/^\./gm, ".."),
      ".",
    ].join("\r\n");

    await sendSmtp(socket, message);
    await sendSmtp(socket, "QUIT");
  } finally {
    socket.end();
  }
}

async function runOnce() {
  const previous = await readState();
  const data = await scan(scanParams);
  const currentSignature = signature(data.results);
  const changed = !previous || previous.signature !== currentSignature;
  const timestamp = new Date().toISOString();

  if (changed) {
    const email = buildEmail(data, previous?.count);
    await sendMail({ to: RECIPIENT, ...email });
    await writeState({
      signature: currentSignature,
      count: data.results.length,
      sentAt: timestamp,
      results: data.results.map((row) => ({
        code: row.code,
        name: row.name,
        close: row.close,
        triggerDate: row.triggerDate,
        triggerRisePct: row.triggerRisePct,
      })),
    });
    console.log(`[${timestamp}] email sent: ${data.results.length} results`);
  } else {
    console.log(`[${timestamp}] unchanged: ${data.results.length} results`);
  }
}

async function runLoop() {
  while (true) {
    try {
      await runOnce();
    } catch (error) {
      console.error(`[${new Date().toISOString()}] monitor error:`, error.message);
    }
    await new Promise((resolve) => setTimeout(resolve, TEN_MINUTES));
  }
}

if (require.main === module) {
  runLoop();
}

module.exports = {
  runOnce,
};
