import { Switch, Route, Router as WouterRouter, Redirect, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/lib/auth";
import NotFound from "@/pages/not-found";
import LoginPage from "@/pages/login";
import DashboardPage from "@/pages/dashboard";
import EventsPage from "@/pages/events";
import EventDetailPage from "@/pages/event-detail";
import ParticipantsPage from "@/pages/participants";
import ParticipantDetailPage from "@/pages/participant-detail";
import ScanPage from "@/pages/scan";
import StaffPage from "@/pages/staff";
import OfficersPage from "@/pages/officers";
import PemetaanPage from "@/pages/pemetaan";
import SettingsPage from "@/pages/settings";
import HelpPage from "@/pages/help";
import PetugasEventsPage from "@/pages/petugas-events";
import PetugasScanPage from "@/pages/petugas-scan";
import PetugasRsvpPage from "@/pages/petugas-rsvp";

const queryClient = new QueryClient();
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const ADMIN_PATHS = [
  "/dashboard", "/events", "/participants", "/scan", "/staff",
  "/officers", "/pemetaan", "/settings", "/help",
];

function AppRoutes() {
  const { user, loading } = useAuth();
  const [location] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-slate-400 text-sm">Memuat...</div>
      </div>
    );
  }

  if (!user && location !== "/login") {
    return <Redirect to="/login" />;
  }

  if (user && location === "/login") {
    return <Redirect to="/" />;
  }

  // Role guard: petugas cannot access admin routes
  if (user?.role === "petugas") {
    const isAdminPath = ADMIN_PATHS.some(
      (p) => location === p || location.startsWith(p + "/")
    );
    if (isAdminPath) {
      return <Redirect to="/petugas" />;
    }
  }

  // Role guard: admin cannot access petugas routes
  if (user?.role === "admin" || user?.role === "supervisor") {
    if (location.startsWith("/petugas")) {
      return <Redirect to="/dashboard" />;
    }
  }

  return (
    <Switch>
      <Route path="/login" component={LoginPage} />

      {/* Role-based root redirect */}
      <Route path="/">
        {user?.role === "petugas" ? <Redirect to="/petugas" /> : <Redirect to="/dashboard" />}
      </Route>

      {/* Admin routes */}
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/events" component={EventsPage} />
      <Route path="/events/:id" component={EventDetailPage} />
      <Route path="/participants" component={ParticipantsPage} />
      <Route path="/participants/:nik" component={ParticipantDetailPage} />
      <Route path="/scan" component={ScanPage} />
      <Route path="/staff" component={StaffPage} />
      <Route path="/officers" component={OfficersPage} />
      <Route path="/pemetaan" component={PemetaanPage} />
      <Route path="/settings" component={SettingsPage} />
      <Route path="/help" component={HelpPage} />

      {/* Petugas routes */}
      <Route path="/petugas" component={PetugasEventsPage} />
      <Route path="/petugas/scan/:id" component={PetugasScanPage} />
      <Route path="/petugas/scan-rsvp/:id" component={PetugasRsvpPage} />

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <AuthProvider>
            <AppRoutes />
            <Toaster />
          </AuthProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </WouterRouter>
  );
}

export default App;
