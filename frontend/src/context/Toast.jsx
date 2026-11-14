import { createContext, useCallback, useContext, useMemo, useState } from "react";
import Icon from "../components/Icon.jsx";

const ToastContext = createContext({ success() {}, error() {}, info() {} });
let nextId = 0;

const ICONS = { success: "check", error: "alert", info: "info" };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback(
    (tone, message) => {
      const id = ++nextId;
      setToasts((list) => [...list.slice(-3), { id, tone, message }]);
      setTimeout(() => remove(id), tone === "error" ? 7000 : 4200);
    },
    [remove]
  );

  const api = useMemo(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      info: (message) => push("info", message),
    }),
    [push]
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="region" aria-label="Notifications">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`} role={t.tone === "error" ? "alert" : "status"}>
            <Icon name={ICONS[t.tone]} size={18} />
            <span>{t.message}</span>
            <button type="button" className="toast-close" aria-label="Dismiss message" onClick={() => remove(t.id)}>
              <Icon name="x" size={15} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
