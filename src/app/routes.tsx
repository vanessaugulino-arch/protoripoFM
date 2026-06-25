import { createBrowserRouter, Navigate, Outlet } from "react-router";
import Login from "./pages/Login";
import SystemPresentation from "./pages/SystemPresentation";
import Dashboard from "./pages/Dashboard";
import Planning from "./pages/Planning";
import ChannelPlanning from "./pages/ChannelPlanning";
import Module3DivisionPlanning from "./pages/Module3DivisionPlanning";
import PricePyramid from "./pages/PricePyramid";
import CycleValidation from "./pages/CycleValidation";
import OperationSettings from "./pages/OperationSettings";
import AdminDashboard from "./pages/AdminDashboard";
import Admin_Clients from "./pages/Admin_Clients";
import Admin_Users from "./pages/Admin_Users";
import Admin_Permissions from "./pages/Admin_Permissions";
import TenantSelector from "./pages/TenantSelector";
import SortimentPlan from "./pages/SortimentPlan";
import Onboarding from "./pages/Onboarding";
import PlanningGateway from "./pages/PlanningGateway";
import PlanningSetup from "./pages/PlanningSetup";
import ProfileAdjust from "./pages/ProfileAdjust";
import MatrizAbastecimento from "./pages/MatrizAbastecimento";
// Fase 2 — acessíveis apenas pelo usuário Suporte
import CycleClosing from "./pages/CycleClosing";
import CollectionPlanning from "./pages/CollectionPlanning";
import ProductMix from "./pages/ProductMix";
import TrackingCreative from "./pages/TrackingCreative";

// Guard: bloqueia acesso a rotas de Fase 2 para qualquer role que não seja "support"
function SuporteRoute() {
  const raw = sessionStorage.getItem("currentUser");
  if (!raw) return <Navigate to="/" replace />;
  try {
    const user = JSON.parse(raw);
    if (user?.system_role !== "support") return <Navigate to="/dashboard" replace />;
  } catch {
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Login,
  },
  {
    path: "/presentation",
    Component: SystemPresentation,
  },
  {
    path: "/onboarding",
    Component: Onboarding,
  },
  {
    path: "/dashboard",
    Component: Dashboard,
  },
  {
    path: "/planning-gateway",
    Component: PlanningGateway,
  },
  {
    path: "/planning-setup",
    Component: PlanningSetup,
  },
  {
    path: "/profile-adjust",
    Component: ProfileAdjust,
  },
  {
    path: "/planning",
    Component: Planning,
  },
  {
    path: "/channel-planning",
    Component: ChannelPlanning,
  },
  {
    path: "/module3-division-planning",
    Component: Module3DivisionPlanning,
  },
  {
    path: "/module3-price-pyramid/:divisionId",
    Component: PricePyramid,
  },
  {
    path: "/cycle-validation",
    Component: CycleValidation,
  },
  {
    path: "/operation-settings",
    Component: OperationSettings,
  },
  {
    path: "/matriz-abastecimento",
    Component: MatrizAbastecimento,
  },
  {
    path: "/sortiment-plan",
    Component: SortimentPlan,
  },
  {
    path: "/tenant-selector",
    Component: TenantSelector,
  },
  // Admin Routes
  {
    path: "/admin",
    Component: AdminDashboard,
  },
  {
    path: "/admin/clients",
    Component: Admin_Clients,
  },
  {
    path: "/admin/users",
    Component: Admin_Users,
  },
  {
    path: "/admin/permissions",
    Component: Admin_Permissions,
  },
  // ── Fase 2 — Pré-visualização exclusiva Suporte ───────────────────────────
  {
    element: <SuporteRoute />,
    children: [
      {
        path: "/preview/cycle-closing",
        Component: CycleClosing,
      },
      {
        path: "/preview/collection-planning",
        Component: CollectionPlanning,
      },
      {
        path: "/preview/product-mix",
        Component: ProductMix,
      },
      {
        path: "/preview/tracking-creative",
        Component: TrackingCreative,
      },
    ],
  },
]);