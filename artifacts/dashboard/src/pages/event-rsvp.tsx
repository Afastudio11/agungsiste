import { useState, useRef, useCallback } from "react";
import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import { useGetEvent, getGetEventQueryKey } from "@workspace/api-client-react";
import {
  ChevronLeft, Upload, UserPlus, Trash2, Download, Search,
  CheckCircle2, XCircle, AlertCircle, FileSpreadsheet, Users
} from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface RsvpParticipant {
  nik: string;
  fullName: string;
  gender?: string;
  city?: string;
  phone?: string;
  email?: string;
  notes?: string;
  registeredAt: string;
}

interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

function parseCSV(text: string): { nik: string; fullName: string; phone?: string; email?: string; notes?: string }[] {
  const lines = text.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].toLowerCase().split(",").map((h) => h.replace(/^"|"$/g, "").trim());
  const nikIdx = header.findIndex((h) => h.includes("nik"));
  const nameIdx = header.findIndex((h) => h.includes("nama") || h.includes("name"));
  const phoneIdx = header.findIndex((h) => h.includes("phone") || h.includes("hp") || h.includes("telp"));
  const emailIdx = header.findIndex((h) => h.includes("email"));
  const notesIdx = header.findIndex((h) => h.includes("note") || h.includes("catatan"));

  if (nikIdx < 0 || nameIdx < 0) return [];

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    return {
      nik: cols[nikIdx] ?? "",
      fullName: cols[nameIdx] ?? "",
      phone: phoneIdx >= 0 ? cols[phoneIdx] : undefined,
      email: emailIdx >= 0 ? cols[emailIdx] : undefined,
      notes: notesIdx >= 0 ? cols[notesIdx] : undefined,
    };
  }).filter((r) => r.nik && r.fullName);
}

