import { useUser, Show, useClerk } from "@clerk/react";
import { Redirect } from "wouter";

export default function HomeRedirect() {
  const { user, isLoaded } = useUser();

  if (!isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
      </div>
    );
  }

  if (user) {
    const role = user.publicMetadata?.role as string | undefined;
    
    if (role === "supervisor") {
      return <Redirect to="/dashboard" />;
    } else if (role === "staff") {
      return <Redirect to="/scan" />;
    } else {
      return <Redirect to="/waiting-role" />;
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-900 text-slate-50">
      <div className="mx-auto flex w-full max-w-md flex-col justify-center space-y-6 px-6 sm:w-[350px]">
        <div className="flex flex-col space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            KTP Dashboard System
          </h1>
          <p className="text-sm text-slate-400">
            Secure field operations portal
          </p>
        </div>
        <div className="flex flex-col gap-4">
          <a
            href="/sign-in"
            className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-8 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-white text-slate-900 hover:bg-slate-200"
          >
            Sign In
          </a>
          <a
            href="/sign-up"
            className="inline-flex h-10 items-center justify-center rounded-md border border-slate-700 bg-transparent px-8 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
          >
            Create Account
          </a>
        </div>
      </div>
    </div>
  );
}
