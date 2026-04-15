import { useState, useEffect } from "react";
import Layout from "@/components/layout";
import { Gift, Plus, Trash2, Award, ChevronDown, ChevronUp, Package, Users } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Prize = {
  id: number;
  eventId: number;
  eventName: string;
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

type Event = {
  id: number;
  name: string;
};

export default function PrizesPage() {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [filterEventId, setFilterEventId] = useState<string>("");
  const [expandedPrize, setExpandedPrize] = useState<number | null>(null);
  const [distributions, setDistributions] = useState<Record<number, Distribution[]>>({});

  const [formData, setFormData] = useState({ eventId: "", name: "", description: "", quantity: "1" });
  const [distributeForm, setDistributeForm] = useState<{ prizeId: number; participantId: string; distributedBy: string; notes: string } | null>(null);

  const fetchPrizes = async () => {
    setLoading(true);
    try {
      const url = filterEventId
        ? `${BASE}/api/prizes?eventId=${filterEventId}`
        : `${BASE}/api/prizes`;
      const res = await fetch(url, { credentials: "include" });
      const data = await res.json();
      setPrizes(data);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const fetchEvents = async () => {
    try {
      const res = await fetch(`${BASE}/api/events`, { credentials: "include" });
      const data = await res.json();
      setEvents(data);
    } catch {}
  };

  useEffect(() => { fetchEvents(); fetchPrizes(); }, []);
  useEffect(() => { fetchPrizes(); }, [filterEventId]);

  const createPrize = async () => {
    if (!formData.eventId || !formData.name) return;
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
    } catch {}
  };

  const deletePrize = async (id: number) => {
    if (!confirm("Hapus hadiah ini?")) return;
    try {
      await fetch(`${BASE}/api/prizes/${id}`, { method: "DELETE", credentials: "include" });
      fetchPrizes();
    } catch {}
  };

  const loadDistributions = async (prizeId: number) => {
    if (expandedPrize === prizeId) {
      setExpandedPrize(null);
      return;
    }
    try {
      const res = await fetch(`${BASE}/api/prizes/${prizeId}/distributions`, { credentials: "include" });
      const data = await res.json();
      setDistributions((prev) => ({ ...prev, [prizeId]: data }));
      setExpandedPrize(prizeId);
    } catch {}
  };

  const distributePrize = async () => {
    if (!distributeForm) return;
    try {
      const res = await fetch(`${BASE}/api/prizes/${distributeForm.prizeId}/distribute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          participantId: parseInt(distributeForm.participantId),
          distributedBy: distributeForm.distributedBy,
          notes: distributeForm.notes,
        }),
      });
      if (res.ok) {
        setDistributeForm(null);
        fetchPrizes();
        loadDistributions(distributeForm.prizeId);
      }
    } catch {}
  };

  const totalPrizes = prizes.reduce((a, p) => a + p.quantity, 0);
  const totalDistributed = prizes.reduce((a, p) => a + p.distributedCount, 0);

  return (
    <Layout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
              <Gift className="h-6 w-6 text-purple-600" /> Monitoring Hadiah
            </h1>
            <p className="text-sm text-slate-500 mt-1">Kelola dan lacak distribusi hadiah per event</p>
          </div>
          <button onClick={() => setShowForm(true)} className="px-4 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700 flex items-center gap-2">
            <Plus className="h-4 w-4" /> Tambah Hadiah
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2.5 rounded-xl"><Package className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{prizes.length}</p>
                <p className="text-xs text-slate-500">Jenis Hadiah</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2.5 rounded-xl"><Gift className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalPrizes}</p>
                <p className="text-xs text-slate-500">Total Hadiah</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2.5 rounded-xl"><Award className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-2xl font-bold text-slate-800">{totalDistributed} <span className="text-sm font-normal text-slate-400">/ {totalPrizes}</span></p>
                <p className="text-xs text-slate-500">Didistribusikan</p>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4">
          <select
            value={filterEventId}
            onChange={(e) => setFilterEventId(e.target.value)}
            className="px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            <option value="">Semua Event</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>

        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowForm(false)}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800 mb-4">Tambah Hadiah</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Event</label>
                  <select value={formData.eventId} onChange={(e) => setFormData({ ...formData, eventId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm">
                    <option value="">Pilih Event</option>
                    {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Nama Hadiah</label>
                  <input type="text" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Contoh: Sepeda Motor" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Deskripsi</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Opsional" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Jumlah</label>
                  <input type="number" min="1" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">Batal</button>
                <button onClick={createPrize} className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-sm font-medium hover:bg-purple-700">Simpan</button>
              </div>
            </div>
          </div>
        )}

        {distributeForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDistributeForm(null)}>
            <div className="bg-white rounded-2xl p-6 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-bold text-slate-800 mb-4">Distribusikan Hadiah</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">ID Peserta</label>
                  <input type="text" value={distributeForm.participantId} onChange={(e) => setDistributeForm({ ...distributeForm, participantId: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="ID Peserta" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Didistribusikan Oleh</label>
                  <input type="text" value={distributeForm.distributedBy} onChange={(e) => setDistributeForm({ ...distributeForm, distributedBy: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Nama petugas" />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-500 block mb-1">Catatan</label>
                  <input type="text" value={distributeForm.notes} onChange={(e) => setDistributeForm({ ...distributeForm, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm" placeholder="Opsional" />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button onClick={() => setDistributeForm(null)} className="flex-1 py-2 border border-slate-200 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50">Batal</button>
                <button onClick={distributePrize} className="flex-1 py-2 bg-green-600 text-white rounded-xl text-sm font-medium hover:bg-green-700">Distribusikan</button>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-4">
          {loading ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center text-slate-400">Memuat...</div>
          ) : prizes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-8 text-center">
              <Gift className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <p className="text-slate-500">Belum ada hadiah</p>
            </div>
          ) : (
            prizes.map((prize) => {
              const pct = prize.quantity > 0 ? Math.round((prize.distributedCount / prize.quantity) * 100) : 0;
              const isExpanded = expandedPrize === prize.id;
              return (
                <div key={prize.id} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-slate-800">{prize.name}</h3>
                          <span className="text-xs px-2 py-0.5 bg-slate-100 rounded-full text-slate-600">{prize.eventName}</span>
                        </div>
                        {prize.description && <p className="text-sm text-slate-500">{prize.description}</p>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setDistributeForm({ prizeId: prize.id, participantId: "", distributedBy: "", notes: "" })}
                          disabled={prize.distributedCount >= prize.quantity}
                          className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 rounded-lg hover:bg-green-100 disabled:opacity-40">
                          <Award className="h-3.5 w-3.5 inline mr-1" />Berikan
                        </button>
                        <button onClick={() => deletePrize(prize.id)} className="p-1.5 text-slate-400 hover:text-red-500">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-slate-500">{prize.distributedCount} / {prize.quantity} didistribusikan</span>
                        <span className="font-medium text-slate-700">{pct}%</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "#8b5cf6" }} />
                      </div>
                    </div>
                    <button onClick={() => loadDistributions(prize.id)} className="mt-3 text-xs text-slate-500 flex items-center gap-1 hover:text-slate-700">
                      {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                      {isExpanded ? "Tutup" : "Lihat Penerima"}
                    </button>
                  </div>
                  {isExpanded && (
                    <div className="border-t border-slate-100 bg-slate-50 p-4">
                      {(distributions[prize.id] || []).length === 0 ? (
                        <p className="text-sm text-slate-400 text-center">Belum ada penerima</p>
                      ) : (
                        <div className="space-y-2">
                          {(distributions[prize.id] || []).map((d) => (
                            <div key={d.id} className="flex items-center justify-between bg-white rounded-lg p-3 text-sm">
                              <div>
                                <p className="font-medium text-slate-800">{d.participantName || "—"}</p>
                                <p className="text-xs text-slate-500">{d.participantNik}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-xs text-slate-500">{d.distributedBy || "—"}</p>
                                <p className="text-xs text-slate-400">{new Date(d.distributedAt).toLocaleDateString("id-ID")}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </Layout>
  );
}
