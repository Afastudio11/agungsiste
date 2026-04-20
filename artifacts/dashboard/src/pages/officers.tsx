import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Users, Plus, Trash2, Trophy, MapPin, Briefcase, X, Eye, EyeOff } from "@/lib/icons";
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
      <div className="space-y-6 max-w-6xl">

        {/* Action bar */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => { setShowForm(true); setError(""); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold px-5 py-2.5 rounded-full text-sm transition-all shadow-lg shadow-blue-200"
          >
            <Plus className="h-4 w-4" />
            Tambah Pengguna
          </button>
        </div>

        <div className="space-y-4">
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
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 ml-10">
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
              <div className="divide-y divide-slate-50">
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
                    { label: "Nomor HP", key: "phone", placeholder: "08123456789" },
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
