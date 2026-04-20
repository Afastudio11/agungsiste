import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import {
  ClipboardList, Plus, Trash2, ChevronRight, Users, Calendar,
  MapPin, Search, X, FileText, Pencil,
} from "@/lib/icons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

const KABUPATEN_LIST = ["Pacitan", "Trenggalek", "Magetan", "Ponorogo", "Ngawi"];

type Program = {
  id: number;
  name: string;
  komisi: string | null;
  mitra: string | null;
  tahun: string | null;
  kabupatenPenerima: string[];
  totalKtpPenerima: number | null;
  registeredCount: number;
  createdAt: string;
};

type FormData = {
  name: string;
  komisi: string;
  mitra: string;
  tahun: string;
  kabupatenPenerima: string[];
  totalKtpPenerima: string;
};

const emptyForm: FormData = {
  name: "",
  komisi: "",
  mitra: "",
  tahun: "",
  kabupatenPenerima: [],
  totalKtpPenerima: "",
};

function RecipientPill({ count }: { count: number }) {
  if (count === 0) {
    return (
      <div className="w-9 h-9 rounded-full ring-4 ring-white bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-400">
        0
      </div>
    );
  }
  const display = count >= 1000 ? `+${(count / 1000).toFixed(1)}k` : `+${count}`;
  return (
    <div className="w-9 h-9 rounded-full ring-4 ring-white bg-slate-900 text-white flex items-center justify-center text-[10px] font-bold">
      {display}
    </div>
  );
}

