import { Link, useLocation } from "wouter";
import { ReactNode, useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useSettings } from "@/lib/settings-context";
import { useHeaderContext } from "@/lib/header-context";
import {
  LayoutDashboard,
  Calendar,
  Users,
  IdentificationBadge,
  Scan,
  ClipboardList,
  MapTrifold,
  Settings,
  PlusCircle,
  LogOut,
  List,
  Download,
  Bell,
  History,
} from "@/lib/icons";
import type { ElementType } from "react";

interface LayoutProps {
  children: ReactNode;
}

const adminNavBase: { href: string; key: "dashboard"|"events"|"participants"|"officers"|"scan"|"prizes"|"pemetaan"|"settings"; Icon: ElementType }[] = [
  { href: "/dashboard",    key: "dashboard",    Icon: LayoutDashboard },
  { href: "/pemetaan",     key: "pemetaan",     Icon: MapTrifold },
  { href: "/events",       key: "events",       Icon: Calendar },
  { href: "/programs",     key: "prizes",       Icon: ClipboardList },
  { href: "/participants", key: "participants", Icon: Users },
  { href: "/officers",     key: "officers",     Icon: IdentificationBadge },
  { href: "/scan",         key: "scan",         Icon: Scan },
  { href: "/settings",     key: "settings",     Icon: Settings },
];

function NavItem({
  href,
  label,
  Icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  Icon: ElementType;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <Link href={href}>
      <div
        onClick={onClick}
        className={`group flex items-center gap-3 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all duration-150 cursor-pointer ${
          active
            ? "bg-blue-600 text-white shadow-sm shadow-blue-200"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
        }`}
      >
        <Icon
          size={18}
          weight="bold"
          className={`shrink-0 ${active ? "text-white" : "text-slate-400 group-hover:text-slate-600"}`}
        />
        <span className="truncate">{label}</span>
      </div>
    </Link>
  );
}

