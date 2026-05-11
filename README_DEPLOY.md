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

## Notes

- The dashboard scans Naver Finance from the server at request time.
- CSV download is available at `/api/scan.csv`.
- Extra email recipients are stored in `recipients.json` on the running server. On most free hosts, filesystem writes may reset after redeploy/restart.
- The Codex Gmail automation runs from this Codex thread, not from the deployed web server. If you want email monitoring to run fully in the cloud, add a hosted scheduler and Gmail/API mail sender.
