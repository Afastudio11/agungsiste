import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/layout";
import { Gift, Plus, Trash2, Award, ChevronDown, ChevronUp, Package, Search, X, Users, Globe, Calendar, MapPin } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Prize = {
  id: number;
  eventId: number | null;
  eventName: string | null;
  name: string;
  description: string | null;
  quantity: number;
  distributedCount: number;
};

type Distribution = {
  id: number;
  participantName: string;
  participantNik: string;
  distributedBy: string | null;
  distributedAt: string;
  notes: string | null;
};

type Event = { id: number; name: string };

type ParticipantResult = {
  id: number;
  nik: string;
  fullName: string;
  city: string | null;
  province: string | null;
};

type AllDistribution = {
  id: number;
  distributedAt: string;
  distributedBy: string | null;
  notes: string | null;
  participantName: string;
  participantNik: string;
  kabupaten: string | null;
  kecamatan: string | null;
  kelurahan: string | null;
  prizeName: string;
  prizeId: number;
  eventName: string | null;
};

const KABUPATEN_LIST = ["Pacitan", "Trenggalek", "Magetan", "Ponorogo", "Ngawi"];

type DistributeState = {
  prizeId: number;
  prizeName: string;
  prizeEventId: number | null;
  selectedParticipant: ParticipantResult | null;
  distributedBy: string;
  notes: string;
  source: "event" | "all";
  searchQ: string;
  searchResults: ParticipantResult[];
  searching: boolean;
};

