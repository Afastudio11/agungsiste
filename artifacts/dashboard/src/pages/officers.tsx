import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Trash2, Trophy, MapPin, Briefcase, X, Eye, EyeOff, Activity } from "lucide-react";
import Layout from "@/components/layout";
import { useAuth } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

  const rankClass = (i: number) =>
    i === 0 ? "bg-yellow-100 text-yellow-800" : i === 1 ? "bg-slate-100 text-slate-600" : i === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-50 text-slate-500";

  return (
    <Layout>
      <div className="space-y-6 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setShowForm(true); setError(""); }}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-xl text-sm transition shadow-sm shadow-blue-200"
          >
            <Plus className="h-4 w-4" />
            Tambah Petugas
          </button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Total Petugas</p>
              <Users className="h-4 w-4 text-slate-200" />
            </div>
            <div className="text-[32px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>
              {petugas.length}
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Total Registrasi</p>
              <Trophy className="h-4 w-4 text-slate-200" />
            </div>
            <div className="text-[32px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>
              {totalRegistrasi.toLocaleString("id-ID")}
            </div>
          </div>
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">Petugas Aktif</p>
              <Activity className="h-4 w-4 text-slate-200" />
            </div>
            <div className="text-[32px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>
              {petugasAktif}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">sudah input ≥ 1 data</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Leaderboard */}
          <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center gap-2 mb-4">
              <Trophy className="h-4 w-4 text-amber-500" />
              <div className="font-bold text-slate-900">Leaderboard Petugas</div>
            </div>
            <div className="space-y-3">
              {sorted.slice(0, 5).map((o, i) => {
                const maxInput = sorted[0]?.totalInput || 1;
                const pct = Math.round((Number(o.totalInput) / Number(maxInput)) * 100);
                return (
                  <div key={o.id}>
                    <div className="flex items-center gap-3 mb-1">
                      <div className={`h-7 w-7 rounded-full text-xs font-extrabold flex items-center justify-center shrink-0 ${rankClass(i)}`}>
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-sm text-slate-900 truncate">{o.name}</div>
                        <div className="text-xs text-slate-400">{o.jabatan}{o.wilayah ? ` · ${o.wilayah}` : ""} · {o.totalEvent} event</div>
                      </div>
                      <div className="text-lg font-extrabold text-slate-800">{Number(o.totalInput).toLocaleString("id-ID")}</div>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 ml-10">
                      <div
                        className={`h-full rounded-full transition-all ${i === 0 ? "bg-amber-400" : i === 1 ? "bg-slate-300" : i === 2 ? "bg-orange-400" : "bg-blue-300"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {sorted.length === 0 && <div className="text-sm text-slate-400 text-center py-4">Belum ada data</div>}
            </div>
          </div>

          {/* Officer list */}
          <div className="rounded-2xl bg-white border border-slate-100 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="p-4 border-b border-slate-100 flex items-center gap-3">
              <Users className="h-4 w-4 text-slate-500" />
              <span className="font-bold text-slate-900">Daftar Petugas</span>
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter wilayah/nama..."
                className="ml-auto text-sm px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-40"
              />
            </div>
            {isLoading ? (
              <div className="p-8 text-center text-slate-400 text-sm">Memuat...</div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filtered.map((o) => (
                  <div key={o.id} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50/60 transition-colors">
                    <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                      {o.name[0]}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm text-slate-900 truncate">{o.name}</div>
                      <div className="text-xs text-slate-400 flex items-center gap-1.5">
                        <Briefcase className="h-2.5 w-2.5" />{o.jabatan || "—"}
                        {o.wilayah && <><MapPin className="h-2.5 w-2.5 ml-1" />{o.wilayah}</>}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm font-bold text-slate-800">{Number(o.totalInput).toLocaleString("id-ID")}</div>
                      <div className="text-xs text-slate-400">{o.totalEvent} event</div>
                    </div>
                    {o.id !== user?.id && (
                      <button
                        onClick={() => { if (confirm(`Hapus ${o.name}?`)) remove.mutate(o.id); }}
                        className="p-1.5 hover:bg-red-50 text-slate-300 hover:text-red-500 rounded-lg transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="p-8 text-center text-slate-400 text-sm">Tidak ada petugas</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Add Officer Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
                <div className="font-bold text-slate-900">Tambah Petugas Baru</div>
                <button onClick={() => { setShowForm(false); setError(""); }} className="p-1.5 hover:bg-slate-100 rounded-lg">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="p-5 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: "Nama Lengkap *", key: "name", placeholder: "Nama petugas" },
                    { label: "Jabatan", key: "jabatan", placeholder: "Koordinator / Staf" },
                    { label: "Wilayah / Kabupaten", key: "wilayah", placeholder: "Kab. Bandung" },
                    { label: "Nomor HP", key: "phone", placeholder: "+62 8xx" },
                  ].map(({ label, key, placeholder }) => (
                    <div key={key}>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
                      <input
                        value={(form as Record<string, string>)[key]}
                        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                        placeholder={placeholder}
                        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      />
                    </div>
                  ))}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Username *</label>
                    <input
                      value={form.username}
                      onChange={(e) => setForm({ ...form, username: e.target.value })}
                      placeholder="username_login"
                      className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">Password *</label>
                    <div className="relative">
                      <input
                        type={showPw ? "text" : "password"}
                        value={form.password}
                        onChange={(e) => setForm({ ...form, password: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 pr-9 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                      />
                      <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                        {showPw ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Catatan</label>
                  <input
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Catatan tambahan..."
                    className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
                {error && <div className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2">{error}</div>}
              </div>
              <div className="px-5 pb-5 flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-slate-200 text-slate-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  onClick={() => create.mutate(form)}
                  disabled={create.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold py-2.5 rounded-xl text-sm transition"
                >
                  {create.isPending ? "Menyimpan..." : "Simpan Petugas"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
