import { useState, useRef, useCallback, useMemo } from "react";
import { kabupatenList, getKecamatanList, getDesaList } from "@workspace/db/jatimWilayah";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Camera, Upload, CheckCircle2, AlertCircle,
  Sun, Eye, Contrast, RotateCcw, ScanLine, ChevronRight, User, Users, ClipboardList,
} from "@/lib/icons";
import { useAuth } from "@/lib/auth";
import KtpCamera from "@/components/ktp-camera";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QualityWarning = "dark" | "overexposed" | "blurry" | "low_contrast" | null;

interface KtpMeta {
  tesseractScore: number;
  qualityWarning: QualityWarning;
  lowConfidence: boolean;
  engine?: string;
}

interface KtpData {
  nik?: string; fullName?: string; address?: string; birthPlace?: string;
  birthDate?: string; gender?: string; religion?: string; maritalStatus?: string;
  occupation?: string; nationality?: string; rtRw?: string; kelurahan?: string;
  kecamatan?: string; province?: string; city?: string; bloodType?: string;
  _meta?: KtpMeta;
}

interface ProgramInfo {
  id: number;
  name: string;
  komisi: string | null;
  mitra: string | null;
  tahun: string | null;
  registeredCount: number;
  totalKtpPenerima: number | null;
}

const qualityMessages: Record<string, { icon: React.ReactNode; text: string }> = {
  dark: { icon: <Sun className="h-3.5 w-3.5 shrink-0" />, text: "Gambar terlalu gelap — coba di tempat lebih terang" },
  overexposed: { icon: <Sun className="h-3.5 w-3.5 shrink-0" />, text: "Gambar terlalu terang — hindari cahaya langsung" },
  blurry: { icon: <Eye className="h-3.5 w-3.5 shrink-0" />, text: "Gambar kurang tajam — tahan kamera lebih stabil" },
  low_contrast: { icon: <Contrast className="h-3.5 w-3.5 shrink-0" />, text: "Kontras rendah — kemungkinan dari fotokopi pudar" },
};

