import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import {
  useListEvents,
  useCreateEvent,
  useDeleteEvent,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

export default function EventsPage() {
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", location: "", eventDate: "" });

  const qc = useQueryClient();
  const { toast } = useToast();

  const params = {
    ...(search ? { search } : {}),
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const { data: events, isLoading } = useListEvents(params, {
    query: { queryKey: getListEventsQueryKey(params) },
  });

  const createEvent = useCreateEvent({
    mutation: {
      onSuccess: () => {
        qc.invalidateQueries({ queryKey: getListEventsQueryKey({}) });
        setShowForm(false);
        setForm({ name: "", description: "", location: "", eventDate: "" });
        toast({ title: "Event berhasil dibuat" });
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.eventDate) return;
    createEvent.mutate({ data: form });
  };

  return (
    <Layout role="supervisor">
      <div className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold">Manajemen Event</h1>
          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {showForm ? "Batal" : "Tambah Event"}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Event Baru</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium">Nama Event *</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Nama event"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Tanggal Event *</label>
                <input
                  type="date"
                  required
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Lokasi</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Lokasi event"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium">Deskripsi</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Deskripsi singkat"
                />
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={createEvent.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {createEvent.isPending ? "Menyimpan..." : "Simpan"}
              </button>
            </div>
          </form>
        )}

        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Cari event..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          {(search || startDate || endDate) && (
            <button
              onClick={() => { setSearch(""); setStartDate(""); setEndDate(""); }}
              className="rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
            >
              Reset
            </button>
          )}
        </div>

        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Nama Event</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Tanggal</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Lokasi</th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Peserta</th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Memuat...</td>
                  </tr>
                ) : events && events.length > 0 ? (
                  events.map((event) => (
                    <tr key={event.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">
                        <Link href={`/events/${event.id}`} className="hover:underline">
                          {event.name}
                        </Link>
                        {event.description && (
                          <p className="text-xs text-muted-foreground">{event.description}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{event.eventDate}</td>
                      <td className="px-5 py-3 text-muted-foreground">{event.location ?? "-"}</td>
                      <td className="px-5 py-3 text-right font-bold">{event.participantCount}</td>
                      <td className="px-5 py-3 text-right">
                        <button
                          onClick={() => {
                            if (confirm(`Hapus event "${event.name}"?`)) {
                              deleteEvent.mutate({ id: event.id });
                            }
                          }}
                          className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                        >
                          Hapus
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">
                      Belum ada event
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
