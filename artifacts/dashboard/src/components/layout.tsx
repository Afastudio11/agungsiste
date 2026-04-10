import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ScanLine,
  Settings,
  HelpCircle,
  UserCheck,
  Map,
  Globe,
  LogOut,
  Shield,
  BarChart2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

interface LayoutProps {
  children: ReactNode;
}

const adminNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Event", icon: CalendarDays },
  { href: "/participants", label: "Peserta", icon: Users },
  { href: "/officers", label: "Petugas", icon: UserCheck },
  { href: "/staff", label: "Statistik Staf", icon: BarChart2 },
  { href: "/scan", label: "Scan KTP", icon: ScanLine },
  { href: "/pemetaan", label: "Pemetaan", icon: Map },
  { href: "/peta", label: "Peta Interaktif", icon: Globe },
];

const adminNavBottom = [
  { href: "/settings", label: "Pengaturan", icon: Settings },
  { href: "/help", label: "Help", icon: HelpCircle },
];

function NavItem({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof LayoutDashboard; active: boolean }) {
  return (
    <Link href={href}>
      <div
        className={`group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition-all duration-150 cursor-pointer ${
          active ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
        }`}
      >
        <div className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-lg transition-all ${active ? "bg-blue-100" : "bg-slate-100 group-hover:bg-slate-200"}`}>
          <Icon className={`h-[15px] w-[15px] ${active ? "text-blue-600" : "text-slate-500"}`} strokeWidth={active ? 2.5 : 2} />
        </div>
        <span>{label}</span>
        {active && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-blue-500" />}
      </div>
    </Link>
  );
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();

  const navMain = adminNav;
  const navBottom = adminNavBottom;
  const allNav = [...navMain, ...navBottom];

  const handleLogout = async () => {
    await logout();
    window.location.href = import.meta.env.BASE_URL + "login";
  };

  return (
    <div className="flex min-h-screen bg-slate-50/70">
      {/* ── Desktop Sidebar ──────────────────────────────────────────── */}
      <aside className="hidden md:flex w-[220px] flex-col fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-100/80">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-[22px]">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-sm shadow-blue-200">
            <ScanLine className="h-[15px] w-[15px] text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[15px] font-bold tracking-tight text-slate-900" style={{ letterSpacing: "-0.02em" }}>
            KTP Scan
          </span>
        </div>

        <div className="mx-4 border-t border-slate-100" />

        {/* Main nav */}
        <nav className="flex-1 px-3 pt-4 space-y-0.5 overflow-y-auto">
          {navMain.map(({ href, label, icon }) => (
            <NavItem
              key={href}
              href={href}
              label={label}
              icon={icon}
              active={location === href || location.startsWith(href + "/")}
            />
          ))}
        </nav>

        {/* User + bottom nav */}
        <div className="border-t border-slate-100 px-3 py-3 space-y-0.5">
          {navBottom.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link key={href} href={href}>
                <div className={`flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] font-medium transition-all cursor-pointer ${active ? "bg-blue-50 text-blue-600" : "text-slate-400 hover:bg-slate-50 hover:text-slate-600"}`}>
                  <Icon className={`h-[14px] w-[14px] shrink-0 ${active ? "text-blue-500" : ""}`} strokeWidth={active ? 2.5 : 2} />
                  <span>{label}</span>
                </div>
              </Link>
            );
          })}

          {/* User profile */}
          {user && (
            <div className="mt-2 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-2 px-3 py-2">
                <div className="h-7 w-7 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                  <Shield className="h-3.5 w-3.5 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-slate-800 truncate">{user.name}</div>
                  <div className="text-[10px] text-slate-400 capitalize">{user.role}</div>
                </div>
                <button onClick={handleLogout} className="p-1 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition" title="Sign Out">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div className="flex-1 md:ml-[220px] min-h-screen">
        {/* Mobile top bar */}
        <div className="md:hidden sticky top-0 z-30 flex items-center gap-3 bg-white border-b border-slate-100 px-4 py-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-600">
            <ScanLine className="h-[13px] w-[13px] text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[14px] font-bold text-slate-900 flex-1" style={{ letterSpacing: "-0.02em" }}>KTP Scan</span>
          {user && (
            <button onClick={handleLogout} className="text-xs text-slate-400 hover:text-red-500 transition flex items-center gap-1">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <main className="p-4 md:p-7 pb-24 md:pb-7">{children}</main>
      </div>

      {/* ── Mobile bottom navigation ──────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-100 safe-area-bottom">
        <div className="flex items-center justify-around px-1 py-1">
          {allNav.slice(0, 6).map(({ href, label, icon: Icon }) => {
            const active = location === href || location.startsWith(href + "/");
            const shortLabel =
              label === "Help & Support" ? "Help"
              : label === "Pengaturan" ? "Setting"
              : label === "Dashboard" ? "Home"
              : label === "Statistik Staf" ? "Staf"
              : label;
            return (
              <Link key={href} href={href}>
                <div className={`flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-xl min-w-[44px] transition-all cursor-pointer ${active ? "text-blue-600" : "text-slate-400"}`}>
                  <div className={`flex h-7 w-7 items-center justify-center rounded-lg transition-all ${active ? "bg-blue-50" : ""}`}>
                    <Icon className={`h-[18px] w-[18px] ${active ? "text-blue-600" : "text-slate-400"}`} strokeWidth={active ? 2.5 : 2} />
                  </div>
                  <span className={`text-[9px] font-semibold leading-none ${active ? "text-blue-600" : "text-slate-400"}`}>{shortLabel}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
