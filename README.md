# WasteZero — Smart Waste Pickup & Recycling Platform

## Tech Stack
- **Frontend**: Angular 21 (standalone, lazy-loaded, SSR-enabled) + Bootstrap 5
- **Backend**: Node.js + Express.js
- **Database**: MongoDB Atlas
- **Auth**: JWT (7-day expiry) + bcryptjs

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
│   ├── middleware/auth.js     # JWT protect, adminOnly, volunteerOrAdmin
│   ├── models/               # User, Pickup, Message, AdminLog
│   ├── routes/               # auth, users, pickups, messages, admin
│   ├── server.js             # Express entry point
│   └── .env                  # MONGO_URI, JWT_SECRET, PORT
└── frontend/
    ├── src/app/
    │   ├── components/       # All page components
    │   ├── guards/           # authGuard, guestGuard
    │   ├── models/           # TypeScript interfaces
    │   ├── services/         # auth, user, pickup, message, admin
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

---

## Default Admin Setup
Register an account, then update the role directly in MongoDB Atlas:
```
Database: wastezero → Collection: users → Set role: "admin"
```
