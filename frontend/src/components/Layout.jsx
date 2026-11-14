import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { api } from "../api.js";
import { useAuth } from "../context/Auth.jsx";
import { useStockActions } from "../context/StockActions.jsx";
import { useLoad, useTheme } from "../hooks.js";
import Icon from "./Icon.jsx";
import { Modal } from "./Modal.jsx";
import PasswordDialog from "./PasswordDialog.jsx";
import QuickFind from "./QuickFind.jsx";
import { Avatar, Button } from "./ui.jsx";

const GROUPS = [
  {
    title: "Operate",
    items: [
      { to: "/", label: "Dashboard", icon: "dashboard", end: true },
      { to: "/products", label: "Products", icon: "package", alerts: true },
      { to: "/ledger", label: "Stock ledger", icon: "ledger" },
      { to: "/orders", label: "Purchase orders", icon: "orders" },
    ],
  },
  {
    title: "Manage",
    items: [
      { to: "/suppliers", label: "Suppliers", icon: "truck" },
      { to: "/categories", label: "Categories", icon: "tag" },
      { to: "/team", label: "Team", icon: "users", admin: true },
    ],
  },
];

const BOTTOM = [
  { to: "/", label: "Home", icon: "dashboard", end: true },
  { to: "/products", label: "Products", icon: "package" },
  { to: "/ledger", label: "Ledger", icon: "ledger" },
  { to: "/orders", label: "Orders", icon: "orders" },
];

export function Brand({ light = false }) {
  return (
    <span className={`brand ${light ? "brand-light" : ""}`}>
      <span className="brand-mark" aria-hidden="true">
        <svg viewBox="0 0 32 32" width="30" height="30">
          <rect width="32" height="32" rx="8" fill="currentColor" />
          <path d="M8 21V12.5L16 8l8 4.5V21" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M12 21v-5h8v5" fill="none" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="brand-name">Godown</span>
    </span>
  );
}

function UserMenu({ onPassword }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="usermenu" ref={ref}>
      <button type="button" className="usermenu-btn" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Avatar name={user.name} />
        <span className="usermenu-text">
          <strong>{user.name}</strong>
          <small>{user.role === "admin" ? "Admin" : "Staff"}</small>
        </span>
        <Icon name="chevron-down" size={15} />
      </button>
      {open ? (
        <div className="menu" role="menu">
          <div className="menu-head">
            <strong>{user.name}</strong>
            <small>{user.email}</small>
          </div>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onPassword(); }}>
            <Icon name="key" size={16} /> Change password
          </button>
          <button type="button" role="menuitem" onClick={logout}>
            <Icon name="logout" size={16} /> Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default function Layout() {
  const { isAdmin, user, logout } = useAuth();
  const stock = useStockActions();
  const location = useLocation();
  const navigate = useNavigate();
  const [theme, toggleTheme] = useTheme();
  const [finding, setFinding] = useState(false);
  const [more, setMore] = useState(false);
  const [password, setPassword] = useState(false);
  const summary = useLoad(() => api.productSummary(), []);
  const alerts = summary.data ? Number(summary.data.low) + Number(summary.data.out) : 0;

  useEffect(() => {
    window.scrollTo(0, 0);
    setMore(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = (event) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
      if ((event.key === "k" && (event.ctrlKey || event.metaKey)) || (event.key === "/" && !typing)) {
        event.preventDefault();
        setFinding(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const visible = (items) => items.filter((item) => !item.admin || isAdmin);

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <aside className="sidebar">
        <NavLink to="/" className="sidebar-brand" aria-label="Godown home">
          <Brand light />
        </NavLink>
        <nav aria-label="Main">
          {GROUPS.map((group) => (
            <div className="nav-group" key={group.title}>
              <p className="nav-title">{group.title}</p>
              {visible(group.items).map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                  <Icon name={item.icon} size={18} />
                  <span>{item.label}</span>
                  {item.alerts && alerts > 0 ? (
                    <span className="nav-badge" title={`${alerts} products need restocking`}>
                      {alerts}
                    </span>
                  ) : null}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-foot">
          <button type="button" className="nav-link" onClick={toggleTheme}>
            <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
            <span>{theme === "dark" ? "Light mode" : "Dark mode"}</span>
          </button>
          <p className="sidebar-note">Godown · Hyderabad</p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <NavLink to="/" className="topbar-brand" aria-label="Godown home">
            <Brand />
          </NavLink>
          <button type="button" className="findbtn" onClick={() => setFinding(true)} aria-label="Quick find, Control K">
            <Icon name="search" size={17} />
            <span>Search products…</span>
            <kbd>Ctrl K</kbd>
          </button>
          <div className="topbar-actions">
            <Button variant="primary" icon="receive" onClick={() => stock.receive()} className="hide-sm">
              Receive stock
            </Button>
            <Button icon="issue" onClick={() => stock.issue()} className="hide-sm">
              Issue stock
            </Button>
            <button type="button" className="icon-btn show-sm-only" aria-label="Quick find" onClick={() => setFinding(true)}>
              <Icon name="search" size={19} />
            </button>
            <button type="button" className="icon-btn show-sm-only" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={toggleTheme}>
              <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
            </button>
            <UserMenu onPassword={() => setPassword(true)} />
          </div>
        </header>

        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>

      <nav className="bottomnav" aria-label="Main">
        {BOTTOM.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className="bottomnav-link">
            <Icon name={item.icon} size={21} />
            <span>{item.label}</span>
          </NavLink>
        ))}
        <button type="button" className="bottomnav-link" onClick={() => setMore(true)} aria-haspopup="dialog">
          <Icon name="menu" size={21} />
          <span>More</span>
        </button>
      </nav>

      {more ? (
        <Modal title="More" variant="sheet" onClose={() => setMore(false)}>
          <div className="sheet-actions">
            <Button variant="primary" icon="receive" onClick={() => { setMore(false); stock.receive(); }}>
              Receive stock
            </Button>
            <Button icon="issue" onClick={() => { setMore(false); stock.issue(); }}>
              Issue stock
            </Button>
          </div>
          <div className="sheet-links">
            {visible(GROUPS[1].items).map((item) => (
              <button key={item.to} type="button" onClick={() => { setMore(false); navigate(item.to); }}>
                <Icon name={item.icon} size={19} /> {item.label}
              </button>
            ))}
            <button type="button" onClick={() => { setMore(false); setPassword(true); }}>
              <Icon name="key" size={19} /> Change password
            </button>
            <button type="button" onClick={logout}>
              <Icon name="logout" size={19} /> Sign out ({user.name.split(" ")[0]})
            </button>
          </div>
        </Modal>
      ) : null}
      {finding ? <QuickFind onClose={() => setFinding(false)} /> : null}
      {password ? <PasswordDialog onClose={() => setPassword(false)} /> : null}
    </div>
  );
}
