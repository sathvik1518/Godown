import { describe, expect, it, vi } from "vitest";
import { validateStock } from "../components/StockDialog.jsx";
import { validateProduct } from "../components/ProductForm.jsx";
import { validateSupplier } from "../components/SupplierForm.jsx";
import { validateOrder } from "../pages/OrderForm.jsx";

const product = { id: 1, qty_on_hand: 10, unit: "pcs" };

describe("validateStock", () => {
  it("blocks an issue larger than what is on the shelf", () => {
    const e = validateStock("issue", product, { quantity: "11" });
    expect(e.quantity).toBe("Only 10 pcs in stock.");
  });
  it("allows issuing exactly what is on hand", () => {
    expect(validateStock("issue", product, { quantity: "10" })).toEqual({});
  });
  it("rejects zero, negative and fractional quantities", () => {
    for (const q of ["0", "-3", "2.5", ""]) {
      expect(validateStock("receive", product, { quantity: q, unit_cost: "" }).quantity).toBeTruthy();
    }
  });
  it("needs a product", () => {
    expect(validateStock("receive", null, { quantity: "1", unit_cost: "" }).product_id).toBeTruthy();
  });
  it("requires a note and a different count for an adjustment", () => {
    expect(validateStock("adjust", product, { new_quantity: "10", note: "ok" }).new_quantity).toMatch(/nothing to adjust/);
    expect(validateStock("adjust", product, { new_quantity: "8", note: "" }).note).toBeTruthy();
    expect(validateStock("adjust", product, { new_quantity: "8", note: "Recount" })).toEqual({});
  });
});

describe("validateProduct", () => {
  const good = { name: "Toor Dal 1 kg", sku: "DAL-TOO-1", category_id: "2", cost_price: "120", sell_price: "135.50", reorder_level: "10", opening_stock: "0" };
  it("accepts a valid product", () => {
    expect(validateProduct(good, true)).toEqual({});
  });
  it("flags every bad field", () => {
    const e = validateProduct({ ...good, name: "A", sku: "bad sku!", category_id: "", cost_price: "x", sell_price: "-1", reorder_level: "1.5", opening_stock: "-2" }, true);
    expect(Object.keys(e).sort()).toEqual(["category_id", "cost_price", "name", "opening_stock", "reorder_level", "sell_price", "sku"]);
  });
  it("ignores opening stock when editing", () => {
    expect(validateProduct({ ...good, opening_stock: "junk" }, false)).toEqual({});
  });
});

describe("validateSupplier", () => {
  it("only needs a name", () => {
    expect(validateSupplier({ name: "Ganesh Agencies", phone: "", email: "", gstin: "" })).toEqual({});
  });
  it("checks phone, email and GSTIN when given", () => {
    const e = validateSupplier({ name: "G", phone: "abc", email: "nope", gstin: "123" });
    expect(Object.keys(e).sort()).toEqual(["email", "gstin", "name", "phone"]);
  });
  it("accepts a well-formed GSTIN", () => {
    expect(validateSupplier({ name: "Ganesh Agencies", phone: "", email: "", gstin: "36AAKFS4821M1ZP" }).gstin).toBeUndefined();
  });
});

describe("validateOrder", () => {
  it("needs a supplier and at least one line", () => {
    const e = validateOrder({ supplier_id: "", expected_date: "" }, []);
    expect(e.supplier_id).toBeTruthy();
    expect(e.items).toBeTruthy();
  });
  it("flags a bad quantity or cost on a line", () => {
    const e = validateOrder({ supplier_id: "1", expected_date: "" }, [{ quantity: "0", unit_cost: "" }]);
    expect(e["items.0.quantity"]).toBeTruthy();
    expect(e["items.0.unit_cost"]).toBeTruthy();
  });
  it("rejects a delivery date in the past", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-14T10:00:00Z"));
    const e = validateOrder({ supplier_id: "1", expected_date: "2026-11-01" }, [{ quantity: "5", unit_cost: "10" }]);
    expect(e.expected_date).toBeTruthy();
    vi.useRealTimers();
  });
});
