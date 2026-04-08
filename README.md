# WasteZero — Smart Waste Pickup & Recycling Platform

## Tech Stack
- **Frontend**: Angular 21 (standalone, lazy-loaded, SSR-enabled) + Bootstrap 5
- **Backend**: Node.js + Express.js
- **Database**: MongoDB Atlas
- **Auth**: JWT (7-day expiry) + bcryptjs
- **Real-time**: Socket.IO 4 (WebSockets + polling fallback)

---

## Quick Start

### 1. Start the Backend
```bash
cd backend
npm run dev
```
Or double-click `start-backend.bat`.  
Backend runs at **http://localhost:5000**

### 2. Start the Frontend (new terminal)
```bash
cd frontend
npx ng serve
```
Or double-click `start-frontend.bat`.  
Frontend opens at **http://localhost:4200**

> The Angular dev server proxies all `/api/*` requests to `http://localhost:5000` automatically.

---

## Roles
| Role | Access |
|------|--------|
| **User** (Citizen) | Schedule pickups, track impact, view history, message volunteers |
| **Volunteer** | Browse open opportunities, accept/complete pickups, message users |
| **Admin** | Full platform management, reports, CSV exports, user suspension |

---

## Milestone 4 Highlights
- Admin dashboard now includes users, volunteers, opportunities, applications, active/completed opportunity metrics.
- User activity monitoring now includes role, location, applications, accepted/rejected rates, and participation counts.
- Opportunity monitoring now supports full admin visibility across all opportunities with application totals by status.
- Administrative controls now include user blocking/unblocking and system alert broadcasting to selected audiences.
- Reporting now includes Milestone 4 summary + dedicated opportunity/application reports with CSV export.
- Deployment readiness improved for separate frontend/backend hosting with runtime-configurable API and Socket URLs.

---

## Project Structure
```
waste/
├── backend/
│   ├── config/db.js          # MongoDB connection
│   ├── middleware/auth.js     # JWT protect, adminOnly, volunteerOnly, volunteerOrAdmin
│   ├── models/               # User, Pickup, Message, AdminLog, Opportunity, Application, Notification
│   ├── controllers/          # opportunityController, applicationController, notificationController, searchController
│   ├── routes/               # auth, users, pickups, messages, admin, opportunities, applications, notifications, search
│   ├── socket.js             # Socket.IO server (JWT auth, rooms, events)
│   ├── migrations/           # DB migration scripts
│   ├── tests/                # Integration tests (Jest + Supertest)
│   ├── server.js             # Express entry point
│   └── .env                  # MONGO_URI, JWT_SECRET, PORT
└── frontend/
    ├── src/app/
    │   ├── components/       # All page components
    │   ├── guards/           # authGuard, guestGuard
    │   ├── models/           # TypeScript interfaces
    │   ├── services/         # auth, user, pickup, message, admin, opportunity, application, socket, notification, search
    │   ├── app.routes.ts     # Lazy-loaded routes
    │   └── app.config.ts     # Angular providers
    ├── src/styles.scss       # Global design system
    └── proxy.conf.json       # Dev proxy → backend:5000
```

---

