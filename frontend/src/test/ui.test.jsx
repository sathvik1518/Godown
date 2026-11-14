import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OrderPill, Pagination, StockBar, StockPill } from "../components/ui.jsx";

describe("pills", () => {
  it("labels stock statuses in plain words", () => {
    render(<><StockPill status="out" /><StockPill status="low" /><StockPill status="ok" /></>);
    expect(screen.getByText("Out of stock")).toBeInTheDocument();
    expect(screen.getByText("Low stock")).toBeInTheDocument();
    expect(screen.getByText("In stock")).toBeInTheDocument();
  });
  it("labels order statuses", () => {
    render(<OrderPill status="received" />);
    expect(screen.getByText("Received")).toBeInTheDocument();
  });
});

describe("StockBar", () => {
  it("never overflows its track", () => {
    const { container } = render(<StockBar qty={500} reorder={10} status="ok" />);
    expect(container.querySelector("span > span").style.width).toBe("100%");
  });
  it("is empty at zero stock", () => {
    const { container } = render(<StockBar qty={0} reorder={10} status="out" />);
    expect(container.querySelector("span > span").style.width).toBe("0%");
  });
});

describe("Pagination", () => {
  it("shows the range and disables Previous on page 1", () => {
    const onPage = vi.fn();
    render(<Pagination page={1} pages={3} total={55} pageSize={25} onPage={onPage} noun="products" />);
    expect(screen.getByText("1–25")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPage).toHaveBeenCalledWith(2);
  });
  it("renders nothing when there are no rows", () => {
    const { container } = render(<Pagination page={1} pages={1} total={0} pageSize={25} onPage={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
