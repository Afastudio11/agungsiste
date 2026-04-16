import { useState, useMemo } from "react";
import Layout from "@/components/layout";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Search, TrendingUp, Users, Clock, Medal, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SortKey = "staffName" | "totalCount" | "recentCount" | "lastActivity";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 text-slate-300 ml-1 shrink-0" />;
  return sortDir === "asc" ? <ChevronUp className="h-3 w-3 text-blue-500 ml-1 shrink-0" /> : <ChevronDown className="h-3 w-3 text-blue-500 ml-1 shrink-0" />;
}

function SortTh({ col, label, sortKey, sortDir, onSort, align = "left", className = "" }: {
  col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; align?: "left" | "right"; className?: string;
}) {
  const active = col === sortKey;
  return (
    <th className={`px-5 py-3 text-[10px] font-bold uppercase tracking-wider cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"} ${className}`} onClick={() => onSort(col)}>
      <span className={`inline-flex items-center gap-0.5 ${active ? "text-blue-600" : "text-slate-400"} ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type StaffRow = {
  staffName: string | null;
  totalCount: number;
  recentCount: number;
  lastActivity: string;
};

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 0)
    return (
      <div className="h-8 w-8 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
        <span className="text-xs font-extrabold text-amber-600">🥇</span>
      </div>
    );
  if (rank === 1)
    return (
      <div className="h-8 w-8 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
        <span className="text-xs font-extrabold text-slate-500">🥈</span>
      </div>
    );
  if (rank === 2)
    return (
      <div className="h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
        <span className="text-xs font-extrabold text-orange-600">🥉</span>
      </div>
    );
  return (
    <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-slate-400">{rank + 1}</span>
    </div>
  );
}

export default function StaffPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("totalCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const { data: staffList, isLoading } = useQuery<StaffRow[]>({
    queryKey: ["staff-list"],
    queryFn: () =>
      fetch(`${BASE}/api/dashboard/staff`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const filtered = useMemo(() => {
    if (!staffList) return [];
    let list = search.trim()
      ? staffList.filter((s) => (s.staffName ?? "").toLowerCase().includes(search.toLowerCase()))
      : [...staffList];
    list.sort((a, b) => {
      let av: any = (a as any)[sortKey] ?? "";
      let bv: any = (b as any)[sortKey] ?? "";
      if (sortKey === "totalCount" || sortKey === "recentCount") { av = Number(av); bv = Number(bv); }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
    return list;
  }, [staffList, search, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const maxCount = staffList?.[0]?.totalCount ?? 1;
  const totalRegistrations = staffList?.reduce((s, r) => s + Number(r.totalCount), 0) ?? 0;
  const totalStaff = staffList?.length ?? 0;
  const totalRecent = staffList?.reduce((s, r) => s + Number(r.recentCount), 0) ?? 0;
  const top3 = (staffList ?? []).slice(0, 3);

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-6 max-w-5xl">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Performa Staf</h1>
          <p className="text-sm text-slate-500 mt-0.5">Aktivitas dan pencapaian staf input registrasi</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Total Staf", value: totalStaff, icon: Users, circleColor: "bg-blue-400", iconColor: "text-blue-500" },
            { label: "Total Registrasi", value: totalRegistrations, icon: Trophy, circleColor: "bg-green-400", iconColor: "text-green-500" },
            { label: "7 Hari Terakhir", value: totalRecent, icon: TrendingUp, circleColor: "bg-amber-400", iconColor: "text-amber-500" },
          ].map(({ label, value, icon: Icon, circleColor, iconColor }) => (
            <div key={label} className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-5 pt-5 pb-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] transition-shadow">
              {/* Decorative circle */}
              <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 ${circleColor}`} />
              <div className="flex items-start justify-between mb-3 relative">
                <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</p>
                <Icon className={`h-5 w-5 ${iconColor}`} />
              </div>
              <p className="text-[34px] font-extrabold text-slate-900 leading-none relative" style={{ letterSpacing: "-0.04em" }}>
                {fmt(value)}
              </p>
            </div>
          ))}
        </div>

        {/* Top 3 podium */}
        {!isLoading && top3.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="flex items-center gap-2 mb-5">
              <Medal className="h-4 w-4 text-amber-500" />
              <span className="font-bold text-slate-900">Top Performer</span>
            </div>
            <div className="grid grid-cols-3 gap-4">
              {top3.map((s, i) => {
                const pct = Math.round((Number(s.totalCount) / maxCount) * 100);
                const configs = [
                  { bg: "from-amber-50 to-amber-100/50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-400", h: "h-20" },
                  { bg: "from-slate-50 to-slate-100/50", border: "border-slate-200", text: "text-slate-600", badge: "bg-slate-400", h: "h-14" },
                  { bg: "from-orange-50 to-orange-100/50", border: "border-orange-200", text: "text-orange-700", badge: "bg-orange-400", h: "h-10" },
                ];
                const cfg = configs[i];
                return (
                  <div key={s.staffName} className={`flex flex-col items-center text-center rounded-xl border bg-gradient-to-b ${cfg.bg} ${cfg.border} p-4`}>
                    <div className="text-2xl mb-2">{i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}</div>
                    <div className="h-10 w-10 rounded-full bg-white border-2 border-white shadow-sm flex items-center justify-center text-sm font-bold text-slate-700 mb-2">
                      {(s.staffName ?? "?")[0].toUpperCase()}
                    </div>
                    <div className={`text-xs font-bold truncate w-full ${cfg.text}`}>{s.staffName ?? "—"}</div>
                    <div className="text-lg font-extrabold text-slate-900 mt-1" style={{ letterSpacing: "-0.04em" }}>
                      {fmt(Number(s.totalCount))}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">registrasi</div>
                    {/* Bar */}
                    <div className="mt-2 w-full h-1 rounded-full bg-white/60 overflow-hidden">
                      <div className={`h-full rounded-full ${cfg.badge}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Full leaderboard table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4 border-b border-slate-100">
            <div>
              <div className="font-bold text-slate-900">Leaderboard Staf</div>
              <div className="text-xs text-slate-400 mt-0.5">Diurutkan berdasarkan total registrasi</div>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 w-full sm:w-auto">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Cari nama staf..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full sm:w-44 border-0 bg-transparent text-xs text-slate-600 placeholder:text-slate-300 focus:outline-none"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-16 gap-3">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
              <span className="text-sm text-slate-400">Memuat data staf...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="px-5 py-3 text-center w-14 text-[10px] font-bold uppercase tracking-wider text-slate-400">#</th>
                    <SortTh col="staffName" label="Nama Staf" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                    <SortTh col="totalCount" label="Total Input" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                    <SortTh col="recentCount" label="7 Hari" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" className="hidden sm:table-cell" />
                    <SortTh col="lastActivity" label="Terakhir Aktif" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" className="hidden md:table-cell" />
                    <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-400 hidden md:table-cell">Performa</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.length > 0 ? (
                    filtered.map((s, i) => {
                      const originalRank = staffList?.indexOf(s) ?? i;
                      const pct = (Number(s.totalCount) / maxCount) * 100;
                      return (
                        <tr key={s.staffName ?? i} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-5 py-3.5 text-center">
                            <div className="flex justify-center">
                              <RankBadge rank={originalRank} />
                            </div>
                          </td>
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center font-bold text-sm text-blue-600 shrink-0">
                                {(s.staffName ?? "?")[0].toUpperCase()}
                              </div>
                              <span className="text-sm font-semibold text-slate-800">{s.staffName ?? "—"}</span>
                            </div>
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <span className="text-base font-extrabold text-slate-800" style={{ letterSpacing: "-0.02em" }}>
                              {fmt(Number(s.totalCount))}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right hidden sm:table-cell">
                            <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${
                              Number(s.recentCount) > 0 ? "bg-green-50 text-green-600" : "bg-slate-50 text-slate-400"
                            }`}>
                              {Number(s.recentCount) > 0 && <TrendingUp className="h-3 w-3" />}
                              {fmt(Number(s.recentCount))}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right hidden md:table-cell">
                            <div className="flex items-center justify-end gap-1.5 text-xs text-slate-400 font-medium">
                              <Clock className="h-3 w-3 shrink-0" />
                              {s.lastActivity ?? "—"}
                            </div>
                          </td>
                          <td className="px-5 py-3.5 hidden md:table-cell">
                            <div className="flex items-center justify-end gap-2">
                              <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className={`h-full rounded-full transition-all ${
                                    originalRank === 0 ? "bg-amber-400" : originalRank === 1 ? "bg-slate-400" : originalRank === 2 ? "bg-orange-400" : "bg-blue-400"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <span className="text-xs font-bold text-slate-400 w-8 text-right">{Math.round(pct)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="px-5 py-16 text-center text-sm text-slate-400">
                        {search ? "Staf tidak ditemukan" : "Belum ada data staf"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
