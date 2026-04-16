import { useState, useMemo, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import Layout from "@/components/layout";
import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
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
} from "lucide-react";

type SortKey = "name" | "eventDate" | "location" | "participantCount";
type SortDir = "asc" | "desc";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface DesaOption { kelurahan: string; kecamatan: string; kabupaten: string; }

function LocationInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: options = [] } = useQuery<DesaOption[]>({
    queryKey: ["desa-options", query],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/desa?search=${encodeURIComponent(query)}`, {
        credentials: "include",
      })
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d.slice(0, 40) : [])),
    enabled: query.length >= 2,
    staleTime: 30_000,
  });

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  const filtered = options.filter((o) =>
    o.kelurahan.toLowerCase().includes(query.toLowerCase()) ||
    o.kecamatan.toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        placeholder="Ketik nama desa / kecamatan..."
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {filtered.map((o, i) => (
            <button
              key={`${o.kelurahan}-${i}`}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(o.kelurahan);
                setQuery(o.kelurahan);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition flex items-center justify-between gap-3 border-b border-slate-50 last:border-0"
            >
              <span className="text-[13px] font-semibold text-slate-800">{o.kelurahan}</span>
              <span className="text-[11px] text-slate-400 shrink-0">Kec. {o.kecamatan}</span>
            </button>
          ))}
        </div>
      )}
      {open && query.length >= 2 && filtered.length === 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-slate-200 bg-white shadow-lg px-3 py-3 text-[12px] text-slate-400 text-center">
          Tidak ada desa yang cocok
        </div>
      )}
    </div>
  );
}

const emptyForm = {
  name: "",
  description: "",
  location: "",
  eventDate: "",
  category: "",
  startTime: "",
  targetParticipants: "",
};

function exportCSV(events: any[]) {
  const headers = ["ID", "Nama Event", "Tanggal", "Lokasi", "Kategori", "Peserta", "Status"];
  const rows = events.map((e) => [
    e.id,
    `"${e.name}"`,
    e.eventDate,
    `"${e.location ?? ""}"`,
    `"${e.category ?? ""}"`,
    e.participantCount,
    e.status ?? "active",
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `events_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
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
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [showDateFilter, setShowDateFilter] = useState(false);

  const qc = useQueryClient();
  const { toast } = useToast();

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
    return [...rawEvents].sort((a, b) => {
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
  }, [rawEvents, sortKey, sortDir]);

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
        toast({ title: "Event berhasil dibuat" });
      },
    },
  });

  const updateEvent = useUpdateEvent({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEventsQueryKey({}) });
        closeForm();
        toast({ title: "Event berhasil diperbarui" });
      },
    },
  });

  const deleteEvent = useDeleteEvent({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEventsQueryKey({}) });
        toast({ title: "Event dihapus" });
      },
    },
  });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  };

  const openEdit = (ev: any) => {
    setEditingId(ev.id);
    setForm({
      name: ev.name ?? "",
      description: ev.description ?? "",
      location: ev.location ?? "",
      eventDate: ev.eventDate ?? "",
      category: ev.category ?? "",
      startTime: ev.startTime ?? "",
      targetParticipants: ev.targetParticipants?.toString() ?? "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
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
      targetParticipants: form.targetParticipants ? parseInt(form.targetParticipants) : undefined,
    };
    if (editingId) {
      updateEvent.mutate({ id: editingId, data });
    } else {
      createEvent.mutate({ data });
    }
  };

  const isPending = createEvent.isPending || updateEvent.isPending;
  const hasFilter = search || startDate || endDate;

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
                placeholder="Cari nama event..."
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

              {hasFilter && (
                <button
                  onClick={() => { setSearch(""); setStartDate(""); setEndDate(""); }}
                  className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm border bg-white text-red-400 border-red-100 hover:bg-red-50 transition-all"
                  title="Reset filter"
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <div className="h-6 w-px bg-slate-200" />

              <button
                onClick={() => events && exportCSV(events)}
                className="flex items-center gap-2 px-4 py-2.5 bg-white text-slate-600 font-bold rounded-xl border border-slate-200 hover:bg-slate-50 transition-all text-sm"
              >
                <Download className="h-4 w-4" />
                Export
              </button>
              <button
                onClick={openCreate}
                className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-all text-sm"
              >
                <Plus className="h-4 w-4" />
                Tambah Event
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
        </div>

        {/* ── Event List ── */}
        <div className="space-y-5">
          {/* Section header */}
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest flex items-center gap-2">
              Daftar Event
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                {events?.length ?? 0}
              </span>
            </h3>
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
                  className="group bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-[1.75rem] px-7 py-5 flex flex-col lg:flex-row items-start lg:items-center gap-5 transition-all hover:border-indigo-100 hover:shadow-[0_8px_32px_rgba(79,70,229,0.08)] cursor-pointer"
                >
                  {/* Main info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-xl font-bold text-slate-900 truncate mb-1 group-hover:text-indigo-600 transition-colors">
                      {event.name}
                    </h4>
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
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Target</p>
                        <p className="text-sm font-extrabold text-slate-700">{(event as any).targetParticipants}</p>
                      </div>
                    )}
                    <div className="h-10 w-px bg-slate-100 hidden lg:block" />
                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => { e.stopPropagation(); openEdit(event); }}
                        title="Edit"
                        className="p-2.5 bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`Hapus event "${event.name}"?`)) {
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
                <p className="text-sm font-semibold text-slate-400">Belum ada event</p>
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
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="font-extrabold text-slate-900 text-[15px]" style={{ letterSpacing: "-0.02em" }}>
                {editingId ? "Edit Event" : "Tambah Event Baru"}
              </div>
              <button
                onClick={closeForm}
                className="p-1.5 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <X className="h-4 w-4 text-slate-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
                    Nama Event *
                  </label>
                  <input
                    type="text"
                    required
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="Nama event"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
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
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
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
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
                    Lokasi
                  </label>
                  <LocationInput
                    value={form.location}
                    onChange={(v) => setForm({ ...form, location: v })}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
                    Kategori
                  </label>
                  <input
                    type="text"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    placeholder="cth: Sosial, Politik"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
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
                <div className="col-span-2">
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
                    Deskripsi
                  </label>
                  <input
                    type="text"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    placeholder="Deskripsi singkat"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-indigo-400 focus:bg-white transition-colors"
                  />
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
                  {isPending ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Buat Event"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