export default function ProgramsPage() {
  const [, navigate] = useLocation();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  const fetchPrograms = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${BASE}/api/programs`, { credentials: "include" });
      setPrograms(await res.json());
    } catch { } finally { setLoading(false); }
  }, []);

  useState(() => { fetchPrograms(); });

  const toggleKabupaten = (k: string) => {
    setFormData((prev) => ({
      ...prev,
      kabupatenPenerima: prev.kabupatenPenerima.includes(k)
        ? prev.kabupatenPenerima.filter((x) => x !== k)
        : [...prev.kabupatenPenerima, k],
    }));
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm);
    setShowForm(true);
  };

  const openEdit = (prog: Program, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(prog.id);
    setFormData({
      name: prog.name,
      komisi: prog.komisi ?? "",
      mitra: prog.mitra ?? "",
      tahun: prog.tahun ?? "",
      kabupatenPenerima: prog.kabupatenPenerima ?? [],
      totalKtpPenerima: prog.totalKtpPenerima?.toString() ?? "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setFormData(emptyForm);
  };

  const saveProgram = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const body = JSON.stringify({
        ...formData,
        totalKtpPenerima: formData.totalKtpPenerima ? parseInt(formData.totalKtpPenerima) : null,
      });
      const res = editingId
        ? await fetch(`${BASE}/api/programs/${editingId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body,
          })
        : await fetch(`${BASE}/api/programs`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body,
          });
      if (res.ok) {
        closeForm();
        fetchPrograms();
      }
    } catch { } finally { setSaving(false); }
  };

  const deleteProgram = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Hapus program ini?")) return;
    try {
      await fetch(`${BASE}/api/programs/${id}`, { method: "DELETE", credentials: "include" });
      fetchPrograms();
    } catch { }
  };

  const filtered = programs.filter((p) =>
    !search ||
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.komisi ?? "").toLowerCase().includes(search.toLowerCase()) ||
    (p.mitra ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const totalTarget = programs.reduce((a, p) => a + (p.totalKtpPenerima ?? 0), 0);
  const totalRegistered = programs.reduce((a, p) => a + p.registeredCount, 0);

  return (
    <Layout>
      <div className="space-y-8">

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
            <div className="w-11 h-11 bg-indigo-50 rounded-xl flex items-center justify-center mb-3">
              <ClipboardList className="h-5 w-5 text-indigo-600" />
            </div>
            <p className="text-[10px] font-bold tracking-widest text-slate-400 mb-1">Total Program</p>
            <p className="text-3xl font-extrabold text-slate-900">{programs.length}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
            <div className="w-11 h-11 bg-sky-50 rounded-xl flex items-center justify-center mb-3">
              <FileText className="h-5 w-5 text-sky-500" />
            </div>
            <p className="text-[10px] font-bold tracking-widest text-slate-400 mb-1">Target KTP</p>
            <p className="text-3xl font-extrabold text-slate-900">{totalTarget.toLocaleString("id-ID")}</p>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
            <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
              <Users className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-[10px] font-bold tracking-widest text-slate-400 mb-1">Terdaftar</p>
            <div className="flex items-baseline gap-1 justify-center">
              <p className="text-3xl font-extrabold text-slate-900">{totalRegistered.toLocaleString("id-ID")}</p>
              {totalTarget > 0 && <span className="text-sm text-slate-400">/ {totalTarget.toLocaleString("id-ID")}</span>}
            </div>
          </div>
        </div>

        {/* ── Toolbar ── */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama program, komisi, atau mitra..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-indigo-400 text-sm text-slate-700 placeholder:text-slate-400 transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {search && (
              <button
                onClick={() => setSearch("")}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm border bg-white text-red-400 border-red-100 hover:bg-red-50 transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-sm shadow-indigo-200 hover:bg-indigo-700 transition-all text-sm"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Tambah Program</span>
            </button>
          </div>
        </div>

        {/* ── Add/Edit Program Form ── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh]">
              <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-[15px] font-extrabold text-slate-900">
                  {editingId ? "Edit Program" : "Tambah Program Baru"}
                </h2>
                <button onClick={closeForm} className="p-1.5 rounded-xl hover:bg-slate-100 transition">
                  <X className="h-4 w-4 text-slate-400" />
                </button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">Nama Program *</label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Cth: Bedah Rumah 2025"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">Komisi</label>
                    <input
                      type="text"
                      value={formData.komisi}
                      onChange={(e) => setFormData({ ...formData, komisi: e.target.value })}
                      placeholder="Cth: Komisi VIII"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">Tahun</label>
                    <input
                      type="text"
                      value={formData.tahun}
                      onChange={(e) => setFormData({ ...formData, tahun: e.target.value })}
                      placeholder="Cth: 2025"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">Mitra / KL</label>
                  <input
                    type="text"
                    value={formData.mitra}
                    onChange={(e) => setFormData({ ...formData, mitra: e.target.value })}
                    placeholder="Cth: Kementerian PUPR"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">Total KTP Penerima</label>
                  <input
                    type="number"
                    value={formData.totalKtpPenerima}
                    onChange={(e) => setFormData({ ...formData, totalKtpPenerima: e.target.value })}
                    placeholder="Cth: 500"
                    min="1"
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-2 tracking-wide uppercase">Kabupaten Penerima</label>
                  <div className="flex flex-wrap gap-2">
                    {KABUPATEN_LIST.map((k) => {
                      const active = formData.kabupatenPenerima.includes(k);
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => toggleKabupaten(k)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                            active
                              ? "bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200"
                              : "bg-white text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-600"
                          }`}
                        >
                          {k}
                        </button>
                      );
                    })}
                  </div>
                  {formData.kabupatenPenerima.length > 0 && (
                    <p className="text-[11px] text-indigo-600 font-medium mt-1.5">
                      {formData.kabupatenPenerima.length} kabupaten dipilih
                    </p>
                  )}
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={closeForm}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  onClick={saveProgram}
                  disabled={!formData.name.trim() || saving}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm shadow-indigo-200"
                >
                  {saving ? "Menyimpan..." : editingId ? "Simpan Perubahan" : "Simpan Program"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Program List ── */}
        <div className="space-y-5">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-slate-900 tracking-widest flex items-center gap-2">
              Daftar Program
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px]">
                {filtered.length}
              </span>
            </h3>
          </div>

          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-[1.75rem] border border-slate-100 px-7 py-5 animate-pulse">
                  <div className="h-5 bg-slate-100 rounded-lg w-1/2 mb-3" />
                  <div className="flex gap-2 mb-3">
                    <div className="h-4 bg-slate-100 rounded-full w-16" />
                    <div className="h-4 bg-slate-100 rounded-full w-20" />
                  </div>
                  <div className="h-1.5 bg-slate-100 rounded-full w-full" />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center bg-white border border-slate-100 rounded-[1.75rem]">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 text-slate-200" />
              <p className="text-sm font-semibold text-slate-400">
                {search ? "Program tidak ditemukan" : "Belum ada program"}
              </p>
              {!search && (
                <button
                  onClick={openCreate}
                  className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white text-sm font-bold rounded-full hover:bg-indigo-700 transition-colors"
                >
                  <Plus className="h-4 w-4" /> Buat Program
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filtered.map((prog) => {
                const pct = prog.totalKtpPenerima && prog.totalKtpPenerima > 0
                  ? Math.min(100, Math.round((prog.registeredCount / prog.totalKtpPenerima) * 100))
                  : null;
                return (
                  <div
                    key={prog.id}
                    onClick={() => navigate(`/programs/${prog.id}`)}
                    className="group bg-white border border-slate-100 shadow-[0_4px_20px_rgba(0,0,0,0.04)] rounded-[1.75rem] px-7 py-5 flex flex-col lg:flex-row items-start lg:items-center gap-5 transition-all cursor-pointer hover:border-indigo-100 hover:shadow-[0_8px_32px_rgba(79,70,229,0.08)]"
                  >
                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate mb-1.5">
                        {prog.name}
                      </h4>

                      {/* Badges row */}
                      <div className="flex flex-wrap items-center gap-1.5 mb-2">
                        {prog.komisi && (
                          <span className="inline-block text-[10px] font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-lg border border-indigo-100">
                            {prog.komisi}
                          </span>
                        )}
                        {prog.mitra && (
                          <span className="inline-block text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg">
                            {prog.mitra}
                          </span>
                        )}
                        {prog.tahun && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-lg border border-amber-100">
                            <Calendar className="h-2.5 w-2.5" />
                            {prog.tahun}
                          </span>
                        )}
                      </div>

                      {/* Location row */}
                      {prog.kabupatenPenerima.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                          {prog.kabupatenPenerima.map((k) => (
                            <span key={k} className="text-xs font-bold text-slate-700">{k}</span>
                          ))}
                        </div>
                      )}

                      {/* Progress bar */}
                      {pct !== null && (
                        <div className="mt-3 max-w-xs">
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "#6366f1" }}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Right side */}
                    <div className="flex items-center gap-4 shrink-0 lg:pl-4">
                      {/* Recipient pill */}
                      <div className="flex -space-x-2">
                        <RecipientPill count={prog.registeredCount} />
                      </div>

                      {/* Target label */}
                      {prog.totalKtpPenerima && (
                        <div className="text-right hidden lg:block">
                          <p className="text-[10px] font-bold text-slate-400 tracking-wider">Target</p>
                          <p className="text-sm font-extrabold text-slate-700">{prog.totalKtpPenerima.toLocaleString("id-ID")}</p>
                        </div>
                      )}

                      <div className="h-10 w-px bg-slate-100 hidden lg:block" />

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => openEdit(prog, e)}
                          title="Edit"
                          className="p-2.5 bg-slate-50 rounded-xl text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={(e) => deleteProgram(prog.id, e)}
                          title="Hapus"
                          className="p-2.5 bg-slate-50 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                        <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-indigo-400 transition-colors ml-1" />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
