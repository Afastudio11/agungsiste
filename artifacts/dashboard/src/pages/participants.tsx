import { useState, useMemo } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import {
  useListParticipants,
  getListParticipantsQueryKey,
} from "@workspace/api-client-react";
import { Users, Search, CalendarDays, Download, X, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SortKey = "nik" | "fullName" | "gender" | "city" | "province" | "firstRegisteredAt" | "eventCount";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 text-slate-300 ml-1 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp className="h-3 w-3 text-blue-500 ml-1 shrink-0" />
    : <ChevronDown className="h-3 w-3 text-blue-500 ml-1 shrink-0" />;
}

function SortTh({
  col, label, sortKey, sortDir, onSort, align = "left",
}: {
  col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = col === sortKey;
  return (
    <th
      className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.08em] cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-0.5 ${active ? "text-blue-600" : "text-slate-400"} ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );
}

function exportCSV(participants: any[]) {
  const headers = ["NIK", "Nama", "Kelamin", "Kota", "Provinsi", "Pekerjaan", "Pertama Daftar", "Total Event"];
  const rows = participants.map((p) => [
    p.nik,
    `"${p.fullName}"`,
    p.gender ?? "",
    `"${p.city ?? ""}"`,
    `"${p.province ?? ""}"`,
    `"${p.occupation ?? ""}"`,
    new Date(p.firstRegisteredAt).toLocaleDateString("id-ID"),
    p.eventCount,
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

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const hasFilter = search || startDate || endDate;
  const resetAll = () => { setSearch(""); setStartDate(""); setEndDate(""); };

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-[26px] font-extrabold text-slate-900 leading-tight" style={{ letterSpacing: "-0.03em" }}>
              Daftar Peserta
            </h1>
            <p className="mt-1 text-sm text-slate-400 font-medium">
              {participants?.length ?? 0} peserta unik terdaftar
            </p>
          </div>
          <button
            onClick={() => participants && exportCSV(participants as any[])}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>

        {/* Top filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm flex-1 min-w-[180px]">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Cari nama atau NIK..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="flex-1 bg-transparent text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch("")} className="text-slate-300 hover:text-slate-500">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-[110px]" />
            <span className="text-slate-300">—</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-[110px]" />
          </div>
          {hasFilter && (
            <button onClick={resetAll}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-500 hover:bg-slate-50 shadow-sm">
              <X className="h-3.5 w-3.5" />
              Reset
            </button>
          )}
        </div>

        {/* Table */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <SortTh col="nik" label="NIK" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="fullName" label="Nama Lengkap" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="gender" label="Kelamin" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="city" label="Kota" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="province" label="Provinsi" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="firstRegisteredAt" label="Pertama Daftar" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="eventCount" label="Total Event" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">Memuat...</td>
                  </tr>
                ) : participants && participants.length > 0 ? (
                  participants.map((p) => (
                    <tr key={p.nik} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-5 py-3 font-mono text-[11px] text-slate-500">{p.nik}</td>
                      <td className="px-5 py-3">
                        <Link href={`/participants/${p.nik}`}>
                          <span className="font-semibold text-sm text-slate-900 hover:text-blue-600 cursor-pointer transition-colors">
                            {p.fullName}
                          </span>
                        </Link>
                        {(p as any).occupation && (
                          <div className="text-[11px] text-slate-400 mt-0.5">{(p as any).occupation}</div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {p.gender ? (
                          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                            p.gender === "LAKI-LAKI" ? "bg-blue-50 text-blue-600" : "bg-pink-50 text-pink-600"
                          }`}>
                            {p.gender === "LAKI-LAKI" ? "L" : "P"}
                          </span>
                        ) : <span className="text-slate-300 text-sm">—</span>}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-600">{(p as any).city ?? "—"}</td>
                      <td className="px-5 py-3 text-[12px] text-slate-400">{(p as any).province ?? "—"}</td>
                      <td className="px-5 py-3 text-[11px] text-slate-400">
                        {new Date(p.firstRegisteredAt).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.eventCount > 1 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"}`}>
                          {p.eventCount}
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <Users className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                      <p className="text-sm text-slate-400">
                        {hasFilter ? "Tidak ada peserta yang sesuai" : "Belum ada peserta"}
                      </p>
                      {hasFilter && (
                        <button onClick={resetAll} className="mt-2 text-xs text-blue-500 hover:underline">Reset filter</button>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
