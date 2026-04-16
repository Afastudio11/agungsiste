import { useState, useMemo } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import {
  useListParticipants,
  getListParticipantsQueryKey,
} from "@workspace/api-client-react";
import { Search, Download, X, ChevronUp, ChevronDown, ChevronsUpDown, Eye, Users, TrendingUp, Activity } from "lucide-react";

type SortKey = "nik" | "fullName" | "gender" | "city" | "province" | "firstRegisteredAt" | "eventCount";
type SortDir = "asc" | "desc";

const AVATAR_PALETTES = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function getInitials(name: string) {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

function getPalette(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_PALETTES[Math.abs(hash) % AVATAR_PALETTES.length];
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 text-slate-300 ml-1 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 text-blue-500 ml-1 shrink-0" />
    : <ChevronDown className="h-3 w-3 text-blue-500 ml-1 shrink-0" />;
}

function SortTh({ col, label, sortKey, sortDir, onSort, className = "" }: {
  col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; className?: string;
}) {
  const active = col === sortKey;
  return (
    <th
      className={`px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest cursor-pointer select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-0.5 ${active ? "text-blue-600" : ""}`}>
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );
}

function exportCSV(participants: any[]) {
  const headers = ["NIK", "Nama", "Kelamin", "Kota", "Provinsi", "Pekerjaan", "Pertama Daftar", "Total Event"];
  const rows = participants.map((p) => [
    p.nik, `"${p.fullName}"`, p.gender ?? "", `"${p.city ?? ""}"`,
    `"${p.province ?? ""}"`, `"${p.occupation ?? ""}"`,
    new Date(p.firstRegisteredAt).toLocaleDateString("id-ID"), p.eventCount,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `peserta_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ParticipantsPage() {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("firstRegisteredAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const params = {
    ...(search ? { search } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const { data: rawParticipants, isLoading } = useListParticipants(params as any, {
    query: { queryKey: getListParticipantsQueryKey(params as any) },
  });

  const participants = useMemo(() => {
    if (!rawParticipants) return rawParticipants;
    return [...rawParticipants].sort((a, b) => {
      let av: any = (a as any)[sortKey] ?? "";
      let bv: any = (b as any)[sortKey] ?? "";
      if (sortKey === "eventCount") { av = Number(av); bv = Number(bv); }
      else if (sortKey === "firstRegisteredAt") { av = new Date(av).getTime(); bv = new Date(bv).getTime(); }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rawParticipants, sortKey, sortDir]);

  const stats = useMemo(() => {
    if (!rawParticipants) return { today: 0, multiEvent: 0, total: 0 };
    const today = new Date().toDateString();
    return {
      total: rawParticipants.length,
      today: rawParticipants.filter((p) => new Date(p.firstRegisteredAt).toDateString() === today).length,
      multiEvent: rawParticipants.filter((p) => p.eventCount > 1).length,
    };
  }, [rawParticipants]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const hasFilter = search || startDate || endDate;
  const resetAll = () => { setSearch(""); setStartDate(""); setEndDate(""); };

  return (
    <Layout>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-[10px] font-extrabold uppercase tracking-widest">
                Live Database
              </span>
            </div>
            <h1 className="text-4xl font-extrabold text-slate-900 leading-tight tracking-tight">
              Daftar Peserta
            </h1>
            <p className="mt-1.5 text-base font-medium text-slate-400">
              Total Entry:{" "}
              <span className="text-slate-800 font-bold">
                {isLoading ? "..." : `${stats.total} Peserta`}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="flex items-center gap-2 bg-slate-100 rounded-full px-4 py-2.5">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Cari nama atau NIK..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-transparent text-[13px] text-slate-700 placeholder:text-slate-400 focus:outline-none w-44"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5 bg-slate-100 rounded-full px-4 py-2.5 text-xs text-slate-500">
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-[115px]" />
              <span className="text-slate-300">—</span>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-[115px]" />
            </div>

            {hasFilter && (
              <button onClick={resetAll}
                className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[12px] font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                <X className="h-3.5 w-3.5" /> Reset
              </button>
            )}

            {/* Export */}
            <button
              onClick={() => participants && exportCSV(participants as any[])}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-full font-bold text-sm shadow-sm hover:bg-purple-700 transition-colors active:scale-95"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* ── Stats Bento ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.06)] relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-slate-400 text-sm font-semibold mb-1">Registrasi Hari Ini</p>
              <h3 className="text-4xl font-extrabold text-slate-900">{isLoading ? "—" : stats.today}</h3>
              <p className="text-emerald-600 text-xs font-bold mt-2 flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5" />
                Peserta baru hari ini
              </p>
            </div>
            <div className="absolute -right-3 -bottom-3 opacity-5 group-hover:scale-110 transition-transform duration-700">
              <Users className="h-28 w-28" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.06)] relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-slate-400 text-sm font-semibold mb-1">Multi Event</p>
              <h3 className="text-4xl font-extrabold text-slate-900">{isLoading ? "—" : stats.multiEvent}</h3>
              <p className="text-amber-600 text-xs font-bold mt-2 flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" />
                Peserta lebih dari 1 event
              </p>
            </div>
            <div className="absolute -right-3 -bottom-3 opacity-5 group-hover:scale-110 transition-transform duration-700">
              <Activity className="h-28 w-28" />
            </div>
          </div>

          <div className="bg-blue-600 rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,84,202,0.25)] relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-blue-200 text-sm font-semibold mb-1">Status Sistem</p>
              <h3 className="text-4xl font-extrabold text-white">Aktif</h3>
              <p className="text-blue-200 text-xs font-bold mt-2 flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                Database terhubung
              </p>
            </div>
            <div className="absolute -right-3 -bottom-3 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Eye className="h-28 w-28 text-white" />
            </div>
          </div>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl shadow-[0_2px_16px_rgba(0,0,0,0.06)] overflow-hidden border border-white/60">
          <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
            <h4 className="text-base font-bold text-slate-900">Data Real-time</h4>
            <span className="text-xs text-slate-400 font-medium">
              {isLoading ? "Memuat..." : `${participants?.length ?? 0} entri`}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/60">
                  <SortTh col="nik" label="NIK Peserta" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="fullName" label="Nama Lengkap" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="gender" label="Kelamin" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="city" label="Domisili" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="firstRegisteredAt" label="Terdaftar" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="eventCount" label="Total Event" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <th className="px-6 py-4 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">Memuat data...</td>
                  </tr>
                ) : participants && participants.length > 0 ? (
                  participants.map((p) => {
                    const initials = getInitials(p.fullName ?? "?");
                    const palette = getPalette(p.fullName ?? "");
                    const isMulti = p.eventCount > 1;
                    return (
                      <tr key={p.nik} className="group hover:bg-slate-50/50 transition-colors">
                        {/* NIK */}
                        <td className="px-6 py-4">
                          <span className="font-mono text-xs font-semibold text-blue-600 tracking-tighter">
                            {p.nik}
                          </span>
                        </td>

                        {/* Nama + avatar */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${palette}`}>
                              {initials}
                            </div>
                            <div>
                              <p className="font-bold text-sm text-slate-900 leading-tight">{p.fullName}</p>
                              {(p as any).occupation && (
                                <p className="text-[10px] text-slate-400 font-medium mt-0.5">{(p as any).occupation}</p>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Kelamin */}
                        <td className="px-6 py-4">
                          {p.gender ? (
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${
                              p.gender === "LAKI-LAKI"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-pink-50 text-pink-600"
                            }`}>
                              {p.gender === "LAKI-LAKI" ? "L" : "P"}
                            </span>
                          ) : <span className="text-slate-300 text-sm">—</span>}
                        </td>

                        {/* Domisili */}
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-slate-800 leading-tight">{(p as any).city ?? "—"}</p>
                          {(p as any).province && (
                            <p className="text-[10px] text-slate-400 mt-0.5">{(p as any).province}</p>
                          )}
                        </td>

                        {/* Terdaftar */}
                        <td className="px-6 py-4">
                          <p className="text-xs font-medium text-slate-600">
                            {new Date(p.firstRegisteredAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                        </td>

                        {/* Total Event */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {String(p.eventCount).padStart(2, "0")}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                              isMulti
                                ? "bg-amber-50 text-amber-700"
                                : "bg-slate-100 text-slate-500"
                            }`}>
                              {isMulti ? "Multi" : "Single"}
                            </span>
                          </div>
                        </td>

                        {/* Aksi */}
                        <td className="px-6 py-4 text-right">
                          <Link href={`/participants/${p.nik}`}>
                            <button className="p-2 hover:bg-blue-50 hover:text-blue-600 text-slate-300 rounded-full transition-all opacity-0 group-hover:opacity-100">
                              <Eye className="h-4 w-4" />
                            </button>
                          </Link>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <div className="h-12 w-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3">
                        <Users className="h-6 w-6 text-slate-300" />
                      </div>
                      <p className="text-sm font-medium text-slate-400">
                        {hasFilter ? "Tidak ada peserta yang sesuai filter" : "Belum ada peserta"}
                      </p>
                      {hasFilter && (
                        <button onClick={resetAll} className="mt-2 text-xs text-blue-500 hover:underline font-medium">
                          Reset filter
                        </button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer count */}
          {participants && participants.length > 0 && (
            <div className="px-6 py-3 border-t border-slate-50 bg-slate-50/30">
              <p className="text-xs text-slate-400 font-medium">
                Menampilkan {participants.length} dari {stats.total} peserta
              </p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
