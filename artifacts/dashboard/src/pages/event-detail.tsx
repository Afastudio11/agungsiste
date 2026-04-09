import { useState } from "react";
import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import {
  useGetEvent,
  useListEventParticipants,
  getGetEventQueryKey,
  getListEventParticipantsQueryKey,
} from "@workspace/api-client-react";
import { CalendarDays, MapPin, Users, Search, ChevronLeft, Download, ClipboardList } from "lucide-react";

function exportCSV(participants: any[], eventName: string) {
  const headers = ["NIK", "Nama", "Kelamin", "Pekerjaan", "Kota", "Waktu Daftar", "Staf", "Tag", "Total Event"];
  const rows = participants.map((p) => [
    p.nik,
    `"${p.fullName}"`,
    p.gender ?? "",
    `"${p.occupation ?? ""}"`,
    `"${p.city ?? ""}"`,
    new Date(p.registeredAt).toLocaleString("id-ID"),
    `"${p.staffName ?? ""}"`,
    `"${p.tags ?? ""}"`,
    p.eventCount,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `peserta_${eventName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent"></div>
        </div>
      </Layout>
    );
  }

  if (!event) {
    return (
      <Layout>
        <div className="py-16 text-center text-slate-400">Event tidak ditemukan</div>
      </Layout>
    );
  }

  const pct = (event as any).targetParticipants
    ? Math.min(100, Math.round((event.participantCount / (event as any).targetParticipants) * 100))
    : null;

  return (
    <Layout>
      <div className="space-y-5">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <Link href="/events">
            <div className="flex items-center gap-1 text-slate-400 hover:text-slate-600 cursor-pointer transition-colors">
              <ChevronLeft className="h-3.5 w-3.5" />
              Event
            </div>
          </Link>
          <span className="text-slate-300">/</span>
          <span className="text-slate-600 font-medium truncate max-w-[240px]">{event.name}</span>
        </div>

        {/* Event card */}
        <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                {(event as any).category && (
                  <span className="text-[10px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-md">
                    {(event as any).category}
                  </span>
                )}
                {(event as any).isRsvp && (
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md">RSVP</span>
                )}
              </div>
              <h1
                className="text-[22px] font-extrabold text-slate-900 leading-tight mb-2"
                style={{ letterSpacing: "-0.03em" }}
              >
                {event.name}
              </h1>
              {event.description && (
                <p className="text-sm text-slate-500 mb-3">{event.description}</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                  <span>{event.eventDate}</span>
                  {(event as any).startTime && (
                    <span className="text-slate-400">· {(event as any).startTime}</span>
                  )}
                </div>
                {event.location && (
                  <div className="flex items-center gap-1.5 text-slate-600">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {event.location}
                  </div>
                )}
              </div>
            </div>

            {/* Stats + RSVP button */}
            <div className="flex flex-col items-end gap-3 shrink-0">
              {(event as any).isRsvp && (
                <Link href={`/events/${id}/rsvp`}>
                  <button className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                    <ClipboardList size={13} />
                    Kelola RSVP
                  </button>
                </Link>
              )}
              <div className="flex gap-3">
              <div className="rounded-xl bg-blue-50 px-4 py-3 text-center min-w-[80px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-blue-400 mb-1">Peserta</p>
                <p className="text-[28px] font-extrabold text-blue-700" style={{ letterSpacing: "-0.04em" }}>
                  {event.participantCount}
                </p>
                {pct !== null && (
                  <>
                    <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-blue-100">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[10px] text-blue-400 mt-0.5">{pct}% target</p>
                  </>
                )}
              </div>
              </div>
            </div>
          </div>
        </div>

        {/* Participants table */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
            <div>
              <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                Daftar Peserta
              </p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                {participants?.length ?? 0} peserta terdaftar
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari peserta..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-transparent text-[12px] text-slate-700 placeholder:text-slate-300 focus:outline-none w-[130px]"
                />
              </div>
              <button
                onClick={() => participants && exportCSV(participants as any[], event.name)}
                className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/60">
                  {["NIK", "Nama", "Kelamin", "Pekerjaan", "Kota", "Waktu Daftar", "Total Event"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 ${i === 6 ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {participantsLoading ? (
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
                        {(p as any).staffName && (
                          <div className="text-[10px] text-slate-400 mt-0.5">via {(p as any).staffName}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-500">{p.gender ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-500 max-w-[120px] truncate">{p.occupation ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{(p as any).city ?? "—"}</td>
                      <td className="px-5 py-3 text-[11px] text-slate-400 whitespace-nowrap">
                        {new Date(p.registeredAt).toLocaleString("id-ID")}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.eventCount > 1 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"}`}>
                          {p.eventCount} event
                        </span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      <Users className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                      <p className="text-sm text-slate-400">Belum ada peserta terdaftar</p>
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
