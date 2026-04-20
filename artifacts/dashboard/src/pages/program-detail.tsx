import { useState, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import Layout from "@/components/layout";
import {
  ArrowLeft, ClipboardList, Users, Calendar, MapPin,
  Search, X, FileText, ChevronRight,
} from "@/lib/icons";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

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

type Recipient = {
  id: number;
  registeredAt: string;
  staffName: string | null;
  notes: string | null;
  participantId: number;
  participantName: string;
  participantNik: string;
  participantCity: string | null;
  participantKecamatan: string | null;
  participantKelurahan: string | null;
  participantGender: string | null;
  participantPhone: string | null;
};

export default function ProgramDetailPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [program, setProgram] = useState<Program | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetchData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const [progRes, recipRes] = await Promise.all([
        fetch(`${BASE}/api/programs/${id}`, { credentials: "include" }),
        fetch(`${BASE}/api/programs/${id}/recipients`, { credentials: "include" }),
      ]);
      setProgram(await progRes.json());
      setRecipients(await recipRes.json());
    } catch { } finally { setLoading(false); }
  }, [id]);

  useState(() => { fetchData(); });

  const filtered = recipients.filter(
    (r) =>
      !search ||
      r.participantName.toLowerCase().includes(search.toLowerCase()) ||
      r.participantNik.includes(search) ||
      (r.participantCity ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const pct = program?.totalKtpPenerima && program.totalKtpPenerima > 0
    ? Math.min(100, Math.round((program.registeredCount / program.totalKtpPenerima) * 100))
    : null;

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Back button */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/programs")}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-slate-800 transition"
          >
            <ArrowLeft className="h-4 w-4" /> Kembali ke Daftar Program
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-8 animate-pulse space-y-3">
            <div className="h-6 bg-slate-100 rounded-lg w-1/2" />
            <div className="h-4 bg-slate-100 rounded-lg w-1/3" />
            <div className="h-2 bg-slate-100 rounded-full mt-4" />
          </div>
        ) : !program ? (
          <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
            <p className="text-slate-400 font-medium">Program tidak ditemukan</p>
          </div>
        ) : (
          <>
            {/* Program Info Card */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.05)] p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
                  <ClipboardList className="h-6 w-6 text-blue-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-extrabold text-slate-900 leading-tight">{program.name}</h1>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    {program.komisi && (
                      <span className="text-[11px] font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full border border-blue-100">{program.komisi}</span>
                    )}
                    {program.mitra && (
                      <span className="text-[11px] font-bold bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">{program.mitra}</span>
                    )}
                    {program.tahun && (
                      <span className="text-[11px] font-bold bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full border border-amber-100 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />{program.tahun}
                      </span>
                    )}
                  </div>
                  {program.kabupatenPenerima.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                      <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      {program.kabupatenPenerima.map((k) => (
                        <span key={k} className="text-[11px] font-semibold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-100">{k}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Progress */}
              <div className="mt-5 pt-4 border-t border-slate-100">
                <div className="flex items-baseline justify-between mb-2">
                  <span className="text-xs font-bold text-slate-400 tracking-wide">PENERIMA KTP</span>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-extrabold text-slate-900">{program.registeredCount.toLocaleString("id-ID")}</span>
                    {program.totalKtpPenerima && (
                      <span className="text-sm text-slate-400">/ {program.totalKtpPenerima.toLocaleString("id-ID")}</span>
                    )}
                    {pct !== null && (
                      <span className={`text-[11px] font-bold ml-1 px-2 py-0.5 rounded-full ${pct >= 100 ? "bg-emerald-100 text-emerald-700" : "bg-blue-50 text-blue-600"}`}>
                        {pct}%
                      </span>
                    )}
                  </div>
                </div>
                {pct !== null && (
                  <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: pct >= 100 ? "#22c55e" : "#3b82f6" }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Recipients Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-extrabold text-slate-700 tracking-wide flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-500" />
                  DAFTAR PENERIMA
                </h2>
                <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                  {recipients.length} orang
                </span>
              </div>

              {/* Search */}
              <div className="relative">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Cari nama, NIK, atau kabupaten..."
                  className="w-full pl-9 pr-8 py-2.5 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 placeholder:text-slate-300"
                />
                {search && (
                  <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-slate-100 rounded-full transition">
                    <X size={12} className="text-slate-400" />
                  </button>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <FileText className="h-6 w-6 text-slate-300" />
                  </div>
                  <p className="text-slate-400 text-sm font-medium">
                    {search ? "Tidak ditemukan" : "Belum ada penerima"}
                  </p>
                </div>
              ) : (
                <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-50">
                  {filtered.map((r, idx) => (
                    <div
                      key={r.id}
                      onClick={() => navigate(`/participants/${r.participantNik}`)}
                      className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-slate-50/60 transition cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                        <span className="text-[11px] font-extrabold text-blue-600">{idx + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-extrabold text-slate-900 text-[13px] truncate leading-snug">
                          {r.participantName}
                        </p>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          <span className="text-[11px] text-slate-400 font-mono">{r.participantNik}</span>
                          {r.participantGender && (
                            <span className="text-[10px] font-bold text-slate-400">{r.participantGender === "LAKI-LAKI" ? "L" : r.participantGender === "PEREMPUAN" ? "P" : r.participantGender}</span>
                          )}
                          {r.participantCity && (
                            <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-0.5">
                              <MapPin className="h-2.5 w-2.5" />{[r.participantKecamatan, r.participantCity].filter(Boolean).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0 hidden sm:block">
                        <p className="text-[11px] text-slate-400">
                          {new Date(r.registeredAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "2-digit" })}
                        </p>
                        {r.staffName && <p className="text-[10px] text-slate-300">{r.staffName}</p>}
                      </div>
                      <ChevronRight className="h-4 w-4 text-slate-200 group-hover:text-blue-400 transition-colors shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
