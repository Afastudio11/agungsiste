import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CalendarDays, MapPin, Users, ChevronRight, LogOut, ScanLine } from "lucide-react";
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

export default function PetugasEventsPage() {
  const { user, logout } = useAuth();
  const [, navigate] = useLocation();

  const { data: events = [], isLoading } = useQuery<Event[]>({
    queryKey: ["events-active"],
    queryFn: () =>
      fetch(`${BASE}/api/events`, { credentials: "include" }).then((r) => r.json()),
  });

  const active = events.filter((e) => !e.status || e.status === "active");

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const selectEvent = (id: number, isRsvp: boolean) => {
    if (isRsvp) {
      navigate(`/petugas/scan-rsvp/${id}`);
    } else {
      navigate(`/petugas/scan/${id}`);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white px-4 pt-4 pb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-white/20 flex items-center justify-center">
              <ScanLine className="h-4 w-4 text-white" />
            </div>
            <span className="text-sm font-semibold opacity-80">Portal Petugas</span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-white/20 flex items-center justify-center text-xl font-bold">
            {user?.name?.[0]}
          </div>
          <div>
            <div className="font-bold text-lg leading-tight">{user?.name}</div>
            <div className="text-sm opacity-75">
              {user?.jabatan}
              {user?.wilayah ? ` · ${user.wilayah}` : ""}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 pt-4">
        <div className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-orange-500" />
          Event Aktif — Pilih untuk Mulai Scan
        </div>

        {isLoading && (
          <div className="text-center py-12 text-slate-400 text-sm">Memuat daftar event...</div>
        )}

        {!isLoading && active.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <CalendarDays className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <div className="text-sm">Tidak ada event aktif</div>
          </div>
        )}

        <div className="space-y-3 pb-8">
          {active.map((ev) => (
            <div
              key={ev.id}
              className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <div className={`h-2.5 w-2.5 rounded-full mt-1 ${ev.isRsvp ? "bg-blue-500" : "bg-green-500"}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {ev.isRsvp && (
                      <span className="inline-block text-[10px] font-bold bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded-md">RSVP</span>
                    )}
                    {ev.category && (
                      <span className="inline-block text-[10px] font-bold bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-md">{ev.category}</span>
                    )}
                  </div>
                  <div className="font-bold text-sm text-slate-900 mb-1">{ev.name}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1 mb-0.5">
                    <CalendarDays className="h-3 w-3" />
                    {ev.eventDate}
                    {ev.startTime && ` · ${ev.startTime}`}
                  </div>
                  {ev.location && (
                    <div className="text-xs text-slate-500 flex items-center gap-1 mb-1">
                      <MapPin className="h-3 w-3" />
                      {ev.location}
                    </div>
                  )}
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    {ev.participantCount} terdaftar
                    {ev.targetParticipants ? ` / target ${ev.targetParticipants}` : ""}
                  </div>
                </div>
                <button
                  onClick={() => selectEvent(ev.id, !!ev.isRsvp)}
                  className="flex items-center gap-1 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition whitespace-nowrap"
                >
                  Pilih
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