export default function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { settings } = useSettings();
  const { onExport } = useHeaderContext();
  const [exportOpen, setExportOpen] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isDashboard = location === "/dashboard";

  const adminNav = adminNavBase.map((n) => ({
    ...n,
    label: settings.menuLabels[n.key] || n.key,
  }));

  const handleLogout = async () => {
    await logout();
    window.location.href = import.meta.env.BASE_URL + "login";
  };

  const initials = user?.name
    ? user.name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  const currentNavLabel = adminNav.find(
    (n) => location === n.href || location.startsWith(n.href + "/")
  )?.label ?? "Dashboard";

  const Sidebar = ({ onNav }: { onNav?: () => void }) => (
    <div className="flex h-full flex-col">
      <p className="px-5 pt-4 pb-1.5 text-[10px] font-bold tracking-[0.1em] text-slate-400">Menu</p>

      {/* Main nav */}
      <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto pb-2">
        {adminNav.map(({ href, label, Icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            Icon={Icon}
            active={location === href || location.startsWith(href + "/")}
            onClick={onNav}
          />
        ))}
      </nav>

      {/* Bottom section */}
      <div className="px-3 pb-4 space-y-2">
        <div className="h-px bg-slate-100 mb-3" />

        {/* New Scan CTA */}
        <Link href="/scan">
          <div
            onClick={onNav}
            className="flex items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-[13px] font-bold text-white shadow-sm shadow-blue-300/50 hover:bg-blue-700 transition-colors cursor-pointer mt-1"
          >
            <PlusCircle size={18} weight="bold" className="text-white" />
            New Scan
          </div>
        </Link>

        {/* User profile */}
        {user && (
          <div className="mt-2 flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-2.5 border border-slate-100">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[12px] font-extrabold text-blue-700">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-bold text-slate-800 truncate leading-tight">{user.name}</p>
              <p className="text-[10px] text-slate-400 capitalize leading-tight">{user.role}</p>
            </div>
            <button
              onClick={handleLogout}
              title="Sign Out"
              className="p-1 rounded-full text-slate-300 hover:text-red-500 hover:bg-red-50 transition"
            >
              <LogOut size={16} weight="bold" />
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-slate-50">
      {/* ── Desktop Sidebar ──────────────────────────────────── */}
      <aside className="hidden md:flex w-[240px] flex-col fixed inset-y-0 left-0 z-40 bg-white/80 backdrop-blur-2xl border-r border-slate-100/80 rounded-r-[28px]">
        <Sidebar />
      </aside>

      {/* ── Mobile Overlay ───────────────────────────────────── */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/20 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-[260px] h-full bg-white/95 backdrop-blur-2xl border-r border-slate-100 rounded-r-[28px] flex flex-col z-10">
            <Sidebar onNav={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────── */}
      <div className="flex-1 md:ml-[240px] min-h-screen flex flex-col">
        {/* Top header bar — frosted glass */}
        <header className="sticky top-0 z-30 flex items-center gap-3 bg-white/80 backdrop-blur-2xl border-b border-slate-100/80 px-5 py-3">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileOpen(true)}
            className="md:hidden p-2 rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <List size={20} weight="bold" />
          </button>

          {/* Page title */}
          <p className="text-[15px] font-extrabold text-slate-900 tracking-tight leading-tight hidden md:block mr-1">
            {currentNavLabel}
          </p>

          <div className="flex-1" />

          {/* Export dropdown — shown on dashboard */}
          {isDashboard && (
            <div ref={exportRef} className="relative hidden sm:block">
              <button
                onClick={() => setExportOpen((v) => !v)}
                className="flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm shadow-blue-300/50 hover:bg-blue-700 transition-colors"
              >
                <Download size={15} weight="bold" />
                Export
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="ml-0.5 opacity-80">
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
              {exportOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 rounded-2xl bg-white border border-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.12)] overflow-hidden z-50">
                  <button
                    onClick={() => { onExport?.("pdf"); setExportOpen(false); }}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-red-500" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      <line x1="9" y1="13" x2="15" y2="13"/><line x1="9" y1="17" x2="11" y2="17"/>
                    </svg>
                    Export PDF
                  </button>
                  <div className="h-px bg-slate-50 mx-3" />
                  <button
                    onClick={() => { onExport?.("excel"); setExportOpen(false); }}
                    className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" className="text-emerald-500" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                      <line x1="8" y1="13" x2="10" y2="17"/><line x1="10" y1="13" x2="8" y2="17"/>
                      <line x1="13" y1="13" x2="16" y2="13"/><line x1="16" y1="13" x2="16" y2="17"/><line x1="13" y1="17" x2="16" y2="17"/>
                    </svg>
                    Export Excel
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-1">
            <button className="flex items-center justify-center h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
              <Bell size={20} weight="bold" />
            </button>
            <button className="flex items-center justify-center h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
              <History size={20} weight="bold" />
            </button>
            <div className="w-px h-5 bg-slate-100 mx-1" />
            {user && (
              <button
                onClick={handleLogout}
                title={user.name}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-extrabold text-blue-700 hover:bg-blue-200 transition"
              >
                {initials}
              </button>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 pb-24 md:pb-6">{children}</main>
      </div>

      {/* ── Mobile bottom navigation ──────────────────────────── */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-xl border-t border-slate-100 safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-1.5">
          {adminNav.slice(0, 5).map(({ href, label, Icon }) => {
            const active = location === href || location.startsWith(href + "/");
            const shortLabel = label.length > 8 ? label.slice(0, 7) + "…" : label;
            return (
              <Link key={href} href={href}>
                <div className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl min-w-[44px] transition-all cursor-pointer ${active ? "text-blue-600" : "text-slate-400"}`}>
                  <Icon
                    size={22}
                    weight="bold"
                    className={active ? "text-blue-600" : "text-slate-400"}
                  />
                  <span className={`text-[9px] font-semibold leading-none ${active ? "text-blue-600" : "text-slate-400"}`}>
                    {shortLabel}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
