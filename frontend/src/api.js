// All calls to the Godown API go through this file.
const BASE = "/api";
const TOKEN_KEY = "godown.token";

export class ApiError extends Error {
  constructor(message, { status = 0, code = null, errors = null, data = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.errors = errors; // { fieldName: "message" } for form problems
    this.data = data;
  }
}

export const getToken = () => {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
};
export const setToken = (token) => {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode: the session simply will not survive a reload */
  }
};
export const clearToken = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
};

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export function queryString(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function send(method, path, { body, params } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(BASE + path + queryString(params), {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Cannot reach the server. Check your internet connection and try again.", {
      code: "network",
    });
  }
  return response;
}

async function request(method, path, options) {
  const response = await send(method, path, options);
  if (response.status === 204) return null;

  const isJson = (response.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    if (response.status === 401 && !path.startsWith("/auth/login")) onUnauthorized();
    throw new ApiError(data?.detail || `Something went wrong (error ${response.status}).`, {
      status: response.status,
      code: data?.code,
      errors: data?.errors,
      data,
    });
  }
  return data;
}

// Saves a CSV (or any file) the server sends back.
async function download(path, params, filename) {
  const response = await send("GET", path, { params });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(data?.detail || "The export failed.", { status: response.status });
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const get = (path, params) => request("GET", path, { params });
const post = (path, body) => request("POST", path, { body });
const put = (path, body) => request("PUT", path, { body });
const patch = (path, body) => request("PATCH", path, { body });
const del = (path) => request("DELETE", path);

export const api = {
  login: (email, password) => post("/auth/login", { email, password }),
  me: () => get("/auth/me"),
  changePassword: (body) => post("/auth/change-password", body),

  dashboard: () => get("/dashboard"),

  products: (params) => get("/products", params),
  productSummary: () => get("/products/summary"),
  product: (id) => get(`/products/${id}`),
  createProduct: (body) => post("/products", body),
  updateProduct: (id, body) => patch(`/products/${id}`, body),
  deleteProduct: (id) => del(`/products/${id}`),
  exportProducts: (params) => download("/products/export.csv", params, "godown-products.csv"),

  categories: () => get("/categories"),
  createCategory: (body) => post("/categories", body),
  updateCategory: (id, body) => put(`/categories/${id}`, body),
  deleteCategory: (id) => del(`/categories/${id}`),

  suppliers: (params) => get("/suppliers", params),
  createSupplier: (body) => post("/suppliers", body),
  updateSupplier: (id, body) => put(`/suppliers/${id}`, body),
  deleteSupplier: (id) => del(`/suppliers/${id}`),

  receive: (body) => post("/stock/receipts", body),
  issue: (body) => post("/stock/issues", body),
  adjust: (body) => post("/stock/adjustments", body),
  movements: (params) => get("/movements", params),
  exportMovements: (params) => download("/movements/export.csv", params, "godown-stock-ledger.csv"),

  orders: (params) => get("/purchase-orders", params),
  order: (id) => get(`/purchase-orders/${id}`),
  createOrder: (body) => post("/purchase-orders", body),
  updateOrder: (id, body) => put(`/purchase-orders/${id}`, body),
  placeOrder: (id) => post(`/purchase-orders/${id}/order`),
  receiveOrder: (id) => post(`/purchase-orders/${id}/receive`),
  cancelOrder: (id) => post(`/purchase-orders/${id}/cancel`),
  ordersFromLowStock: () => post("/purchase-orders/from-low-stock"),

  users: () => get("/users"),
  createUser: (body) => post("/users", body),
  updateUser: (id, body) => patch(`/users/${id}`, body),
};
