import { createBrowserRouter } from "react-router";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Planning from "./pages/Planning";
import ChannelPlanning from "./pages/ChannelPlanning";
import CyclePlanning from "./pages/CyclePlanning";
import CycleValidation from "./pages/CycleValidation";
import OperationSettings from "./pages/OperationSettings";
import AdminDashboard from "./pages/AdminDashboard";
import Admin_Clients from "./pages/Admin_Clients";
import Admin_Users from "./pages/Admin_Users";
import Admin_Permissions from "./pages/Admin_Permissions";
import SortimentPlan from "./pages/SortimentPlan";
import Onboarding from "./pages/Onboarding";
import PlanningGateway from "./pages/PlanningGateway";
import PlanningSetup from "./pages/PlanningSetup";
import ProfileAdjust from "./pages/ProfileAdjust";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Login,
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
    path: "/cycle-planning",
    Component: CyclePlanning,
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
    path: "/sortiment-plan",
    Component: SortimentPlan,
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
]);