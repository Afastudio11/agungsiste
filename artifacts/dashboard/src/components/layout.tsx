import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  ScanLine,
  Settings,
  HelpCircle,
  ChevronRight,
} from "lucide-react";

interface LayoutProps {
  children: ReactNode;
  role?: string;
}

const navMain = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/events", label: "Event", icon: CalendarDays },
  { href: "/participants", label: "Peserta", icon: Users },
  { href: "/scan", label: "Scan KTP", icon: ScanLine },
];

const navBottom = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help & Support", icon: HelpCircle },
];

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();

  return (
    <div className="flex min-h-screen bg-[#f5f6fa]">
      {/* Sidebar */}
      <aside className="flex w-56 flex-col fixed inset-y-0 left-0 z-40 bg-[#1e2230] text-white">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/10">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
            <ScanLine className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold tracking-wide">KTP Scan</span>
        </div>

        {/* Main nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-0.5">
          {navMain.map(({ href, label, icon: Icon }) => {
            const active = location === href || location.startsWith(href + "/");
            return (
              <Link key={href} href={href}>
                <div
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all cursor-pointer ${
                    active
                      ? "bg-blue-600 text-white shadow-sm"
                      : "text-slate-400 hover:bg-white/5 hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{label}</span>
                  {active && <ChevronRight className="ml-auto h-3.5 w-3.5 opacity-60" />}
                </div>
              </Link>
            );
          })}
        </nav>

        {/* Bottom nav */}
        <div className="border-t border-white/10 px-3 py-3 space-y-0.5">
          {navBottom.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-white/5 hover:text-slate-300 transition-all cursor-pointer">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </div>
            </Link>
          ))}
        </div>

        {/* Upgrade banner */}
        <div className="m-3 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 p-4">
          <p className="text-xs font-semibold text-white">Upgrade ke Premium!</p>
          <p className="mt-1 text-xs text-blue-200 leading-relaxed">
            Unlock fitur analitik lanjutan dan export data.
          </p>
          <button className="mt-3 w-full rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-50 transition-colors">
            Upgrade Premium
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 ml-56 min-h-screen flex flex-col">
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
