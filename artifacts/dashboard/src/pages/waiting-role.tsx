import { useUser, useClerk } from "@clerk/react";

export default function WaitingRole() {
  const { signOut } = useClerk();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 text-center">
      <div className="w-full max-w-md rounded-lg border bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Pending Approval</h1>
        <p className="mt-4 text-sm text-slate-600">
          Your account has been created, but you do not have a role assigned yet. Please contact your administrator to assign you as Staff or Supervisor.
        </p>
        <button
          onClick={() => signOut()}
          className="mt-8 rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
