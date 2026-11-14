"""Demo data for Godown: a small Hyderabad grocery and household shop.

    python seed.py            create tables and add demo data only if the database is empty
    python seed.py --reset    wipe everything and rebuild the history so it ends today

The history is simulated in memory (45 days of sales, restocks and a few stock
counts) and then written with a handful of bulk inserts, so seeding takes
well under a second even on a remote database. Every balance_after value is
computed from the previous one, so the ledger always adds up to qty_on_hand.
"""
import math
import os
import random
import sys
from datetime import date, datetime, time, timedelta, timezone

from psycopg2.extras import execute_values

import db
import migrate
import security

IST = timezone(timedelta(hours=5, minutes=30))  # India has no daylight saving
HISTORY_DAYS = 45
SEED_LOCK = 727202

ADMIN_NAME = "Sathvik"
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "saisathvik@gmail.com").lower()
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "Admin@123")
STAFF_PASSWORD = "Staff@1234"
STAFF = [
    ("Kavya Reddy", "kavya.reddy@gmail.com"),
    ("Ramesh Yadav", "ramesh.yadav@gmail.com"),
]

CATEGORIES = [
    ("Staples & Grains", "Atta, rice, dal, sugar and salt"),
    ("Oils & Ghee", "Cooking oils and ghee"),
    ("Snacks & Biscuits", "Packaged snacks, biscuits and noodles"),
    ("Beverages", "Tea, coffee, soft drinks and water"),
    ("Personal Care", "Soaps, shampoos and toothpaste"),
    ("Household", "Cleaning and home care"),
]

# name, contact, phone, email, address, gstin
SUPPLIERS = [
    ("Sri Venkateswara Traders", "Venkat Rao", "+91 98480 12345", "svtraders.hyd@gmail.com",
     "12-4-78, Begum Bazaar, Hyderabad 500012", "36AAKFS4821M1ZP"),
    ("Balaji Wholesale Mart", "Srinivas Reddy", "+91 99890 45612", "balajimart.sales@gmail.com",
     "Plot 41, Bowenpally Market Yard, Secunderabad 500011", "36BHRPB7392K1Z4"),
    ("Ganesh Agencies", "Ganesh Kumar", "+91 97012 33481", "ganeshagencies.hyd@gmail.com",
     "5-9-201, Abids Road, Hyderabad 500001", "36AADFG2210C1ZX"),
    ("Lakshmi Distributors", "Lakshmi Prasad", "+91 90300 77214", "lakshmidist@gmail.com",
     "8-2-120, Road No. 2, Banjara Hills, Hyderabad 500034", "36ABCPL5567H1Z2"),
    ("Hanuman Provisions", "Hanumantha Rao", "+91 98660 90871", "hanumanprovisions@gmail.com",
     "3-6-45, Himayatnagar, Hyderabad 500029", "36AAHFH9034R1ZK"),
    ("Mahalakshmi Agencies", "Mahesh Goud", "+91 94410 28365", "mahalakshmi.agencies@gmail.com",
     "1-1-60, Kukatpally Housing Board, Hyderabad 500072", "36AAMFM6178D1ZB"),
]

