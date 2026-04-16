import { useState, useEffect, useCallback } from "react";
import Layout from "@/components/layout";
import { Gift, Plus, Trash2, Award, ChevronDown, ChevronUp, Package, Search, X, Users, Globe } from "lucide-react";

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
      <div className="max-w-5xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 transition shadow-sm shadow-purple-200">
            <Plus className="h-4 w-4" /> Tambah Hadiah
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { icon: <Package className="h-5 w-5 text-purple-600" />, bg: "bg-purple-100", val: prizes.length, label: "Jenis Hadiah" },
            { icon: <Gift className="h-5 w-5 text-blue-600" />, bg: "bg-blue-100", val: totalPrizes, label: "Total Hadiah" },
            { icon: <Award className="h-5 w-5 text-emerald-600" />, bg: "bg-emerald-100", val: `${totalDistributed}`, sub: `/ ${totalPrizes}`, label: "Didistribusikan" },
          ].map((s, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 p-4 shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
              <div className="flex items-center gap-3">
                <div className={`${s.bg} p-2.5 rounded-xl`}>{s.icon}</div>
                <div>
                  <p className="text-2xl font-bold text-slate-800">{s.val}{s.sub && <span className="text-sm font-normal text-slate-400"> {s.sub}</span>}</p>
                  <p className="text-xs text-slate-500">{s.label}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <select value={filterEventId} onChange={(e) => setFilterEventId(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 bg-white">
            <option value="">Semua Event</option>
            <option value="_standalone">Tanpa Event</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <span className="text-xs text-slate-400">{prizes.length} hadiah</span>
        </div>

        {/* List */}
        <div className="space-y-3">
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400 text-sm">Memuat...</div>
          ) : prizes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
              <Gift className="h-12 w-12 text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Belum ada hadiah</p>
            </div>
          ) : prizes.map((prize) => {
            const pct = prize.quantity > 0 ? Math.round((prize.distributedCount / prize.quantity) * 100) : 0;
            const isExpanded = expandedPrize === prize.id;
            const isFull = prize.distributedCount >= prize.quantity;
            return (
              <div key={prize.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-[0_1px_4px_rgba(0,0,0,0.05)]">
                <div className="p-4 sm:p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center flex-wrap gap-1.5 mb-0.5">
                        <span className="font-semibold text-slate-800">{prize.name}</span>
                        {prize.eventId ? (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full font-medium">
                            <Users className="h-2.5 w-2.5" />
                            {prize.eventName ?? "Event"}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full font-medium">
                            <Globe className="h-2.5 w-2.5" />
                            Langsung
                          </span>
                        )}
                        {isFull && (
                          <span className="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full font-medium">Habis</span>
                        )}
                      </div>
                      {prize.description && <p className="text-xs text-slate-400 mt-0.5">{prize.description}</p>}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openDistributeForm(prize)}
                        disabled={isFull}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-emerald-50 text-emerald-700 rounded-lg hover:bg-emerald-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                      >
                        <Award className="h-3.5 w-3.5" /> Berikan
                      </button>
                      <button onClick={() => deletePrize(prize.id)} className="p-1.5 text-slate-300 hover:text-red-500 transition">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-400">{prize.distributedCount} / {prize.quantity} didistribusikan</span>
                      <span className="font-bold text-slate-600">{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, background: isFull ? "#22c55e" : "#8b5cf6" }} />
                    </div>
                  </div>

                  <button onClick={() => loadDistributions(prize.id)}
                    className="mt-3 text-xs text-slate-400 flex items-center gap-1 hover:text-slate-600 transition">
                    {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {isExpanded ? "Tutup penerima" : "Lihat penerima"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/60 p-4">
                    {(distributions[prize.id] ?? []).length === 0 ? (
                      <p className="text-xs text-slate-400 text-center py-3">Belum ada penerima</p>
                    ) : (
                      <div className="space-y-2">
                        {(distributions[prize.id] ?? []).map((d) => (
                          <div key={d.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 text-sm shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500/20 bg-white">
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  placeholder="Cth: Sepeda Motor, Voucher 500K..." />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Deskripsi</label>
                <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20"
                  placeholder="Opsional" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-500 block mb-1">Jumlah</label>
                <input type="number" min="1" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20" />
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Batal</button>
              <button onClick={createPrize} disabled={!formData.name.trim()}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 transition">Simpan</button>
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
              {/* Source toggle — only show if prize has event */}
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

              {/* Search bar */}
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

              {/* Selected participant */}
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

              {/* Search results */}
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

              {/* Extra fields */}
              <div className="space-y-3 pt-1 border-t border-slate-100">
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Diserahkan Oleh</label>
                  <input type="text" value={distributeState.distributedBy}
                    onChange={(e) => setDistributeState((prev) => prev ? { ...prev, distributedBy: e.target.value } : null)}
                    placeholder="Nama petugas..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-500 block mb-1">Catatan</label>
                  <input type="text" value={distributeState.notes}
                    onChange={(e) => setDistributeState((prev) => prev ? { ...prev, notes: e.target.value } : null)}
                    placeholder="Opsional..."
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20" />
                </div>
              </div>

              {distributeError && (
                <p className="text-xs text-red-600 bg-red-50 rounded-xl px-3 py-2">{distributeError}</p>
              )}
            </div>

            <div className="px-5 pb-5 flex gap-2 border-t border-slate-100 pt-4">
              <button onClick={() => setDistributeState(null)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 transition">Batal</button>
              <button onClick={distributePrize} disabled={!distributeState.selectedParticipant}
                className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition">
                Berikan Hadiah
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
