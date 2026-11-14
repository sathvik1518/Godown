import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout.jsx";
import { Spinner } from "./components/ui.jsx";
import { useAuth } from "./context/Auth.jsx";
import { RefreshProvider } from "./context/Refresh.jsx";
import { StockActionsProvider } from "./context/StockActions.jsx";
import Categories from "./pages/Categories.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Ledger from "./pages/Ledger.jsx";
import Login from "./pages/Login.jsx";
import NotFound from "./pages/NotFound.jsx";
import OrderDetail from "./pages/OrderDetail.jsx";
import OrderForm from "./pages/OrderForm.jsx";
import Orders from "./pages/Orders.jsx";
import ProductDetail from "./pages/ProductDetail.jsx";
import Products from "./pages/Products.jsx";
import Suppliers from "./pages/Suppliers.jsx";
import Team from "./pages/Team.jsx";

// Everything except /login needs a signed-in user. Remembers where they were going.
function RequireAuth({ children }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="boot" role="status">
        <Spinner size={28} />
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return children;
}

function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        element={
          <RequireAuth>
            <RefreshProvider>
              <StockActionsProvider>
                <Layout />
              </StockActionsProvider>
            </RefreshProvider>
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="products" element={<Products />} />
        <Route path="products/:id" element={<ProductDetail />} />
        <Route path="ledger" element={<Ledger />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/new" element={<OrderForm />} />
        <Route path="orders/:id" element={<OrderDetail />} />
        <Route path="orders/:id/edit" element={<OrderForm />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="categories" element={<Categories />} />
        <Route
          path="team"
          element={
            <AdminOnly>
              <Team />
            </AdminOnly>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