function downloadTemplate() {
  const csv = "NIK,Nama,Phone,Email,Catatan\n3201234567890001,Budi Santoso,08123456789,budi@email.com,VIP";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "template_rsvp.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function exportExcelRsvp(list: RsvpParticipant[], eventName: string) {
  import("@/lib/exportUtils").then(({ exportExcel }) => {
    const headers = ["NIK", "Nama", "Kelamin", "Kota", "Phone", "Email", "Catatan", "Terdaftar"];
    const rows = [headers, ...list.map((p) => [
      p.nik, p.fullName, p.gender ?? "", p.city ?? "",
      p.phone ?? "", p.email ?? "", p.notes ?? "",
      new Date(p.registeredAt).toLocaleString("id-ID"),
    ])];
    exportExcel(rows, `rsvp_${eventName.replace(/\s+/g, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
  });
}

export default function EventRsvpPage() {
  const params = useParams();
  const id = parseInt(params.id as string);

  const { data: event } = useGetEvent(id, {
    query: { enabled: !!id, queryKey: getGetEventQueryKey(id) },
  });

  const [list, setList] = useState<RsvpParticipant[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [listLoaded, setListLoaded] = useState(false);
  const [search, setSearch] = useState("");

  // Manual add state
  const [showManual, setShowManual] = useState(false);
  const [manualNik, setManualNik] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualPhone, setManualPhone] = useState("");
  const [manualEmail, setManualEmail] = useState("");
  const [manualNotes, setManualNotes] = useState("");
  const [addingManual, setAddingManual] = useState(false);

  // Import state
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [previewRows, setPreviewRows] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const fetchList = useCallback(async () => {
    setLoadingList(true);
    try {
      const r = await fetch(`${BASE}/api/events/${id}/rsvp`, { credentials: "include" });
      if (r.ok) {
        setList(await r.json());
        setListLoaded(true);
      }
    } finally {
      setLoadingList(false);
    }
  }, [id]);

  // Load on mount
  useState(() => { fetchList(); });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setPreviewRows(rows);
      setShowPreview(true);
      setImportResult(null);
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleImport = async () => {
    if (!previewRows.length) return;
    setImporting(true);
    setImportResult(null);
    try {
      const r = await fetch(`${BASE}/api/events/${id}/rsvp/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ participants: previewRows }),
      });
      const data = await r.json();
      setImportResult(data);
      setShowPreview(false);
      setPreviewRows([]);
      fetchList();
    } finally {
      setImporting(false);
    }
  };

  const handleManualAdd = async () => {
    if (!manualNik.trim() || !manualName.trim()) return;
    setAddingManual(true);
    try {
      const r = await fetch(`${BASE}/api/events/${id}/rsvp/import`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          participants: [{
            nik: manualNik.trim(),
            fullName: manualName.trim(),
            phone: manualPhone.trim() || undefined,
            email: manualEmail.trim() || undefined,
            notes: manualNotes.trim() || undefined,
          }],
        }),
      });
      if (r.ok) {
        setManualNik(""); setManualName(""); setManualPhone("");
        setManualEmail(""); setManualNotes("");
        setShowManual(false);
        fetchList();
      }
    } finally {
      setAddingManual(false);
    }
  };

  const handleDelete = async (nik: string) => {
    if (!confirm("Hapus peserta RSVP ini?")) return;
    await fetch(`${BASE}/api/events/${id}/rsvp/${encodeURIComponent(nik)}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchList();
  };

  const filtered = list.filter((p) =>
    !search ||
    p.fullName.toLowerCase().includes(search.toLowerCase()) ||
    p.nik.includes(search)
  );

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href={`/events/${id}`}>
            <button className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
              <ChevronLeft size={18} className="text-slate-500" />
            </button>
          </Link>
          <div>
            <div className="text-xs text-slate-400 font-medium">Manajemen RSVP</div>
            <h1 className="text-xl font-bold text-slate-800">{event?.name ?? "Memuat..."}</h1>
          </div>
        </div>

        {/* Stats bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <Users size={18} className="text-blue-600" />
            </div>
            <div>
              <div className="text-xs text-slate-400">Total RSVP</div>
              <div className="text-2xl font-bold text-slate-800">{list.length}</div>
            </div>
          </div>
          {event?.targetParticipants && (
            <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
                <CheckCircle2 size={18} className="text-green-600" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Kapasitas</div>
                <div className="text-2xl font-bold text-slate-800">{event.targetParticipants}</div>
              </div>
            </div>
          )}
          {event?.targetParticipants && (
            <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-orange-50 flex items-center justify-center">
                <AlertCircle size={18} className="text-orange-500" />
              </div>
              <div>
                <div className="text-xs text-slate-400">Sisa Slot</div>
                <div className="text-2xl font-bold text-slate-800">
                  {Math.max(0, event.targetParticipants - list.length)}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Import result */}
        {importResult && (
          <div className={`rounded-2xl border px-5 py-4 flex items-start gap-3 ${importResult.skipped > 0 ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"}`}>
            {importResult.skipped > 0
              ? <AlertCircle size={18} className="text-amber-500 mt-0.5 shrink-0" />
              : <CheckCircle2 size={18} className="text-green-600 mt-0.5 shrink-0" />
            }
            <div className="text-sm">
              <div className="font-semibold text-slate-700">
                Import selesai: <span className="text-green-700">{importResult.inserted} berhasil</span>
                {importResult.skipped > 0 && <span className="text-amber-600">, {importResult.skipped} dilewati</span>}
              </div>
              {importResult.errors.slice(0, 3).map((e, i) => (
                <div key={i} className="text-xs text-red-600 mt-1">{e}</div>
              ))}
            </div>
            <button onClick={() => setImportResult(null)} className="ml-auto text-slate-400 hover:text-slate-600">
              <XCircle size={16} />
            </button>
          </div>
        )}

        {/* Toolbar */}
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4">
          <div className="flex flex-wrap gap-3 items-center justify-between">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari NIK / nama..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 w-56"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={downloadTemplate}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <FileSpreadsheet size={15} />
                Template CSV
              </button>
              <button
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100 transition-colors"
              >
                <Upload size={15} />
                Import CSV
              </button>
              <input type="file" ref={fileRef} accept=".csv" className="hidden" onChange={handleFileChange} />
              <button
                onClick={() => setShowManual(true)}
                className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                <UserPlus size={15} />
                Tambah Manual
              </button>
              {list.length > 0 && (
                <button
                  onClick={() => exportExcelRsvp(list, event?.name ?? "event")}
                  className="flex items-center gap-1.5 text-sm px-3 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  <Download size={15} />
                  Export
                </button>
              )}
            </div>
          </div>
        </div>

        {/* CSV Preview modal */}
        {showPreview && previewRows.length > 0 && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-800">Preview Import CSV</h2>
                  <div className="text-xs text-slate-400 mt-0.5">{previewRows.length} peserta ditemukan</div>
                </div>
                <button onClick={() => { setShowPreview(false); setPreviewRows([]); }}
                  className="p-2 rounded-xl hover:bg-slate-100"><XCircle size={18} className="text-slate-400" /></button>
              </div>
              <div className="overflow-auto flex-1 p-4">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">#</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">NIK</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Nama</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Phone</th>
                      <th className="px-3 py-2 text-left font-semibold text-slate-500">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r, i) => (
                      <tr key={i} className="border-t border-slate-100">
                        <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-slate-700">{r.nik}</td>
                        <td className="px-3 py-2 text-slate-800">{r.fullName}</td>
                        <td className="px-3 py-2 text-slate-500">{r.phone ?? "-"}</td>
                        <td className="px-3 py-2 text-slate-500">{r.email ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                <button onClick={() => { setShowPreview(false); setPreviewRows([]); }}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
                  Batal
                </button>
                <button onClick={handleImport} disabled={importing}
                  className="px-5 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {importing && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  Import {previewRows.length} Peserta
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Manual add modal */}
        {showManual && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-base font-bold text-slate-800">Tambah Peserta RSVP</h2>
                <button onClick={() => setShowManual(false)}
                  className="p-2 rounded-xl hover:bg-slate-100"><XCircle size={18} className="text-slate-400" /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">NIK <span className="text-red-500">*</span></label>
                  <input type="text" value={manualNik} onChange={(e) => setManualNik(e.target.value)}
                    placeholder="16 digit NIK"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Nama Lengkap <span className="text-red-500">*</span></label>
                  <input type="text" value={manualName} onChange={(e) => setManualName(e.target.value)}
                    placeholder="Nama sesuai KTP"
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">No. HP</label>
                    <input type="text" value={manualPhone} onChange={(e) => setManualPhone(e.target.value)}
                      placeholder="08..."
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1.5">Email</label>
                    <input type="email" value={manualEmail} onChange={(e) => setManualEmail(e.target.value)}
                      placeholder="email@..."
                      className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">Catatan</label>
                  <input type="text" value={manualNotes} onChange={(e) => setManualNotes(e.target.value)}
                    placeholder="VIP, undangan khusus, dll."
                    className="w-full px-3 py-2.5 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
                <button onClick={() => setShowManual(false)}
                  className="px-4 py-2 text-sm rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50">
                  Batal
                </button>
                <button onClick={handleManualAdd} disabled={!manualNik.trim() || !manualName.trim() || addingManual}
                  className="px-5 py-2 text-sm rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {addingManual && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                  Simpan
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Table */}
        <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-700">
              Daftar Peserta RSVP
              {search && <span className="ml-2 text-slate-400 font-normal">{filtered.length} hasil</span>}
            </div>
            <div className="text-xs text-slate-400">{list.length} total</div>
          </div>

          {loadingList ? (
            <div className="py-16 text-center text-slate-400 text-sm">Memuat data...</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center">
              <Users size={36} className="mx-auto text-slate-200 mb-3" />
              <div className="text-sm text-slate-400">
                {search ? "Tidak ada hasil pencarian" : "Belum ada peserta RSVP"}
              </div>
              {!search && (
                <div className="text-xs text-slate-300 mt-1">Import CSV atau tambah manual untuk mulai</div>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400">#</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400">NIK</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400">Nama</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400">Kelamin</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400">Kota</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400">Phone</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400">Catatan</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-slate-400">Terdaftar</th>
                    <th className="px-5 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {filtered.map((p, i) => (
                    <tr key={p.nik} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3.5 text-xs text-slate-400">{i + 1}</td>
                      <td className="px-5 py-3.5">
                        <span className="font-mono text-xs text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">{p.nik}</span>
                      </td>
                      <td className="px-5 py-3.5 text-sm font-semibold text-slate-800">{p.fullName}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">{p.gender ?? "-"}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">{p.city ?? "-"}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-500">{p.phone ?? "-"}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-400 max-w-[120px] truncate">{p.notes ?? "-"}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-400">
                        {new Date(p.registeredAt).toLocaleDateString("id-ID")}
                      </td>
                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => handleDelete(p.nik)}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                          title="Hapus dari daftar RSVP"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