## API Endpoints
| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/api/auth/register` | Public | Register user |
| POST | `/api/auth/login` | Public | Login (username or email) |
| GET | `/api/auth/me` | JWT | Current user |
| GET/PUT | `/api/users/profile` | JWT | View/edit profile |
| GET | `/api/users/stats` | JWT | Role-aware stats |
| POST | `/api/pickups` | User | Schedule pickup |
| GET | `/api/pickups/my` | JWT | My pickups (role-aware) |
| GET | `/api/pickups/opportunities` | Volunteer | Open pickups |
| PUT | `/api/pickups/:id/accept` | Volunteer | Accept pickup |
| PUT | `/api/pickups/:id/complete` | Vol/Admin | Complete + update stats |
| GET | `/api/admin/stats` | Admin | Platform overview |
| GET | `/api/admin/reports/*` | Admin | Reports + CSV export |
| GET | `/api/admin/activity/users` | Admin | User and volunteer activity monitoring |
| GET | `/api/admin/opportunities` | Admin | Monitor all opportunities + application stats |
| PUT | `/api/admin/opportunities/:id` | Admin | Admin edit opportunity details |
| DELETE | `/api/admin/opportunities/:id` | Admin | Remove inappropriate opportunity |
| PUT | `/api/admin/users/:id/block` | Admin | Block/unblock user |
| POST | `/api/admin/alerts/broadcast` | Admin | Send system alert notifications |
| GET | `/api/admin/reports/summary` | Admin | Milestone 4 summary report |
| GET | `/api/admin/reports/opportunities` | Admin | Opportunity report with application metrics |
| GET | `/api/admin/reports/applications` | Admin | Application report (pending/accepted/rejected) |

### Milestone 2 — Opportunity & Application APIs
| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/api/opportunities` | Admin | Create opportunity |
| GET | `/api/opportunities` | JWT | List opportunities (role-aware, paginated) |
| GET | `/api/opportunities/:id` | JWT | Get single opportunity |
| PUT | `/api/opportunities/:id` | Admin | Update opportunity |
| DELETE | `/api/opportunities/:id` | Admin | Soft-delete opportunity |
| POST | `/api/applications` | Volunteer | Apply to opportunity |
| GET | `/api/applications/my` | Volunteer | My applications |
| GET | `/api/applications/opportunity/:id` | Admin | List apps for opportunity |
| PUT | `/api/applications/:id/decide` | Admin | Accept/reject application |

### Milestone 3 — Real-time, Notifications, Search
| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| GET | `/api/notifications` | JWT | List notifications (paginated, unread filter) |
| GET | `/api/notifications/unread-count` | JWT | Unread notification count |
| PUT | `/api/notifications/:id/read` | JWT | Mark notification as read |
| PUT | `/api/notifications/read-all` | JWT | Mark all notifications as read |
| GET | `/api/search?q=term&type=all` | JWT | Universal search (opportunities, pickups, users) |

### Socket.IO Events
| Event | Direction | Description |
|-------|-----------|-------------|
| `chat:message` | Server → Client | New chat message (to receiver) |
| `chat:typing` | Client → Server → Client | Typing indicator |
| `opportunity:created` | Server → `role:volunteer` | New opportunity posted |
| `opportunity:updated` | Server → room | Opportunity details changed |
| `opportunity:deleted` | Server → room | Opportunity soft-deleted |
| `application:created` | Server → admin | New volunteer application |
| `application:updated` | Server → volunteer | Application accepted/rejected |
| `notification:new` | Server → user | Real-time notification push |
| `pickup:accepted` | Server → user | Pickup accepted by volunteer |
| `pickup:completed` | Server → user | Pickup marked complete |

> Socket authentication: Connect with `auth: { token: '<JWT>' }`. Server validates JWT and joins rooms `user:<id>` and `role:<role>`.

> Full Milestone 2 API docs: [docs/MILESTONE2.md](docs/MILESTONE2.md)

---

## Running Tests

```bash
cd backend
npm test
```

Use the full manual system validation checklist for Milestone 4 integration:

- [docs/MILESTONE4_SYSTEM_TESTING.md](docs/MILESTONE4_SYSTEM_TESTING.md)

For frontend checks:

```bash
cd frontend
npm run build
```

For backend syntax and startup checks:

```bash
cd backend
node --check server.js
npm run dev
```

---

## Separate Vercel Deployment Notes

### Backend (Vercel Project: backend)
- Deploy from `backend` folder.
- `vercel.json` routes all requests to Express entrypoint.
- Required environment variables:
    - `MONGO_URI`
    - `JWT_SECRET`
    - `FRONTEND_URL` (comma-separated allowed frontend origins, optional)
    - `CORS_ORIGINS` (additional comma-separated origins, optional)

### Frontend (Vercel Project: frontend)
- Deploy from `frontend` folder.
- `vercel.json` serves built Angular output as SPA.
- Runtime API/socket endpoints are read from:
    - `frontend/public/assets/runtime-config.js`
    - Global object: `window.__WZ_CONFIG__`
- Update runtime config for production:
    - `API_URL`: e.g. `https://your-backend-domain.vercel.app/api`
    - `SOCKET_URL`: e.g. `https://your-backend-domain.vercel.app`

This setup keeps frontend and backend fully decoupled while preserving real-time + authenticated API integration.

---

## Backend Deployment on Render (Recommended for Socket.IO)

Render supports long-running Node processes, so backend realtime features (Socket.IO) work reliably.

### Option A: Blueprint (recommended)
- This repo includes a Render blueprint at `render.yaml`.
- In Render: **New +** -> **Blueprint** -> connect repository -> deploy.

### Option B: Manual Web Service
- Service type: **Web Service**
- Root Directory: `backend`
- Build Command: `npm ci`
- Start Command: `npm start`
- Health Check Path: `/api/keepalive`

### Required Environment Variables (Render)
- `MONGO_URI`
- `JWT_SECRET`
- `FRONTEND_URL` (e.g. `https://wastezeros.vercel.app`)
- `CORS_ORIGINS` (e.g. `https://wastezeros.vercel.app,http://localhost:4200`)
- SMTP variables for forgot-password / notification emails:
    - `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`

### Email Delivery Resilience (Forgot Password + Admin Reset Link)
- The backend now handles SMTP delivery failures gracefully.
- `POST /api/auth/forgot-password` always returns `200` for privacy and anti-enumeration.
- If email delivery fails, response includes:
    - `emailQueued: false`
    - a user-friendly message (`We're facing an issue sending reset emails right now...`).
- `POST /api/admin/users/:id/reset-password-token` no longer fails with `500` when SMTP is unavailable.
- Admin response now includes:
    - `emailed: true|false`
    - `resetUrl` fallback when email delivery fails (admin can share securely if needed).

Recommended SMTP network settings on Render:
- `SMTP_IP_FAMILY=4`
- `DNS_RESULT_ORDER=ipv4first`
- `SMTP_DNS_TIMEOUT_MS=10000`
- `SMTP_CONNECTION_TIMEOUT_MS=10000`
- `SMTP_GREETING_TIMEOUT_MS=10000`
- `SMTP_SOCKET_TIMEOUT_MS=15000`

### Uptime Monitoring
- Keep using `GET /api/keepalive` for external uptime monitors.
- Suggested monitor interval: every 5 minutes.

---

## Default Admin Setup
Register an account, then update the role directly in MongoDB Atlas:
```
Database: wastezero → Collection: users → Set role: "admin"
```
