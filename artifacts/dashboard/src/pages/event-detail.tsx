import { useState } from "react";
import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import {
  useGetEvent,
  useListEventParticipants,
  getGetEventQueryKey,
  getListEventParticipantsQueryKey,
} from "@workspace/api-client-react";
import { CalendarDays, MapPin, Users, Search, ChevronLeft, Download, ClipboardList, ClipboardCheck, ScanLine, CheckCircle2, Clock } from "lucide-react";

type TabType = "rsvp" | "onsite";

function exportCSV(participants: any[], eventName: string, label: string) {
  const headers = ["NIK", "Nama", "Kelamin", "Pekerjaan", "Kota", "Waktu Daftar", "Waktu Check-in", "Staf", "Tag", "Total Event"];
  const rows = participants.map((p) => [
    p.nik,
    `"${p.fullName}"`,
    p.gender ?? "",
    `"${p.occupation ?? ""}"`,
    `"${p.city ?? ""}"`,
    new Date(p.registeredAt).toLocaleString("id-ID"),
    p.checkedInAt ? new Date(p.checkedInAt).toLocaleString("id-ID") : "",
    `"${p.staffName ?? ""}"`,
    `"${p.tags ?? ""}"`,
    p.eventCount,
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${label}_${eventName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function EventDetailPage() {
  const params = useParams();
  const id = parseInt(params.id as string);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("rsvp");

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

  const allParticipants = (participants as any[]) ?? [];

  // Registrasi = pra-event (RSVP), ada atau tidak ada check-in
  const rsvpList = allParticipants.filter((p) => p.registrationType === "rsvp");
  // Hadir = yang datang hari H: RSVP yang sudah check-in + on-the-spot walk-in
  const hadirList = allParticipants.filter(
    (p) => p.checkedInAt != null || p.registrationType === "onsite"
  );

  const filteredList = activeTab === "rsvp" ? rsvpList : hadirList;

  // Stats
  const rsvpTotal = rsvpList.length;
  const hadirTotal = hadirList.length;
  const rsvpCheckedIn = rsvpList.filter((p) => p.checkedInAt != null).length;
  const rsvpNoShow = rsvpTotal - rsvpCheckedIn;
  const walkinCount = allParticipants.filter((p) => p.registrationType === "onsite").length;

  const pct = (event as any).targetParticipants
    ? Math.min(100, Math.round((hadirTotal / (event as any).targetParticipants) * 100))
    : null;

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count: number; color: string }[] = [
    {
      key: "rsvp",
      label: "Registrasi",
      icon: <ClipboardList className="h-3.5 w-3.5" />,
      count: rsvpTotal,
      color: "blue",
    },
    {
      key: "onsite",
      label: "Absen Hari-H",
      icon: <ClipboardCheck className="h-3.5 w-3.5" />,
      count: hadirTotal,
      color: "emerald",
    },
  ];

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

            {/* Stats cards */}
            <div className="flex flex-col items-end gap-3 shrink-0">
              {(event as any).isRsvp && (
                <Link href={`/events/${id}/rsvp`}>
                  <button className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors">
                    <ClipboardList size={13} />
                    Kelola RSVP
                  </button>
                </Link>
              )}
              <div className="flex gap-2">
                {/* Registrasi */}
                <div className="rounded-xl bg-blue-50 px-4 py-3 text-center min-w-[76px]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-blue-400 mb-0.5">Registrasi</p>
                  <p className="text-[26px] font-extrabold text-blue-700 leading-none" style={{ letterSpacing: "-0.04em" }}>
                    {participantsLoading ? "—" : rsvpTotal}
                  </p>
                  {!participantsLoading && rsvpTotal > 0 && (
                    <p className="text-[10px] text-blue-400 mt-1">{rsvpCheckedIn} hadir</p>
                  )}
                </div>
                {/* Absen */}
                <div className="rounded-xl bg-emerald-50 px-4 py-3 text-center min-w-[76px]">
                  <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-emerald-500 mb-0.5">Absen</p>
                  <p className="text-[26px] font-extrabold text-emerald-700 leading-none" style={{ letterSpacing: "-0.04em" }}>
                    {participantsLoading ? "—" : hadirTotal}
                  </p>
                  {!participantsLoading && walkinCount > 0 && (
                    <p className="text-[10px] text-emerald-400 mt-1">{walkinCount} walk-in</p>
                  )}
                  {pct !== null && (
                    <>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-emerald-100">
                        <div className="h-full rounded-full bg-emerald-400" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-[10px] text-emerald-400 mt-0.5">{pct}% target</p>
                    </>
                  )}
                </div>
                {/* No-show (only if there are RSVP) */}
                {!participantsLoading && rsvpNoShow > 0 && (
                  <div className="rounded-xl bg-amber-50 px-4 py-3 text-center min-w-[76px]">
                    <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-amber-500 mb-0.5">Tidak Hadir</p>
                    <p className="text-[26px] font-extrabold text-amber-700 leading-none" style={{ letterSpacing: "-0.04em" }}>
                      {rsvpNoShow}
                    </p>
                    <p className="text-[10px] text-amber-400 mt-1">dari RSVP</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Participants table */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          {/* Header */}
          <div className="px-6 pt-5 pb-0 border-b border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                  Daftar Peserta
                </p>
                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                  {rsvpTotal} registrasi · {hadirTotal} hadir · {rsvpNoShow > 0 ? `${rsvpNoShow} tidak hadir` : "semua hadir"}
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
                  onClick={() =>
                    exportCSV(
                      filteredList,
                      event.name,
                      activeTab === "rsvp" ? "registrasi" : "absen"
                    )
                  }
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-bold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export
                </button>
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1">
              {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                const colorMap = {
                  blue: { active: "border-blue-600 text-blue-700", badge: "bg-blue-100 text-blue-700" },
                  emerald: { active: "border-emerald-600 text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
                };
                const colors = colorMap[tab.color as keyof typeof colorMap];
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold border-b-2 transition-colors ${
                      isActive ? colors.active : "border-transparent text-slate-400 hover:text-slate-600"
                    }`}
                  >
                    {tab.icon}
                    {tab.label}
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${isActive ? colors.badge : "bg-slate-100 text-slate-400"}`}>
                      {tab.count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Context info */}
          {activeTab === "rsvp" && !participantsLoading && rsvpTotal > 0 && (
            <div className="px-6 py-2.5 bg-blue-50/50 border-b border-blue-100 flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 font-semibold text-emerald-700">
                <CheckCircle2 className="h-3 w-3" />{rsvpCheckedIn} hadir hari-H
              </span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1 font-semibold text-amber-600">
                <Clock className="h-3 w-3" />{rsvpNoShow} belum/tidak hadir
              </span>
            </div>
          )}
          {activeTab === "onsite" && !participantsLoading && hadirTotal > 0 && (
            <div className="px-6 py-2.5 bg-emerald-50/50 border-b border-emerald-100 flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1 font-semibold text-blue-700">
                <ClipboardList className="h-3 w-3" />{rsvpCheckedIn} dari RSVP (check-in)
              </span>
              <span className="text-slate-300">·</span>
              <span className="flex items-center gap-1 font-semibold text-slate-600">
                <ScanLine className="h-3 w-3" />{walkinCount} walk-in (on-the-spot)
              </span>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/60">
                  {activeTab === "rsvp"
                    ? ["NIK", "Nama", "Kelamin", "Kota", "Waktu Daftar", "Status Hadir"].map((h, i) => (
                        <th key={h} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 ${i === 5 ? "text-right" : "text-left"}`}>{h}</th>
                      ))
                    : ["NIK", "Nama", "Kelamin", "Kota", "Waktu Hadir", "Tipe", "Total Event"].map((h, i) => (
                        <th key={h} className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 ${i === 6 ? "text-right" : "text-left"}`}>{h}</th>
                      ))
                  }
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {participantsLoading ? (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">Memuat...</td>
                  </tr>
                ) : filteredList.length > 0 ? (
                  filteredList.map((p) => (
                    <tr
                      key={p.nik}
                      className={`transition-colors ${
                        activeTab === "rsvp"
                          ? p.checkedInAt
                            ? "hover:bg-emerald-50/20"
                            : "hover:bg-amber-50/20"
                          : "hover:bg-emerald-50/20"
                      }`}
                    >
                      <td className="px-5 py-3 font-mono text-[11px] text-slate-500">{p.nik}</td>
                      <td className="px-5 py-3">
                        <Link href={`/participants/${p.nik}`}>
                          <span className="font-semibold text-sm text-slate-900 hover:text-blue-600 cursor-pointer transition-colors">
                            {p.fullName}
                          </span>
                        </Link>
                        {p.staffName && (
                          <div className="text-[10px] text-slate-400 mt-0.5">via {p.staffName}</div>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-slate-500">{p.gender ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-slate-500">{p.city ?? "—"}</td>
                      {activeTab === "rsvp" ? (
                        <>
                          <td className="px-5 py-3 text-[11px] text-slate-400 whitespace-nowrap">
                            {new Date(p.registeredAt).toLocaleDateString("id-ID")}
                          </td>
                          <td className="px-5 py-3 text-right">
                            {p.checkedInAt ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-emerald-100 text-emerald-700">
                                <CheckCircle2 className="h-3 w-3" />
                                Hadir {new Date(p.checkedInAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-700">
                                <Clock className="h-3 w-3" />
                                Belum Hadir
                              </span>
                            )}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-5 py-3 text-[11px] text-slate-400 whitespace-nowrap">
                            {p.checkedInAt
                              ? new Date(p.checkedInAt).toLocaleString("id-ID")
                              : new Date(p.registeredAt).toLocaleString("id-ID")}
                          </td>
                          <td className="px-5 py-3">
                            {p.registrationType === "rsvp" ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-blue-100 text-blue-700">
                                <ClipboardList className="h-3 w-3" />
                                RSVP
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-600">
                                <ScanLine className="h-3 w-3" />
                                Walk-in
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${p.eventCount > 1 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"}`}>
                              {p.eventCount} event
                            </span>
                          </td>
                        </>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={7} className="px-5 py-12 text-center">
                      {activeTab === "rsvp" ? (
                        <>
                          <ClipboardList className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                          <p className="text-sm text-slate-400">Belum ada peserta yang registrasi pra-acara</p>
                          {(event as any).isRsvp && (
                            <Link href={`/events/${id}/rsvp`}>
                              <span className="mt-2 inline-block text-xs font-bold text-blue-600 hover:underline cursor-pointer">
                                Kelola daftar RSVP →
                              </span>
                            </Link>
                          )}
                        </>
                      ) : (
                        <>
                          <ClipboardCheck className="h-8 w-8 mx-auto mb-2 text-slate-200" />
                          <p className="text-sm text-slate-400">Belum ada absen hari-H tercatat</p>
                        </>
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