# sku, name, category index, supplier index, unit, cost, sell, reorder level, sales per day, shelf
PRODUCTS = [
    ("STP-ATA-5", "Aashirvaad Atta 5 kg", 0, 0, "pack", 232, 255, 20, 4.0, "A-01"),
    ("STP-ATA-10", "Aashirvaad Atta 10 kg", 0, 0, "pack", 448, 485, 12, 2.0, "A-01"),
    ("STP-RIC-5", "India Gate Basmati Rice 5 kg", 0, 0, "pack", 610, 665, 10, 2.0, "A-02"),
    ("STP-RIC-26", "Sona Masoori Rice 26 kg", 0, 0, "pack", 1180, 1290, 6, 1.0, "A-02"),
    ("STP-DAL-TOOR", "Toor Dal 1 kg", 0, 3, "pack", 138, 152, 25, 5.0, "A-03"),
    ("STP-DAL-MOONG", "Moong Dal 1 kg", 0, 3, "pack", 112, 124, 20, 3.0, "A-03"),
    ("STP-SUG-1", "Sugar 1 kg", 0, 0, "kg", 41, 46, 60, 12.0, "A-04"),
    ("STP-SAL-1", "Tata Salt 1 kg", 0, 0, "pack", 22, 26, 40, 8.0, "A-04"),
    ("STP-POH-500", "Poha Thick 500 g", 0, 3, "pack", 34, 40, 15, 3.0, "A-05"),
    ("OIL-SUN-1", "Fortune Sunflower Oil 1 L", 1, 1, "pcs", 118, 128, 30, 7.0, "B-01"),
    ("OIL-SUN-5", "Fortune Sunflower Oil 5 L", 1, 1, "pcs", 585, 625, 8, 1.5, "B-01"),
    ("OIL-GN-1", "Groundnut Oil 1 L", 1, 1, "pcs", 192, 210, 15, 2.0, "B-02"),
    ("GHE-AMU-500", "Amul Ghee 500 ml", 1, 1, "pcs", 285, 310, 12, 2.0, "B-03"),
    ("GHE-AMU-1", "Amul Ghee 1 L", 1, 1, "pcs", 560, 605, 8, 1.0, "B-03"),
    ("SNK-PAR-G", "Parle-G Biscuits 800 g", 2, 2, "pack", 78, 85, 24, 6.0, "C-01"),
    ("SNK-BRI-MG", "Britannia Marie Gold 250 g", 2, 2, "pack", 28, 32, 20, 4.0, "C-01"),
    ("SNK-MAG-12", "Maggi 2-Minute Noodles (12 pack)", 2, 2, "box", 150, 168, 10, 2.0, "C-02"),
    ("SNK-LAY-52", "Lay's Classic Salted 52 g", 2, 2, "pcs", 16, 20, 40, 9.0, "C-03"),
    ("SNK-KUR-90", "Kurkure Masala Munch 90 g", 2, 2, "pcs", 17, 20, 30, 6.0, "C-03"),
    ("SNK-HAL-BHU", "Haldiram's Bhujia 400 g", 2, 2, "pack", 118, 130, 10, 2.0, "C-04"),
    ("BEV-TEA-RL", "Red Label Tea 500 g", 3, 3, "pack", 248, 268, 12, 2.0, "D-01"),
    ("BEV-TEA-TG", "Tata Gold Tea 250 g", 3, 3, "pack", 138, 152, 10, 2.0, "D-01"),
    ("BEV-COF-NES", "Nescafe Classic 100 g", 3, 3, "pcs", 295, 320, 8, 1.0, "D-02"),
    ("BEV-COK-2", "Coca-Cola 2 L", 3, 3, "pcs", 82, 95, 24, 5.0, "D-03"),
    ("BEV-MAZ-600", "Maaza Mango 600 ml", 3, 3, "pcs", 33, 40, 24, 4.0, "D-03"),
    ("BEV-WAT-1", "Bisleri Water 1 L", 3, 3, "pcs", 14, 20, 48, 12.0, "D-04"),
    ("PER-COL-200", "Colgate Strong Teeth 200 g", 4, 4, "pcs", 98, 108, 16, 3.0, "E-01"),
    ("PER-LUX-3", "Lux Soap (3 x 100 g)", 4, 4, "pack", 108, 120, 14, 2.0, "E-01"),
    ("PER-DOV-SH", "Dove Shampoo 340 ml", 4, 4, "pcs", 295, 325, 8, 1.0, "E-02"),
    ("PER-HEA-SH", "Head & Shoulders Shampoo 180 ml", 4, 4, "pcs", 165, 178, 8, 1.0, "E-02"),
    ("PER-PAR-OIL", "Parachute Coconut Oil 500 ml", 4, 4, "pcs", 192, 210, 12, 2.0, "E-03"),
    ("HOU-SUR-1", "Surf Excel Easy Wash 1 kg", 5, 5, "pack", 118, 130, 16, 3.0, "F-01"),
    ("HOU-VIM-500", "Vim Dishwash Liquid 500 ml", 5, 5, "pcs", 98, 108, 14, 2.0, "F-01"),
    ("HOU-HAR-500", "Harpic Toilet Cleaner 500 ml", 5, 5, "pcs", 92, 102, 10, 2.0, "F-02"),
    ("HOU-COM-860", "Comfort Fabric Conditioner 860 ml", 5, 5, "pcs", 215, 235, 6, 1.0, "F-02"),
    ("HOU-SCR-3", "Scotch-Brite Scrub Pad (pack of 3)", 5, 5, "pack", 42, 50, 16, 2.0, "F-03"),
    ("HOU-GAR-30", "Garbage Bags Medium (30 pcs)", 5, 5, "pack", 62, 75, 10, 2.0, "F-03"),
]

