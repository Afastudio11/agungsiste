import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import {
  useListParticipants,
  getListParticipantsQueryKey,
} from "@workspace/api-client-react";
import { Users, Search, CalendarDays, Download, X } from "lucide-react";

function exportCSV(participants: any[]) {
  const headers = ["NIK", "Nama", "Kelamin", "Kota", "Kecamatan", "Kelurahan", "Pekerjaan", "Pertama Daftar", "Total Event"];
  const rows = participants.map((p) => [
    p.nik,
    `"${p.fullName}"`,
    p.gender ?? "",
    `"${p.city ?? ""}"`,
    `"${p.kecamatan ?? ""}"`,
    `"${p.kelurahan ?? ""}"`,
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

  const params = {
    ...(search ? { search } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const { data: participants, isLoading } = useListParticipants(params, {
    query: { queryKey: getListParticipantsQueryKey(params) },
  });

  return (
    <Layout>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1
              className="text-[26px] font-extrabold text-slate-900 leading-tight"
              style={{ letterSpacing: "-0.03em" }}
            >
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

        {/* Filters */}
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
          </div>
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-[110px]"
            />
            <span className="text-slate-300">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-[110px]"
            />
          </div>
          {(search || startDate || endDate) && (
            <button
              onClick={() => { setSearch(""); setStartDate(""); setEndDate(""); }}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[12px] font-medium text-slate-500 hover:bg-slate-50 shadow-sm"
            >
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
                <tr className="border-b border-slate-50 bg-slate-50/60">
                  {["NIK", "Nama Lengkap", "Kelamin", "Kota", "Pertama Daftar", "Total Event"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 ${i === 5 ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-slate-400">Memuat...</td>
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
                      <td className="px-5 py-3 text-sm text-slate-500">{p.gender ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{(p as any).city ?? "—"}</td>
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
                    <td colSpan={6} className="px-5 py-12 text-center">
                      <Users className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                      <p className="text-sm text-slate-400">Belum ada peserta</p>
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
