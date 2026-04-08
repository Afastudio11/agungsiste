import { useState, useMemo } from "react";
import Layout from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Search, TrendingUp, Users, Clock } from "lucide-react";

type StaffRow = {
  staffName: string | null;
  totalCount: number;
  recentCount: number;
  lastActivity: string;
};

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function rankBadge(i: number) {
  if (i === 0)
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-extrabold text-amber-600">
        1
      </span>
    );
  if (i === 1)
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-extrabold text-slate-500">
        2
      </span>
    );
  if (i === 2)
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-orange-100 text-[11px] font-extrabold text-orange-600">
        3
      </span>
    );
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-50 text-[11px] font-bold text-slate-400">
      {i + 1}
    </span>
  );
}

export default function StaffPage() {
  const [search, setSearch] = useState("");

  const { data: staffList, isLoading } = useQuery<StaffRow[]>({
    queryKey: ["staff-list"],
    queryFn: () => fetch("/api/dashboard/staff").then((r) => r.json()),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!staffList) return [];
    if (!search.trim()) return staffList;
    return staffList.filter((s) =>
      (s.staffName ?? "").toLowerCase().includes(search.toLowerCase())
    );
  }, [staffList, search]);

  const maxCount = staffList?.[0]?.totalCount ?? 1;
  const totalRegistrations = staffList?.reduce((s, r) => s + r.totalCount, 0) ?? 0;
  const totalStaff = staffList?.length ?? 0;
  const totalRecent = staffList?.reduce((s, r) => s + r.recentCount, 0) ?? 0;

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1
            className="text-[26px] font-extrabold text-slate-900 leading-tight"
            style={{ letterSpacing: "-0.03em" }}
          >
            Staf
          </h1>
          <p className="mt-1 text-sm text-slate-400 font-medium">
            Performa dan aktivitas staf input registrasi
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-5 pt-5 pb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-blue-500" />
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Total Staf</p>
            <Users className="h-4 w-4 text-slate-300" />
          </div>
          <p className="text-[32px] font-extrabold text-slate-900 leading-none" style={{ letterSpacing: "-0.03em" }}>
            {fmt(totalStaff)}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-5 pt-5 pb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-emerald-500" />
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Total Registrasi</p>
            <Trophy className="h-4 w-4 text-slate-300" />
          </div>
          <p className="text-[32px] font-extrabold text-slate-900 leading-none" style={{ letterSpacing: "-0.03em" }}>
            {fmt(totalRegistrations)}
          </p>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-5 pt-5 pb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="absolute inset-x-0 top-0 h-[3px] bg-amber-400" />
          <div className="flex items-start justify-between mb-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">7 Hari Terakhir</p>
            <TrendingUp className="h-4 w-4 text-slate-300" />
          </div>
          <p className="text-[32px] font-extrabold text-slate-900 leading-none" style={{ letterSpacing: "-0.03em" }}>
            {fmt(totalRecent)}
          </p>
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
        {/* Table header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-100">
          <div>
            <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
              Leaderboard Staf
            </p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Diurutkan berdasarkan total registrasi
            </p>
          </div>

          {/* Search */}
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Cari nama staf..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44 border-0 bg-transparent text-[12px] text-slate-600 placeholder:text-slate-300 focus:outline-none"
            />
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
            <span className="ml-3 text-sm text-slate-400">Memuat data staf...</span>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-50 bg-slate-50/60">
                {["#", "Nama Staf", "Total Input", "7 Hari", "Terakhir Aktif", "Performa"].map(
                  (h, i) => (
                    <th
                      key={h}
                      className={`px-6 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 ${
                        i === 0 ? "text-center w-14" : i >= 2 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  )
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.length > 0 ? (
                filtered.map((s, i) => {
                  const originalRank = staffList?.indexOf(s) ?? i;
                  const pct = (s.totalCount / maxCount) * 100;
                  return (
                    <tr key={s.staffName ?? i} className="hover:bg-blue-50/20 transition-colors group">
                      <td className="px-6 py-4 text-center">{rankBadge(originalRank)}</td>
                      <td className="px-6 py-4">
                        <span className="text-[13px] font-semibold text-slate-700">
                          {s.staffName ?? "—"}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className="text-[16px] font-extrabold text-slate-800"
                          style={{ letterSpacing: "-0.02em" }}
                        >
                          {fmt(s.totalCount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                            s.recentCount > 0
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-slate-50 text-slate-400"
                          }`}
                        >
                          {s.recentCount > 0 && <TrendingUp className="h-3 w-3" />}
                          {fmt(s.recentCount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5 text-[12px] text-slate-400 font-medium">
                          <Clock className="h-3 w-3 shrink-0" />
                          {s.lastActivity ?? "—"}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full transition-all ${
                                originalRank === 0 ? "bg-amber-400" : "bg-blue-400"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-bold text-slate-400 w-8 text-right">
                            {Math.round(pct)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center text-sm text-slate-300">
                    {search ? "Staf tidak ditemukan" : "Belum ada data staf"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
