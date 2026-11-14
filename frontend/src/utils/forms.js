// Helpers shared by every form.

// The API answers form problems with { errors: { field: "message" } }. This splits an error
// into messages for fields and one general message for everything else.
export function splitError(error) {
  const fields = error?.errors && typeof error.errors === "object" ? error.errors : {};
  const hasFields = Object.keys(fields).length > 0;
  return { fields, general: hasFields ? "" : error?.message || "Something went wrong. Please try again." };
}

// "" -> undefined, "12" -> 12. Lets forms keep text in inputs and send real numbers.
export const toNumber = (value) => {
  if (value === "" || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : NaN;
};

export const isWholeNumber = (value) => Number.isInteger(Number(value)) && String(value).trim() !== "";
