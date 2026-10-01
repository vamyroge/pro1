# Library Management Pro

A modern full-stack library management system with a clean SaaS-style dashboard.
Built with **Node.js + Express** on the backend, **Vanilla JavaScript + Tailwind-like CSS** on the frontend, and **Supabase PostgreSQL** as the real database (no mocks, no MongoDB, no localStorage as DB).

## Features

- JWT-based authentication (admin / librarian) with bcrypt password hashing
- Books, Readers, Borrowings, Activity logs — all stored in Supabase
- Atomic borrow / return operations using PostgreSQL functions (no data inconsistency)
- Search with debouncing, filter, sort, pagination — performed at DB level
- Dashboard with stats, charts, recent activity, and overdue list
- Overdue detection at query time (no cron needed)
- Responsive UI (desktop / tablet / mobile), toast notifications, modals, loading skeletons, empty states
- Security: helmet, CORS, rate limit, env variables, no hard-coded secrets, .env not committed

## Tech Stack

- **Frontend**: HTML5, CSS3, Vanilla JS (ES6+), Chart.js, Lucide icons, Fetch API
- **Backend**: Node.js, Express, @supabase/supabase-js, jsonwebtoken, bcryptjs, helmet, cors, express-rate-limit, dotenv
- **Database**: Supabase PostgreSQL (RPC functions for transactions)

## Project Structure

```
library-management-pro/
├── api/
│   └── index.js              # Express server (works for local + Vercel)
├── config/
│   └── supabase.js           # Server-side Supabase client
├── middleware/
│   ├── auth.js               # JWT verify + role check
│   └── errorHandler.js       # Centralized error handler
├── routes/
│   ├── auth.js               # /api/auth
│   ├── books.js              # /api/books
│   ├── readers.js            # /api/readers
│   ├── borrowings.js         # /api/borrowings
│   └── dashboard.js          # /api/dashboard
├── public/
│   ├── index.html            # Main app
│   ├── login.html            # Login page
│   ├── css/style.css         # Stylesheet
│   └── js/
│       ├── app.js            # Router
│       ├── auth.js           # Session helper
│       ├── dashboard.js      # Dashboard view
│       ├── books.js          # Books view
│       ├── readers.js        # Readers view
│       ├── borrowings.js     # Borrowings view
│       └── utils.js          # API helper, toast, modal, etc.
├── scripts/
│   ├── setup-db.sql          # DB schema + atomic functions
│   ├── seed.js               # Sample data
│   ├── create-admin.js       # Create admin user
│   └── test-api.js           # API smoke test
├── .env.example
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

## Setup

### 1. Install dependencies

```bash
cd library-management-pro
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```env
SUPABASE_URL=https://<project>.supabase.co/rest/v1/
SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx
SUPABASE_SECRET_KEY=sb_secret_xxx
JWT_SECRET=<random 64-hex chars>
PORT=3000
```

### 3. Initialize the database

Open the Supabase SQL editor of your project and run the contents of
[`scripts/setup-db.sql`](scripts/setup-db.sql). It will:

- create tables: `users`, `books`, `readers`, `borrowings`, `activity_logs`
- create indexes
- create `borrow_book` and `return_book` PL/pgSQL functions (atomic transactions)
- create the `v_borrowings_overdue` view

### 4. Create an admin user

```bash
ADMIN_USERNAME=admin ADMIN_PASSWORD=Admin@123 node scripts/create-admin.js
```

Or run interactively:

```bash
node scripts/create-admin.js
```

### 5. (Optional) Seed sample data

```bash
node scripts/seed.js
```

This creates 10 books, 5 readers, a few borrowings, activity logs, and a default `admin / Admin@123` account.

### 6. Run locally

```bash
npm run dev
```

The app is now available at <http://localhost:3000>.
API health: <http://localhost:3000/api/health>.

### 7. Run the API smoke test

With the server running, in another terminal:

```bash
BASE_URL=http://localhost:3100 node scripts/test-api.js
```

It exercises health, login, me, books CRUD, readers CRUD, borrow, return, dashboard.

## Environment Variables

