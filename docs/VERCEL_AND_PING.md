Vercel Deployment & Keepalive (Ping) Guide
=========================================

Overview
--------
- Frontend: deploy to Vercel (recommended). Use the `frontend` folder as the project root.
- Backend: requires a long-running process for Socket.IO and background uptime. Deploy to Render, Railway, Heroku, or a VM. Serverless on Vercel is not recommended for Socket.IO.

Frontend (Vercel) — quick steps
-------------------------------
1. In Vercel, import the Git repository and choose the project.
2. Preferred: set Project Root to `frontend`.
3. Install Command: `npm install --legacy-peer-deps`
4. Build Command: `npm run build`
5. Output Directory: `dist/frontend/browser`
6. Alternative (if Project Root is `./`): this repo includes root `vercel.json` with:
  - Install: `npm install --prefix frontend --legacy-peer-deps`
  - Build: `npm run build --prefix frontend`
  - Output: `frontend/dist/frontend/browser`
7. Environment Variables (set in Vercel):
   - `API_URL` — full backend base URL (e.g. `https://api.example.com`)
   - `SOCKET_URL` — websocket URL (e.g. `wss://api.example.com` or same as `API_URL` with ws/s)
   - `FRONTEND_URL` — public frontend URL used in email links (e.g. `https://myapp.vercel.app`)
8. If the app uses `frontend/public/assets/runtime-config.js`, keep it or generate an equivalent at build/runtime using these env vars.

Backend — hosting recommendation
--------------------------------
- Socket.IO requires a persistent server; prefer Render/Railway/Heroku (always-on dyno) or a VPS with PM2/systemd.
- Example required env vars for backend:
  - `MONGO_URI` (or `MONGODB_URI`)
  - `JWT_SECRET`
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
  - `FRONTEND_URL` (used when composing password reset links)
  - `SOCKET_ORIGIN` (allowed origin for socket connections / CORS)

Deploy notes
------------
- Ensure Node process is long-running for Socket.IO. Vercel functions time out and will break realtime connections.
- If you want to host API on Vercel (limited), move realtime features to a managed WebSocket service (Pusher, Ably) or a separate long-running host.

Keepalive / Ping API
--------------------
- Endpoint implemented in this repo: `GET /api/keepalive`
- Response example:
```
{
  "uptimeSeconds": 12345,
  "timestamp": "2026-04-08T12:34:56.789Z",
  "onlineUsers": 3
}
```
- Use an uptime monitor (UptimeRobot, Pingdom) to hit the endpoint every 5 minutes to keep the host awake.

Example curl checks
-------------------
Check from CLI:
```
curl -sS https://api.example.com/api/keepalive | jq
```
Check email-sending (admin token send):
```
curl -X POST "https://api.example.com/api/admin/users/<USER_ID>/reset-password-token" \
  -H "Authorization: Bearer <ADMIN_JWT>" \
  -H "Content-Type: application/json"
```

UptimeRobot setup
-----------------
1. Create a new HTTPS monitor.
2. Set URL to `https://api.example.com/api/keepalive`.
3. Set check interval to 5 minutes.

Notes / Troubleshooting
-----------------------
- If Socket.IO disconnects often, confirm the backend host is stable and not timing out proxies/load-balancers. Enable heartbeats and consider increasing timeouts for reverse proxies.
- Ensure SMTP credentials are valid and `FRONTEND_URL` is correct so password reset links point to the deployed frontend.
- If you deploy the frontend and backend to different domains, ensure CORS and socket origin settings allow the frontend origin.

Where to find this file
-----------------------
This guide was added as `docs/VERCEL_AND_PING.md` in the repository root.