function StepBar({ step }: { step: "upload" | "form" | "done" }) {
  const steps = [
    { key: "upload", label: "Scan KTP", icon: <ScanLine size={13} /> },
    { key: "form", label: "Isi Data", icon: <User size={13} /> },
    { key: "done", label: "Selesai", icon: <CheckCircle2 size={13} /> },
  ];
  const idx = steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center w-full">
      {steps.map((s, i) => {
        const done = i < idx;
        const active = i === idx;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold whitespace-nowrap transition-all duration-300 ${
              active
                ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                : done
                ? "bg-emerald-100 text-emerald-600"
                : "bg-slate-100 text-slate-400"
            }`}>
              {s.icon}
              <span>{s.label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 mx-2 h-px rounded-full transition-colors duration-500 ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({ label, value, onChange, placeholder, textarea }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean;
}) {
  const cls = "w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition font-medium placeholder:text-slate-300 text-slate-800";
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
          className={`${cls} resize-none`} />
      ) : (
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
          className={cls} />
      )}
    </div>
  );
}

function FieldSelect({ label, value, onChange, options, disabled }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition font-medium text-slate-800 disabled:bg-slate-50 disabled:text-slate-300"
      >
        <option value="">— Pilih —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

const GENDER_OPTIONS = ["LAKI-LAKI", "PEREMPUAN"];
const AGAMA_OPTIONS = ["ISLAM", "KRISTEN", "KATOLIK", "HINDU", "BUDDHA", "KONGHUCU", "PENGHAYAT"];
const GOL_DARAH_OPTIONS = ["A", "B", "AB", "O", "A+", "B+", "AB+", "O+", "A-", "B-", "AB-", "O-"];
const STATUS_KAWIN_OPTIONS = ["BELUM KAWIN", "KAWIN", "CERAI HIDUP", "CERAI MATI"];

function normalizeOcr(raw: string): string {
  return raw
    .replace(/\b(KABUPATEN|KOTA|KAB\.|KAB\s|KEC\.|KEC\s|KEL\.|KEL\s|DESA\s|KELURAHAN\s|KECAMATAN\s)/gi, "")
    .replace(/\s+/g, " ").trim().toLowerCase();
}

function findCanonical(ocrValue: string, list: string[]): string {
  if (!ocrValue) return "";
  const raw = ocrValue.toLowerCase().trim();
  const exact = list.find((k) => k.toLowerCase() === raw);
  if (exact) return exact;
  const norm = normalizeOcr(ocrValue);
  const normExact = list.find((k) => k.toLowerCase() === norm);
  if (normExact) return normExact;
  const contains = list.find((k) => raw.includes(k.toLowerCase()) || norm.includes(k.toLowerCase()));
  if (contains) return contains;
  const starts = list.find((k) => k.toLowerCase().startsWith(norm) && norm.length >= 4);
  if (starts) return starts;
  return "";
}

export default function PetugasScanProgramPage() {
  const { id } = useParams();
  const programId = parseInt(id || "0");
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<"upload" | "form" | "done">("upload");
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [ocrMeta, setOcrMeta] = useState<KtpMeta | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const [ktp, setKtp] = useState<KtpData>({});
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [phone, setPhone] = useState("");
  const [notes, setNotes] = useState("");

  const canonKab = useMemo(() => findCanonical(ktp.city ?? "", kabupatenList), [ktp.city]);
  const canonKec = useMemo(() => {
    if (!canonKab) return "";
    return findCanonical(ktp.kecamatan ?? "", getKecamatanList(canonKab));
  }, [canonKab, ktp.kecamatan]);
  const kecList = useMemo(() => canonKab ? getKecamatanList(canonKab) : [], [canonKab]);
  const kelList = useMemo(() => canonKab && canonKec ? getDesaList(canonKab, canonKec) : [], [canonKab, canonKec]);
  const canonKel = useMemo(() => findCanonical(ktp.kelurahan ?? "", kelList), [kelList, ktp.kelurahan]);

  const { data: program } = useQuery<ProgramInfo>({
    queryKey: ["program", programId],
    queryFn: () =>
      fetch(`${BASE}/api/programs/${programId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: programId > 0,
  });

  const processBase64 = useCallback(async (base64: string) => {
    setScanning(true);
    setError("");
    setOcrMeta(null);
    setCapturedBase64(base64);
    try {
      const r = await fetch(`${BASE}/api/ktp/scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!r.ok) throw new Error("Gagal scan KTP");
      const data: KtpData = await r.json();
      const { _meta, ...rest } = data;
      if (_meta) setOcrMeta(_meta);

      const canonCity = findCanonical(rest.city ?? "", kabupatenList);
      const canonKec2 = canonCity ? findCanonical(rest.kecamatan ?? "", getKecamatanList(canonCity)) : "";
      const canonKel2 = canonCity && canonKec2 ? findCanonical(rest.kelurahan ?? "", getDesaList(canonCity, canonKec2)) : "";

      setKtp({
        ...rest,
        city: canonCity || rest.city,
        kecamatan: canonKec2 || rest.kecamatan,
        kelurahan: canonKel2 || rest.kelurahan,
      });
      setStep("form");
    } catch {
      setError("Gagal membaca KTP. Coba foto ulang dengan pencahayaan yang lebih baik.");
    } finally {
      setScanning(false);
    }
  }, []);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      processBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = (base64: string) => { setShowCamera(false); processBase64(base64); };
  const handleDrop = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); };

  const handleSubmit = async () => {
    if (!ktp.nik || !ktp.fullName) { setError("NIK dan nama lengkap wajib diisi"); return; }
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch(`${BASE}/api/programs/${programId}/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          staffId: user?.id,
          staffName: user?.name,
          phone: phone || undefined,
          notes: notes || undefined,
          ...ktp,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(
          r.status === 409
            ? "Peserta ini sudah terdaftar di program ini."
            : data.error || "Gagal mendaftarkan"
        );
        return;
      }
      setSuccessMsg(data.message || "Berhasil didaftarkan!");
      if (capturedBase64 && ktp.nik) {
        fetch(`${BASE}/api/ktp/save-image`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nik: ktp.nik, imageBase64: capturedBase64 }),
        }).catch(() => {});
      }
      setStep("done");
    } catch {
      setError("Terjadi kesalahan jaringan. Coba lagi.");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setKtp({}); setCapturedBase64(null); setPhone(""); setNotes("");
    setError(""); setSuccessMsg(""); setOcrMeta(null);
    setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const qw = ocrMeta?.qualityWarning;

  return (
    <div className="min-h-screen bg-[#f5f7f9]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {showCamera && (
        <KtpCamera onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
      )}

      {/* ── Top Bar ─────────────────────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 flex items-center gap-3 px-4 py-3.5 bg-white/80 backdrop-blur-2xl shadow-[0_20px_40px_rgba(44,47,49,0.06)] rounded-b-[1.5rem]">
        <button
          onClick={() => navigate("/petugas")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100/60 transition-all active:scale-90"
        >
          <ArrowLeft className="h-5 w-5 text-slate-700" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-extrabold text-[#0054ca] tracking-widest uppercase flex items-center gap-1">
            <ClipboardList size={10} /> Scan KTP Program
          </div>
          <div className="text-[13px] font-extrabold text-slate-900 truncate leading-tight">
            {program?.name || "Memuat..."}
          </div>
        </div>
        {program && (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 shrink-0 bg-white/80 border border-slate-100 px-2.5 py-1.5 rounded-xl">
            <Users className="h-3 w-3 text-[#0054ca]" />
            {program.registeredCount}
            {program.totalKtpPenerima ? `/${program.totalKtpPenerima}` : ""}
          </div>
        )}
      </nav>

      <div className="max-w-md mx-auto px-4 pt-[76px] pb-28 space-y-4">
        <StepBar step={step} />

        {/* ── STEP 1: Upload ── */}
        {step === "upload" && (
          <div className="space-y-4 pt-2">
            <div className="bg-white/70 backdrop-blur-2xl rounded-[1.25rem] shadow-[0_20px_40px_rgba(44,47,49,0.07)] border border-white/60 p-7 flex flex-col items-center text-center space-y-5 relative overflow-hidden">
              <div className="absolute -top-10 -right-10 w-40 h-40 bg-[#0054ca]/5 rounded-full blur-3xl pointer-events-none" />
              <div className={`w-20 h-20 rounded-full flex items-center justify-center ${scanning ? "bg-blue-100 animate-pulse" : "bg-[#0054ca]/10"}`}>
                <Camera className={`h-9 w-9 ${scanning ? "text-blue-400" : "text-[#0054ca]"}`} strokeWidth={1.8} />
              </div>
              {scanning ? (
                <div className="space-y-2 w-full">
                  <div className="text-[16px] font-bold text-blue-700">Membaca KTP...</div>
                  <div className="text-xs text-blue-400">OCR sedang berjalan, mohon tunggu</div>
                  <div className="mx-auto max-w-[180px] h-1.5 overflow-hidden rounded-full bg-blue-100 mt-3">
                    <div className="h-full w-2/3 rounded-full bg-[#0054ca] animate-pulse" />
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <h2 className="text-[1.05rem] font-semibold text-slate-900">Ambil Foto KTP</h2>
                  <p className="text-slate-500 text-sm max-w-[220px] leading-relaxed">
                    Foto KTP untuk mendaftarkan penerima program
                  </p>
                </div>
              )}
              <button
                onClick={() => !scanning && setShowCamera(true)}
                disabled={scanning}
                className="w-full py-3.5 px-8 rounded-full text-white font-semibold flex items-center justify-center gap-2.5 shadow-[0_10px_20px_rgba(0,84,202,0.25)] active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:cursor-wait"
                style={{ background: "linear-gradient(135deg, #0054ca 0%, #769dff 100%)" }}
              >
                <Camera className="h-4 w-4" />
                <span>Buka Kamera</span>
              </button>
            </div>

            <div
              onDrop={handleDrop}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => !scanning && fileInputRef.current?.click()}
              className={`bg-white/70 backdrop-blur-2xl rounded-[1.25rem] shadow-[0_20px_40px_rgba(44,47,49,0.07)] border p-5 flex items-center justify-between cursor-pointer active:scale-[0.98] transition-all duration-200 ${
                isDragging ? "border-[#0054ca]/40 bg-blue-50/50" : "border-white/60 hover:border-[#0054ca]/20"
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Upload className="h-5 w-5 text-indigo-600" strokeWidth={2} />
                </div>
                <div>
                  <div className="text-[14px] font-semibold text-slate-900">Upload dari galeri</div>
                  <div className="text-[12px] text-slate-500 font-medium">Pilih file JPG, PNG</div>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-300" />
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} className="hidden" />

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-4 py-3.5 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <span className="font-medium">{error}</span>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 2: Form ── */}
        {step === "form" && (
          <div className="space-y-3">
            {qw && qualityMessages[qw] && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-[12px] font-medium rounded-2xl px-4 py-3 flex items-center gap-2">
                {qualityMessages[qw].icon}
                <span>{qualityMessages[qw].text}</span>
              </div>
            )}
            {ocrMeta?.lowConfidence && (
              <div className="bg-orange-50 border border-orange-200 text-orange-700 text-[12px] font-medium rounded-2xl px-4 py-3 flex items-center gap-2">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>Kepercayaan OCR rendah — harap periksa data kembali</span>
              </div>
            )}

            {/* Data KTP */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-50">
                <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center">
                  <User size={14} className="text-blue-600" />
                </div>
                <span className="text-[13px] font-extrabold text-slate-900">Data KTP</span>
                <span className="text-[10px] text-slate-400 font-medium ml-0.5">— koreksi jika perlu</span>
              </div>
              <div className="p-5 space-y-3">
                <FieldInput label="NIK *" value={ktp.nik || ""} onChange={(v) => setKtp({ ...ktp, nik: v })} placeholder="16 digit NIK" />
                <FieldInput label="Nama Lengkap *" value={ktp.fullName || ""} onChange={(v) => setKtp({ ...ktp, fullName: v })} placeholder="Sesuai KTP" />
                <div className="grid grid-cols-2 gap-3">
                  <FieldInput label="Tempat Lahir" value={ktp.birthPlace || ""} onChange={(v) => setKtp({ ...ktp, birthPlace: v })} placeholder="Kota" />
                  <FieldInput label="Tanggal Lahir" value={ktp.birthDate || ""} onChange={(v) => setKtp({ ...ktp, birthDate: v })} placeholder="DD-MM-YYYY" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FieldSelect label="Jenis Kelamin" value={ktp.gender || ""} onChange={(v) => setKtp({ ...ktp, gender: v })} options={GENDER_OPTIONS} />
                  <FieldSelect label="Agama" value={ktp.religion || ""} onChange={(v) => setKtp({ ...ktp, religion: v })} options={AGAMA_OPTIONS} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FieldSelect label="Gol. Darah" value={ktp.bloodType || ""} onChange={(v) => setKtp({ ...ktp, bloodType: v })} options={GOL_DARAH_OPTIONS} />
                  <FieldSelect label="Status Kawin" value={ktp.maritalStatus || ""} onChange={(v) => setKtp({ ...ktp, maritalStatus: v })} options={STATUS_KAWIN_OPTIONS} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FieldInput label="Kewarganegaraan" value={ktp.nationality || "WNI"} onChange={(v) => setKtp({ ...ktp, nationality: v })} placeholder="WNI" />
                  <FieldInput label="RT/RW" value={ktp.rtRw || ""} onChange={(v) => setKtp({ ...ktp, rtRw: v })} placeholder="000/000" />
                </div>
                <FieldInput label="Alamat" value={ktp.address || ""} onChange={(v) => setKtp({ ...ktp, address: v })} placeholder="Alamat sesuai KTP" textarea />

                {/* Wilayah cascading */}
                <div className="space-y-2">
                  {[
                    {
                      label: "Kabupaten / Kota",
                      value: canonKab,
                      disabled: false,
                      options: kabupatenList,
                      onChange: (v: string) => setKtp({ ...ktp, city: v, kecamatan: "", kelurahan: "" }),
                    },
                    {
                      label: "Kecamatan",
                      value: canonKec,
                      disabled: !canonKab,
                      options: kecList,
                      onChange: (v: string) => setKtp({ ...ktp, kecamatan: v, kelurahan: "" }),
                    },
                    {
                      label: "Kelurahan / Desa",
                      value: canonKel,
                      disabled: !canonKec,
                      options: kelList,
                      onChange: (v: string) => setKtp({ ...ktp, kelurahan: v }),
                    },
                  ].map((f) => (
                    <FieldSelect
                      key={f.label}
                      label={f.label}
                      value={f.value}
                      onChange={f.onChange}
                      options={f.options}
                      disabled={f.disabled}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Kontak */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-50">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <ClipboardList size={14} className="text-emerald-600" />
                </div>
                <span className="text-[13px] font-extrabold text-slate-900">Info Tambahan</span>
              </div>
              <div className="p-5 space-y-3">
                <FieldInput label="Nomor Telepon" value={phone} onChange={setPhone} placeholder="08xx-xxxx-xxxx" />
                <FieldInput label="Catatan" value={notes} onChange={setNotes} placeholder="Catatan tambahan..." textarea />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-4 py-3.5 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={resetForm}
                className="flex items-center gap-1.5 px-4 py-3 rounded-full border border-slate-200 text-slate-500 text-[13px] font-extrabold hover:bg-slate-50 active:scale-95 transition-all"
              >
                <RotateCcw size={13} />
                Ulangi
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-full bg-blue-600 text-white text-[13px] font-extrabold hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-200 disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Menyimpan...
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={14} />
                    Daftarkan
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === "done" && (
          <div className="space-y-4 pt-4">
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex flex-col items-center text-center gap-4">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              </div>
              <div>
                <h2 className="text-[18px] font-extrabold text-slate-900 mb-1">Berhasil Didaftarkan!</h2>
                <p className="text-sm text-slate-500">{successMsg}</p>
              </div>
              <div className="bg-slate-50 rounded-xl px-5 py-3 w-full text-left">
                <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">Program</div>
                <div className="text-[14px] font-extrabold text-slate-800">{program?.name}</div>
              </div>
              <div className="bg-slate-50 rounded-xl px-5 py-3 w-full text-left">
                <div className="text-[11px] font-bold text-slate-400 uppercase mb-1">Peserta</div>
                <div className="text-[14px] font-extrabold text-slate-800">{ktp.fullName}</div>
                <div className="text-[12px] text-slate-500 mt-0.5">{ktp.nik}</div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={resetForm}
                className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-full bg-blue-600 text-white text-[13px] font-extrabold hover:bg-blue-700 active:scale-95 transition-all shadow-sm shadow-blue-200"
              >
                <ScanLine size={14} />
                Scan KTP Lagi
              </button>
              <button
                onClick={() => navigate("/petugas")}
                className="flex items-center justify-center gap-1.5 px-5 py-3 rounded-full border border-slate-200 text-slate-600 text-[13px] font-extrabold hover:bg-slate-50 active:scale-95 transition-all"
              >
                Selesai
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
