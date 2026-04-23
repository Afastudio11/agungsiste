import { useState } from "react";
import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import { ExportPickerModal, type ExportCol } from "@/components/export-picker-modal";
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
  QrCode,
  Copy,
  Check,
  RefreshCw,
  Filter,
  Edit2,
  UserCheck,
  Activity,
} from "@/lib/icons";

type TabType = "rsvp" | "onsite";

const EVENT_EXPORT_COLS: ExportCol[] = [
  { key: "nik",            label: "NIK",              section: "Identitas", getValue: (p) => p.nik ?? "" },
  { key: "fullName",       label: "Nama Lengkap",     section: "Identitas", getValue: (p) => p.fullName ?? "" },
  { key: "gender",         label: "Jenis Kelamin",    section: "Identitas", getValue: (p) => p.gender ?? "" },
  { key: "birthPlace",     label: "Tempat Lahir",     section: "Identitas", getValue: (p) => p.birthPlace ?? "" },
  { key: "birthDate",      label: "Tanggal Lahir",    section: "Identitas", getValue: (p) => p.birthDate ?? "" },
  { key: "occupation",     label: "Pekerjaan",        section: "Identitas", getValue: (p) => p.occupation ?? "" },
  { key: "socialStatus",   label: "Status Sosial",    section: "Identitas", getValue: (p) => p.socialStatus ?? "" },
  { key: "address",        label: "Alamat",           section: "Alamat",    getValue: (p) => p.address ?? "" },
  { key: "kelurahan",      label: "Kelurahan/Desa",   section: "Alamat",    getValue: (p) => p.kelurahan ?? "" },
  { key: "kecamatan",      label: "Kecamatan",        section: "Alamat",    getValue: (p) => p.kecamatan ?? "" },
  { key: "city",           label: "Kabupaten/Kota",   section: "Alamat",    getValue: (p) => p.city ?? "" },
  { key: "phone",          label: "Nomor HP",         section: "Registrasi",getValue: (p) => p.phone ?? "" },
  { key: "registrationType", label: "Tipe Registrasi",section: "Registrasi",getValue: (p) => p.registrationType ?? "" },
  { key: "staffName",      label: "Petugas",          section: "Registrasi",getValue: (p) => p.staffName ?? "" },
  { key: "registeredAt",   label: "Tanggal Registrasi", section: "Registrasi", getValue: (p) => p.registeredAt ? new Date(p.registeredAt).toLocaleDateString("id-ID") : "" },
  { key: "checkedInAt",    label: "Waktu Check-in",   section: "Registrasi",getValue: (p) => p.checkedInAt ? new Date(p.checkedInAt).toLocaleString("id-ID") : "" },
];

const EVENT_DEFAULT_KEYS = ["nik", "fullName", "gender", "city", "kecamatan", "kelurahan", "phone", "registeredAt", "staffName"];

