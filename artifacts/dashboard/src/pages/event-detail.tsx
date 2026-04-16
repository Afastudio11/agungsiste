import { useState } from "react";
import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import {
  useGetEvent,
  useListEventParticipants,
  getGetEventQueryKey,
  getListEventParticipantsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  MapPin,
  Users,
  Search,
  ChevronLeft,
  Download,
  ClipboardList,
  ClipboardCheck,
  ScanLine,
  CheckCircle2,
  Clock,
  QrCode,
  Copy,
  Check,
  RefreshCw,
  Filter,
  Edit2,
  UserCheck,
  UserX,
  Activity,
} from "lucide-react";

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

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function LinkCard({
  label,
  type,
  token,
  qr,
  onLoadQr,
  onCopy,
  isCopied,
}: {
  label: string;
  type: string;
  token: string;
  qr: any;
  onLoadQr: () => void;
  onCopy: (url: string) => void;
  isCopied: boolean;
}) {
  const isReg = type === "registration";
  return (
    <div
      className={`rounded-2xl p-4 border ${
        isReg
          ? "bg-indigo-50/60 border-indigo-100"
          : "bg-cyan-50/60 border-cyan-100"
      }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`w-7 h-7 rounded-lg flex items-center justify-center ${
            isReg ? "bg-indigo-100" : "bg-cyan-100"
          }`}
        >
          {isReg ? (
            <ClipboardList className={`h-3.5 w-3.5 ${isReg ? "text-indigo-600" : "text-cyan-600"}`} />
          ) : (
            <ScanLine className="h-3.5 w-3.5 text-cyan-600" />
          )}
        </div>
        <p className={`text-xs font-bold ${isReg ? "text-indigo-700" : "text-cyan-700"}`}>{label}</p>
      </div>

      {qr ? (
        <div className="space-y-3">
          <div className="bg-white rounded-xl p-3 flex justify-center shadow-sm">
            <img src={qr.qrDataUrl} alt="QR Code" className="w-36 h-36" />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={qr.url}
              className="flex-1 text-[11px] bg-white/80 rounded-lg px-3 py-2 border border-white text-slate-600 truncate focus:outline-none"
            />
            <button
              onClick={() => onCopy(qr.url)}
              className="shrink-0 p-2 bg-white rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
            >
              {isCopied ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
              ) : (
                <Copy className="h-3.5 w-3.5 text-slate-400" />
              )}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={onLoadQr}
          className={`w-full py-3 bg-white/70 hover:bg-white rounded-xl text-sm font-semibold border border-white/80 transition-colors flex items-center justify-center gap-2 ${
            isReg ? "text-indigo-600" : "text-cyan-600"
          }`}
        >
          <QrCode className="h-4 w-4" />
          Tampilkan QR Code
        </button>
      )}
    </div>
  );
}

function QRLinksCard({ eventId, event }: { eventId: number; event: any }) {
  const [qrData, setQrData] = useState<Record<string, { url: string; qrDataUrl: string } | null>>({});
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const generateTokens = async () => {
    setGenerating(true);
    try {
      await fetch(`${BASE}/api/events/${eventId}/generate-tokens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      setQrData({});
      queryClient.invalidateQueries({ queryKey: getGetEventQueryKey(eventId) });
    } catch {}
    setGenerating(false);
  };

  const loadQr = async (type: "registration" | "attendance") => {
    try {
      const res = await fetch(`${BASE}/api/events/${eventId}/qrcode/${type}`, { credentials: "include" });
      const data = await res.json();
      setQrData((prev) => ({ ...prev, [type]: data }));
    } catch {}
  };

  const copyLink = (url: string, key: string) => {
    navigator.clipboard.writeText(url);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const hasTokens = event.registrationToken || event.attendanceToken;

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <QrCode className="h-4 w-4 text-indigo-500" />
          <h3 className="text-[14px] font-extrabold text-slate-800" style={{ letterSpacing: "-0.02em" }}>
            Link & QR Code
          </h3>
        </div>
        <button
          onClick={generateTokens}
          disabled={generating}
          className="flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
          {hasTokens ? "Generate Ulang" : "Generate Link"}
        </button>
      </div>

      <div className="p-4">
        {!hasTokens ? (
          <div className="py-6 text-center">
            <QrCode className="h-8 w-8 mx-auto mb-2 text-slate-200" />
            <p className="text-sm text-slate-400">Klik "Generate Link" untuk membuat link registrasi dan absensi</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {event.registrationToken && (
              <LinkCard
                label="Registrasi Online"
                type="registration"
                token={event.registrationToken}
                qr={qrData.registration}
                onLoadQr={() => loadQr("registration")}
                onCopy={(url: string) => copyLink(url, "reg")}
                isCopied={copied === "reg"}
              />
            )}
            {event.attendanceToken && (
              <LinkCard
                label="Absensi di Lokasi"
                type="attendance"
                token={event.attendanceToken}
                qr={qrData.attendance}
                onLoadQr={() => loadQr("attendance")}
                onCopy={(url: string) => copyLink(url, "att")}
                isCopied={copied === "att"}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  icon,
  gradient,
  barColor,
  barPct,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  gradient: string;
  barColor: string;
  barPct?: number;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-white/60 ${gradient} backdrop-blur-sm shadow-[0_4px_16px_rgba(0,0,0,0.08)] p-5`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-xl bg-white/40 backdrop-blur-sm flex items-center justify-center shadow-sm">
          {icon}
        </div>
      </div>
      <p className="text-[42px] font-extrabold leading-none text-slate-900 mb-1" style={{ letterSpacing: "-0.04em" }}>
        {value}
      </p>
      <p className="text-[12px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
      {barPct !== undefined && (
        <div className="mt-3">
          <div className="h-1.5 w-full bg-white/50 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${barColor} transition-all`} style={{ width: `${barPct}%` }} />
          </div>
          <p className="text-[10px] text-slate-500 mt-1">{barPct}% dari target</p>
        </div>
      )}
    </div>
  );
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
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-500 border-t-transparent"></div>
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

  const rsvpList = allParticipants.filter((p) => p.registrationType === "rsvp");
  const hadirList = allParticipants.filter(
    (p) => p.checkedInAt != null || p.registrationType === "onsite"
  );

  const filteredList = activeTab === "rsvp" ? rsvpList : hadirList;

  const rsvpTotal = rsvpList.length;
  const hadirTotal = hadirList.length;
  const rsvpCheckedIn = rsvpList.filter((p) => p.checkedInAt != null).length;
  const rsvpNoShow = rsvpTotal - rsvpCheckedIn;
  const walkinCount = allParticipants.filter((p) => p.registrationType === "onsite").length;

  const pct = (event as any).targetParticipants
    ? Math.min(100, Math.round((hadirTotal / (event as any).targetParticipants) * 100))
    : null;

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "rsvp", label: "Registrasi", icon: <ClipboardList className="h-3.5 w-3.5" />, count: rsvpTotal },
    { key: "onsite", label: "Absen Hari-H", icon: <ClipboardCheck className="h-3.5 w-3.5" />, count: hadirTotal },
  ];

  return (
    <Layout>
      <div className="space-y-5 md3-surface">
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

        {/* ── Header Section ── */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] px-6 py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            {/* Left: title + meta */}
            <div className="flex-1 min-w-0">
              {/* Badge row */}
              <div className="flex flex-wrap items-center gap-2 mb-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200">
                  <Activity className="h-3 w-3" />
                  Active Event
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                  <CalendarDays className="h-3 w-3" />
                  {event.eventDate}
                  {(event as any).startTime && ` · ${(event as any).startTime}`}
                </span>
                {(event as any).category && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
                    {(event as any).category}
                  </span>
                )}
                {(event as any).isRsvp && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-600 border border-blue-100">
                    RSVP
                  </span>
                )}
              </div>

              {/* Title */}
              <h1
                className="text-[22px] font-extrabold text-slate-900 leading-snug mb-3"
                style={{ letterSpacing: "-0.02em" }}
              >
                {event.name}
              </h1>

              {/* Location */}
              {event.location && (
                <div className="flex items-center gap-1.5 text-slate-500 text-sm">
                  <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                  <span>{event.location}</span>
                </div>
              )}

              {event.description && (
                <p className="mt-2 text-sm text-slate-400 max-w-xl">{event.description}</p>
              )}
            </div>

            {/* Right: action buttons */}
            <div className="flex items-center gap-2 shrink-0 lg:pt-1">
              {(event as any).isRsvp && (
                <Link href={`/events/${id}/rsvp`}>
                  <button className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm">
                    <ClipboardList className="h-4 w-4" />
                    Kelola RSVP
                  </button>
                </Link>
              )}
              <button
                onClick={() => exportCSV(filteredList, event.name, activeTab === "rsvp" ? "registrasi" : "absen")}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
              >
                <Download className="h-4 w-4" />
                Export Data
              </button>
              <Link href={`/events/${id}/edit`}>
                <button className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
                  <Edit2 className="h-4 w-4" />
                  Edit Event
                </button>
              </Link>
            </div>
          </div>
        </div>

        {/* ── Glassmorphism Stat Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard
            label="Registrasi"
            value={participantsLoading ? "—" : rsvpTotal}
            sub={participantsLoading ? undefined : rsvpCheckedIn > 0 ? `${rsvpCheckedIn} sudah hadir` : "Belum ada check-in"}
            icon={<Users className="h-5 w-5 text-indigo-600" />}
            gradient="bg-gradient-to-br from-indigo-50 via-white to-blue-50"
            barColor="bg-indigo-500"
          />
          <StatCard
            label="Absen"
            value={participantsLoading ? "—" : hadirTotal}
            sub={participantsLoading ? undefined : walkinCount > 0 ? `${walkinCount} walk-in` : "Semua via RSVP"}
            icon={<UserCheck className="h-5 w-5 text-emerald-600" />}
            gradient="bg-gradient-to-br from-emerald-50 via-white to-teal-50"
            barColor="bg-emerald-500"
            barPct={pct !== null ? pct : undefined}
          />
          <StatCard
            label="Tidak Hadir"
            value={participantsLoading ? "—" : rsvpNoShow}
            sub={participantsLoading ? undefined : rsvpTotal > 0 ? `dari ${rsvpTotal} registrasi` : "Tidak ada RSVP"}
            icon={<UserX className="h-5 w-5 text-rose-500" />}
            gradient="bg-gradient-to-br from-rose-50 via-white to-orange-50"
            barColor="bg-rose-400"
            barPct={rsvpTotal > 0 ? Math.round((rsvpNoShow / rsvpTotal) * 100) : undefined}
          />
        </div>

        {/* ── Bottom 3-column grid ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Left column: QR & Links */}
          <div className="lg:col-span-1">
            <QRLinksCard eventId={id} event={event} />
          </div>

          {/* Right two columns: Participant Table */}
          <div className="lg:col-span-2 rounded-2xl bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
            {/* Table header */}
            <div className="px-5 pt-5 pb-0 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                    Daftar Peserta
                  </p>
                  <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                    {rsvpTotal} registrasi · {hadirTotal} hadir
                    {rsvpNoShow > 0 ? ` · ${rsvpNoShow} tidak hadir` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {/* Search */}
                  <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                    <input
                      type="text"
                      placeholder="Cari peserta..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="bg-transparent text-[12px] text-slate-700 placeholder:text-slate-300 focus:outline-none w-[120px]"
                    />
                  </div>
                  {/* Filter button */}
                  <button className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-50 transition-colors">
                    <Filter className="h-3.5 w-3.5" />
                    Filter
                  </button>
                </div>
              </div>

              {/* Tabs */}
              <div className="flex gap-1">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setActiveTab(tab.key)}
                      className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-bold border-b-2 transition-colors ${
                        isActive
                          ? "border-indigo-600 text-indigo-700"
                          : "border-transparent text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      {tab.icon}
                      {tab.label}
                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full ${
                          isActive ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-400"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Context info row */}
            {activeTab === "rsvp" && !participantsLoading && rsvpTotal > 0 && (
              <div className="px-5 py-2.5 bg-indigo-50/50 border-b border-indigo-100 flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3 w-3" />{rsvpCheckedIn} hadir hari-H
                </span>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1 font-semibold text-slate-500">
                  <Clock className="h-3 w-3" />{rsvpNoShow} belum/tidak hadir
                </span>
              </div>
            )}
            {activeTab === "onsite" && !participantsLoading && hadirTotal > 0 && (
              <div className="px-5 py-2.5 bg-emerald-50/50 border-b border-emerald-100 flex items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1 font-semibold text-indigo-700">
                  <ClipboardList className="h-3 w-3" />{rsvpCheckedIn} dari RSVP
                </span>
                <span className="text-slate-300">·</span>
                <span className="flex items-center gap-1 font-semibold text-slate-600">
                  <ScanLine className="h-3 w-3" />{walkinCount} walk-in
                </span>
              </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-50 bg-slate-50/60">
                    {activeTab === "rsvp"
                      ? ["NIK", "Nama", "Kelamin", "Kota", "Waktu Daftar", "Status"].map((h, i) => (
                          <th
                            key={h}
                            className={`px-5 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 ${i === 5 ? "text-right" : "text-left"}`}
                          >
                            {h}
                          </th>
                        ))
                      : ["NIK", "Nama", "Kelamin", "Kota", "Waktu Hadir", "Tipe", "Total"].map((h, i) => (
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
                      <td colSpan={7} className="px-5 py-10 text-center text-sm text-slate-400">
                        Memuat...
                      </td>
                    </tr>
                  ) : filteredList.length > 0 ? (
                    filteredList.map((p) => (
                      <tr
                        key={p.nik}
                        className="transition-colors hover:bg-slate-50/60"
                      >
                        <td className="px-5 py-3 font-mono text-[11px] text-slate-400">{p.nik}</td>
                        <td className="px-5 py-3">
                          <Link href={`/participants/${p.nik}`}>
                            <span className="font-semibold text-sm text-slate-900 hover:text-indigo-600 cursor-pointer transition-colors">
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
                                  Hadir{" "}
                                  {new Date(p.checkedInAt).toLocaleTimeString("id-ID", {
                                    hour: "2-digit",
                                    minute: "2-digit",
                                  })}
                                </span>
                              ) : (p as any).status === "cancelled" ? (
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-700">
                                  Dibatalkan
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-slate-100 text-slate-500">
                                  <Clock className="h-3 w-3" />
                                  Belum Absen
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
                                <span className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold bg-indigo-100 text-indigo-700">
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
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                                  p.eventCount > 1 ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
                                }`}
                              >
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
                                <span className="mt-2 inline-block text-xs font-bold text-indigo-600 hover:underline cursor-pointer">
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
      </div>
    </Layout>
  );
}
