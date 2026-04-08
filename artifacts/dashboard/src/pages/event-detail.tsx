import { useState } from "react";
import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import {
  useGetEvent,
  useListEventParticipants,
  getGetEventQueryKey,
  getListEventParticipantsQueryKey,
} from "@workspace/api-client-react";

export default function EventDetailPage() {
  const params = useParams();
  const id = parseInt(params.id as string);
  const [search, setSearch] = useState("");

  const { data: event, isLoading: eventLoading } = useGetEvent(id, {
    query: { enabled: !!id, queryKey: getGetEventQueryKey(id) },
  });

  const queryParams = search ? { search } : {};
  const { data: participants, isLoading: participantsLoading } = useListEventParticipants(id, queryParams, {
    query: { enabled: !!id, queryKey: getListEventParticipantsQueryKey(id, queryParams) },
  });

  if (eventLoading) {
    return (
      <Layout role="supervisor">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>
      </Layout>
    );
  }

  if (!event) {
    return (
      <Layout role="supervisor">
        <div className="py-16 text-center text-muted-foreground">Event tidak ditemukan</div>
      </Layout>
    );
  }

  return (
    <Layout role="supervisor">
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/events" className="hover:text-foreground hover:underline">
            Event
          </Link>
          <span>/</span>
          <span className="text-foreground">{event.name}</span>
        </div>

        <div className="rounded-lg border bg-card p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-xl font-bold">{event.name}</h1>
              {event.description && (
                <p className="mt-1 text-sm text-muted-foreground">{event.description}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Tanggal</span>
                  <p className="font-medium">{event.eventDate}</p>
                </div>
                {event.location && (
                  <div>
                    <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Lokasi</span>
                    <p className="font-medium">{event.location}</p>
                  </div>
                )}
                <div>
                  <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Peserta</span>
                  <p className="text-2xl font-bold">{event.participantCount}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Daftar Peserta</h2>
          <input
            type="text"
            placeholder="Cari peserta..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-md border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">NIK</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Nama Lengkap</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Kelamin</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Pekerjaan</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Waktu Daftar</th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Event</th>
                </tr>
              </thead>
              <tbody>
                {participantsLoading ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">Memuat...</td>
                  </tr>
                ) : participants && participants.length > 0 ? (
                  participants.map((p) => (
                    <tr key={p.nik} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3 font-mono text-xs">{p.nik}</td>
                      <td className="px-5 py-3 font-medium">
                        <Link href={`/participants/${p.nik}`} className="hover:underline">
                          {p.fullName}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{p.gender ?? "-"}</td>
                      <td className="px-5 py-3 text-muted-foreground">{p.occupation ?? "-"}</td>
                      <td className="px-5 py-3 text-muted-foreground text-xs">
                        {new Date(p.registeredAt).toLocaleString("id-ID")}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${p.eventCount > 1 ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800"}`}>
                          {p.eventCount} event
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-muted-foreground">
                      Belum ada peserta terdaftar
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
