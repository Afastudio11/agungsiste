import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CalendarDays, MapPin, LogOut, ScanLine, Search,
  ClipboardCheck, Users, QrCode, X,
  TrendingUp, Zap, History, Clock, ChevronRight
} from "@/lib/icons";
import { useAuth } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Event {
  id: number;
  name: string;
  description?: string;
  category?: string;
  location?: string;
  eventDate: string;
  startTime?: string;
  targetParticipants?: number;
  isRsvp?: boolean;
  status?: string;
  participantCount: number;
}

interface ScanHistoryItem {
  id: number;
  registeredAt: string;
  checkedInAt: string | null;
  registrationType: string;
  participantName: string;
  participantNik: string;
  participantCity: string | null;
  participantKecamatan: string | null;
  eventId: number;
  eventName: string;
  eventLocation: string | null;
}

function maskNik(nik: string) {
  if (!nik || nik.length < 8) return nik;
  return nik.slice(0, 4) + "·".repeat(nik.length - 8) + nik.slice(-4);
}

function formatRelTime(isoStr: string) {
  const diff = Date.now() - new Date(isoStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Baru saja";
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const d = Math.floor(h / 24);
  return `${d} hari lalu`;
}

function getCategoryBadge(ev: Event) {
  if (ev.isRsvp) return { label: "RSVP", cls: "bg-blue-100 text-blue-700 border border-blue-200" };
  const cat = (ev.category ?? "").toLowerCase();
  if (cat.includes("nasional") || cat.includes("pusat"))
    return { label: "Nasional", cls: "bg-red-100 text-red-700 border border-red-200" };
  if (cat.includes("regional") || cat.includes("provinsi"))
    return { label: "Regional", cls: "bg-amber-100 text-amber-700 border border-amber-200" };
  return { label: ev.category || "Reguler", cls: "bg-slate-100 text-slate-600 border border-slate-200" };
}

export default function PetugasEventsPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [showRiwayat, setShowRiwayat] = useState(false);

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ["events-active"],
    queryFn: () =>
      fetch(`${BASE}/api/events`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: scanHistory = [], isLoading: historyLoading } = useQuery<ScanHistoryItem[]>({
    queryKey: ["petugas-scan-history"],
    queryFn: () =>
      fetch(`${BASE}/api/petugas/scan-history`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 15000,
  });

  const { data: myStats } = useQuery<{ totalRegistered: number; totalEvents: number }>({
    queryKey: ["petugas-my-stats"],
    queryFn: () =>
      fetch(`${BASE}/api/petugas/my-stats`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 30000,
  });

  const active = events.filter((e) => !e.status || e.status === "active");
  const filtered = active.filter(
    (ev) =>
      !search ||
      ev.name.toLowerCase().includes(search.toLowerCase()) ||
      (ev.location ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (ev.category ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const selectEvent = (id: number, isRsvp: boolean) => {
    navigate(isRsvp ? `/petugas/scan-rsvp/${id}` : `/petugas/scan/${id}`);
  };

  const openQrScan = (id: number) => {
    navigate(`/petugas/qr-scan/${id}`);
  };

  const initials = (user?.name ?? "P")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {/* ── Sticky Top Bar ───────────────────────────────────────── */}
      <nav className="bg-white border-b border-slate-100 px-5 py-3 flex items-center justify-between sticky top-0 z-20 shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white text-[13px] font-extrabold shrink-0">
            {initials}
          </div>
          <div>
            <div className="text-[13px] font-extrabold text-slate-900 leading-none">
              {user?.name ?? "Petugas"}
            </div>
            {(user?.jabatan || user?.wilayah) && (
              <div className="text-[11px] text-slate-400 font-medium leading-none mt-0.5">
                {[user.jabatan, user.wilayah].filter(Boolean).join(" · ")}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {/* Riwayat button */}
          <button
            onClick={() => setShowRiwayat(true)}
            className="relative flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-blue-600 transition-colors p-2 rounded-xl hover:bg-blue-50"
          >
            <History size={16} />
            {scanHistory.length > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 bg-blue-600 text-white text-[9px] font-extrabold rounded-full flex items-center justify-center px-1">
                {scanHistory.length > 99 ? "99+" : scanHistory.length}
              </span>
            )}
          </button>
          {/* Logout button */}
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors p-2 rounded-xl hover:bg-red-50"
          >
            <LogOut size={16} />
          </button>
        </div>
      </nav>

      {/* ── Riwayat Bottom Sheet ─────────────────────────────────────── */}
      {showRiwayat && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
            onClick={() => setShowRiwayat(false)}
          />
          {/* Panel */}
          <div className="relative bg-white rounded-t-3xl max-h-[82vh] flex flex-col shadow-2xl">
            {/* Handle + Header */}
            <div className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0">
              <div className="w-10 h-1 bg-slate-200 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <h2 className="text-[14px] font-extrabold text-slate-900 flex items-center gap-2">
                  <History size={15} className="text-blue-500" />
                  Riwayat Scan Saya
                </h2>
                {scanHistory.length > 0 && (
                  <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                    {scanHistory.length} entri
                  </span>
                )}
              </div>
            </div>
            {/* Scrollable list */}
            <div className="overflow-y-auto flex-1 p-4 space-y-2">
              {historyLoading && (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="bg-slate-50 rounded-2xl p-4 animate-pulse">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-200 shrink-0" />
                        <div className="flex-1">
                          <div className="h-3.5 bg-slate-200 rounded-lg mb-2 w-2/3" />
                          <div className="h-3 bg-slate-200 rounded-lg w-1/2" />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!historyLoading && scanHistory.length === 0 && (
                <div className="py-16 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-3">
                    <ScanLine size={28} className="text-slate-300" />
                  </div>
                  <div className="text-sm font-bold text-slate-400">Belum ada riwayat</div>
                  <div className="text-xs text-slate-300 mt-1">Scan KTP atau absen peserta untuk memulai</div>
                </div>
              )}
              {!historyLoading && scanHistory.length > 0 && (
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
                  {scanHistory.map((item, idx) => (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors">
                      <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-extrabold text-blue-600">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-extrabold text-slate-900 truncate leading-snug">
                          {item.participantName}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[11px] text-slate-400 font-mono tracking-wide">
                            {maskNik(item.participantNik)}
                          </span>
                          {(item.participantCity || item.participantKecamatan) && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              · {[item.participantKecamatan, item.participantCity].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-1">
                          <div className="flex items-center gap-1 text-[10px] text-blue-500 font-semibold bg-blue-50 px-2 py-0.5 rounded-full max-w-[200px] truncate">
                            <ChevronRight size={9} className="shrink-0" />
                            <span className="truncate">{item.eventName}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {item.checkedInAt && item.registrationType === "onsite" ? (
                          <div className="flex items-center gap-1">
                            <div className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ABSEN</div>
                            <div className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">+KTP</div>
                          </div>
                        ) : item.checkedInAt ? (
                          <div className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">ABSEN</div>
                        ) : (
                          <div className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">KTP</div>
                        )}
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                          <Clock size={9} />
                          {formatRelTime(item.checkedInAt ?? item.registeredAt)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="h-4" />
            </div>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-4">

        {/* ── Hero Banner ──────────────────────────────────────────── */}
        <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-blue-600 via-blue-600 to-indigo-700 shadow-lg shadow-blue-500/20">
          <div className="px-6 pt-6 pb-5">
            <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur-sm text-white/90 text-[10px] font-extrabold tracking-widest px-3 py-1 rounded-full mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              AKTIF BERTUGAS
            </div>
            <h1 className="text-[22px] font-extrabold text-white leading-tight mb-1" style={{ letterSpacing: "-0.03em" }}>
              Halo, {user?.name?.split(" ")[0] ?? "Petugas"} 👋
            </h1>
            {(user?.jabatan || user?.wilayah) && (
              <div className="flex items-center gap-1.5 text-blue-200 text-xs font-medium">
                <MapPin size={11} />
                {[user.jabatan, user.wilayah].filter(Boolean).join(" · ")}
              </div>
            )}

            {/* Mini stats */}
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3">
                <div className="text-[10px] text-blue-200 font-bold tracking-wider mb-1 flex items-center gap-1">
                  <CalendarDays size={10} />
                  Event Saya
                </div>
                <div className="text-2xl font-extrabold text-white leading-none" style={{ letterSpacing: "-0.04em" }}>
                  {myStats == null ? "—" : myStats.totalEvents.toLocaleString("id-ID")}
                </div>
              </div>
              <div className="bg-white/15 backdrop-blur-sm rounded-2xl px-4 py-3">
                <div className="text-[10px] text-blue-200 font-bold tracking-wider mb-1 flex items-center gap-1">
                  <Users size={10} />
                  Peserta Saya
                </div>
                <div className="text-2xl font-extrabold text-white leading-none" style={{ letterSpacing: "-0.04em" }}>
                  {myStats == null ? "—" : myStats.totalRegistered.toLocaleString("id-ID")}
                </div>
              </div>
            </div>
          </div>

          {/* Instruction strip */}
          <div className="bg-white/10 px-6 py-3 flex items-center gap-2">
            <Zap size={13} className="text-amber-300 shrink-0" />
            <span className="text-[11px] text-blue-100 font-medium">
              Pilih event lalu tekan <strong className="text-white">Scan KTP</strong> atau <strong className="text-white">Scan QR</strong> untuk absensi
            </span>
          </div>
        </div>

        {/* ── Search Bar ───────────────────────────────────────────── */}
        <div className="relative">
          <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Cari event berdasarkan nama atau lokasi..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-10 py-3 text-sm bg-white border border-slate-200 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 placeholder:text-slate-300 transition"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-100 rounded-full transition"
            >
              <X size={13} className="text-slate-400" />
            </button>
          )}
        </div>

        {/* ── Events Section ───────────────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[13px] font-extrabold text-slate-700 tracking-wide">
              EVENT AKTIF
            </h2>
            <div className="text-xs font-bold text-slate-400">
              {isLoading ? "Memuat..." : `${filtered.length} event`}
            </div>
          </div>

          {/* Loading skeleton */}
          {isLoading && (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-xl bg-slate-100" />
                    <div className="flex-1">
                      <div className="h-4 bg-slate-100 rounded-lg mb-2 w-3/4" />
                      <div className="h-3 bg-slate-100 rounded-lg w-1/2" />
                    </div>
                    <div className="h-6 w-16 bg-slate-100 rounded-full" />
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full mb-4" />
                  <div className="flex gap-2">
                    <div className="flex-1 h-10 bg-slate-100 rounded-xl" />
                    <div className="w-10 h-10 bg-slate-100 rounded-xl" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filtered.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <CalendarDays size={28} className="text-slate-300" />
              </div>
              <div className="text-sm font-bold text-slate-400">
                {search ? "Tidak ada event yang cocok" : "Tidak ada event aktif saat ini"}
              </div>
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="mt-3 text-xs text-blue-600 font-semibold hover:underline"
                >
                  Hapus pencarian
                </button>
              )}
            </div>
          )}

          {/* Event cards */}
          <div className="space-y-3">
            {filtered.map((ev) => {
              const badge = getCategoryBadge(ev);
              const pct =
                ev.targetParticipants
                  ? Math.min(100, Math.round((ev.participantCount / ev.targetParticipants) * 100))
                  : null;

              return (
                <div
                  key={ev.id}
                  className="bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-blue-100 transition-all duration-200 overflow-hidden"
                >
                  <div className="p-5">
                    {/* Top row: icon + title + badge */}
                    <div className="flex items-start gap-3 mb-3">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                          ev.isRsvp ? "bg-blue-50" : "bg-indigo-50"
                        }`}
                      >
                        {ev.isRsvp ? (
                          <ClipboardCheck size={19} className="text-blue-600" />
                        ) : (
                          <ScanLine size={19} className="text-indigo-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3
                          className="text-[15px] font-extrabold text-slate-900 leading-snug"
                          style={{ letterSpacing: "-0.02em" }}
                        >
                          {ev.name}
                        </h3>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded-full ${badge.cls}`}>
                            {badge.label}
                          </span>
                          {ev.isRsvp && (
                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                              RSVP
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Meta info */}
                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 font-medium mb-3">
                      <span className="flex items-center gap-1">
                        <CalendarDays size={11} className="shrink-0" />
                        {ev.eventDate}
                        {ev.startTime ? ` · ${ev.startTime}` : ""}
                      </span>
                      {ev.location && (
                        <span className="flex items-center gap-1">
                          <MapPin size={11} className="shrink-0" />
                          <span className="truncate max-w-[160px]">{ev.location}</span>
                        </span>
                      )}
                    </div>

                    {/* Participant count + progress */}
                    <div className="mb-4">
                      <div className="flex items-baseline justify-between mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <TrendingUp size={12} className="text-slate-400" />
                          <span className="text-[11px] text-slate-400 font-medium">Peserta</span>
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span
                            className="text-[20px] font-extrabold text-slate-900"
                            style={{ letterSpacing: "-0.04em" }}
                          >
                            {ev.participantCount.toLocaleString("id-ID")}
                          </span>
                          {ev.targetParticipants && (
                            <span className="text-[11px] text-slate-400 font-medium">
                              / {ev.targetParticipants.toLocaleString("id-ID")}
                            </span>
                          )}
                        </div>
                      </div>
                      {pct !== null && (
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-700"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => selectEvent(ev.id, !!ev.isRsvp)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-extrabold bg-blue-600 text-white rounded-xl hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-200"
                      >
                        <ScanLine size={14} />
                        Scan KTP
                      </button>
                      <button
                        onClick={() => openQrScan(ev.id)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-extrabold text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 active:scale-95 transition-all"
                      >
                        <QrCode size={14} />
                        Scan Absen
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Bottom spacer */}
        <div className="h-4" />
      </div>
    </div>
  );
}
