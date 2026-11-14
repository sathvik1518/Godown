import { describe, expect, it } from "vitest";
import { inr, initials, marginPercent, num, reasonLabel } from "../utils/format.js";
import { isWholeNumber, splitError, toNumber } from "../utils/forms.js";
import { ApiError } from "../api.js";

describe("format helpers", () => {
  it("formats rupees with Indian digit grouping", () => {
    expect(inr(194130, 0)).toContain("1,94,130");
    expect(inr(255)).toContain("255.00");
  });
  it("shows a dash for missing values", () => {
    expect(inr(null)).toBe("—");
    expect(num(undefined)).toBe("—");
  });
  it("groups plain numbers the Indian way", () => {
    expect(num(1234567)).toBe("12,34,567");
  });
  it("makes initials from a name", () => {
    expect(initials("Kavya Reddy")).toBe("KR");
    expect(initials("Sathvik")).toBe("S");
  });
  it("calculates margin on selling price", () => {
    expect(marginPercent(80, 100)).toBeCloseTo(20);
  });
  it("turns a reason code into a readable label", () => {
    expect(reasonLabel("sale")).toBe("Sale");
    expect(reasonLabel(null)).toBe("");
  });
});

describe("form helpers", () => {
  it("accepts whole numbers only", () => {
    expect(isWholeNumber("12")).toBe(true);
    expect(isWholeNumber("1.5")).toBe(false);
    expect(isWholeNumber("")).toBe(false);
    expect(isWholeNumber("abc")).toBe(false);
  });
  it("toNumber returns a number for numeric text", () => {
    expect(toNumber("12.5")).toBe(12.5);
  });
  it("splitError separates field errors from the general message", () => {
    const err = new ApiError("Please fix the highlighted fields.", { status: 422, errors: { sku: "SKU already exists." } });
    const { fields, general } = splitError(err);
    expect(fields.sku).toBe("SKU already exists.");
    expect(general).toBe("");
    expect(splitError(new ApiError("Boom")).general).toBe("Boom");
  });
});