export default function PrizesPage() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterEventId, setFilterEventId] = useState<string>("");
  const [expandedPrize, setExpandedPrize] = useState<number | null>(null);
  const [distributions, setDistributions] = useState<Record<number, Distribution[]>>({});
  const [distributeState, setDistributeState] = useState<DistributeState | null>(null);
  const [distributeError, setDistributeError] = useState("");

  const [formData, setFormData] = useState({ eventId: "", name: "", description: "", quantity: "1" });

  const [distStartDate, setDistStartDate] = useState("");
  const [distEndDate, setDistEndDate] = useState("");
  const [distKabupaten, setDistKabupaten] = useState("");
  const [allDistributions, setAllDistributions] = useState<AllDistribution[]>([]);
  const [allDistLoading, setAllDistLoading] = useState(false);

  const fetchAllDistributions = useCallback(async () => {
    setAllDistLoading(true);
    try {
      const params = new URLSearchParams();
      if (distStartDate) params.set("startDate", distStartDate);
      if (distEndDate) params.set("endDate", distEndDate);
      if (distKabupaten) params.set("kabupaten", distKabupaten);
      const res = await fetch(`${BASE}/api/prizes/all-distributions?${params}`, { credentials: "include" });
      setAllDistributions(await res.json());
    } catch { } finally { setAllDistLoading(false); }
  }, [distStartDate, distEndDate, distKabupaten]);

  const fetchPrizes = useCallback(async () => {
    setLoading(true);
    try {
      const url = filterEventId ? `${BASE}/api/prizes?eventId=${filterEventId}` : `${BASE}/api/prizes`;
      const res = await fetch(url, { credentials: "include" });
      setPrizes(await res.json());
    } catch { } finally { setLoading(false); }
  }, [filterEventId]);

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${BASE}/api/events`, { credentials: "include" });
      setEvents(await res.json());
    } catch { }
  };

  useEffect(() => { fetchEvents(); }, []);
  useEffect(() => { fetchPrizes(); }, [fetchPrizes]);
  useEffect(() => { fetchAllDistributions(); }, [fetchAllDistributions]);

  const createPrize = async () => {
    if (!formData.name.trim()) return;
    try {
      await fetch(`${BASE}/api/prizes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(formData),
      });
      setShowForm(false);
      setFormData({ eventId: "", name: "", description: "", quantity: "1" });
      fetchPrizes();
    } catch { }
  };

  const deletePrize = async (id: number) => {
    if (!confirm("Hapus hadiah ini?")) return;
    try {
      await fetch(`${BASE}/api/prizes/${id}`, { method: "DELETE", credentials: "include" });
      fetchPrizes();
    } catch { }
  };

  const loadDistributions = async (prizeId: number) => {
    if (expandedPrize === prizeId) { setExpandedPrize(null); return; }
    try {
      const res = await fetch(`${BASE}/api/prizes/${prizeId}/distributions`, { credentials: "include" });
      const data = await res.json();
      setDistributions((prev) => ({ ...prev, [prizeId]: data }));
      setExpandedPrize(prizeId);
    } catch { }
  };

  const openDistributeForm = (prize: Prize) => {
    const source: "event" | "all" = prize.eventId ? "event" : "all";
    setDistributeState({
      prizeId: prize.id,
      prizeName: prize.name,
      prizeEventId: prize.eventId,
      selectedParticipant: null,
      distributedBy: "",
      notes: "",
      source,
      searchQ: "",
      searchResults: [],
      searching: false,
    });
    setDistributeError("");
  };

  const searchParticipants = useCallback(
    async (state: DistributeState, q: string, source: "event" | "all") => {
      if (!state) return;
      setDistributeState((prev) => prev ? { ...prev, searching: true, searchQ: q, source } : null);
      try {
        const params = new URLSearchParams({ q, source });
        const res = await fetch(`${BASE}/api/prizes/${state.prizeId}/participant-search?${params}`, { credentials: "include" });
        const data = await res.json();
        setDistributeState((prev) => prev ? { ...prev, searchResults: data.results ?? [], searching: false } : null);
      } catch {
        setDistributeState((prev) => prev ? { ...prev, searching: false } : null);
      }
    },
    []
  );

  const distributePrize = async () => {
    if (!distributeState?.selectedParticipant) { setDistributeError("Pilih peserta terlebih dahulu"); return; }
    setDistributeError("");
    try {
      const res = await fetch(`${BASE}/api/prizes/${distributeState.prizeId}/distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          participantId: distributeState.selectedParticipant.id,
          distributedBy: distributeState.distributedBy || null,
          notes: distributeState.notes || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setDistributeError(data.error ?? "Gagal mendistribusikan"); return; }
      setDistributeState(null);
      fetchPrizes();
      if (expandedPrize === distributeState.prizeId) loadDistributions(distributeState.prizeId);
    } catch { setDistributeError("Terjadi kesalahan"); }
  };

  const totalPrizes = prizes.reduce((a, p) => a + p.quantity, 0);
  const totalDistributed = prizes.reduce((a, p) => a + p.distributedCount, 0);

  return (
    <Layout>
      <div className="p-4 md:p-6 max-w-5xl space-y-6">

        {/* ── Summary Stats ── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
            <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
              <Package className="h-5 w-5 text-blue-600" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Jenis Hadiah</p>
            <p className="text-3xl font-extrabold text-slate-900">{prizes.length}</p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
            <div className="w-11 h-11 bg-sky-50 rounded-xl flex items-center justify-center mb-3">
              <Gift className="h-5 w-5 text-sky-500" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Total Hadiah</p>
            <div className="flex items-baseline gap-1 justify-center">
              <p className="text-3xl font-extrabold text-slate-900">{totalPrizes}</p>
              <span className="text-sm text-slate-400 font-medium">unit</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-[0_1px_4px_rgba(0,0,0,0.05)] flex flex-col items-center text-center">
            <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
              <Award className="h-5 w-5 text-emerald-500" />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Didistribusikan</p>
            <div className="flex items-baseline gap-1.5 justify-center">
              <p className="text-3xl font-extrabold text-slate-900">{totalDistributed}</p>
              <span className="text-slate-300 font-medium text-base">/ {totalPrizes}</span>
            </div>
          </div>
        </div>

        {/* ── List Section ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="text-base font-bold text-slate-800">Daftar Inventaris</h4>
            <div className="flex items-center gap-2">
              <select
                value={filterEventId}
                onChange={(e) => setFilterEventId(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              >
                <option value="">Semua Event</option>
                <option value="_standalone">Tanpa Event</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <span className="text-xs text-slate-400">{prizes.length} item</span>
            </div>
          </div>

          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-10 text-center text-slate-400 text-sm">Memuat...</div>
          ) : prizes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-14 text-center">
              <Gift className="h-12 w-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Belum ada hadiah</p>
            </div>
          ) : (
            <div className="space-y-3">
              {prizes.map((prize) => {
                const pct = prize.quantity > 0 ? Math.round((prize.distributedCount / prize.quantity) * 100) : 0;
                const isExpanded = expandedPrize === prize.id;
                const isFull = prize.distributedCount >= prize.quantity;

                return (
                  <div key={prize.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)] hover:border-blue-100 hover:shadow-md transition-all duration-200">
                    <div className="p-4 sm:p-5">
                      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-4 items-center">

                        {/* Name + event badge */}
                        <div className="min-w-0">
                          <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                            <span className="font-bold text-slate-800 text-[15px]">{prize.name}</span>
                            {isFull && (
                              <span className="text-[10px] px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-bold">Habis</span>
                            )}
                          </div>
                          {prize.eventId ? (
                            <div className="flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                              <Users className="h-3 w-3 text-blue-400" />
                              {prize.eventName ?? "Event"}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                              <Globe className="h-3 w-3" />
                              Langsung
                            </div>
                          )}
                          {prize.description && (
                            <p className="text-[11px] text-slate-400 mt-0.5">{prize.description}</p>
                          )}
                        </div>

                        {/* Progress bar */}
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-tight text-slate-400 mb-1.5">Status Distribusi</p>
                          <div className="flex items-center gap-3">
                            <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-500"
                                style={{ width: `${pct}%`, background: isFull ? "#22c55e" : "#3b82f6" }}
                              />
                            </div>
                            <span className="text-xs font-bold text-slate-700 shrink-0">
                              {prize.distributedCount}/{prize.quantity}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => loadDistributions(prize.id)}
                            className="px-3.5 py-2 bg-slate-50 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100 transition-colors border border-slate-100 flex items-center gap-1"
                          >
                            {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            Riwayat
                          </button>
                          <button
                            onClick={() => openDistributeForm(prize)}
                            disabled={isFull}
                            className="px-3.5 py-2 bg-blue-600 text-white rounded-xl text-xs font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shadow-sm flex items-center gap-1"
                          >
                            <Award className="h-3.5 w-3.5" /> Kirim
                          </button>
                          <button
                            onClick={() => deletePrize(prize.id)}
                            className="p-2 text-slate-300 hover:text-red-500 transition rounded-xl hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Distributions expanded */}
                    {isExpanded && (
                      <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                        {(distributions[prize.id] ?? []).length === 0 ? (
                          <p className="text-xs text-slate-400 text-center py-3">Belum ada penerima</p>
                        ) : (
                          <div className="space-y-2">
                            {(distributions[prize.id] ?? []).map((d) => (
                              <div key={d.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
                                <div>
                                  <p className="font-semibold text-slate-800 text-[13px]">{d.participantName || "—"}</p>
                                  <p className="text-xs text-slate-400 font-mono">{d.participantNik}</p>
                                </div>
                                <div className="text-right">
                                  <p className="text-xs text-slate-500">{d.distributedBy || "—"}</p>
                                  <p className="text-xs text-slate-400">{new Date(d.distributedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })}</p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add new dashed button */}
              <button
                onClick={() => setShowForm(true)}
                className="w-full border border-dashed border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-2 text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
              >
                <Plus className="h-4 w-4 group-hover:scale-110 transition-transform" />
                <span className="text-sm font-bold">Tambah Hadiah Baru</span>
              </button>
            </div>
          )}

          {/* If empty, still show add button */}
          {!loading && prizes.length === 0 && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full border border-dashed border-slate-200 rounded-2xl p-4 flex items-center justify-center gap-2 text-slate-400 hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50/30 transition-all group"
            >
              <Plus className="h-4 w-4 group-hover:scale-110 transition-transform" />
              <span className="text-sm font-bold">Tambah Hadiah Baru</span>
            </button>
          )}
        </div>

        {/* ── Riwayat Distribusi ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h4 className="text-base font-bold text-slate-800">Riwayat Distribusi</h4>
            <span className="text-xs text-slate-400">{allDistributions.length} data</span>
          </div>

          {/* Filter bar */}
          <div className="bg-white rounded-2xl border border-slate-100 p-4 flex flex-wrap gap-3 items-end">
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <Calendar className="h-3 w-3" /> Tanggal Dari
              </label>
              <input
                type="date"
                value={distStartDate}
                onChange={(e) => setDistStartDate(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Sampai</label>
              <input
                type="date"
                value={distEndDate}
                onChange={(e) => setDistEndDate(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Daerah
              </label>
              <select
                value={distKabupaten}
                onChange={(e) => setDistKabupaten(e.target.value)}
                className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white"
              >
                <option value="">Semua Kabupaten</option>
                {KABUPATEN_LIST.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </div>
            {(distStartDate || distEndDate || distKabupaten) && (
              <button
                onClick={() => { setDistStartDate(""); setDistEndDate(""); setDistKabupaten(""); }}
                className="flex items-center gap-1 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl hover:bg-slate-50 transition"
              >
                <X className="h-3 w-3" /> Reset
              </button>
            )}
          </div>

          {/* Distribution table */}
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
            {allDistLoading ? (
              <div className="p-10 text-center text-slate-400 text-sm">Memuat data...</div>
            ) : allDistributions.length === 0 ? (
              <div className="p-12 text-center">
                <Gift className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Belum ada distribusi{distKabupaten || distStartDate ? " sesuai filter" : ""}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                      <th className="px-4 py-3 text-left">Penerima</th>
                      <th className="px-4 py-3 text-left">Hadiah</th>
                      <th className="px-4 py-3 text-left hidden md:table-cell">Daerah</th>
                      <th className="px-4 py-3 text-left hidden sm:table-cell">Petugas</th>
                      <th className="px-4 py-3 text-right">Tanggal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {allDistributions.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/60 transition">
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-slate-800">{d.participantName}</p>
                          <p className="text-xs text-slate-400 font-mono">{d.participantNik}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-700 font-medium">{d.prizeName}</p>
                          {d.eventName && <p className="text-xs text-slate-400">{d.eventName}</p>}
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell">
                          <p className="text-xs text-slate-600">{d.kabupaten ?? "-"}</p>
                          {d.kecamatan && <p className="text-xs text-slate-400">{d.kecamatan}</p>}
                        </td>
                        <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-500">{d.distributedBy ?? "-"}</td>
                        <td className="px-4 py-3 text-right text-xs text-slate-500">
                          {new Date(d.distributedAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Create Prize Modal ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-800">Tambah Hadiah</h3>
              <button onClick={() => setShowForm(false)} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Event <span className="font-normal text-slate-400">(opsional)</span></label>
                <select value={formData.eventId} onChange={(e) => setFormData({ ...formData, eventId: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 bg-white">
                  <option value="">— Tanpa Event (langsung) —</option>
                  {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
                {!formData.eventId && (
                  <p className="text-[11px] text-slate-400 mt-1">Hadiah bisa diberikan ke siapa saja tanpa batasan event</p>
                )}
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Nama Hadiah *</label>
                <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Cth: Sepeda Motor, Voucher 500K..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Deskripsi</label>
                <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                  placeholder="Opsional" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Jumlah</label>
                <input type="number" min="1" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Batal</button>
              <button onClick={createPrize} disabled={!formData.name.trim()}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">Simpan</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Distribute Modal ── */}
      {distributeState && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDistributeState(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-800">Berikan Hadiah</h3>
                <p className="text-xs text-slate-400 mt-0.5">{distributeState.prizeName}</p>
              </div>
              <button onClick={() => setDistributeState(null)} className="p-1.5 hover:bg-slate-100 rounded-lg transition">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {distributeState.prizeEventId && (
                <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
                  <button
                    onClick={() => { searchParticipants(distributeState, distributeState.searchQ, "event"); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${distributeState.source === "event" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500"}`}
                  >
                    <Users className="h-3.5 w-3.5" /> Peserta Event
                  </button>
                  <button
                    onClick={() => { searchParticipants(distributeState, distributeState.searchQ, "all"); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition ${distributeState.source === "all" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500"}`}
                  >
                    <Globe className="h-3.5 w-3.5" /> Semua Peserta
                  </button>
                </div>
              )}

              <div>
                <div className="flex items-center gap-2 bg-slate-100 rounded-xl px-3 py-2.5">
                  <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Cari nama atau NIK..."
                    value={distributeState.searchQ}
                    onChange={(e) => searchParticipants(distributeState, e.target.value, distributeState.source)}
                    className="flex-1 bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                    autoFocus
                  />
                  {distributeState.searchQ && (
                    <button onClick={() => searchParticipants(distributeState, "", distributeState.source)}>
                      <X className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>

              {distributeState.selectedParticipant && (
                <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5">
                  <div className="h-8 w-8 rounded-full bg-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                    {distributeState.selectedParticipant.fullName[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-emerald-800 text-sm truncate">{distributeState.selectedParticipant.fullName}</p>
                    <p className="text-xs text-emerald-600 font-mono">{distributeState.selectedParticipant.nik}</p>
                  </div>
                  <button onClick={() => setDistributeState((prev) => prev ? { ...prev, selectedParticipant: null } : null)}
                    className="p-1 text-emerald-400 hover:text-emerald-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {distributeState.searchResults.length > 0 && !distributeState.selectedParticipant && (
                <div className="border border-slate-100 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                  {distributeState.searchResults.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setDistributeState((prev) => prev ? { ...prev, selectedParticipant: p, searchResults: [] } : null)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 transition text-left border-b border-slate-50 last:border-0"
                    >
                      <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold text-sm shrink-0">
                        {p.fullName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 text-sm truncate">{p.fullName}</p>
                        <p className="text-xs text-slate-400 font-mono">{p.nik}{p.city ? ` · ${p.city}` : ""}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {distributeState.searching && (
                <p className="text-xs text-slate-400 text-center py-2">Mencari...</p>
              )}

              <div className="space-y-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Diserahkan Oleh</label>
                  <input type="text" value={distributeState.distributedBy}
                    onChange={(e) => setDistributeState((prev) => prev ? { ...prev, distributedBy: e.target.value } : null)}
                    placeholder="Nama petugas..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Catatan</label>
                  <input type="text" value={distributeState.notes}
                    onChange={(e) => setDistributeState((prev) => prev ? { ...prev, notes: e.target.value } : null)}
                    placeholder="Opsional..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
              </div>

              {distributeError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{distributeError}</p>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4">
              <button onClick={() => setDistributeState(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Batal</button>
              <button onClick={distributePrize} disabled={!distributeState.selectedParticipant}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition">
                Berikan Hadiah
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
