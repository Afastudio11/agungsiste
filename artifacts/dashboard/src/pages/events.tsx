import { useState, useMemo } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import {
  useListEvents,
  useCreateEvent,
  useUpdateEvent,
  useDeleteEvent,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { CalendarDays, MapPin, Users, Plus, Pencil, Trash2, Search, X, Download, ChevronUp, ChevronDown, ChevronsUpDown } from "lucide-react";

type SortKey = "name" | "eventDate" | "location" | "participantCount";
type SortDir = "asc" | "desc";

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 text-slate-300 ml-1 shrink-0" />;
  return sortDir === "asc" ? <ChevronUp className="h-3 w-3 text-blue-500 ml-1 shrink-0" /> : <ChevronDown className="h-3 w-3 text-blue-500 ml-1 shrink-0" />;
}

function SortTh({ col, label, sortKey, sortDir, onSort, align = "left" }: {
  col: SortKey; label: string; sortKey: SortKey; sortDir: SortDir; onSort: (k: SortKey) => void; align?: "left" | "right";
}) {
  const active = col === sortKey;
  return (
    <th className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.08em] cursor-pointer select-none ${align === "right" ? "text-right" : "text-left"}`} onClick={() => onSort(col)}>
      <span className={`inline-flex items-center gap-0.5 ${active ? "text-blue-600" : "text-slate-400"} ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}<SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );
}

const emptyForm = { name: "", description: "", location: "", eventDate: "", category: "", startTime: "", targetParticipants: "" };

function exportCSV(events: any[]) {
  const headers = ["ID", "Nama Event", "Tanggal", "Lokasi", "Kategori", "Peserta", "Status"];
  const rows = events.map((e) => [
    e.id, `"${e.name}"`, e.eventDate, `"${e.location ?? ""}"`, `"${e.category ?? ""}"`, e.participantCount, e.status ?? "active",
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

export default function EventsPage() {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("eventDate");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

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
      if (sortKey === "participantCount") { av = Number(av); bv = Number(bv); }
      else { av = String(av).toLowerCase(); bv = String(bv).toLowerCase(); }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [rawEvents, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
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
              Manajemen Event
            </h1>
            <p className="mt-1 text-sm text-slate-400 font-medium">
              {events?.length ?? 0} event terdaftar
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => events && exportCSV(events)}
              className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
            <button
              onClick={openCreate}
              className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-[12px] font-bold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah Event
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm flex-1 min-w-[180px]">
            <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <input
              type="text"
              placeholder="Cari event..."
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
                <tr className="border-b border-slate-100 bg-slate-50/60">
                  <SortTh col="name" label="Nama Event" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="eventDate" label="Tanggal" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="location" label="Lokasi" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="participantCount" label="Peserta" sortKey={sortKey} sortDir={sortDir} onSort={handleSort} align="right" />
                  <th className="px-5 py-3 text-right text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-slate-400">Memuat...</td>
                  </tr>
                ) : events && events.length > 0 ? (
                  events.map((event) => (
                    <tr key={event.id} className="hover:bg-blue-50/30 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/events/${event.id}`}>
                          <div className="font-semibold text-sm text-slate-900 hover:text-blue-600 cursor-pointer transition-colors">
                            {event.name}
                          </div>
                        </Link>
                        <div className="flex items-center gap-2 mt-0.5">
                          {(event as any).category && (
                            <span className="inline-block text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">
                              {(event as any).category}
                            </span>
                          )}
                          {(event as any).isRsvp && (
                            <span className="inline-block text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md">RSVP</span>
                          )}
                          {event.description && (
                            <p className="text-[11px] text-slate-400 truncate max-w-[200px]">{event.description}</p>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 text-sm text-slate-600">
                          <CalendarDays className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          {event.eventDate}
                        </div>
                        {(event as any).startTime && (
                          <div className="text-[11px] text-slate-400 ml-5 mt-0.5">{(event as any).startTime}</div>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        {event.location ? (
                          <div className="flex items-center gap-1.5 text-sm text-slate-600">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate max-w-[160px]">{event.location}</span>
                          </div>
                        ) : (
                          <span className="text-slate-300 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Users className="h-3.5 w-3.5 text-slate-300" />
                          <span className="text-sm font-bold text-slate-700">{event.participantCount}</span>
                        </div>
                        {(event as any).targetParticipants && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            target {(event as any).targetParticipants}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => openEdit(event)}
                            className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-300 hover:text-blue-500 transition-colors"
                            title="Edit"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Hapus event "${event.name}"?`)) {
                                deleteEvent.mutate({ id: event.id });
                              }
                            }}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <CalendarDays className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                      <p className="text-sm text-slate-400">Belum ada event</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Form Modal (Create / Edit) */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100">
              <div className="font-bold text-slate-900 text-[15px]">
                {editingId ? "Edit Event" : "Tambah Event Baru"}
              </div>
              <button onClick={closeForm} className="p-1.5 hover:bg-slate-100 rounded-lg">
                <X className="h-4 w-4" />
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-700 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1.5">
                    Lokasi
                  </label>
                  <input
                    type="text"
                    value={form.location}
                    onChange={(e) => setForm({ ...form, location: e.target.value })}
                    placeholder="Lokasi event"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
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
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
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
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
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
