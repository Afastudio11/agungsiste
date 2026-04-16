import { Link, useLocation } from "wouter";
import { ReactNode, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useHeaderContext } from "@/lib/header-context";
import { useSettings } from "@/lib/settings-context";

interface LayoutProps {
  children: ReactNode;
}

const adminNavBase = [
  { href: "/dashboard", key: "dashboard" as const, icon: "dashboard" },
  { href: "/events",   key: "events"    as const, icon: "event" },
  { href: "/participants", key: "participants" as const, icon: "group" },
  { href: "/officers", key: "officers"  as const, icon: "badge" },
  { href: "/scan",     key: "scan"      as const, icon: "document_scanner" },
  { href: "/prizes",   key: "prizes"    as const, icon: "card_giftcard" },
  { href: "/pemetaan", key: "pemetaan"  as const, icon: "map" },
  { href: "/settings", key: "settings"  as const, icon: "settings" },
];

function MsIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`material-symbols-outlined select-none leading-none ${className ?? ""}`}
      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20", ...style }}
    >
      {name}
    </span>
  );
}

function NavItem({
  href,
  label,
  icon,
  active,
  onClick,
}: {
  href: string;
  label: string;
  icon: string;
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
        <MsIcon
          name={icon}
          className={`text-[18px] shrink-0 ${active ? "text-white" : "text-slate-400 group-hover:text-slate-600"}`}
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
  const { startDate, endDate, setStartDate, setEndDate } = useHeaderContext();
  const { settings } = useSettings();

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
        {adminNav.map(({ href, label, icon }) => (
          <NavItem
            key={href}
            href={href}
            label={label}
            icon={icon}
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
            <MsIcon name="add_circle" className="text-[18px] text-white" />
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
              <MsIcon name="logout" className="text-[16px]" />
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
            <MsIcon name="menu" className="text-[20px]" />
          </button>

          {/* Page title */}
          <p className="text-[15px] font-extrabold text-slate-900 tracking-tight leading-tight hidden md:block mr-1">
            {currentNavLabel}
          </p>

          <div className="flex-1" />

          {/* Export button — shown on dashboard */}
          {isDashboard && (
            <button className="hidden sm:flex items-center gap-1.5 rounded-full bg-blue-600 px-3 py-1.5 text-[12px] font-bold text-white shadow-sm shadow-blue-300/50 hover:bg-blue-700 transition-colors">
              <MsIcon name="download" className="text-[15px] text-white" />
              Export
            </button>
          )}

          <div className="flex items-center gap-1">
            <button className="flex items-center justify-center h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
              <MsIcon name="notifications" className="text-[20px]" />
            </button>
            <button className="flex items-center justify-center h-8 w-8 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
              <MsIcon name="history" className="text-[20px]" />
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
          {adminNav.slice(0, 5).map(({ href, label, icon }) => {
            const active = location === href || location.startsWith(href + "/");
            const shortLabel = label.length > 8 ? label.slice(0, 7) + "…" : label;
            return (
              <Link key={href} href={href}>
                <div className={`flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl min-w-[44px] transition-all cursor-pointer ${active ? "text-blue-600" : "text-slate-400"}`}>
                  <MsIcon
                    name={icon}
                    className={`text-[22px] ${active ? "text-blue-600" : "text-slate-400"}`}
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
