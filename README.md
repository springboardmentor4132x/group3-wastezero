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

### Milestone 2 — Opportunity & Application APIs
| Method | URL | Auth | Description |
|--------|-----|------|-------------|
| POST | `/api/opportunities` | Admin | Create opportunity |
| GET | `/api/opportunities` | JWT | List opportunities (role-aware, paginated) |
| GET | `/api/opportunities/:id` | JWT | Get single opportunity |
| PUT | `/api/opportunities/:id` | Admin (owner) | Update opportunity |
| DELETE | `/api/opportunities/:id` | Admin (owner) | Soft-delete opportunity |
| POST | `/api/applications` | Volunteer | Apply to opportunity |
| GET | `/api/applications/my` | Volunteer | My applications |
| GET | `/api/applications/opportunity/:id` | Admin (owner) | List apps for opportunity |
| PUT | `/api/applications/:id/decide` | Admin (owner) | Accept/reject application |

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

57 integration tests across 2 suites:
- **Milestone 2** (33 tests): Opportunity CRUD, Application workflow, ownership enforcement, E2E flows
- **Milestone 3** (24 tests): Notification API, Universal Search, Socket.IO auth, real-time event integration

---

## Default Admin Setup
Register an account, then update the role directly in MongoDB Atlas:
```
Database: wastezero → Collection: users → Set role: "admin"
```
