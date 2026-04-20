import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import Layout from "@/components/layout";
import {
  useListParticipants,
  getListParticipantsQueryKey,
} from "@workspace/api-client-react";
import { Search, Download, X, ChevronUp, ChevronDown, ChevronsUpDown, Users, Gift, CalendarCheck2, Eye, MapPin, ChevronRight, FileText, FileSpreadsheet, Loader2, RefreshCw } from "@/lib/icons";
import { useQuery } from "@tanstack/react-query";
import { exportExcel, exportParticipantsPDF } from "@/lib/exportUtils";

type SortKey = "nik" | "fullName" | "gender" | "city" | "province" | "firstRegisteredAt" | "eventCount";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 50;

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
      className={`px-6 py-4 text-[10px] font-bold text-slate-400 tracking-widest cursor-pointer select-none whitespace-nowrap ${className}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-0.5 ${active ? "text-blue-600" : ""}`}>
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function doExportExcel(participants: any[]) {
  const headers = ["NIK", "Nama", "Kelamin", "Kota", "Provinsi", "Kelurahan", "Kecamatan", "Pekerjaan", "Pertama Daftar", "Total Kegiatan", "Didaftarkan Oleh"];
  const rows = [headers, ...participants.map((p) => [
    p.nik, p.fullName, p.gender ?? "", p.city ?? "", p.province ?? "",
    p.kelurahan ?? "", p.kecamatan ?? "", p.occupation ?? "",
    new Date(p.firstRegisteredAt).toLocaleDateString("id-ID"), p.eventCount,
    (p as any).registeredBy ?? "",
  ])];
  exportExcel(rows, `peserta_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export default function ParticipantsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("firstRegisteredAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [showDomisili, setShowDomisili] = useState(false);
  const [filterKabupaten, setFilterKabupaten] = useState("");
  const [filterKecamatan, setFilterKecamatan] = useState("");
  const [filterKelurahan, setFilterKelurahan] = useState("");
  const [pdfProgress, setPdfProgress] = useState<{ current: number; total: number } | null>(null);

  const params: Record<string, string> = {
    ...(search ? { search } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(filterKabupaten ? { city: filterKabupaten } : {}),
    ...(filterKecamatan ? { kecamatan: filterKecamatan } : {}),
    ...(filterKelurahan ? { kelurahan: filterKelurahan } : {}),
  };

  const { data: rawParticipants, isLoading, isRefetching, refetch } = useListParticipants(params as any, {
    query: { queryKey: getListParticipantsQueryKey(params as any), refetchInterval: 30_000 },
  });

  // Cascading domisili data
  const { data: kabupatenList } = useQuery<{ kabupaten: string }[]>({
    queryKey: ["participant-kabupaten"],
    queryFn: () => fetch("/api/pemetaan/kabupaten").then((r) => r.json()),
    staleTime: 120_000,
    enabled: showDomisili,
  });
  const { data: kecamatanList } = useQuery<{ kecamatan: string }[]>({
    queryKey: ["participant-kecamatan", filterKabupaten],
    queryFn: () => fetch(`/api/pemetaan/kecamatan${filterKabupaten ? `?kabupaten=${encodeURIComponent(filterKabupaten)}` : ""}`).then((r) => r.json()),
    staleTime: 120_000,
    enabled: showDomisili,
  });
  const { data: desaList } = useQuery<{ kelurahan: string }[]>({
    queryKey: ["participant-desa", filterKabupaten, filterKecamatan],
    queryFn: () => {
      const q = new URLSearchParams();
      if (filterKabupaten) q.set("kabupaten", filterKabupaten);
      if (filterKecamatan) q.set("kecamatan", filterKecamatan);
      return fetch(`/api/pemetaan/desa?${q.toString()}`).then((r) => r.json());
    },
    staleTime: 120_000,
    enabled: showDomisili && !!(filterKabupaten || filterKecamatan),
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
    if (!rawParticipants) return { total: 0, totalEvents: 0 };
    return {
      total: rawParticipants.length,
      totalEvents: rawParticipants.reduce((s, p) => s + (p.eventCount ?? 0), 0),
    };
  }, [rawParticipants]);

  const { data: totalHadiah } = useQuery({
    queryKey: ["participants-total-hadiah"],
    queryFn: async () => {
      const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
      const res = await fetch(`${BASE}/api/prizes`, { credentials: "include" });
      const data: { distributedCount: number }[] = await res.json();
      return data.reduce((s, p) => s + (p.distributedCount ?? 0), 0);
    },
    staleTime: 60_000,
  });

  const totalPages = Math.max(1, Math.ceil((participants?.length ?? 0) / PAGE_SIZE));
  const paginatedParticipants = useMemo(() => {
    if (!participants) return [];
    return participants.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  }, [participants, currentPage]);

  const handleSort = (key: SortKey) => {
    setCurrentPage(1);
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const hasDomisiliFilter = filterKabupaten || filterKecamatan || filterKelurahan;
  const hasFilter = search || startDate || endDate || hasDomisiliFilter;
  const resetAll = () => {
    setSearch(""); setStartDate(""); setEndDate("");
    setFilterKabupaten(""); setFilterKecamatan(""); setFilterKelurahan("");
    setCurrentPage(1);
  };

  const goToPage = (p: number) => setCurrentPage(Math.min(Math.max(1, p), totalPages));

  const handleExportPDF = async () => {
    if (!participants || participants.length === 0 || pdfProgress) return;
    const list = participants as any[];
    setPdfProgress({ current: 0, total: list.length });
    const label = filterKelurahan
      ? `peserta_${filterKelurahan.replace(/\s+/g, "_")}`
      : filterKecamatan
      ? `peserta_${filterKecamatan.replace(/\s+/g, "_")}`
      : filterKabupaten
      ? `peserta_${filterKabupaten.replace(/\s+/g, "_")}`
      : "peserta_semua";
    try {
      await exportParticipantsPDF(list, BASE, (current) => setPdfProgress({ current, total: list.length }), label);
    } finally {
      setPdfProgress(null);
    }
  };

  return (
    <Layout>
      <div className="space-y-6">

        {/* ── Header ── */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="flex items-center gap-2 bg-slate-100 rounded-full px-4 py-2.5">
              <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Cari nama, NIK, pekerjaan, alamat, status..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
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
              <input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setCurrentPage(1); }}
                className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-[115px]" />
              <span className="text-slate-300">—</span>
              <input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setCurrentPage(1); }}
                className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-[115px]" />
            </div>

            {/* Domisili toggle button */}
            <button
              onClick={() => { setShowDomisili((v) => !v); }}
              className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[12px] font-bold transition-all ${
                hasDomisiliFilter
                  ? "bg-blue-600 text-white shadow-sm"
                  : showDomisili
                  ? "bg-blue-50 text-blue-600 border border-blue-200"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              <MapPin className="h-3.5 w-3.5" />
              {hasDomisiliFilter
                ? filterKelurahan || filterKecamatan || filterKabupaten
                : "Domisili"}
            </button>

            {hasFilter && (
              <button onClick={resetAll}
                className="flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[12px] font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                <X className="h-3.5 w-3.5" /> Reset
              </button>
            )}

            {/* Refresh button */}
            <button
              onClick={() => refetch()}
              disabled={isLoading || isRefetching}
              title="Refresh data"
              className="flex items-center gap-2 px-3 py-2.5 bg-white border border-slate-200 text-slate-500 rounded-full font-bold text-sm shadow-sm hover:bg-slate-50 hover:text-slate-700 disabled:opacity-50 transition-colors active:scale-95"
            >
              <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
            </button>

            {/* Export buttons */}
            <button
              onClick={() => participants && doExportExcel(participants as any[])}
              disabled={!participants || participants.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-full font-bold text-sm shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition-colors active:scale-95"
            >
              <FileSpreadsheet className="h-4 w-4" />
              Excel
            </button>
            <button
              onClick={handleExportPDF}
              disabled={!participants || participants.length === 0 || !!pdfProgress}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-full font-bold text-sm shadow-sm hover:bg-blue-700 disabled:opacity-50 transition-colors active:scale-95"
            >
              <FileText className="h-4 w-4" />
              PDF
            </button>
          </div>

          {/* Domisili cascading filter panel */}
          {showDomisili && (
            <div className="flex flex-wrap items-center gap-2 bg-white border border-blue-100 rounded-2xl px-4 py-3 shadow-sm">
              <MapPin className="h-4 w-4 text-blue-500 shrink-0" />
              <span className="text-[11px] font-bold text-slate-400 tracking-widest">Filter Domisili</span>

              {/* Kabupaten */}
              <select
                value={filterKabupaten}
                onChange={(e) => {
                  setFilterKabupaten(e.target.value);
                  setFilterKecamatan("");
                  setFilterKelurahan("");
                  setCurrentPage(1);
                }}
                className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] text-slate-700 focus:outline-none focus:border-blue-400 transition-colors min-w-[160px]"
              >
                <option value="">— Semua Kabupaten —</option>
                {(kabupatenList ?? []).map((k) => (
                  <option key={k.kabupaten} value={k.kabupaten}>{k.kabupaten}</option>
                ))}
              </select>

              {/* Kecamatan */}
              {filterKabupaten && (
                <>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  <select
                    value={filterKecamatan}
                    onChange={(e) => {
                      setFilterKecamatan(e.target.value);
                      setFilterKelurahan("");
                      setCurrentPage(1);
                    }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] text-slate-700 focus:outline-none focus:border-blue-400 transition-colors min-w-[150px]"
                  >
                    <option value="">— Semua Kecamatan —</option>
                    {(kecamatanList ?? []).map((k) => (
                      <option key={k.kecamatan} value={k.kecamatan}>{k.kecamatan}</option>
                    ))}
                  </select>
                </>
              )}

              {/* Kelurahan / Desa */}
              {filterKecamatan && (
                <>
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                  <select
                    value={filterKelurahan}
                    onChange={(e) => {
                      setFilterKelurahan(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[12px] text-slate-700 focus:outline-none focus:border-blue-400 transition-colors min-w-[150px]"
                  >
                    <option value="">— Semua Desa/Kel. —</option>
                    {(desaList ?? []).map((d) => (
                      <option key={d.kelurahan} value={d.kelurahan}>{d.kelurahan}</option>
                    ))}
                  </select>
                </>
              )}

              {hasDomisiliFilter && (
                <button
                  onClick={() => { setFilterKabupaten(""); setFilterKecamatan(""); setFilterKelurahan(""); setCurrentPage(1); }}
                  className="ml-auto flex items-center gap-1 text-[11px] text-red-400 hover:text-red-600 transition-colors"
                >
                  <X className="h-3 w-3" /> Hapus filter
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Stats Bento ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.06)] relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-slate-400 text-sm font-semibold mb-1">Teregister</p>
              <h3 className="text-4xl font-extrabold text-slate-900">{isLoading ? "—" : stats.total.toLocaleString("id-ID")}</h3>
              <p className="text-blue-600 text-xs font-bold mt-2 flex items-center gap-1">
                <Users className="h-3.5 w-3.5" />
                Total peserta unik
              </p>
            </div>
            <div className="absolute -right-3 -bottom-3 opacity-5 group-hover:scale-110 transition-transform duration-700">
              <Users className="h-28 w-28" />
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-[0_2px_16px_rgba(0,0,0,0.06)] relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-slate-400 text-sm font-semibold mb-1">Kegiatan</p>
              <h3 className="text-4xl font-extrabold text-slate-900">{isLoading ? "—" : stats.totalEvents.toLocaleString("id-ID")}</h3>
              <p className="text-amber-600 text-xs font-bold mt-2 flex items-center gap-1">
                <CalendarCheck2 className="h-3.5 w-3.5" />
                Total registrasi event
              </p>
            </div>
            <div className="absolute -right-3 -bottom-3 opacity-5 group-hover:scale-110 transition-transform duration-700">
              <CalendarCheck2 className="h-28 w-28" />
            </div>
          </div>

          <div className="bg-purple-600 rounded-2xl p-6 shadow-[0_2px_16px_rgba(147,51,234,0.25)] relative overflow-hidden group">
            <div className="relative z-10">
              <p className="text-purple-200 text-sm font-semibold mb-1">Hadiah</p>
              <h3 className="text-4xl font-extrabold text-white">{totalHadiah?.toLocaleString("id-ID") ?? "—"}</h3>
              <p className="text-purple-200 text-xs font-bold mt-2 flex items-center gap-1">
                <Gift className="h-3.5 w-3.5" />
                Total hadiah dibagikan
              </p>
            </div>
            <div className="absolute -right-3 -bottom-3 opacity-10 group-hover:scale-110 transition-transform duration-700">
              <Gift className="h-28 w-28 text-white" />
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
                  <SortTh col="gender" label="Kelamin" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                  <SortTh col="city" label="Domisili" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="firstRegisteredAt" label="Terdaftar" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                  <SortTh col="eventCount" label="Total Kegiatan" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} className="text-right" />
                  <th className="px-6 py-4 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">Memuat data...</td>
                  </tr>
                ) : paginatedParticipants.length > 0 ? (
                  paginatedParticipants.map((p) => {
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
                          <Link href={`/participants/${p.nik}`}>
                            <div className="flex items-center gap-3 cursor-pointer">
                              <div className={`h-9 w-9 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${palette}`}>
                                {initials}
                              </div>
                              <div>
                                <p className="font-bold text-sm text-slate-900 group-hover:text-blue-600 transition-colors leading-tight">{p.fullName}</p>
                                {(p as any).occupation && (
                                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">{(p as any).occupation}</p>
                                )}
                              </div>
                            </div>
                          </Link>
                        </td>

                        {/* Kelamin */}
                        <td className="px-6 py-4 hidden sm:table-cell">
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
                        </td>

                        {/* Terdaftar */}
                        <td className="px-6 py-4 hidden md:table-cell">
                          <p className="text-xs font-medium text-slate-600">
                            {new Date(p.firstRegisteredAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                          </p>
                          {(p as any).registeredBy && (
                            <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                              <span className="font-medium">oleh</span>
                              <span className="font-semibold text-slate-500">{(p as any).registeredBy.split(" ").slice(0, 2).join(" ")}</span>
                            </p>
                          )}
                        </td>

                        {/* Total Event */}
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {String(p.eventCount).padStart(2, "0")}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[9px] font-bold ${
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
                          <button
                            onClick={() => navigate(`/participants/${p.nik}`)}
                            className="p-2 hover:bg-blue-50 hover:text-blue-600 text-slate-300 rounded-full transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
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

          {/* Pagination */}
          {!isLoading && (participants?.length ?? 0) > 0 && (
            <div className="px-6 py-4 border-t border-slate-50 bg-slate-50/30 flex items-center justify-between">
              <p className="text-xs text-slate-400 font-medium">
                Menampilkan {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, participants?.length ?? 0)} dari {participants?.length ?? 0} peserta
              </p>
              <div className="flex items-center gap-1">
                {/* Prev */}
                <button
                  onClick={() => goToPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown className="h-4 w-4 rotate-90" />
                </button>

                {/* Page numbers */}
                {(() => {
                  const pages: (number | "...")[] = [];
                  if (totalPages <= 7) {
                    for (let i = 1; i <= totalPages; i++) pages.push(i);
                  } else {
                    pages.push(1);
                    if (currentPage > 3) pages.push("...");
                    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) pages.push(i);
                    if (currentPage < totalPages - 2) pages.push("...");
                    pages.push(totalPages);
                  }
                  return pages.map((p, i) =>
                    p === "..." ? (
                      <span key={`dots-${i}`} className="w-8 h-8 flex items-center justify-center text-slate-400 text-xs">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => goToPage(p as number)}
                        className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                          currentPage === p
                            ? "bg-blue-600 text-white font-bold shadow-sm"
                            : "text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {p}
                      </button>
                    )
                  );
                })()}

                {/* Next */}
                <button
                  onClick={() => goToPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 text-slate-400 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown className="h-4 w-4 -rotate-90" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── PDF Progress Modal ── */}
      {pdfProgress && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full text-center">
            <div className="mb-4 flex justify-center">
              <div className="h-14 w-14 rounded-full bg-blue-50 flex items-center justify-center">
                <Loader2 className="h-7 w-7 text-blue-600 animate-spin" />
              </div>
            </div>
            <h3 className="text-base font-bold text-slate-800 mb-1">Membuat PDF...</h3>
            <p className="text-sm text-slate-500 mb-5">
              Memuat foto KTP peserta {pdfProgress.current} dari {pdfProgress.total}
            </p>
            <div className="w-full bg-slate-100 rounded-full h-2.5 mb-2">
              <div
                className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                style={{ width: `${pdfProgress.total > 0 ? Math.round((pdfProgress.current / pdfProgress.total) * 100) : 0}%` }}
              />
            </div>
            <p className="text-xs text-slate-400">
              {pdfProgress.total > 0 ? Math.round((pdfProgress.current / pdfProgress.total) * 100) : 0}% — Jangan tutup jendela ini
            </p>
          </div>
        </div>
      )}
    </Layout>
  );
}
