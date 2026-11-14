# Godown: inventory and purchase management

Godown tracks products, suppliers, stock coming in and going out, and purchase orders for a small shop. Stock can never go below zero, every change is written to a permanent ledger, and the dashboard shows what needs restocking.

The demo data is a Hyderabad grocery and household shop: 37 products, 6 suppliers, 6 categories and 45 days of stock history.

| | |
|---|---|
| Live app | https://godown-gamma.vercel.app/#/login |
| Source | https://github.com/sathvik1518/Godown |
| Admin login | `saisathvik@gmail.com` / `Admin@123` |
| Staff login | `kavya.reddy@gmail.com` / `Staff@1234` |

Change these demo passwords before putting real data in.

## What it does

- **Products**: SKU, category, supplier, unit, cost and selling price, reorder level, shelf location. Search, filter by category, supplier or stock status, sort, page, export to CSV. Products with history are archived, not deleted.
- **Receive, issue, adjust**: one dialog for each. Issue is refused when it would take stock below zero, and the screen shows the resulting balance before you submit.
- **Stock ledger**: every movement with who, when, why and the balance after. Filter by product, type, date range or text. It cannot be edited or deleted, enforced by a database trigger.
- **Purchase orders**: draft, place, receive, cancel. Receiving a placed order adds every line to stock in one transaction, or none of it. "Draft purchase orders" on the dashboard builds one draft per supplier from everything that is low.
- **Dashboard**: stock value, low and out-of-stock counts, units moved today, a 14-day movement chart, a restock list with one-click receive, value by category, open orders, recent activity.
- **Suppliers, categories, team**: admins manage them. Staff can receive, issue and raise orders but cannot adjust stock, change master data or manage users.
- **Also**: Ctrl+K quick find, dark mode, phone layout with bottom navigation, printable purchase orders, login lockout after 5 wrong passwords in 5 minutes.

## Stack

FastAPI, PostgreSQL (psycopg2, plain SQL), JWT with bcrypt, React 18 with Vite, deployed as one Vercel project on a Neon database.

## Database design

Seven tables in third normal form. Migrations are plain SQL files in `backend/migrations`, applied in order and recorded in a table, under an advisory lock so two servers cannot migrate at once.

```
users ─┐
       ├──< stock_movements >── products >── categories
       ├──< purchase_orders ──< purchase_order_items >── products
suppliers ─┴── (products.supplier_id, purchase_orders.supplier_id)
```

How the rules are enforced, at the database and not only in code:

- `products.qty_on_hand` has `CHECK (qty_on_hand >= 0)`, so a bug in the application still cannot create negative stock.
- `stock_movements` has `CHECK` constraints that the sign of `quantity` matches the movement type and that `balance_after >= 0`. A trigger blocks `UPDATE` and `DELETE`.
- Stock changes go through one function, `post_movement()`. It locks the product row (`SELECT ... FOR UPDATE`), checks the balance, updates it and writes the ledger row inside one transaction. Two people issuing the last unit at once: one succeeds, the other gets a clear error.
- Emails and SKUs are unique case-insensitively. GSTIN format is a `CHECK`.

## API

All routes are under `/api`, JSON in and out. Lists are paged as `{items, total, page, page_size, pages}`. Errors always look like `{"detail": "...", "code": "...", "errors": {"field": "message"}}`. Interactive docs are at `/api/docs`.

| Area | Routes |
|---|---|
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password` |
| Products | `GET /products` (q, category_id, supplier_id, status, sort, order, page), `GET /products/summary`, `GET /products/export.csv`, `GET/PATCH/DELETE /products/{id}`, `POST /products` |
| Stock | `POST /stock/receipts`, `POST /stock/issues`, `POST /stock/adjustments` (admin), `GET /movements`, `GET /movements/export.csv` |
| Purchase orders | `GET/POST /purchase-orders`, `GET/PUT /purchase-orders/{id}`, `POST .../order`, `.../receive`, `.../cancel`, `POST /purchase-orders/from-low-stock` |
| Masters | `/suppliers`, `/categories` (read for all, write for admin) |
| Users | `GET/POST /users`, `PATCH /users/{id}` (admin) |
| Dashboard | `GET /dashboard` |

## Run it on your computer

You need Python 3.11+, Node 18+ and PostgreSQL. Settings are read from environment variables (`.env.example` lists them all); defaults point at a local Postgres user `postgres` and database `godown_dev`.

```powershell
# 1. Database
createdb godown_dev
createdb godown_test

# 2. Backend
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements-dev.txt
$env:DB_PASSWORD = "your-postgres-password"   # see .env.example for every setting
python seed.py --reset             # loads the demo data (asks you to type YES)
uvicorn main:app --reload --port 8000

# 3. Frontend, in a second terminal
cd frontend
npm install
npm run dev                        # opens http://localhost:5173
```

## Tests

```powershell
cd backend
$env:DB_PASSWORD = "your-postgres-password"
pytest -q                          # 113 tests, uses the godown_test database

cd ..\frontend
npm test                           # 37 tests
```

The backend tests refuse to run if `DATABASE_URL` is set, so they can never touch a real database. They cover the negative-stock rule, concurrent issues, receive and cancel flows, the append-only ledger, roles, validation messages, lockout and the CSV export.

## Deploy to Vercel with Neon

1. Create a Neon project and copy the connection string. It must start with `postgresql://` and has no quotes around it.
2. Push this repo to GitHub.
3. In Vercel choose **Add New, Project**, import the repo, and set **Framework Preset** to **Other**. Leave the root as the repo root; `vercel.json` already sets the build command and output folder.
4. Add two environment variables: `DATABASE_URL` (the Neon string) and `JWT_SECRET` (any long random text).
5. Deploy. The first request creates the tables and loads the demo data.
6. Open `https://godown-gamma.vercel.app/#/login` and sign in as the admin.

To start with an empty shop instead of demo data, set `SEED_DEMO=0` before the first request. The admin account is still created.

## Project layout

```
api/index.py          Vercel entry point, mounts the backend under /api
backend/              FastAPI app: routers, services/stock.py, migrations, seed.py, tests
frontend/src/         React app: pages, components, context, styles, tests
vercel.json           build and routing
```

## Decisions worth knowing

- The ledger stores signed quantities and the balance after each change, so any product's history can be audited without recomputing.
- Cost per receipt is recorded on the movement, so stock value uses current cost but history keeps what was actually paid.
- The UI uses hash routing (`/#/products`) so refreshing any page works on Vercel with no extra rewrite rules.
- No chart library: the three charts are small hand-written SVG, which keeps the bundle at about 86 KB gzipped.
