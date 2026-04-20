import { useState, useCallback } from "react";
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import {
  ClipboardList, Plus, Trash2, ChevronRight, Users, Calendar,
  MapPin, Search, X, FileText,
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

export default function ProgramsPage() {
  const [, navigate] = useLocation();
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
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

  const createProgram = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${BASE}/api/programs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          ...formData,
          totalKtpPenerima: formData.totalKtpPenerima ? parseInt(formData.totalKtpPenerima) : null,
        }),
      });
      if (res.ok) {
        setShowForm(false);
        setFormData(emptyForm);
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
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
            <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
              <ClipboardList className="h-5 w-5 text-blue-600" />
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

        {/* ── Header + Search ── */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari program..."
              className="w-full pl-9 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-300"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full transition">
                <X size={12} className="text-slate-400" />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm shadow-blue-200 shrink-0"
          >
            <Plus className="h-4 w-4" />
            Tambah
          </button>
        </div>

        {/* ── Add Program Form ── */}
        {showForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-y-auto max-h-[90vh]">
              <div className="px-6 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-[15px] font-extrabold text-slate-900">Tambah Program Baru</h2>
                <button onClick={() => { setShowForm(false); setFormData(emptyForm); }} className="p-1.5 rounded-xl hover:bg-slate-100 transition">
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
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
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
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">Tahun</label>
                    <input
                      type="text"
                      value={formData.tahun}
                      onChange={(e) => setFormData({ ...formData, tahun: e.target.value })}
                      placeholder="Cth: 2025"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
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
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
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
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
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
                              ? "bg-blue-600 text-white border-blue-600 shadow-sm shadow-blue-200"
                              : "bg-white text-slate-600 border-slate-200 hover:border-blue-300 hover:text-blue-600"
                          }`}
                        >
                          {k}
                        </button>
                      );
                    })}
                  </div>
                  {formData.kabupatenPenerima.length > 0 && (
                    <p className="text-[11px] text-blue-600 font-medium mt-1.5">
                      {formData.kabupatenPenerima.length} kabupaten dipilih
                    </p>
                  )}
                </div>
              </div>
              <div className="px-6 pb-6 flex gap-3">
                <button
                  onClick={() => { setShowForm(false); setFormData(emptyForm); }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-600 hover:bg-slate-50 transition"
                >
                  Batal
                </button>
                <button
                  onClick={createProgram}
                  disabled={!formData.name.trim() || saving}
                  className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm shadow-blue-200"
                >
                  {saving ? "Menyimpan..." : "Simpan Program"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── Program List ── */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-100 p-5 animate-pulse">
                <div className="h-4 bg-slate-100 rounded-lg w-1/2 mb-3" />
                <div className="h-3 bg-slate-100 rounded-lg w-1/3 mb-4" />
                <div className="h-2 bg-slate-100 rounded-full" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-16 text-center">
            <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <ClipboardList className="h-7 w-7 text-slate-300" />
            </div>
            <p className="text-slate-500 font-bold mb-1">{search ? "Program tidak ditemukan" : "Belum ada program"}</p>
            <p className="text-slate-400 text-sm mb-5">{search ? "Coba kata kunci lain" : "Buat program pertama untuk memulai"}</p>
            {!search && (
              <button
                onClick={() => setShowForm(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition"
              >
                <Plus className="h-4 w-4" /> Buat Program
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((prog) => {
              const pct = prog.totalKtpPenerima && prog.totalKtpPenerima > 0
                ? Math.min(100, Math.round((prog.registeredCount / prog.totalKtpPenerima) * 100))
                : null;
              return (
                <div
                  key={prog.id}
                  onClick={() => navigate(`/programs/${prog.id}`)}
                  className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] hover:border-blue-200 hover:shadow-md transition-all duration-200 cursor-pointer group"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center shrink-0 group-hover:bg-blue-100 transition-colors">
                      <ClipboardList className="h-5 w-5 text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-extrabold text-slate-900 text-[15px] leading-snug">{prog.name}</h3>
                          <div className="flex flex-wrap items-center gap-2 mt-1.5">
                            {prog.komisi && (
                              <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100">{prog.komisi}</span>
                            )}
                            {prog.mitra && (
                              <span className="text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{prog.mitra}</span>
                            )}
                            {prog.tahun && (
                              <span className="text-[10px] font-bold bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full border border-amber-100 flex items-center gap-0.5">
                                <Calendar className="h-2.5 w-2.5" />{prog.tahun}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={(e) => deleteProgram(prog.id, e)}
                            className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                          <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
                        </div>
                      </div>

                      {prog.kabupatenPenerima.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          {prog.kabupatenPenerima.map((k) => (
                            <span key={k} className="text-[10px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{k}</span>
                          ))}
                        </div>
                      )}

                      <div className="mt-3">
                        <div className="flex items-baseline justify-between mb-1.5">
                          <span className="text-[10px] font-bold text-slate-400 tracking-wide">Penerima KTP</span>
                          <div className="flex items-baseline gap-1">
                            <span className="text-[17px] font-extrabold text-slate-900 leading-none">{prog.registeredCount.toLocaleString("id-ID")}</span>
                            {prog.totalKtpPenerima && (
                              <span className="text-[11px] text-slate-400">/ {prog.totalKtpPenerima.toLocaleString("id-ID")}</span>
                            )}
                          </div>
                        </div>
                        {pct !== null && (
                          <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "#3b82f6" }}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
