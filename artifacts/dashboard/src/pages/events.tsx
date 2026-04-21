import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import {
  useListEvents,
  useCreateEvent,
  useDeleteEvent,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { kabupatenList, getKecamatanList, getDesaList } from "@workspace/db/jatimWilayah";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  Search,
  X,
  Download,
  ChevronUp,
  ChevronDown,
} from "@/lib/icons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type SortKey = "name" | "eventDate" | "location" | "participantCount";
type SortDir = "asc" | "desc";

function findWilayah(kelurahan: string): { kab: string; kec: string } {
  if (!kelurahan) return { kab: "", kec: "" };
  for (const kab of kabupatenList) {
    for (const kec of getKecamatanList(kab)) {
      if (getDesaList(kab, kec).some((d) => d.toLowerCase() === kelurahan.toLowerCase())) {
        return { kab, kec };
      }
    }
  }
  return { kab: "", kec: "" };
}

const selectCls = "w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

function WilayahSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const init = findWilayah(value);
  const [kab, setKab] = useState(init.kab);
  const [kec, setKec] = useState(init.kec);
  const [kel, setKel] = useState(value);

  const kecList = kab ? getKecamatanList(kab) : [];
  const kelList = kab && kec ? getDesaList(kab, kec) : [];

  return (
    <div className="grid grid-cols-3 gap-2">
      <div>
        <label className="block text-[10px] font-bold tracking-[0.08em] text-slate-300 mb-1">Kabupaten/Kota</label>
        <select
          value={kab}
          onChange={(e) => { setKab(e.target.value); setKec(""); setKel(""); onChange(""); }}
          className={selectCls}
        >
          <option value="">— Pilih —</option>
          {kabupatenList.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-bold tracking-[0.08em] text-slate-300 mb-1">Kecamatan</label>
        <select
          value={kec}
          disabled={!kab}
          onChange={(e) => { setKec(e.target.value); setKel(""); onChange(""); }}
          className={selectCls}
        >
          <option value="">— Pilih —</option>
          {kecList.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-[10px] font-bold tracking-[0.08em] text-slate-300 mb-1">Kelurahan/Desa</label>
        <select
          value={kel}
          disabled={!kec}
          onChange={(e) => { setKel(e.target.value); onChange(e.target.value); }}
          className={selectCls}
        >
          <option value="">— Pilih —</option>
          {kelList.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>
    </div>
  );
}

const CATEGORIES = [
  "Kegiatan Sosial",
  "Pendidikan",
  "Kesehatan",
  "Ekonomi",
  "Olahraga",
  "Budaya",
  "Keagamaan",
  "Pemerintahan",
  "Lainnya",
];

const emptyForm = {
  name: "",
  description: "",
  location: "",
  eventDate: "",
  category: "",
  startTime: "",
  endTime: "",
  targetParticipants: "",
  isRsvp: false,
  status: "active",
};

function exportExcelEvents(events: any[]) {
  import("@/lib/exportUtils").then(({ exportExcel }) => {
    const headers = ["ID", "Nama Kegiatan", "Tanggal", "Lokasi", "Kategori", "Peserta", "Status"];
    const rows = [headers, ...events.map((e) => [
      e.id, e.name, e.eventDate, e.location ?? "", e.category ?? "", e.participantCount, e.status ?? "active",
    ])];
    exportExcel(rows, `events_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
}

function ParticipantPill({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div className="w-9 h-9 rounded-full ring-4 ring-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">
        0
      </div>
    );
  }
  const display = count >= 1000 ? `+${(count / 1000).toFixed(1)}k` : `+${count}`;
  return (
    <div className="w-9 h-9 rounded-full ring-4 ring-white bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">
      {display}
    </div>
  );
}

export default function EventsPage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("eventDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [fasilitasCreate, setFasilitasCreate] = useState<string[]>([]);
  const [fasilitasInputCreate, setFasilitasInputCreate] = useState("");
  const [showDateFilter, setShowDateFilter] = useState(false);
  const [filterKabupaten, setFilterKabupaten] = useState("");
  const [showWilayahFilter, setShowWilayahFilter] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"all" | "active" | "inactive">("all");

  const qc = useQueryClient();
  const { toast } = useToast();
  const [togglingId, setTogglingId] = useState<number | null>(null);

  const toggleStatus = async (e: React.MouseEvent, id: number, currentStatus: string) => {
    e.stopPropagation();
    const newStatus = currentStatus === "active" ? "inactive" : "active";
    setTogglingId(id);
    try {
      const res = await fetch(`${BASE}/api/events/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("Gagal mengubah status");
      qc.invalidateQueries({ queryKey: getListEventsQueryKey(params) });
      toast({ title: newStatus === "active" ? "Kegiatan diaktifkan" : "Kegiatan dinonaktifkan" });
    } catch {
      toast({ title: "Gagal mengubah status kegiatan", variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  };

  const params = {
    ...(search ? { search } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const { data: rawEvents, isLoading } = useListEvents(params, {
    query: { queryKey: getListEventsQueryKey(params) },
  });

  const events = useMemo(() => {
    if (!rawEvents) return rawEvents;
    let filtered = [...rawEvents];

    if (filterStatus !== "all") {
      filtered = filtered.filter((e) => ((e as any).status ?? "active") === filterStatus);
    }

    if (filterKabupaten) {
      const allDesa = new Set(
        getKecamatanList(filterKabupaten)
          .flatMap((kec) => getDesaList(filterKabupaten, kec).map((d) => d.toLowerCase()))
      );
      filtered = filtered.filter((e) => allDesa.has((e.location ?? "").toLowerCase()));
    }

    return filtered.sort((a, b) => {
      let av: any = (a as any)[sortKey] ?? "";
      let bv: any = (b as any)[sortKey] ?? "";
      if (sortKey === "participantCount") {
        av = Number(av);
        bv = Number(bv);
      } else {
        av = String(av).toLowerCase();
        bv = String(bv).toLowerCase();
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rawEvents, sortKey, sortDir, filterKabupaten, filterStatus]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const createEvent = useCreateEvent({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEventsQueryKey({}) });
        closeForm();
        toast({ title: "Kegiatan berhasil dibuat" });
      },
    },
  });

  const deleteEvent = useDeleteEvent({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEventsQueryKey({}) });
        toast({ title: "Kegiatan dihapus" });
      },
    },
  });

  const openCreate = () => {
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setForm({ ...emptyForm });
    setFasilitasCreate([]);
    setFasilitasInputCreate("");
  };

  const addFasilitasCreate = () => {
    const val = fasilitasInputCreate.trim();
    if (val && !fasilitasCreate.includes(val)) {
      setFasilitasCreate((prev) => [...prev, val]);
    }
    setFasilitasInputCreate("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.eventDate) return;
    const data = {
      name: form.name,
      description: form.description || undefined,
      location: form.location || undefined,
      eventDate: form.eventDate,
      category: form.category || undefined,
      startTime: form.startTime || undefined,
      endTime: form.endTime || undefined,
      targetParticipants: form.targetParticipants ? parseInt(form.targetParticipants) : undefined,
      isRsvp: form.isRsvp,
      status: form.status,
      fasilitas: fasilitasCreate.length > 0 ? JSON.stringify(fasilitasCreate) : undefined,
    };
    createEvent.mutate({ data });
  };

  const isPending = createEvent.isPending;
  const hasFilter = search || startDate || endDate || filterKabupaten || filterStatus !== "all";

  return (
    <Layout>
      <div className="space-y-8">

        {/* ── Toolbar ── */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search bar */}
            <div className="flex-1 relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Cari nama kegiatan..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 text-sm text-slate-700 placeholder:text-slate-400 transition-colors"
              />
            </div>

            {/* Right-side actions */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowDateFilter((v) => !v)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  startDate || endDate
                    ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                    : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                <CalendarDays className="h-4 w-4" />
                <span className="hidden sm:inline">{startDate || endDate ? "Filter aktif" : "Tanggal"}</span>
              </button>

              <button
                onClick={() => handleSort("eventDate")}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  sortKey === "eventDate"
                    ? "bg-slate-100 text-slate-700 border-slate-200"
                    : "bg-white text-slate-500 border-slate-200 hover:text-slate-700"
                }`}
                title="Urutkan tanggal"
              >
                {sortKey === "eventDate" && sortDir === "asc" ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="hidden sm:inline">Tanggal</span>
              </button>

              <button
                onClick={() => setShowWilayahFilter((v) => !v)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                  filterKabupaten
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "bg-white text-slate-600 border-slate-200 hover:border-emerald-300 hover:text-emerald-700"
                }`}
              >
                <MapPin className="h-4 w-4" />
                <span className="hidden sm:inline">{filterKabupaten || "Wilayah"}</span>
              </button>

              {hasFilter && (
                <button
                  onClick={() => { setSearch(""); setStartDate(""); setEndDate(""); setFilterKabupaten(""); setFilterStatus("all"); setShowDateFilter(false); setShowWilayahFilter(false); }}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm border bg-white text-red-400 border-red-100 hover:bg-red-50 transition-all"
                  title="Reset filter"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <div className="h-6 w-px bg-slate-200" />

              <button
                onClick={() => events && exportExcelEvents(events)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-sm"
              >
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-all text-sm"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Tambah Kegiatan</span>
              </button>
            </div>
          </div>

          {/* Date range row */}
          {showDateFilter && (
            <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <CalendarDays className="h-4 w-4 text-slate-400 shrink-0" />
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Dari</span>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
              <span className="text-slate-300">→</span>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Sampai</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-indigo-400 transition-colors"
                />
              </div>
              <button
                onClick={() => setShowDateFilter(false)}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Tutup
              </button>
            </div>
          )}

          {/* Wilayah filter row */}
          {showWilayahFilter && (
            <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3">
              <MapPin className="h-4 w-4 text-emerald-500 shrink-0" />
              <span className="text-xs font-medium text-slate-500">Kabupaten / Kota</span>
              <select
                value={filterKabupaten}
                onChange={(e) => setFilterKabupaten(e.target.value)}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-emerald-400 transition-colors"
              >
                <option value="">— Semua wilayah —</option>
                {kabupatenList.map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
              {filterKabupaten && (
                <button
                  onClick={() => setFilterKabupaten("")}
                  className="text-xs text-red-400 hover:text-red-600 transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                onClick={() => setShowWilayahFilter(false)}
                className="ml-auto text-xs text-slate-400 hover:text-slate-600 transition-colors"
              >
                Tutup
              </button>
            </div>
          )}
        </div>

        {/* ── Event List ── */}
        <div className="space-y-5">
          {/* Section header */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-3">
              <h3 className="text-sm font-bold text-slate-900 tracking-widest flex items-center gap-2">
                Daftar Event
                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                  {events?.length ?? 0}
                </span>
              </h3>
              {/* Status filter chips */}
              <div className="flex items-center gap-1">
                {(["all", "active", "inactive"] as const).map((s) => {
                  const labels = { all: "Semua", active: "Aktif", inactive: "Nonaktif" };
                  const active = filterStatus === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setFilterStatus(s)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                        active
                          ? s === "active"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : s === "inactive"
                              ? "bg-slate-100 text-slate-500 border-slate-200"
                              : "bg-indigo-50 text-indigo-600 border-indigo-100"
                          : "bg-white text-slate-400 border-slate-200 hover:text-slate-600"
                      }`}
                    >
                      {labels[s]}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Sort options */}
            <div className="flex items-center gap-1 text-xs">
              {(["name", "eventDate", "participantCount"] as SortKey[]).map((key) => {
                const labels: Record<SortKey, string> = {
                  name: "Nama",
                  eventDate: "Tanggal",
                  location: "Lokasi",
                  participantCount: "Peserta",
                };
                const active = sortKey === key;
                return (
                  <button
                    key={key}
                    onClick={() => handleSort(key)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-xl font-bold transition-colors ${
                      active
                        ? "bg-indigo-50 text-indigo-600 border border-indigo-100"
                        : "text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {labels[key]}
                    {active && (
                      sortDir === "asc"
                        ? <ChevronUp className="h-3 w-3" />
                        : <ChevronDown className="h-3 w-3" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Cards */}
          <div className="grid grid-cols-1 gap-4">
            {isLoading ? (
              <div className="py-16 text-center text-sm text-slate-400">Memuat...</div>
            ) : events && events.length > 0 ? (
              events.map((event) => (
                <div
                  key={event.id}
                  onClick={() => navigate(`/events/${event.id}`)}
                  className={`group bg-white border shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-[1.75rem] px-7 py-5 flex flex-col lg:flex-row items-start lg:items-center gap-5 transition-all cursor-pointer ${
                    (event as any).status === "inactive"
                      ? "border-slate-100 opacity-60 hover:opacity-80"
                      : "border-slate-100 hover:border-indigo-100 hover:shadow-[0_8px_32px_rgba(79,70,229,0.08)]"
                  }`}
                >
                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className={`text-xl font-bold truncate ${(event as any).status === "inactive" ? "text-slate-400" : "text-slate-900 group-hover:text-indigo-600"} transition-colors`}>
                        {event.name}
                      </h4>
                      {(event as any).status === "inactive" && (
                        <span className="shrink-0 inline-block text-[10px] font-bold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-lg border border-slate-200">
                          Nonaktif
                        </span>
                      )}
                    </div>
                    {event.description && (
                      <p className="text-sm text-slate-500 mb-3 line-clamp-1">{event.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-4 mt-1">
                      <div className="flex items-center gap-1.5">
                        <CalendarDays className="h-4 w-4 text-slate-400" />
                        <span className="text-xs font-bold text-slate-700">{event.eventDate}</span>
                        {(event as any).startTime && (
                          <span className="text-xs text-slate-400">· {(event as any).startTime}</span>
                        )}
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-slate-400" />
                          <span className="text-xs font-bold text-slate-700 truncate max-w-[180px]">
                            {event.location}
                          </span>
                        </div>
                      )}
                      {/* Category / RSVP badges */}
                      <div className="flex items-center gap-1.5">
                        {(event as any).category && (
                          <span className="inline-block text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-lg">
                            {(event as any).category}
                          </span>
                        )}
                        {(event as any).isRsvp && (
                          <span className="inline-block text-[10px] font-bold bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded-lg border border-indigo-100">
                            RSVP
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right side: participant count + actions */}
                  <div className="flex items-center gap-4 shrink-0 lg:pl-4">
                    {/* Participant avatar-style pill */}
                    <div className="flex -space-x-2">
                      <ParticipantPill count={event.participantCount ?? 0} />
                    </div>
                    {(event as any).targetParticipants && (
                      <div className="text-right hidden lg:block">
                        <p className="text-[10px] font-bold text-slate-400 tracking-wider">Target</p>
                        <p className="text-sm font-extrabold text-slate-700">{(event as any).targetParticipants}</p>
                      </div>
                    )}
                    <div className="h-10 w-px bg-slate-100 hidden lg:block" />
                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      {/* On/Off Toggle */}
                      <button
                        onClick={(e) => toggleStatus(e, event.id, (event as any).status ?? "active")}
                        disabled={togglingId === event.id}
                        title={(event as any).status === "inactive" ? "Aktifkan kegiatan" : "Nonaktifkan kegiatan"}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl transition-all bg-slate-50 hover:bg-slate-100 disabled:opacity-50"
                      >
                        <span
                          className={`relative inline-flex shrink-0 w-9 h-5 rounded-full transition-colors duration-200 ${
                            (event as any).status === "inactive" ? "bg-slate-200" : "bg-emerald-500"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${
                              (event as any).status === "inactive" ? "translate-x-0" : "translate-x-4"
                            }`}
                          />
                        </span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); navigate(`/events/${event.id}/edit`); }}
                        title="Edit"
                        className="p-2.5 bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Hapus kegiatan "${event.name}"?`)) {
                            deleteEvent.mutate({ id: event.id });
                          }
                        }}
                        title="Hapus"
                        className="p-2.5 bg-slate-50 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-20 text-center bg-white border border-slate-100 rounded-[1.75rem]">
                <CalendarDays className="h-10 w-10 mx-auto mb-3 text-slate-200" />
                <p className="text-sm font-semibold text-slate-400">Belum ada kegiatan</p>
                <button
                  onClick={openCreate}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-full hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Tambah Event Pertama
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Create / Edit Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 flex-shrink-0">
              <div className="font-extrabold text-slate-900 text-[15px]" style={{ letterSpacing: "-0.02em" }}>
                Tambah Kegiatan Baru
              </div>
              <button
                onClick={closeForm}
                className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto flex-1">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                    Nama Event *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nama kegiatan"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                    Tanggal *
                  </label>
                  <input
                    type="date"
                    required
                    value={form.eventDate}
                    onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                  />
                </div>
                <div className="col-span-2 grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                      Jam Mulai
                    </label>
                    <input
                      type="time"
                      value={form.startTime}
                      onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                      Jam Selesai
                    </label>
                    <input
                      type="time"
                      value={form.endTime}
                      onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                    Lokasi
                  </label>
                  <WilayahSelect
                    value={form.location}
                    onChange={(v) => setForm({ ...form, location: v })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                    Kategori
                  </label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                  >
                    <option value="">— Pilih kategori —</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                    Target Peserta
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={form.targetParticipants}
                    onChange={(e) => setForm({ ...form, targetParticipants: e.target.value })}
                    placeholder="cth: 500"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                    Status
                  </label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                  >
                    <option value="active">Aktif</option>
                    <option value="inactive">Tidak Aktif</option>
                  </select>
                </div>
                <div className="flex items-center gap-3">
                  <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400">
                    Mode RSVP
                  </label>
                  <div
                    onClick={() => setForm((prev) => ({ ...prev, isRsvp: !prev.isRsvp }))}
                    className={`relative w-9 h-5 rounded-full cursor-pointer transition-colors flex-shrink-0 ${form.isRsvp ? "bg-indigo-600" : "bg-slate-200"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${form.isRsvp ? "translate-x-4" : "translate-x-0"}`} />
                  </div>
                  <span className="text-[11px] text-slate-500">{form.isRsvp ? "Aktif" : "Nonaktif"}</span>
                </div>
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                    Deskripsi
                  </label>
                  <textarea
                    rows={2}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Deskripsi singkat tentang kegiatan ini..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors resize-none"
                  />
                </div>
              </div>

              {/* Fasilitas */}
              <div className="mt-4 space-y-2">
                <label className="block text-[11px] font-bold tracking-[0.08em] text-slate-400 mb-1.5">
                  Fasilitas
                </label>
                {fasilitasCreate.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mb-2">
                    {fasilitasCreate.map((f) => (
                      <span key={f} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700">
                        {f}
                        <button
                          type="button"
                          onClick={() => setFasilitasCreate((prev) => prev.filter((x) => x !== f))}
                          className="text-indigo-400 hover:text-indigo-700 transition ml-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={fasilitasInputCreate}
                    onChange={(e) => setFasilitasInputCreate(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); addFasilitasCreate(); }
                      if (e.key === ",") { e.preventDefault(); addFasilitasCreate(); }
                    }}
                    placeholder="cth: Merchandise, Snack..."
                    className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                  />
                  <button
                    type="button"
                    onClick={addFasilitasCreate}
                    disabled={!fasilitasInputCreate.trim()}
                    className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-40 transition-colors"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {["Merchandise", "Snack", "Konsumsi", "Sertifikat", "Kaos", "Topi"].map((s) => (
                    !fasilitasCreate.includes(s) && (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setFasilitasCreate((prev) => [...prev, s])}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-500 hover:bg-slate-100 transition-colors"
                      >
                        + {s}
                      </button>
                    )
                  ))}
                </div>
              </div>

              <div className="mt-5 flex gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex-1 rounded-xl bg-indigo-600 py-2.5 text-sm font-bold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md shadow-indigo-100"
                >
                  {isPending ? "Menyimpan..." : "Buat Kegiatan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