# Products that end the demo running low (target = reorder level minus a little) or out (0).
RUN_DOWN = {
    "OIL-SUN-1": "low", "STP-SUG-1": "low", "BEV-COK-2": "low", "SNK-LAY-52": "low", "PER-DOV-SH": "low",
    "STP-DAL-TOOR": "out", "HOU-VIM-500": "out", "SNK-MAG-12": "out",
}
# Snack lines received together on one (already received) purchase order.
PO_RECEIVED_SKUS = ["SNK-PAR-G", "SNK-BRI-MG", "SNK-KUR-90", "SNK-HAL-BHU"]
COUNTED_SKUS = ["STP-SUG-1", "BEV-WAT-1", "SNK-LAY-52"]

ISSUE_NOTES = {
    "damaged": ["Packet torn in storage", "Dropped while shelving", "Leaking bottle"],
    "expired": ["Past best-before date", "Expired batch removed"],
    "internal_use": ["Used in the shop", "Staff tea"],
}


def poisson(rng, lam):
    limit, k, p = math.exp(-lam), 0, 1.0
    while p > limit:
        k += 1
        p *= rng.random()
    return k - 1


def at(day, minutes_after_9am):
    return datetime.combine(day, time(9, 0), tzinfo=IST) + timedelta(minutes=minutes_after_9am)


def simulate(today, now, rng):
    """Build every stock movement for the demo, product by product."""
    events = []  # dicts: sku, ts, kind, qty (signed), balance, reason, reference, note, user, po_key
    invoice_counter = {}
    po_received_number = f"PO-{today.year}-0002"
    staff_pool = ["s1"] * 5 + ["s2"] * 4 + ["admin"]

    for sku, name, _c, supplier_idx, _u, cost, _sell, reorder, per_day, _loc in PRODUCTS:
        qty = 0
        target = None
        if sku in RUN_DOWN:
            target = 0 if RUN_DOWN[sku] == "out" else max(1, reorder - rng.randint(1, 3))

        def push(ts, kind, delta, reason, reference=None, note=None, user=None, po_key=None):
            nonlocal qty
            if ts > now:
                return
            if delta < 0 and -delta > qty:
                delta = -qty
            if delta == 0:
                return
            qty += delta
            events.append({
                "sku": sku, "ts": ts, "kind": kind, "qty": delta, "balance": qty, "reason": reason,
                "reference": reference, "note": note, "user": user or rng.choice(staff_pool),
                "po_key": po_key, "supplier_idx": supplier_idx if kind == "receipt" else None,
                "cost": cost,
            })

        start = today - timedelta(days=HISTORY_DAYS)
        push(at(start, 30), "receipt", reorder * 4 + rng.randint(0, reorder), "opening_stock",
             "Opening stock", user="admin")

        for days_ago in range(HISTORY_DAYS - 1, -1, -1):
            day = today - timedelta(days=days_ago)
            day_events = []  # (ts, kind, delta, reason, reference, note, user, po_key)

            # --- restocking -------------------------------------------------
            restock = 0
            po_key = None
            if sku in PO_RECEIVED_SKUS and days_ago == 12:
                restock, po_key = reorder * 3, "RECEIVED"
            elif target is None or days_ago > 6:
                if qty <= reorder and rng.random() < 0.8:
                    restock = reorder * 3 + rng.randint(0, reorder)
            elif days_ago == 6 and qty < reorder * 3:
                restock = reorder * 3 - qty
            if restock:
                ref = po_received_number if po_key else f"INV-{rng.randint(1000, 9999)}"
                day_events.append((at(day, rng.randint(5, 90)), "receipt", restock, "purchase_order" if po_key
                                   else "purchase", ref, None, "admin" if po_key else None, po_key))

            # --- sales ------------------------------------------------------
            drawdown = target is not None and 1 <= days_ago <= 5
            if drawdown:
                need = qty - target
                units = need if days_ago == 1 else math.ceil(need / days_ago) if need > 0 else 0
            elif target is not None and days_ago == 0:
                units = 0
            else:
                weekend = 1.35 if day.weekday() >= 5 else 1.0
                units = poisson(rng, per_day * weekend)
            while units > 0:
                chunk = min(units, rng.randint(1, 3))
                units -= chunk
                day_events.append((at(day, rng.randint(0, 690)), "issue", -chunk, "sale", "SALE", None, None, None))

            # --- rare wastage -------------------------------------------------
            if not drawdown and target is None and rng.random() < 0.025:
                reason = rng.choice(["damaged", "expired", "internal_use"])
                day_events.append((at(day, rng.randint(0, 690)), "issue", -rng.randint(1, 2), reason,
                                   None, rng.choice(ISSUE_NOTES[reason]), None, None))

            # --- monthly stock count on one day --------------------------------
            if sku in COUNTED_SKUS and days_ago == 20 and qty > 5:
                day_events.append((at(day, 580), "adjustment", -rng.randint(1, 3), "stock_count", None,
                                   "Monthly stock count: shelf was short", "admin", None))

            for ts, kind, delta, reason, ref, note, user, key in sorted(day_events, key=lambda e: e[0]):
                if ref == "SALE":
                    n = invoice_counter.get(day, 0) + 1
                    invoice_counter[day] = n
                    ref = f"BILL-{day:%y%m%d}-{n:03d}"
                push(ts, kind, delta, reason, ref, note, user, key)

    events.sort(key=lambda e: e["ts"])
    return events


