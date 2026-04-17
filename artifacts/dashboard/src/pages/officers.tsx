import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Trash2, Trophy, MapPin, Briefcase, X, Eye, EyeOff, Activity, Clock, ScanLine, QrCode } from "lucide-react";
import Layout from "@/components/layout";
import { useAuth } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function maskNik(nik: string) {
  if (!nik || nik.length < 8) return nik;
  return nik.slice(0, 4) + "·".repeat(nik.length - 8) + nik.slice(-4);
}

function formatActivityTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "baru saja";
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  if (diffMin < 1440) {
    const jam = d.getHours().toString().padStart(2, "0");
    const menit = d.getMinutes().toString().padStart(2, "0");
    return `${jam}:${menit}`;
  }
  return d.toLocaleDateString("id-ID", { day: "numeric", month: "short" }) +
    " " + d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0");
}

interface Officer {
  id: number;
  username: string;
  role: string;
  name: string;
  jabatan?: string;
  wilayah?: string;
  phone?: string;
  notes?: string;
  totalInput: number;
  totalEvent: number;
  createdAt: string;
}

const empty = { username: "", password: "", role: "petugas", name: "", jabatan: "", wilayah: "", phone: "", notes: "" };

export default function OfficersPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ...empty });
  const [showPw, setShowPw] = useState(false);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");

  const { data: officers = [], isLoading } = useQuery<Officer[]>({
    queryKey: ["officers"],
    queryFn: () => fetch(`${BASE}/api/users`, { credentials: "include" }).then((r) => r.json()),
  });
  const { data: staffStats = [] } = useQuery<{ staffId: number; staffName: string | null; totalInput: number; totalEvent: number; recentInput: number; lastActivity: string | null; events: { eventName: string; count: number }[] }[]>({
    queryKey: ["staff-stats"],
    queryFn: () => fetch(`${BASE}/api/dashboard/staff`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 60_000,
  });

  const { data: activityLog = [], isLoading: activityLoading } = useQuery<{
    id: number;
    staffId: number | null;
    staffName: string | null;
    participantName: string;
    participantNik: string;
    eventName: string;
    registeredAt: string;
    checkedInAt: string | null;
    registrationType: string | null;
  }[]>({
    queryKey: ["activity-log"],
    queryFn: () => fetch(`${BASE}/api/dashboard/activity-log`, { credentials: "include" }).then((r) => r.json()),
    refetchInterval: 20_000,
  });

  const create = useMutation({
    mutationFn: (data: typeof empty) =>
      fetch(`${BASE}/api/users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        return j;
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["officers"] });
      setShowForm(false);
      setForm({ ...empty });
      setError("");
    },
    onError: (e: Error) => setError(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: number) =>
      fetch(`${BASE}/api/users/${id}`, { method: "DELETE", credentials: "include" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["officers"] }),
  });

  const filtered = officers.filter((o) =>
    !filter || o.wilayah?.toLowerCase().includes(filter.toLowerCase()) || o.name.toLowerCase().includes(filter.toLowerCase())
  );

  const petugas = filtered.filter((o) => o.role === "petugas");
  const sorted = [...petugas].sort((a, b) => Number(b.totalInput) - Number(a.totalInput));

  const totalRegistrasi = petugas.reduce((s, o) => s + Number(o.totalInput), 0);
  const petugasAktif = petugas.filter((o) => Number(o.totalInput) > 0).length;

  const rankBarColor = (i: number) =>
    i === 0 ? "bg-amber-400" : i === 1 ? "bg-slate-400" : i === 2 ? "bg-orange-400" : "bg-blue-400";

  const rankBadge = (i: number) =>
    i === 0
      ? "bg-amber-100 text-amber-700 border border-amber-200"
      : i === 1
      ? "bg-slate-100 text-slate-500 border border-slate-200"
      : i === 2
      ? "bg-orange-100 text-orange-600 border border-orange-200"
      : "bg-blue-50 text-blue-500 border border-blue-100";

  return (
    <Layout>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap');`}</style>
      <div className="space-y-6 max-w-6xl" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

        {/* Action bar — no page title */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => { setShowForm(true); setError(""); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-5 py-2.5 rounded-full text-sm transition-all shadow-lg shadow-blue-200"
          >
            <Plus className="h-4 w-4" />
            Tambah Pengguna
          </button>
        </div>

        {/* Summary cards — glass-card style */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {/* Total Petugas */}
          <div className="group relative rounded-2xl bg-white/70 backdrop-blur-sm border border-white/80 px-6 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.07)] hover:-translate-y-1 transition-all duration-200 cursor-default">
            <div className="flex items-start justify-between mb-4">
              <div className="h-12 w-12 rounded-2xl bg-blue-100 group-hover:bg-blue-600 flex items-center justify-center transition-colors duration-200">
                <Users className="h-6 w-6 text-blue-600 group-hover:text-white transition-colors duration-200" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                Petugas
              </span>
            </div>
            <div className="text-[36px] font-extrabold text-slate-900 leading-none mb-1" style={{ letterSpacing: "-0.04em" }}>
              {petugas.length}
            </div>
            <p className="text-xs font-semibold text-slate-400 tracking-widest">Total Petugas</p>
          </div>

          {/* Total Registrasi */}
          <div className="group relative rounded-2xl bg-white/70 backdrop-blur-sm border border-white/80 px-6 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.07)] hover:-translate-y-1 transition-all duration-200 cursor-default">
            <div className="flex items-start justify-between mb-4">
              <div className="h-12 w-12 rounded-2xl bg-violet-100 group-hover:bg-violet-600 flex items-center justify-center transition-colors duration-200">
                <Trophy className="h-6 w-6 text-violet-600 group-hover:text-white transition-colors duration-200" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-violet-50 text-violet-600 border border-violet-100">
                Registrasi
              </span>
            </div>
            <div className="text-[36px] font-extrabold text-slate-900 leading-none mb-1" style={{ letterSpacing: "-0.04em" }}>
              {totalRegistrasi.toLocaleString("id-ID")}
            </div>
            <p className="text-xs font-semibold text-slate-400 tracking-widest">Total Registrasi</p>
          </div>

          {/* Petugas Aktif */}
          <div className="group relative rounded-2xl bg-white/70 backdrop-blur-sm border border-white/80 px-6 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.07)] hover:-translate-y-1 transition-all duration-200 cursor-default">
            <div className="flex items-start justify-between mb-4">
              <div className="h-12 w-12 rounded-2xl bg-emerald-100 group-hover:bg-emerald-600 flex items-center justify-center transition-colors duration-200">
                <Activity className="h-6 w-6 text-emerald-600 group-hover:text-white transition-colors duration-200" />
              </div>
              <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">
                Aktif
              </span>
            </div>
            <div className="text-[36px] font-extrabold text-slate-900 leading-none mb-1" style={{ letterSpacing: "-0.04em" }}>
              {petugasAktif}
            </div>
            <p className="text-xs font-semibold text-slate-400 tracking-widest">Petugas Aktif</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Leaderboard */}
          <div className="rounded-2xl bg-white border border-slate-100 p-6 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="h-8 w-8 rounded-xl bg-amber-50 flex items-center justify-center">
                <Trophy className="h-4 w-4 text-amber-500" />
              </div>
              <div className="font-bold text-slate-900 text-base">Leaderboard Petugas</div>
            </div>
            <div className="space-y-4">
              {sorted.slice(0, 5).map((o, i) => {
                const maxInput = sorted[0]?.totalInput || 1;
                const pct = Math.round((Number(o.totalInput) / Number(maxInput)) * 100);
                return (
                  <div key={o.id}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`h-7 w-7 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${rankBadge(i)}`}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-sm text-slate-900 truncate">{o.name}</div>
                        <div className="text-xs text-slate-400 truncate">
                          {o.jabatan}{o.wilayah ? ` · ${o.wilayah}` : ""}{o.totalEvent > 0 ? ` · ${o.totalEvent} event` : ""}
                        </div>
                      </div>
                      <div className="text-base font-extrabold text-slate-800 tabular-nums">{Number(o.totalInput).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 ml-10">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${rankBarColor(i)}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {sorted.length === 0 && <div className="text-sm text-slate-400 text-center py-6">Belum ada data</div>}
            </div>
          </div>

          {/* Officer list */}
          <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex flex-col">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 shrink-0">
              <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <span className="font-bold text-slate-900">Daftar Petugas</span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter nama/wilayah..."
                className="ml-auto text-sm px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400 transition w-40"
              />
            </div>
            {isLoading ? (
              <div className="p-10 text-center text-slate-400 text-sm">Memuat...</div>
            ) : (
              <div className="divide-y divide-slate-50 overflow-y-auto max-h-72">
                {filtered.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/70 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm text-slate-900 truncate">{o.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                        <Briefcase className="h-2.5 w-2.5 shrink-0" />
                        <span className="truncate">{o.jabatan || "—"}</span>
                        {o.wilayah && (
                          <>
                            <MapPin className="h-2.5 w-2.5 shrink-0 ml-0.5" />
                            <span className="truncate">{o.wilayah}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-extrabold text-slate-800 tabular-nums">{Number(o.totalInput).toLocaleString("id-ID")}</div>
                      <div className="text-xs text-slate-400">{o.totalEvent} event</div>
                    </div>
                    {o.id !== user?.id && (
                      <button
                        onClick={() => { if (confirm(`Hapus ${o.name}?`)) remove.mutate(o.id); }}
                        className="p-2 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-xl transition ml-1"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="p-10 text-center text-slate-400 text-sm">Tidak ada petugas</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Staff Detailed Stats */}
        {staffStats.length > 0 && (
          <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-xl bg-slate-100 flex items-center justify-center">
                <Activity className="h-4 w-4 text-slate-500" />
              </div>
              <span className="font-bold text-slate-900">Statistik Input per Petugas</span>
              <span className="ml-auto text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full">7 hari terakhir</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 border-b border-slate-100">
                  <tr>
                    <th className="text-left px-6 py-3.5 text-xs font-bold tracking-[0.07em] text-slate-400">Nama</th>
                    <th className="text-center px-4 py-3.5 text-xs font-bold tracking-[0.07em] text-slate-400">Total Input</th>
                    <th className="text-center px-4 py-3.5 text-xs font-bold tracking-[0.07em] text-slate-400">7 Hari</th>
                    <th className="text-center px-4 py-3.5 text-xs font-bold tracking-[0.07em] text-slate-400">Event</th>
                    <th className="text-left px-4 py-3.5 text-xs font-bold tracking-[0.07em] text-slate-400">Terakhir Aktif</th>
                    <th className="text-left px-4 py-3.5 text-xs font-bold tracking-[0.07em] text-slate-400">Event Terlibat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {staffStats.map((s, i) => (
                    <tr key={s.staffId ?? i} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-900">{s.staffName ?? "—"}</div>
                      </td>
                      <td className="px-4 py-4 text-center font-extrabold text-slate-800 tabular-nums">
                        {Number(s.totalInput).toLocaleString("id-ID")}
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className={`inline-flex items-center justify-center px-3 py-1 rounded-full text-xs font-bold ${
                          s.recentInput > 0 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                        }`}>
                          {Number(s.recentInput).toLocaleString("id-ID")}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center text-slate-600 font-bold">{s.totalEvent}</td>
                      <td className="px-4 py-4 text-xs text-slate-400 font-medium">
                        {s.lastActivity
                          ? new Date(s.lastActivity).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })
                          : "—"}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {(s.events ?? []).slice(0, 3).map((ev, j) => (
                            <span key={j} className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold truncate max-w-[120px]" title={ev.eventName}>
                              {ev.eventName} ({ev.count})
                            </span>
                          ))}
                          {(s.events ?? []).length > 3 && (
                            <span className="text-xs text-slate-400 font-medium">+{s.events.length - 3} lainnya</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Log Aktivitas Petugas ─────────────────────────────────── */}
        <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-xl bg-blue-50 flex items-center justify-center">
              <Activity className="h-4 w-4 text-blue-500" />
            </div>
            <span className="font-bold text-slate-900">Log Aktivitas Petugas</span>
            <div className="flex items-center gap-1.5 ml-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] font-semibold text-emerald-600">Live</span>
            </div>
            {activityLog.length > 0 && (
              <span className="ml-auto text-xs font-semibold text-slate-400 bg-slate-50 border border-slate-100 px-3 py-1 rounded-full">
                {activityLog.length} aktivitas
              </span>
            )}
          </div>

          {activityLoading && (
            <div className="divide-y divide-slate-50">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-4 px-6 py-3.5 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-slate-100 shrink-0" />
                  <div className="flex-1">
                    <div className="h-3.5 bg-slate-100 rounded w-1/3 mb-2" />
                    <div className="h-3 bg-slate-100 rounded w-1/2" />
                  </div>
                  <div className="h-3 w-16 bg-slate-100 rounded" />
                </div>
              ))}
            </div>
          )}

          {!activityLoading && activityLog.length === 0 && (
            <div className="py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-3">
                <ScanLine className="h-7 w-7 text-slate-200" />
              </div>
              <div className="text-sm font-bold text-slate-400">Belum ada aktivitas</div>
              <div className="text-xs text-slate-300 mt-1">Aktivitas petugas akan muncul di sini secara real-time</div>
            </div>
          )}

          {!activityLoading && activityLog.length > 0 && (
            <div className="divide-y divide-slate-50 max-h-[500px] overflow-y-auto">
              {activityLog.map((item) => {
                const isAbsen = !!item.checkedInAt;
                const timestamp = item.checkedInAt ?? item.registeredAt;
                const initials = (item.staffName ?? "?").split(" ").map((w: string) => w[0]).join("").slice(0, 2).toUpperCase();
                return (
                  <div key={item.id} className="flex items-start gap-4 px-6 py-3.5 hover:bg-slate-50/60 transition-colors">
                    {/* Staff avatar */}
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center shrink-0 text-[11px] font-extrabold text-blue-700 mt-0.5">
                      {initials}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-slate-900">
                          {item.staffName ?? "—"}
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          isAbsen
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-blue-100 text-blue-700"
                        }`}>
                          {isAbsen ? <QrCode className="h-2.5 w-2.5" /> : <ScanLine className="h-2.5 w-2.5" />}
                          {isAbsen ? "Scan Absen" : "Scan KTP"}
                        </span>
                      </div>
                      <div className="mt-0.5 text-sm text-slate-700 font-semibold truncate">
                        {item.participantName}
                        <span className="ml-2 font-mono text-xs text-slate-400 font-normal">{maskNik(item.participantNik)}</span>
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400 truncate">
                        {item.eventName}
                      </div>
                    </div>

                    {/* Timestamp */}
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium shrink-0 mt-1">
                      <Clock className="h-3 w-3" />
                      {formatActivityTime(timestamp)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Add Officer Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100">
                <div className="font-extrabold text-slate-900 text-base">Tambah Pengguna Baru</div>
                <button onClick={() => { setShowForm(false); setError(""); }} className="p-2 hover:bg-slate-100 rounded-xl transition">
                  <X className="h-4 w-4 text-slate-500" />
                </button>
              </div>
              <div className="p-6 space-y-4">
                {/* Role selector */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">Role *</label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { value: "petugas", label: "Petugas", desc: "Scan & input data lapangan" },
                      { value: "admin", label: "Admin", desc: "Kelola event, peserta & data" },
                    ] as const).map(({ value, label, desc }) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setForm({ ...form, role: value })}
                        className={`text-left px-4 py-3 rounded-2xl border-2 transition-all ${
                          form.role === value
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300"
                        }`}
                      >
                        <div className={`text-sm font-bold ${form.role === value ? "text-blue-700" : "text-slate-700"}`}>{label}</div>
                        <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Nama Lengkap *", key: "name", placeholder: "Nama lengkap" },
                    { label: "Jabatan", key: "jabatan", placeholder: "Koordinator / Staf" },
                    { label: "Wilayah / Kabupaten", key: "wilayah", placeholder: "Kab. Bandung" },
                    { label: "Nomor HP", key: "phone", placeholder: "+62 8xx" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5">{label}</label>
                      <input
                        value={(form as Record<string, string>)[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        placeholder={placeholder}
                        className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Username *</label>
                    <input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="username_login"
                      className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1.5">Password *</label>
                    <div className="relative">
                      <input
                        type={showPw ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3.5 py-2.5 pr-10 text-sm rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                      />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                        {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1.5">Catatan</label>
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Catatan tambahan..."
                    className="w-full px-3.5 py-2.5 text-sm rounded-2xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent transition"
                  />
                </div>
                {error && <div className="text-sm text-red-600 bg-red-50 rounded-2xl px-4 py-2.5 font-medium">{error}</div>}
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => { setShowForm(false); setError(""); }}
                  className="flex-1 border border-slate-200 text-slate-600 font-bold py-3 rounded-full text-sm hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  onClick={() => create.mutate(form)}
                  disabled={create.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 active:scale-95 disabled:opacity-60 text-white font-bold py-3 rounded-full text-sm transition-all shadow-lg shadow-blue-200"
                >
                  {create.isPending ? "Menyimpan..." : `Simpan ${form.role === "admin" ? "Admin" : "Petugas"}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
