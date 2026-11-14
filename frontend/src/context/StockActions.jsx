import { createContext, useContext, useMemo, useState } from "react";
import StockDialog from "../components/StockDialog.jsx";
import { useRefresh } from "./Refresh.jsx";

// Any page can open the Receive / Issue / Adjust dialogs, with or without a product picked.
const StockActionsContext = createContext({ receive() {}, issue() {}, adjust() {} });

export function StockActionsProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const { bump } = useRefresh();

  const actions = useMemo(
    () => ({
      receive: (product = null) => setDialog({ mode: "receive", product }),
      issue: (product = null) => setDialog({ mode: "issue", product }),
      adjust: (product = null) => setDialog({ mode: "adjust", product }),
    }),
    []
  );

  return (
    <StockActionsContext.Provider value={actions}>
      {children}
      {dialog ? (
        <StockDialog
          mode={dialog.mode}
          product={dialog.product}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            bump();
          }}
        />
      ) : null}
    </StockActionsContext.Provider>
  );
}

export const useStockActions = () => useContext(StockActionsContext);
