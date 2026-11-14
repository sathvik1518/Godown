import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Brand } from "../components/Layout.jsx";
import Icon from "../components/Icon.jsx";
import { Field, FormError } from "../components/Form.jsx";
import { Button } from "../components/ui.jsx";
import { useAuth } from "../context/Auth.jsx";
import { useDocumentTitle } from "../hooks.js";

export const DEMO_ACCOUNTS = [
  { label: "Admin demo", hint: "Sathvik · full access", email: "saisathvik@gmail.com", password: "Admin@123" },
  { label: "Staff demo", hint: "Kavya · stock and orders", email: "kavya.reddy@gmail.com", password: "Staff@1234" },
];

// Decorative shelf drawing for the left panel: each bar is a product, the notch is its reorder level.
const SHELF = [
  [78, 30], [54, 30], [92, 30], [22, 30], [66, 30], [12, 30],
  [88, 30], [40, 30], [70, 30], [34, 30], [96, 30], [58, 30],
];

// The Field wrapper gives its single child the id and aria props, so the input and the Show
// button live inside one component that passes them on to the input.
function PasswordInput({ value, onChange, ...aria }) {
  const [show, setShow] = useState(false);
  return (
    <span className="password-wrap">
      <input
        {...aria}
        className="input"
        type={show ? "text" : "password"}
        autoComplete="current-password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" className="password-toggle" onClick={() => setShow((s) => !s)} aria-pressed={show}>
        {show ? "Hide" : "Show"}
      </button>
    </span>
  );
}

export default function Login() {
  useDocumentTitle("Sign in");
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [general, setGeneral] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={location.state?.from || "/"} replace />;

  const submit = async (event) => {
    event.preventDefault();
    const found = {};
    if (!email.trim()) found.email = "Enter your email address.";
    else if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email.trim())) found.email = "Enter a valid email address.";
    if (!password) found.password = "Enter your password.";
    setErrors(found);
    setGeneral("");
    if (Object.keys(found).length) return;

    setBusy(true);
    try {
      await login(email.trim().toLowerCase(), password);
      navigate(location.state?.from || "/", { replace: true });
    } catch (error) {
      setGeneral(error.message);
    } finally {
      setBusy(false);
    }
  };

  const fill = (account) => {
    setEmail(account.email);
    setPassword(account.password);
    setErrors({});
    setGeneral("");
  };

  return (
    <div className="login">
      <section className="login-art" aria-hidden="true">
        <Brand light />
        <div className="login-art-copy">
          <h2>Know what is on the shelf. Know what is on its way.</h2>
          <p>Stock, suppliers and purchase orders for a small shop, in one place.</p>
        </div>
        <div className="shelf">
          {SHELF.map(([fill, notch], i) => (
            <span key={i} className="shelf-bar">
              <span style={{ height: `${fill}%` }} className={fill < 30 ? "is-low" : ""} />
              <i style={{ bottom: `${notch}%` }} />
            </span>
          ))}
        </div>
      </section>

      <main className="login-panel" id="main">
        <div className="login-card">
          <div className="login-mobile-brand">
            <Brand />
          </div>
          <h1>Sign in</h1>
          <p className="login-sub">Use the account your shop owner created for you.</p>

          <form onSubmit={submit} noValidate>
            <FormError message={general} />
            <Field label="Email" required error={errors.email}>
              <input className="input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@shop.in" />
            </Field>
            <Field label="Password" required error={errors.password}>
              <PasswordInput value={password} onChange={setPassword} />
            </Field>
            <Button type="submit" variant="primary" size="lg" loading={busy} className="btn-block">
              Sign in
            </Button>
          </form>

          <div className="demo">
            <p>
              <Icon name="info" size={15} /> Trying it out? Fill in a demo account:
            </p>
            <div className="demo-buttons">
              {DEMO_ACCOUNTS.map((account) => (
                <button key={account.label} type="button" onClick={() => fill(account)}>
                  <strong>{account.label}</strong>
                  <small>{account.hint}</small>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