def seed_all(cur, today=None, now=None, rng_seed=42):
    rng = random.Random(rng_seed)
    now = now or datetime.now(IST)
    today = today or now.astimezone(IST).date()

    # users
    user_rows = [(ADMIN_NAME, ADMIN_EMAIL, security.hash_password(ADMIN_PASSWORD), "admin")]
    for name, email in STAFF:
        user_rows.append((name, email, security.hash_password(STAFF_PASSWORD), "staff"))
    users = execute_values(
        cur, "INSERT INTO users (name, email, password_hash, role) VALUES %s RETURNING id", user_rows, fetch=True
    )
    user_ids = {"admin": users[0]["id"], "s1": users[1]["id"], "s2": users[2]["id"]}

    category_ids = [
        r["id"] for r in execute_values(
            cur, "INSERT INTO categories (name, description) VALUES %s RETURNING id", CATEGORIES, fetch=True)
    ]
    supplier_ids = [
        r["id"] for r in execute_values(
            cur,
            "INSERT INTO suppliers (name, contact_person, phone, email, address, gstin) VALUES %s RETURNING id",
            SUPPLIERS, fetch=True)
    ]

    events = simulate(today, now, rng)
    final_qty = {}
    for e in events:
        final_qty[e["sku"]] = e["balance"]
    last_cost = {p[0]: p[5] for p in PRODUCTS}

    product_rows = [
        (sku, name, category_ids[cat], supplier_ids[sup], unit, cost, sell, reorder, final_qty.get(sku, 0), loc)
        for sku, name, cat, sup, unit, cost, sell, reorder, _d, loc in PRODUCTS
    ]
    inserted = execute_values(
        cur,
        """INSERT INTO products (sku, name, category_id, supplier_id, unit, cost_price, sell_price,
                                 reorder_level, qty_on_hand, location) VALUES %s RETURNING id, sku""",
        product_rows, fetch=True,
    )
    product_id = {r["sku"]: r["id"] for r in inserted}

    # purchase orders (one cancelled, one received, one placed, one draft)
    def make_po(number, supplier_idx, status, created, lines, expected=None, notes=None, ordered=None, received=None):
        cur.execute(
            """INSERT INTO purchase_orders (po_number, supplier_id, status, expected_date, notes, created_by,
                      created_at, ordered_at, received_at, cancelled_at)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) RETURNING id""",
            (number, supplier_ids[supplier_idx], status, expected, notes, user_ids["admin"], created, ordered,
             received, created + timedelta(days=1) if status == "cancelled" else None),
        )
        po_id = cur.fetchone()["id"]
        execute_values(
            cur, "INSERT INTO purchase_order_items (purchase_order_id, product_id, quantity, unit_cost) VALUES %s",
            [(po_id, product_id[sku], q, last_cost[sku]) for sku, q in lines],
        )
        return po_id

    year = today.year
    sku_reorder = {p[0]: p[7] for p in PRODUCTS}
    make_po(f"PO-{year}-0001", 4, "cancelled", at(today - timedelta(days=30), 120),
            [("PER-LUX-3", 28), ("PER-COL-200", 32)], notes="Supplier could not deliver")
    po_received = make_po(
        f"PO-{year}-0002", 2, "received", at(today - timedelta(days=14), 150),
        [(s, sku_reorder[s] * 3) for s in PO_RECEIVED_SKUS],
        expected=today - timedelta(days=12), ordered=at(today - timedelta(days=14), 160),
        received=at(today - timedelta(days=12), 100))
    make_po(f"PO-{year}-0003", 1, "ordered", at(today - timedelta(days=2), 200),
            [("OIL-SUN-1", 60), ("OIL-GN-1", 24)], expected=today + timedelta(days=2),
            notes="Call before delivery", ordered=at(today - timedelta(days=2), 215))
    make_po(f"PO-{year}-0004", 3, "draft", at(today - timedelta(days=1), 300),
            [("BEV-COK-2", 48), ("STP-DAL-TOOR", 50)], notes="Waiting for rate confirmation")
    cur.execute("SELECT setval('po_number_seq', 4)")

    # the ledger, in time order
    ledger_rows = [
        (product_id[e["sku"]], e["kind"], e["qty"], e["balance"], e["cost"],
         supplier_ids[e["supplier_idx"]] if e["supplier_idx"] is not None else None,
         e["reference"], e["reason"], e["note"], user_ids[e["user"]], e["ts"],
         po_received if e["po_key"] == "RECEIVED" else None)
        for e in events
    ]
    execute_values(
        cur,
        """INSERT INTO stock_movements (product_id, movement_type, quantity, balance_after, unit_cost,
               supplier_id, reference, reason, note, created_by, created_at, purchase_order_id) VALUES %s""",
        ledger_rows, page_size=1000,
    )
    return {"users": 3, "products": len(PRODUCTS), "movements": len(ledger_rows)}