| Variable                   | Description                                                    |
| -------------------------- | -------------------------------------------------------------- |
| `SUPABASE_URL`             | Supabase REST URL (include `/rest/v1/`)                        |
| `SUPABASE_PUBLISHABLE_KEY` | Public anon key (kept server-side)                             |
| `SUPABASE_SECRET_KEY`      | Server-side secret key — **never commit or expose to browser** |
| `JWT_SECRET`               | Random string used to sign JWTs                                |
| `PORT`                     | HTTP port (default `3000`)                                     |

## API Reference

All endpoints require `Authorization: Bearer <token>` except `/api/auth/login` and `/api/health`.

| Method | Endpoint                          | Auth | Description                                |
| ------ | --------------------------------- | ---- | ------------------------------------------ |
| GET    | `/api/health`                     | No   | Health check (also pings DB)               |
| POST   | `/api/auth/login`                 | No   | Login (rate-limited)                       |
| POST   | `/api/auth/logout`                | No   | Logout (client should drop token)          |
| GET    | `/api/auth/me`                    | Yes  | Current user                               |
| GET    | `/api/books`                      | Yes  | List books (search, filter, sort, paginate)|
| GET    | `/api/books/:id`                  | Yes  | Get a book                                 |
| POST   | `/api/books`                      | Yes  | Create book                                |
| PUT    | `/api/books/:id`                  | Yes  | Update book                                |
| DELETE | `/api/books/:id`                  | Yes  | Delete book (fails if active borrowings)   |
| GET    | `/api/readers`                    | Yes  | List readers (search, filter, paginate)    |
| GET    | `/api/readers/:id`                | Yes  | Get a reader                               |
| POST   | `/api/readers`                    | Yes  | Create reader                              |
| PUT    | `/api/readers/:id`                | Yes  | Update reader                              |
| DELETE | `/api/readers/:id`                | Yes  | Delete reader (fails if active borrowings) |
| GET    | `/api/borrowings`                 | Yes  | List borrowings (filters, includes overdue)|
| POST   | `/api/borrowings`                 | Yes  | Borrow a book (atomic via RPC)             |
| PUT    | `/api/borrowings/:id/return`      | Yes  | Return a book (atomic via RPC)             |
| GET    | `/api/dashboard/stats`            | Yes  | Aggregated stats + charts data             |
| GET    | `/api/dashboard/activity`         | Yes  | Recent activity logs                       |

### Query examples

```text
GET /api/books?search=harry&category=Children&sort=title&order=asc&page=1&limit=20
GET /api/books?status=AVAILABLE
GET /api/readers?search=nguyen&status=ACTIVE
GET /api/borrowings?status=BORROWING
GET /api/borrowings?overdue=true
```

### Sample login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"Admin@123"}'
```

## Authentication

- Passwords are hashed with bcrypt (10 rounds).
- Login issues a JWT (default 12h) signed with `JWT_SECRET`.
- Every protected endpoint reads the `Authorization: Bearer ...` header and loads the user.
- Login is rate-limited (10 attempts / 15 min / IP).

## Data Consistency

- `borrow_book` and `return_book` PostgreSQL functions lock the book row with `FOR UPDATE`, insert/update the borrowing and adjust `available_quantity` inside the same transaction.
- If any step fails the whole transaction rolls back, so you never end up with a borrowing whose quantity was not decremented.
- `quantity` updates are validated: you cannot reduce a book's `quantity` below the number of currently borrowed copies.

## Overdue Handling

- A borrowing is shown as `OVERDUE` when `status = 'BORROWING'` and `due_date < today`.
- The check happens at query time in the API, so no cron is required.
- The dashboard aggregates overdue count and lists overdue items.

## Security Checklist

- helmet
- CORS enabled
- Login rate-limited
- Global API rate-limited
- Input validation on every endpoint
- No stack traces in production responses
- `.env` ignored by git
- Supabase secret key only used server-side

## Deployment (Vercel)

```bash
vercel login
vercel --prod --yes
```

Set the four environment variables in the Vercel project settings:
`SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `JWT_SECRET`.

`vercel.json` is already configured to:

- serve `public/*` as static assets
- route `/api/*` to the serverless Express function
- serve `/login` → `public/login.html`, `/` → `public/index.html`

## License

MIT
