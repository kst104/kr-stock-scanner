# KR Stock Scanner Deployment

This app is a plain Node.js server with no external npm dependencies.

## Local

```powershell
npm start
```

Open:

```text
http://localhost:3000
```

## Render or Railway

Use these settings:

- Runtime: Node.js
- Build command: none, or `npm install`
- Start command: `npm start`
- Port: provided by the platform through `PORT`
- Node version: 20 or newer

## Render Blueprint

This repository includes `render.yaml`, so Render can deploy it as a Blueprint:

1. Open Render Dashboard.
2. Choose New > Blueprint.
3. Connect `kst104/kr-stock-scanner`.
4. Apply the generated service.

## 장세파악 (별도 서버 · 별도 포트)

장세파악은 기존 스캐너(`server.js`, 3000번 포트)와 **분리된 독립 서버**입니다.

```powershell
npm run trend
```

기본 포트는 **3100**번입니다 (`http://localhost:3100`). 변경하려면 `TREND_PORT` 환경변수를 지정합니다.

- 대상 8종목: KODEX200 · 삼성전자 · 삼성전기 · SK하이닉스 · 삼성물산 · SK스퀘어 · SK텔레콤 · 삼성생명
- 전일까지의 일봉으로 60/20일 이평선, 20일 이평 기울기, ADX(14)·+DI/-DI, RSI(14)를 계산해 상승/하락/횡보장을 판정합니다.
- 서버: `market-trend-server.js`, 계산 로직: `market-trend.js`, API: `/api/market-trend`.
- 페이지 로드시 즉시 계산되고, 매일 오전 8시 30분(Asia/Seoul)에 자동 갱신됩니다.
- 기존 스캐너와 장세파악을 동시에 쓰려면 두 서버를 각각 띄웁니다: `npm start` (3000) + `npm run trend` (3100).

### 상승가능성 점수

각 종목의 총점을 표에 표시합니다.

- 컨센서스: 상향전환 50점 · 상향가속 40점 · 상향둔화 30점 (한 종목당 하나만 적용)
- 기관 연속순매수 +25점, 외인 연속순매수 +25점 (각각)
- 상승장(기술적 분석 판정)이면 +25점

컨센서스/수급 리스트는 매일 바뀌므로 페이지의 **"점수 기준 데이터 편집"** 패널에서 종목명을 쉼표/줄바꿈으로 넣고 저장하면 즉시 재계산됩니다. 데이터는 `scoring-input.json`에 저장되며(웹 UI 또는 파일 직접 수정 모두 가능), 계산 로직은 `scoring.js`, API는 `GET/POST /api/scoring` 입니다.

### 데이터 갱신 방식

- **페이지를 열 때마다** 네이버금융(부족하면 KIS)에서 전일까지 최신 일봉을 새로 받아 계산합니다. 아침에 브라우저만 열면 항상 최신입니다.
- 브라우저 탭을 켜 둔 상태라면 매일 08:30(Asia/Seoul)에 페이지가 스스로 다시 계산합니다(탭이 닫히면 이 타이머는 동작하지 않음).
- 서버는 종목별 일봉을 30분간 캐시합니다. 일봉은 하루 한 번만 바뀌므로 실사용에는 영향이 없습니다.
- 별도의 DB나 스냅샷 저장은 없습니다. 매번 실시간 계산이라 "장세 현재값"만 보여 줍니다.

### macOS 자동 실행 (launchd)

`npm run trend` 터미널을 닫거나 PC를 재부팅하면 서버가 꺼집니다. 로그인 시 자동 실행 + 꺼지면 자동 재시작하려면 아래를 한 번 실행합니다.

```
zsh scripts/install-macos.sh
```

- 로그인할 때마다 서버가 자동으로 뜨고, 죽으면 launchd가 되살립니다. 이후에는 아침에 `http://localhost:3100`만 열면 됩니다.
- 로그: `/tmp/krstock-trend.log`, 오류: `/tmp/krstock-trend.err`
- 해제: `zsh scripts/uninstall-macos.sh`
- 등록 이름(Label): `com.krstock.trend`

## Notes (스캐너)

- The dashboard scans Naver Finance from the server at request time.

## KIS API 폴백 (한국투자증권)

네이버금융 일봉 데이터가 부족하거나 조회에 실패하면 한국투자증권 KIS Open API로 자동 보완합니다 (`kis.js`). 데이터를 KIS에서 받아온 종목은 대시보드에 `KIS` 태그가 표시됩니다.

자격증명 설정 방법 (둘 중 하나):

1. 환경변수: `KIS_APP_KEY`, `KIS_APP_SECRET` (필요시 `KIS_BASE`로 실전/모의 URL 지정)
2. 로컬 파일: `kis-config.example.json`을 `kis-config.json`으로 복사한 뒤 앱키/시크릿을 채웁니다.

`kis-config.json`과 발급 토큰 캐시(`.kis-token.json`)는 `.gitignore`에 포함되어 저장소에 커밋되지 않습니다. 접근토큰은 24시간 캐시되어 재발급 호출을 최소화합니다.
- CSV download is available at `/api/scan.csv`.
- Naver research report collection is available at `/api/reports/run` and through `report-scraper.js`.
- The default local report output path is `C:\증권리포트분석\YYYYMMDD\산업리포트` and `C:\증권리포트분석\YYYYMMDD\기업리포트`.
- Extra email recipients are stored in `recipients.json` on the running server. On most free hosts, filesystem writes may reset after redeploy/restart.
- The Codex Gmail automation runs from this Codex thread, not from the deployed web server. If you want email monitoring to run fully in the cloud, add a hosted scheduler and Gmail/API mail sender.
