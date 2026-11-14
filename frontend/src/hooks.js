import { useEffect, useState } from "react";
import { useRefresh } from "./context/Refresh.jsx";

// Loads data when the page opens, when `deps` change, when stock changes anywhere in the
// app (refresh version), or when reload() is called. Old data stays on screen while
// new data loads, so tables do not flash empty.
export function useLoad(fn, deps = []) {
  const { version } = useRefresh();
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    Promise.resolve()
      .then(fn)
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((error) => alive && setState((s) => ({ ...s, error, loading: false })));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, tick]);

  return { ...state, reload: () => setTick((t) => t + 1) };
}

export function useDebounce(value, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · Godown` : "Godown: Inventory and Purchasing";
  }, [title]);
}

// True while the screen matches a CSS media query, e.g. useMediaQuery("(max-width: 760px)").
// Used to render a table on wide screens and cards on phones (one or the other, never both).
export function useMediaQuery(query) {
  const read = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(read);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

export function useTheme() {
  const [theme, setTheme] = useState(() => document.documentElement.getAttribute("data-theme") || "light");
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("godown.theme", next);
    } catch {
      /* ignore */
    }
    setTheme(next);
  };
  return [theme, toggle];
}