function eventParticipantToPdf(p: any) {
  return {
    nik: p.nik,
    fullName: p.fullName,
    birthPlace: p.birthPlace,
    birthDate: p.birthDate,
    gender: p.gender,
    occupation: p.occupation,
    address: p.address,
    kelurahan: p.kelurahan,
    kecamatan: p.kecamatan,
    city: p.city,
    firstRegisteredAt: p.registeredAt,
  };
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
            <p className="text-sm text-slate-400">Klik "Generate Link" untuk membuat link registrasi</p>
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
  circleColor,
  iconColor,
}: {
  label: string;
  value: number | string;
  sub?: string;
  icon: React.ReactNode;
  circleColor: string;
  iconColor: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-6 pt-6 pb-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] transition-shadow">
      <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 ${circleColor}`} />
      <div className="flex items-start justify-between mb-3 relative">
        <p className="text-[13px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.01em" }}>{label}</p>
        <span className={iconColor}>{icon}</span>
      </div>
      <p className="text-[38px] font-extrabold text-slate-900 leading-none relative" style={{ letterSpacing: "-0.04em" }}>
        {value}
      </p>
      {sub && (
        <p className="text-[11px] text-slate-400 font-medium mt-1.5 relative">{sub}</p>
      )}
    </div>
  );
}

export default function EventDetailPage() {
  const params = useParams();
  const id = parseInt(params.id as string);
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState<TabType>("onsite");
  const [showExport, setShowExport] = useState(false);

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
  const walkinCount = allParticipants.filter((p) => p.registrationType === "onsite").length;

  const pct = (event as any).targetParticipants
    ? Math.min(100, Math.round((hadirTotal / (event as any).targetParticipants) * 100))
    : null;

  const tabs: { key: TabType; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "onsite", label: "Peserta", icon: <ClipboardCheck className="h-3.5 w-3.5" />, count: hadirTotal },
    { key: "rsvp", label: "Registrasi", icon: <ClipboardList className="h-3.5 w-3.5" />, count: rsvpTotal },
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
          <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
            {/* Left: title + meta + action buttons */}
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

              {/* Action buttons — now inside the left column */}
              <div className="flex flex-wrap items-center gap-2 mt-4">
                {(event as any).isRsvp && (
                  <Link href={`/events/${id}/rsvp`}>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors shadow-sm">
                      <ClipboardList className="h-4 w-4" />
                      Kelola RSVP
                    </button>
                  </Link>
                )}
                <button
                  onClick={() => setShowExport(true)}
                  disabled={filteredList.length === 0}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-sm transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
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

            {/* Right: QR Links Card */}
            <div className="w-full lg:w-64 shrink-0">
              <QRLinksCard eventId={id} event={event} />
            </div>
          </div>
        </div>

        {/* ── Stat Cards (full width) ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard
            label="Jumlah Peserta"
            value={participantsLoading ? "—" : hadirTotal}
            sub={participantsLoading ? undefined : walkinCount > 0 ? `${walkinCount} walk-in` : "Semua via RSVP"}
            icon={<UserCheck className="h-5 w-5" />}
            circleColor="bg-emerald-500"
            iconColor="text-emerald-400"
          />
          <StatCard
            label="Jumlah Registrasi"
            value={participantsLoading ? "—" : rsvpTotal}
            sub={participantsLoading ? undefined : rsvpCheckedIn > 0 ? `${rsvpCheckedIn} sudah hadir` : "Belum ada check-in"}
            icon={<Users className="h-5 w-5" />}
            circleColor="bg-indigo-500"
            iconColor="text-indigo-400"
          />
        </div>

        {/* ── Full-width Participant Table ── */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
            {/* Table header */}
            <div className="px-5 pt-5 pb-0 border-b border-slate-100">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                    Daftar Peserta
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

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-50 bg-slate-50/60">
                    {(activeTab === "onsite"
                      ? ["NIK", "Nama", "Jenis Kelamin", "Kabupaten", "Kecamatan", "Desa", "Nomor HP"]
                      : ["NIK", "Nama", "Jenis Kelamin", "Kabupaten", "Nomor HP", "Status Sosial"]
                    ).map((h) => (
                      <th
                        key={h}
                        className="px-5 py-3 text-[10px] font-bold tracking-[0.08em] text-slate-400 text-left"
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
                      <tr key={p.nik} className="transition-colors hover:bg-slate-50/60">
                        <td className="px-5 py-3 font-mono text-[11px] text-slate-400 whitespace-nowrap">{p.nik}</td>
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
                        <td className="px-5 py-3 text-sm text-slate-600">{p.gender ?? "—"}</td>

                        {activeTab === "onsite" ? (
                          <>
                            <td className="px-5 py-3 text-sm text-slate-600">{p.city ?? "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-600">{(p as any).kecamatan ?? "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-600">{(p as any).kelurahan ?? "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-600">{(p as any).phone ?? "—"}</td>
                          </>
                        ) : (
                          <>
                            <td className="px-5 py-3 text-sm text-slate-600">{p.city ?? "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-600">{(p as any).phone ?? "—"}</td>
                            <td className="px-5 py-3 text-sm text-slate-600">{(p as any).socialStatus ?? "—"}</td>
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

      <ExportPickerModal
        open={showExport}
        onClose={() => setShowExport(false)}
        cols={EVENT_EXPORT_COLS}
        defaultKeys={EVENT_DEFAULT_KEYS}
        sections={["Identitas", "Alamat", "Registrasi"]}
        rows={filteredList}
        filename={`${activeTab === "onsite" ? "peserta" : "registrasi"}_${event.name.replace(/\s+/g, "_")}`}
        pdfMapper={eventParticipantToPdf}
        pdfFilenameLabel={`peserta_${event.name.replace(/\s+/g, "_")}`}
        baseUrl={BASE}
        title="Export Data Peserta Kegiatan"
      />
    </Layout>
  );
}
