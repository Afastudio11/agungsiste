import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  CalendarDays, MapPin, LogOut, ScanLine, Search, ArrowRight,
  SlidersHorizontal, Shield, ClipboardCheck, Users, QrCode
} from "lucide-react";
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

function getPriorityLabel(ev: Event) {
  if (ev.isRsvp) return { label: "RSVP", color: "bg-blue-600 text-white" };
  const cat = (ev.category ?? "").toLowerCase();
  if (cat.includes("nasional") || cat.includes("pusat")) return { label: "PRIORITAS", color: "bg-red-500 text-white" };
  if (cat.includes("regional") || cat.includes("provinsi")) return { label: "REGIONAL", color: "bg-amber-500 text-white" };
  return { label: "REGULER", color: "bg-slate-200 text-slate-600" };
}

function EventIcon({ isRsvp }: { isRsvp?: boolean }) {
  return (
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isRsvp ? "bg-blue-50" : "bg-slate-50"}`}>
      {isRsvp
        ? <ClipboardCheck size={20} className="text-blue-600" />
        : <ScanLine size={20} className="text-slate-400" />}
    </div>
  );
}

export default function PetugasEventsPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ["events-active"],
    queryFn: () =>
      fetch(`${BASE}/api/events`, { credentials: "include" }).then((r) => r.json()),
  });

  const active = events.filter((e) => !e.status || e.status === "active");

  const filtered = active.filter((ev) =>
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

  const initials = (user?.name ?? "P").split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-[#f0f4ff]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* Top Navbar */}
      <nav className="bg-white border-b border-slate-100 px-6 py-3 flex items-center justify-between sticky top-0 z-20 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
            <Shield size={16} className="text-white" />
          </div>
          <span className="text-sm font-extrabold text-slate-800 tracking-tight">KTP REGISTRASI</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden sm:block text-sm font-medium text-blue-600">Portal Petugas</span>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold">
              {initials}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-red-500 transition-colors px-2 py-1.5 rounded-lg hover:bg-red-50"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Keluar</span>
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

        {/* Welcome Banner */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_12px_rgba(59,130,246,0.08)] px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[10px] font-extrabold tracking-[0.14em] text-blue-500 uppercase mb-1.5">
                Field Operation Portal
              </div>
              <h1 className="text-2xl font-extrabold text-slate-900 leading-tight" style={{ letterSpacing: "-0.03em" }}>
                Selamat datang, {user?.name?.split(" ")[0] ?? "Petugas"}
              </h1>
              {(user?.jabatan || user?.wilayah) && (
                <div className="flex items-center gap-1.5 text-sm text-slate-400 font-medium mt-1.5">
                  <MapPin size={13} />
                  {[user.jabatan, user.wilayah].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</div>
              <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-extrabold px-3 py-1.5 rounded-full border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Aktif Bertugas
              </div>
            </div>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Cari event berdasarkan nama, ID, atau lokasi..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm bg-white border border-slate-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-300"
            />
          </div>
          <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold px-4 py-3 rounded-xl transition-colors shadow-sm shadow-blue-200">
            <SlidersHorizontal size={15} />
            <span className="hidden sm:inline">Filter</span>
          </button>
        </div>

        {/* Events Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold text-slate-800" style={{ letterSpacing: "-0.02em" }}>
              Event Aktif
            </h2>
            <div className="text-xs font-bold text-slate-400 tracking-widest uppercase">
              {isLoading ? "Memuat..." : `Menampilkan ${filtered.length} event`}
            </div>
          </div>

          {isLoading && (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 mb-4" />
                  <div className="h-4 bg-slate-100 rounded-md mb-2 w-3/4" />
                  <div className="h-3 bg-slate-100 rounded-md mb-4 w-full" />
                  <div className="h-3 bg-slate-100 rounded-md mb-1 w-1/2" />
                  <div className="h-3 bg-slate-100 rounded-md mb-5 w-2/3" />
                  <div className="h-9 bg-slate-100 rounded-xl" />
                </div>
              ))}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center">
              <CalendarDays size={40} className="mx-auto text-slate-200 mb-3" />
              <div className="text-sm font-semibold text-slate-400">
                {search ? "Tidak ada event yang cocok" : "Tidak ada event aktif saat ini"}
              </div>
            </div>
          )}

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((ev) => {
              const badge = getPriorityLabel(ev);
              const pct = ev.targetParticipants
                ? Math.min(100, Math.round((ev.participantCount / ev.targetParticipants) * 100))
                : null;

              return (
                <div
                  key={ev.id}
                  className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col shadow-sm hover:shadow-md hover:border-blue-100 transition-all duration-200 group"
                >
                  {/* Card top row */}
                  <div className="flex items-start justify-between mb-4">
                    <EventIcon isRsvp={ev.isRsvp} />
                    <span className={`text-[10px] font-extrabold tracking-widest px-2.5 py-1 rounded-full ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>

                  {/* Title + description */}
                  <div className="flex-1">
                    <h3 className="text-[15px] font-extrabold text-slate-900 leading-snug mb-1.5" style={{ letterSpacing: "-0.02em" }}>
                      {ev.name}
                    </h3>
                    {ev.description && (
                      <p className="text-xs text-slate-400 leading-relaxed mb-3 line-clamp-2">
                        {ev.description}
                      </p>
                    )}
                  </div>

                  {/* Meta info */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <CalendarDays size={12} className="text-slate-400 shrink-0" />
                      <span>{ev.eventDate}{ev.startTime ? ` · ${ev.startTime}` : ""}</span>
                    </div>
                    {ev.location && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <MapPin size={12} className="text-slate-400 shrink-0" />
                        <span className="truncate">{ev.location}</span>
                      </div>
                    )}
                    {ev.targetParticipants && (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Users size={12} className="text-slate-400 shrink-0" />
                        <span>{ev.participantCount} / {ev.targetParticipants} peserta</span>
                      </div>
                    )}
                  </div>

                  {/* Progress bar */}
                  {pct !== null && (
                    <div className="mb-4">
                      <div className="h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-blue-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => selectEvent(ev.id, !!ev.isRsvp)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-bold text-blue-600 border-2 border-blue-100 rounded-xl hover:bg-blue-600 hover:text-white hover:border-blue-600 transition-all duration-200 group-hover:border-blue-300"
                    >
                      Scan KTP
                      <ArrowRight size={14} />
                    </button>
                    <button
                      onClick={() => openQrScan(ev.id)}
                      title="Scan QR Absensi"
                      className="flex items-center justify-center gap-1.5 px-3 py-2.5 text-sm font-bold text-emerald-600 border-2 border-emerald-100 rounded-xl hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all duration-200"
                    >
                      <QrCode size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
