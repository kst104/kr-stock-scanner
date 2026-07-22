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

## Notes

- The dashboard scans Naver Finance from the server at request time.
- 장세파악: 대시보드 상단에서 KODEX200·삼성전자·삼성전기·SK하이닉스·삼성물산·SK스퀘어·SK텔레콤·삼성생명 8종목의 상승/하락/횡보장을 판정합니다. 전일까지의 일봉으로 60/20일 이평선, 20일 이평 기울기, ADX(14)·+DI/-DI, RSI(14)를 계산합니다. API는 `/api/market-trend`, 계산 로직은 `market-trend.js`에 있습니다. 페이지 로드시 즉시 계산되고, 매일 오전 8시 30분(Asia/Seoul)에 자동 갱신됩니다.

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