def ensure_admin(cur):
    cur.execute("SELECT COUNT(*) AS n FROM users")
    if cur.fetchone()["n"] == 0:
        cur.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, 'admin')",
            (ADMIN_NAME, ADMIN_EMAIL, security.hash_password(ADMIN_PASSWORD)),
        )


def bootstrap():
    """Create/upgrade tables, then add demo data if the database is brand new."""
    migrate.run_migrations()
    with db.transaction() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (SEED_LOCK,))
        cur.execute("SELECT COUNT(*) AS n FROM users")
        if cur.fetchone()["n"] > 0:
            return "existing"
        if os.getenv("SEED_DEMO", "1") == "0":
            ensure_admin(cur)
            return "admin-only"
        seed_all(cur)
        return "seeded"


def reset():
    migrate.run_migrations()
    with db.transaction() as cur:
        cur.execute("SELECT pg_advisory_xact_lock(%s)", (SEED_LOCK,))
        cur.execute(
            """TRUNCATE stock_movements, purchase_order_items, purchase_orders, products,
                        suppliers, categories, users RESTART IDENTITY CASCADE"""
        )
        cur.execute("ALTER SEQUENCE po_number_seq RESTART WITH 1")
        return seed_all(cur)


if __name__ == "__main__":
    if "--reset" in sys.argv:
        target = os.getenv("DATABASE_URL") and "the DATABASE_URL database" or os.getenv("DB_NAME", "godown_dev")
        if "--yes" not in sys.argv:
            answer = input(f"This deletes ALL data in {target} and loads fresh demo data. Type YES to continue: ")
            if answer.strip() != "YES":
                print("Cancelled.")
                sys.exit(1)
        print("Reset complete:", reset())
    else:
        print("Database status:", bootstrap())
