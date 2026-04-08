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
      <aside className="flex w-56 flex-col fixed inset-y-0 left-0 z-40 bg-white border-r border-slate-100 text-slate-700">
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-100">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500">
            <ScanLine className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-bold tracking-wide text-slate-800">KTP Scan</span>
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
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
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
        <div className="border-t border-slate-100 px-3 py-3 space-y-0.5">
          {navBottom.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href}>
              <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-all cursor-pointer">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{label}</span>
              </div>
            </Link>
          ))}
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 ml-56 min-h-screen flex flex-col">
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
