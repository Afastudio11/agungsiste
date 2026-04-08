import { useUser, useClerk } from "@clerk/react";
import { Link, useLocation } from "wouter";
import { ReactNode } from "react";
import { Redirect } from "wouter";

interface LayoutProps {
  children: ReactNode;
  role?: "supervisor" | "staff" | "any";
}

export default function Layout({ children, role = "any" }: LayoutProps) {
  const { user, isLoaded } = useUser();
  const { signOut } = useClerk();
  const [location] = useLocation();

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (!user) return <Redirect to="/" />;

  const userRole = user.publicMetadata?.role as string | undefined;

  if (!userRole) return <Redirect to="/waiting-role" />;

  if (role === "supervisor" && userRole !== "supervisor") {
    return <Redirect to="/scan" />;
  }

  if (role === "staff" && userRole !== "staff") {
    return <Redirect to="/dashboard" />;
  }

  const navItems =
    userRole === "supervisor"
      ? [
          { href: "/dashboard", label: "Dashboard" },
          { href: "/events", label: "Event" },
          { href: "/participants", label: "Peserta" },
        ]
      : [{ href: "/scan", label: "Scan KTP" }];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
          <div className="flex items-center gap-6">
            <span className="text-sm font-bold tracking-widest uppercase">KTP Dashboard</span>
            <nav className="flex items-center gap-1">
              {navItems.map((item) => {
                const active = location === item.href || location.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-sidebar-foreground/60 capitalize">
              {user.firstName || user.emailAddresses[0]?.emailAddress} &bull; {userRole}
            </span>
            <button
              onClick={() => signOut({ redirectUrl: "/" })}
              className="rounded border border-sidebar-border px-3 py-1.5 text-xs font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              Keluar
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 bg-background">
        <div className="mx-auto max-w-7xl px-4 py-6">{children}</div>
      </main>
    </div>
  );
}
