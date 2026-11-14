import { createContext, useCallback, useContext, useMemo, useState } from "react";

// Stock can change from many places (dialogs, purchase orders). Calling bump() tells every
// page that loads data to fetch it again, so numbers on screen never go stale.
const RefreshContext = createContext({ version: 0, bump: () => {} });

export function RefreshProvider({ children }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ version, bump }), [version, bump]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}

export const useRefresh = () => useContext(RefreshContext);
