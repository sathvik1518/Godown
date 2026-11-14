"""Godown API entry point.

Local:   uvicorn main:app --reload
Vercel:  api/index.py mounts this app under /api
"""
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import config
import db
from errors import register_error_handlers
from routers import auth, categories, dashboard, products, purchase_orders, stock, suppliers, users

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="Godown API",
    version="1.0.0",
    description=(
        "Inventory and purchase management. Stock can never go negative, every change is "
        "recorded in a permanent ledger, and every stock update is one database transaction."
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

for module in (auth, users, categories, suppliers, products, stock, purchase_orders, dashboard):
    app.include_router(module.router)


@app.get("/health", tags=["Health"])
def health():
    row = db.fetch_one("SELECT 1 AS ok")
    return {"status": "ok", "database": "connected" if row else "unknown"}
