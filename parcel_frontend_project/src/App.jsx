
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";

import { AuthProvider, useAuth } from "./context/AuthContext";

import HomePage from "./pages/HomePage";
import AuthPage from "./pages/AuthPage";
import BookParcelPage from "./pages/BookParcelPage";
import MyParcelsPage from "./pages/MyParcelsPage";
import ParcelDetailPage from "./pages/ParcelDetailPage";
import TrackPage from "./pages/TrackPage";
import CourierDashboardPage from "./pages/CourierDashboardPage";
import HubStaffPage from "./pages/HubStaffPage";
import AdminPage from "./pages/AdminPage";
import ProfilePage from "./pages/ProfilePage";
import CustomerDashboardPage from "./pages/CustomerDashboardPage";
import PaymentPage from "./pages/PaymentPage";

const HOME_BY_ROLE = {
  customer: "/customer",
  courier: "/courier",
  hub_staff: "/hub",
  admin: "/admin",
};

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 40 }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

function HomeRedirect() {
  const { user, loading } = useAuth();

  if (loading) {
    return <div style={{ padding: 40 }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  return (
    <Navigate
      to={HOME_BY_ROLE[user.role] || "/track"}
      replace
    />
  );
}

function PublicHomePage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const handleBook = () => {
    if (!user) {
      navigate("/login", {
        state: { from: "/book" },
      });
      return;
    }

    if (user.role === "customer") {
      navigate("/book");
      return;
    }

    navigate(HOME_BY_ROLE[user.role] || "/track");
  };

  return (
    <HomePage
      onLogin={() => navigate("/login")}
      onRegister={() =>
        navigate("/login?mode=register")
      }
      onBook={handleBook}
      onTrack={() => navigate("/track")}
    />
  );
}

function AppRoutes() {
  return (
    <Routes>
      {/* PUBLIC HOMEPAGE */}
      <Route path="/" element={<PublicHomePage />} />

      {/* AUTHENTICATION */}
      <Route path="/login" element={<AuthPage />} />

      {/* ROLE-BASED DASHBOARD REDIRECT */}
      <Route
        path="/dashboard"
        element={<HomeRedirect />}
      />

      {/* PUBLIC TRACKING */}
      <Route path="/track" element={<TrackPage />} />
      <Route
        path="/track/:trackingNumber"
        element={<TrackPage />}
      />

      {/* CUSTOMER */}
      <Route
        path="/customer"
        element={
          <PrivateRoute>
            <CustomerDashboardPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/book"
        element={
          <PrivateRoute>
            <BookParcelPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/parcels"
        element={
          <PrivateRoute>
            <MyParcelsPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/parcels/:id"
        element={
          <PrivateRoute>
            <ParcelDetailPage />
          </PrivateRoute>
        }
      />

      <Route
        path="/payments/:parcelId"
        element={
          <PrivateRoute>
            <PaymentPage />
          </PrivateRoute>
        }
      />

      {/* COURIER */}
      <Route
        path="/courier"
        element={
          <PrivateRoute>
            <CourierDashboardPage />
          </PrivateRoute>
        }
      />

      {/* HUB STAFF */}
      <Route
        path="/hub"
        element={
          <PrivateRoute>
            <HubStaffPage />
          </PrivateRoute>
        }
      />

      {/* ADMIN */}
      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <AdminPage />
          </PrivateRoute>
        }
      />

      {/* PROFILE */}
      <Route
        path="/profile"
        element={
          <PrivateRoute>
            <ProfilePage />
          </PrivateRoute>
        }
      />

      {/* UNKNOWN ROUTES */}
      <Route
        path="*"
        element={<HomeRedirect />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
