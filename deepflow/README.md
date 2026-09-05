# deepflow — KR 오더플로우 뷰어 (셀프호스팅)

KIS 실시간 체결·호가를 받아 **버블 차트 · DOM 히트맵 · CVD · 거래대금 프로파일 ·
테마 자금흐름 · 흡수/스탑런 마커 · 이벤트 타임라인**으로 보여주는 로컬 분석 도구.

> **데이터는 본인 KIS 계정으로 본인 PC 에서만 수집·저장됩니다 (BYOK).**
> 외부 서버로 전송되지 않습니다.

---

## 설치 (최초 1회)

### 사전 준비
1. **Python 3.10 이상** 설치
   - Windows: <https://www.python.org/downloads/> (설치 시 **“Add Python to PATH” 체크**)
   - macOS: <https://www.python.org/downloads/> 또는 `brew install python`
2. **KIS Developers 키 발급** — <https://apiportal.koreainvestment.com>
   - 한국투자증권 계좌 + HTS ID 필요
   - 실전 또는 모의투자 환경에서 **App Key / App Secret** 발급

### Windows
1. 이 폴더의 **`setup.bat`** 더블클릭 (또는 명령창에서 실행)
2. 생성된 **`.env`** 파일을 메모장으로 열어 본인 KIS 키 입력
3. **`start.bat`** 더블클릭 → 브라우저가 자동으로 열립니다

### macOS / Linux
```bash
cd deepflow
./setup.sh                 # 최초 1회
nano .env                  # 본인 KIS 키 입력 (또는 편집기로)
./start.sh                 # 실행 → 브라우저 자동 오픈
```

열리는 주소: **http://127.0.0.1:8077**

---

## 사용법

- **장중(평일 09:00~15:30 KST)** 에 켜 두면 자동으로 실시간 데이터가 쌓입니다.
- 추가한 종목은 **그 시점부터** 쌓입니다 (과거 데이터는 소급 안 됨).
- 좌측 **⚙ (종목 관리)** 에서 종목 추가/삭제 → **“캡처 재시작(적용)”** 클릭하면 즉시 반영.
- 상단 탭: **Bubbles / Deep Trades / DOM / 테마 종합 / 이벤트**.
- 하단 **▶ 실시간 보기** / 슬라이더로 리플레이 / 날짜 선택으로 과거 세션 조회.

### KIS 등록 한계 (중요)
- KIS 는 **계정(키)당 실시간 등록 ~41건**이 한계입니다.
- 체결 1종목 = 1칸, 호가(DOM) 1종목 = 1칸 (합산).
- 기본값: 체결 35 + 호가 5 = 40칸. 호가를 늘리려면 체결을 줄이세요.
- **호가를 더 많은 종목에서 보려면**: 모의투자 계정 키를 추가로 발급받아 두 번째로 돌리면
  +41칸을 더 쓸 수 있습니다 (모의도 시세는 실데이터).

---

## 자주 묻는 질문

**Q. 차트가 비어 있어요.**
→ 장 마감 시간이면 그날 데이터만 보입니다. 날짜를 바꿔보거나, 장중에 켜 두세요.
처음 켠 날은 켠 시점부터만 데이터가 있습니다.

**Q. “KIS approval 실패” 오류.**
→ `.env` 의 `KIS_APP_KEY` / `KIS_APP_SECRET` 와 `KIS_TRADING_ENV`(real/demo)가
발급한 키 환경과 맞는지 확인하세요. (모의 키인데 real 로 설정 등)

**Q. 종료하려면?**
→ 실행 중인 터미널/명령창을 닫으면 됩니다. 데이터(`data/orderflow_ticks.db`)는 보존됩니다.

**Q. 자동으로 매일 켜지게 하려면?**
→ (선택) Windows 작업 스케줄러 / macOS 로그인 항목에 `start` 스크립트를 등록하세요.

**Q. KIS 키 없이 화면만 먼저 보고 싶어요.**
→ `.env` 에서 `DEEPFLOW_DEMO=1` 로 두면 합성(가짜) 오더플로우로 UI 를 확인할 수 있습니다.
실데이터가 아니므로 참고용으로만 쓰세요. 실제 사용 시 `0` 으로 되돌리고 KIS 키를 입력하세요.

---

## 구성 (개발자용)

```
deepflow/
├─ setup.bat / setup.sh      # 최초 설치
├─ start.bat / start.sh      # 실행 (python -m app.main)
├─ requirements.txt
├─ .env.example              # → .env 로 복사해 KIS 키 입력
├─ app/
│  ├─ main.py                # FastAPI: UI 서빙 + REST/WS API
│  ├─ config.py              # .env 로딩 (BYOK)
│  ├─ kis.py                 # KIS approval + 실시간(H0STCNT0/H0STASP0) 파싱
│  ├─ capture.py             # 웹소켓 수집 매니저 (+ 데모 피드)
│  ├─ storage.py             # SQLite (data/orderflow_ticks.db)
│  ├─ analytics.py           # CVD · 프로파일 · 흡수/스탑런 · 테마 흐름
│  ├─ symbols.py             # 종목/호가 슬롯 관리
│  └─ themes.py              # 테마 그룹 정의
└─ web/
   ├─ index.html · styles.css · app.js   # 의존성 없는 SPA (Canvas)
```

주요 API: `/api/ticks` `/api/deep-trades` `/api/cvd` `/api/profile` `/api/dom`
`/api/themes` `/api/events` `/api/symbols` · 실시간 푸시 `/ws`.

---

## 면책

본 소프트웨어는 **시장 데이터 시각화·분석 도구**이며, 특정 종목의 매수·매도를
권유하지 않습니다. 모든 투자 판단과 책임은 사용자 본인에게 있습니다.
흡수/스탑런 등 마커는 데이터 기반 추정치(근사)이며 정확성을 보장하지 않습니다.
