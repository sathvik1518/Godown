import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../api.js", async () => {
  const actual = await vi.importActual("../api.js");
  return {
    ...actual,
    api: {
      login: vi.fn(),
      me: vi.fn(),
      dashboard: vi.fn(),
      productSummary: vi.fn().mockResolvedValue({ total: 0, low: 0, out: 0, archived: 0 }),
    },
  };
});

import App from "../App.jsx";
import { ApiError, api, clearToken, setToken } from "../api.js";
import { AuthProvider } from "../context/Auth.jsx";
import { ToastProvider } from "../context/Toast.jsx";

const dashboard = {
  today: "2026-11-14",
  kpis: { total_products: 37, units_on_hand: 1345, stock_value: "194130.00", out_of_stock: 3, low_stock: 5, archived: 0 },
  moved_today: { units_in: 215, units_out: 16, transactions: 13 },
  trend: [], low_stock: [], recent_movements: [], categories: [], open_orders: [], order_counts: { draft: 1, ordered: 1 },
};

function renderApp(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  clearToken();
  vi.clearAllMocks();
  api.dashboard.mockResolvedValue(dashboard);
});

describe("login", () => {
  it("shows field errors and does not call the API when empty", async () => {
    renderApp("/login");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(api.login).not.toHaveBeenCalled();
  });

  it("rejects a malformed email", async () => {
    renderApp("/login");
    await userEvent.type(screen.getByLabelText(/email/i), "not-an-email");
    await userEvent.type(screen.getByLabelText(/password/i), "x");
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
  });

  it("fills credentials from a demo button", async () => {
    renderApp("/login");
    await userEvent.click(screen.getByRole("button", { name: /admin demo/i }));
    expect(screen.getByLabelText(/email/i)).toHaveValue("saisathvik@gmail.com");
  });

  it("shows the server's message when the login fails", async () => {
    api.login.mockRejectedValue(new ApiError("Incorrect email or password.", { status: 401 }));
    renderApp("/login");
    await userEvent.click(screen.getByRole("button", { name: /admin demo/i }));
    await userEvent.click(screen.getByRole("button", { name: /^sign in$/i }));
    expect(await screen.findByText("Incorrect email or password.")).toBeInTheDocument();
  });
});

describe("signed in", () => {
  const asUser = (role) => {
    setToken("t");
    api.me.mockResolvedValue({ id: 1, name: "Test User", email: "t@x.in", role, is_active: true });
  };

  it("redirects to login without a token", async () => {
    renderApp("/products");
    expect(await screen.findByRole("heading", { name: /sign in/i })).toBeInTheDocument();
  });

  it("shows the Team link to admins", async () => {
    asUser("admin");
    renderApp("/");
    await waitFor(() => expect(screen.getAllByRole("link", { name: /team/i }).length).toBeGreaterThan(0));
  });

  it("hides the Team link from staff", async () => {
    asUser("staff");
    renderApp("/");
    await screen.findByText(/good (morning|afternoon|evening)/i);
    expect(screen.queryByRole("link", { name: /team/i })).not.toBeInTheDocument();
  });

  it("shows the dashboard figures", async () => {
    asUser("admin");
    renderApp("/");
    expect(await screen.findByText(/1,94,130/)).toBeInTheDocument();
    expect(screen.getByText(/3 out of stock/i)).toBeInTheDocument();
  });
});
