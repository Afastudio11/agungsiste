import { useState, useRef, useCallback, useMemo } from "react";
import { kabupatenList, getKecamatanList, getDesaList } from "@workspace/db/jatimWilayah";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, Camera, Upload, CheckCircle2, AlertCircle, AlertTriangle,
  Phone, Mail, Tag, FileText, User, Users, Sun, Eye, Contrast,
  RotateCcw, ScanLine, ChevronRight, Home, History, QrCode
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

interface EventInfo {
  id: number; name: string; location?: string;
  eventDate: string; participantCount: number;
}

const profesiList = [
  "Karyawan Swasta", "PNS", "Wiraswasta", "Petani", "Pedagang",
  "Guru", "Dokter", "Mahasiswa", "TNI/Polri", "Ibu Rumah Tangga",
];

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

function FieldSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition font-medium text-slate-800"
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

/**
 * Normalizes OCR output for wilayah matching:
 * - strips "KABUPATEN", "KOTA", "KAB.", "KEC.", "KEL.", "DESA" prefixes
 * - collapses extra spaces, trims
 * - lowercases
 */
function normalizeOcr(raw: string): string {
  return raw
    .replace(/\b(KABUPATEN|KOTA|KAB\.|KAB\s|KEC\.|KEC\s|KEL\.|KEL\s|DESA\s|KELURAHAN\s|KECAMATAN\s)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Find the canonical wilayah name from a list by OCR string.
 * 1. Exact lowercase match
 * 2. Match after stripping common prefixes
 * 3. Contains/partial match (canonical name inside OCR string)
 */
function findCanonical(ocrValue: string, list: string[]): string {
  if (!ocrValue) return "";
  const raw = ocrValue.toLowerCase().trim();
  // 1. Exact case-insensitive
  const exact = list.find((k) => k.toLowerCase() === raw);
  if (exact) return exact;
  // 2. Normalized (strip prefixes) exact match
  const norm = normalizeOcr(ocrValue);
  const normExact = list.find((k) => k.toLowerCase() === norm);
  if (normExact) return normExact;
  // 3. OCR contains canonical name (e.g. OCR="KABUPATEN TRENGGALEK" → find "Trenggalek")
  const contains = list.find((k) => raw.includes(k.toLowerCase()) || norm.includes(k.toLowerCase()));
  if (contains) return contains;
  // 4. Canonical name starts with OCR (e.g. OCR="TRENGGA" → "Trenggalek")
  const starts = list.find((k) => k.toLowerCase().startsWith(norm) && norm.length >= 4);
  if (starts) return starts;
  return "";
}

export default function PetugasScanPage() {
  const { id } = useParams();
  const eventId = parseInt(id || "0");
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
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");

  const canonKab = useMemo(
    () => findCanonical(ktp.city ?? "", kabupatenList),
    [ktp.city]
  );
  const canonKec = useMemo(() => {
    if (!canonKab) return "";
    return findCanonical(ktp.kecamatan ?? "", getKecamatanList(canonKab));
  }, [canonKab, ktp.kecamatan]);
  const kecList = useMemo(() => canonKab ? getKecamatanList(canonKab) : [], [canonKab]);
  const kelList = useMemo(() => canonKab && canonKec ? getDesaList(canonKab, canonKec) : [], [canonKab, canonKec]);
  const canonKel = useMemo(
    () => findCanonical(ktp.kelurahan ?? "", kelList),
    [kelList, ktp.kelurahan]
  );

  const { data: event } = useQuery<EventInfo>({
    queryKey: ["event", eventId],
    queryFn: () =>
      fetch(`${BASE}/api/events/${eventId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: eventId > 0,
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

      // Auto-normalize wilayah: find canonical names from OCR text so dropdowns pre-select correctly
      const canonCity = findCanonical(rest.city ?? "", kabupatenList);
      const canonKec2 = canonCity
        ? findCanonical(rest.kecamatan ?? "", getKecamatanList(canonCity))
        : "";
      const canonKel2 = canonCity && canonKec2
        ? findCanonical(rest.kelurahan ?? "", getDesaList(canonCity, canonKec2))
        : "";

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

  const handleCameraCapture = (base64: string) => {
    setShowCamera(false);
    processBase64(base64);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const addTag = (t: string) => {
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setCustomTag("");
  };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== x && t !== t ? false : x !== t));

  const handleSubmit = async () => {
    if (!ktp.nik || !ktp.fullName) { setError("NIK dan nama lengkap wajib diisi"); return; }
    if (!phone.trim()) { setError("Nomor telepon wajib diisi"); return; }
    setSubmitting(true);
    setError("");
    try {
      const r = await fetch(`${BASE}/api/ktp/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId,
          staffId: user?.id,
          staffName: user?.name,
          phone: phone || undefined,
          email: email || undefined,
          notes: notes || undefined,
          tags: tags.join(", ") || undefined,
          ...ktp,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(
          r.status === 409
            ? "Peserta ini sudah terdaftar di event ini."
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
    setKtp({});
    setCapturedBase64(null);
    setPhone("");
    setEmail("");
    setNotes("");
    setTags([]);
    setError("");
    setSuccessMsg("");
    setOcrMeta(null);
    setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const qw = ocrMeta?.qualityWarning;

  return (
    <div className="min-h-screen bg-[#f5f7f9]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {showCamera && (
        <KtpCamera onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
      )}

      {/* ── Fixed Glassmorphic Top Bar ─────────────────────────────── */}
      <nav className="fixed top-0 w-full z-50 flex items-center gap-3 px-4 py-3.5 bg-white/80 backdrop-blur-2xl shadow-[0_20px_40px_rgba(44,47,49,0.06)] rounded-b-[1.5rem]">
        <button
          onClick={() => navigate("/petugas")}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100/60 transition-all active:scale-90"
        >
          <ArrowLeft className="h-5 w-5 text-slate-700" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-extrabold text-[#0054ca] tracking-widest uppercase">Scan KTP</div>
          <div className="text-[13px] font-extrabold text-slate-900 truncate leading-tight">
            {event?.name || "Memuat..."}
          </div>
        </div>
        {event && (
          <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 shrink-0 bg-white/80 border border-slate-100 px-2.5 py-1.5 rounded-xl">
            <Users className="h-3 w-3 text-[#0054ca]" />
            {event.participantCount}
          </div>
        )}
      </nav>

      <div className="max-w-md mx-auto px-4 pt-[76px] pb-28 space-y-4">

        {/* Step indicator */}
        <StepBar step={step} />

        {/* ── STEP 1: Upload ── */}
        {step === "upload" && (
          <div className="space-y-4 pt-2">

            {/* Header */}
            <div className="space-y-0.5 px-1">
              <h1 className="text-[1.35rem] font-bold text-slate-900 tracking-tight">Ambil Foto KTP</h1>
              <p className="text-slate-500 text-sm font-medium">Pastikan seluruh bagian KTP terlihat jelas</p>
            </div>

            {/* Camera Glass Card */}
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
                    Foto KTP dengan panduan bingkai otomatis
                  </p>
                </div>
              )}

              <button
                onClick={() => !scanning && setShowCamera(true)}
                disabled={scanning}
                className="w-full py-3.5 px-8 rounded-full text-white font-semibold flex items-center justify-center gap-2.5 shadow-[0_10px_20px_rgba(0,84,202,0.25)] active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:cursor-wait"
                style={{ background: "linear-gradient(135deg, #0054ca 0%, #769dff 100%)" }}
              >
                <Camera className="h-4.5 w-4.5" />
                <span>Buka Kamera</span>
              </button>
            </div>

            {/* Gallery Upload Glass Card */}
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

            {/* Tips Section */}
            <div className="space-y-4 pt-2">
              <div className="flex items-center gap-3 px-1">
                <div className="h-[2px] w-7 bg-[#0054ca] rounded-full" />
                <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-slate-400">Tips Foto KTP</h3>
              </div>
              <div className="space-y-3.5">
                {[
                  { icon: <CheckCircle2 className="h-4 w-4 text-[#0054ca] shrink-0" />, title: "Pencahayaan yang cukup", desc: "Hindari pantulan cahaya atau bayangan pada kartu." },
                  { icon: <CheckCircle2 className="h-4 w-4 text-[#0054ca] shrink-0" />, title: "Pastikan KTP terbaca", desc: "Teks dan foto pada KTP harus terlihat fokus dan tajam." },
                  { icon: <CheckCircle2 className="h-4 w-4 text-[#0054ca] shrink-0" />, title: "Letakkan pada bidang datar", desc: "Gunakan latar belakang gelap dan kontras." },
                ].map(({ icon, title, desc }, i) => (
                  <div key={i} className="flex gap-3.5 items-start">
                    <div className="w-6 h-6 rounded-full bg-white flex-shrink-0 flex items-center justify-center shadow-sm mt-0.5">
                      {icon}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-slate-800 leading-tight">{title}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

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
                  <FieldInput label="Tempat Lahir" value={ktp.birthPlace || ""} onChange={(v) => setKtp({ ...ktp, birthPlace: v })} placeholder="Kota kelahiran" />
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
                      placeholder: "— Pilih Kabupaten/Kota —",
                      onChange: (v: string) => setKtp({ ...ktp, city: v, kecamatan: "", kelurahan: "" }),
                    },
                    {
                      label: "Kecamatan",
                      value: canonKec,
                      disabled: !canonKab,
                      options: kecList,
                      placeholder: "— Pilih Kecamatan —",
                      onChange: (v: string) => setKtp({ ...ktp, kecamatan: v, kelurahan: "" }),
                    },
                    {
                      label: "Kelurahan / Desa",
                      value: canonKel,
                      disabled: !canonKec,
                      options: kelList,
                      placeholder: "— Pilih Kelurahan/Desa —",
                      onChange: (v: string) => setKtp({ ...ktp, kelurahan: v }),
                    },
                  ].map(({ label, value, disabled, options, placeholder, onChange }) => (
                    <div key={label}>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">{label}</label>
                      <select
                        value={value}
                        disabled={disabled}
                        onChange={(e) => onChange(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition disabled:opacity-40 disabled:cursor-not-allowed disabled:bg-slate-50"
                      >
                        <option value="">{placeholder}</option>
                        {options.map((k) => <option key={k} value={k}>{k}</option>)}
                      </select>
                    </div>
                  ))}
                </div>

                <FieldInput label="Pekerjaan" value={ktp.occupation || ""} onChange={(v) => setKtp({ ...ktp, occupation: v })} placeholder="Pekerjaan sesuai KTP" />
              </div>
            </div>

            {/* Kontak */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-50">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <Phone size={14} className="text-emerald-600" />
                </div>
                <span className="text-[13px] font-extrabold text-slate-900">Kontak</span>
                <span className="text-[10px] text-red-400 font-bold ml-0.5">— No. HP wajib</span>
              </div>
              <div className="p-5 space-y-3">
                <FieldInput label="Nomor HP *" value={phone} onChange={setPhone} placeholder="+62 8xx xxxx xxxx" />
                <FieldInput label="Email" value={email} onChange={setEmail} placeholder="nama@email.com" />
              </div>
            </div>

            {/* Tags & Catatan */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-50">
                <div className="w-7 h-7 rounded-lg bg-violet-100 flex items-center justify-center">
                  <Tag size={14} className="text-violet-600" />
                </div>
                <span className="text-[13px] font-extrabold text-slate-900">Kategori & Catatan</span>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-2 tracking-wide uppercase">Profesi / Kategori</label>
                  <div className="flex flex-wrap gap-1.5">
                    {profesiList.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => { if (tags.includes(p)) removeTag(p); else addTag(p); }}
                        className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition-all ${
                          tags.includes(p)
                            ? "bg-blue-600 border-blue-600 text-white shadow-sm"
                            : "border-slate-200 text-slate-500 hover:border-blue-300 hover:text-blue-600 bg-white"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1.5 tracking-wide uppercase">Tag Tambahan</label>
                  <div className="flex gap-2">
                    <input
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(customTag); } }}
                      placeholder="Tambah tag..."
                      className="flex-1 px-3.5 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition"
                    />
                    <button
                      type="button"
                      onClick={() => addTag(customTag)}
                      className="px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-600 text-sm font-bold rounded-full transition border border-blue-100"
                    >
                      +
                    </button>
                  </div>
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tags.map((t) => (
                        <span key={t} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
                          {t}
                          <button onClick={() => removeTag(t)} className="hover:text-red-600 ml-0.5 leading-none">×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <FileText size={11} className="text-slate-400" />
                    <label className="text-[11px] font-bold text-slate-400 tracking-wide uppercase">Catatan</label>
                  </div>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={2}
                    placeholder="Catatan tambahan tentang peserta..."
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition resize-none"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-4 py-3.5 flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-400" />
                <span className="font-medium">{error}</span>
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60 text-white font-extrabold rounded-full py-4 text-[15px] transition-all shadow-lg shadow-emerald-500/20 active:scale-[0.98]"
            >
              <CheckCircle2 className="h-5 w-5" />
              {submitting ? "Menyimpan..." : "Daftarkan Peserta"}
            </button>
          </div>
        )}

        {/* ── STEP 3: Done ── */}
        {step === "done" && (
          <div className="flex flex-col items-center text-center py-10">
            <div className="relative mb-7">
              <div className="w-28 h-28 rounded-[28px] bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30">
                <CheckCircle2 className="h-14 w-14 text-white" strokeWidth={1.8} />
              </div>
              <div className="absolute -top-2 -right-2 w-9 h-9 bg-amber-400 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-400/30">
                <span className="text-white text-sm font-extrabold">✓</span>
              </div>
            </div>

            <h2 className="text-[26px] font-extrabold text-slate-900 mb-2" style={{ letterSpacing: "-0.03em" }}>
              Berhasil Didaftarkan!
            </h2>
            <p className="text-sm text-slate-400 max-w-xs mb-5 leading-relaxed">{successMsg}</p>

            {ktp.fullName && (
              <div className="bg-white border border-emerald-100 rounded-2xl px-6 py-4 mb-7 shadow-sm">
                <div className="text-[10px] font-extrabold text-emerald-500 tracking-widest mb-1 uppercase">Peserta</div>
                <div className="text-[16px] font-extrabold text-slate-900">{ktp.fullName}</div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">{ktp.nik}</div>
              </div>
            )}

            <button
              onClick={resetForm}
              className="flex items-center justify-center gap-2.5 w-full max-w-xs px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full font-extrabold text-[15px] transition-all shadow-lg shadow-blue-500/25 active:scale-[0.98]"
            >
              <RotateCcw className="h-5 w-5" />
              Scan Peserta Berikutnya
            </button>
            <button
              onClick={() => navigate("/petugas")}
              className="mt-3.5 text-sm text-slate-400 hover:text-slate-600 font-semibold transition"
            >
              Kembali ke daftar event
            </button>
          </div>
        )}
      </div>

      {/* ── Fixed Bottom Navigation ───────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-4 pb-6 pt-3 bg-white/90 backdrop-blur-3xl shadow-[0_-10px_40px_rgba(0,0,0,0.05)] rounded-t-[2rem]">
        {/* Home */}
        <button
          onClick={() => navigate("/petugas")}
          className="flex flex-col items-center gap-1 px-4 py-1.5 text-slate-400 hover:text-blue-500 transition-colors"
        >
          <Home size={20} />
          <span className="text-[10px] font-medium">Home</span>
        </button>
        {/* Riwayat */}
        <button
          onClick={() => navigate("/petugas")}
          className="flex flex-col items-center gap-1 px-4 py-1.5 text-slate-400 hover:text-blue-500 transition-colors"
        >
          <History size={20} />
          <span className="text-[10px] font-medium">Riwayat</span>
        </button>
        {/* Scan KTP - active */}
        <div className="flex flex-col items-center gap-1 px-4 py-1.5 rounded-full bg-blue-50 text-[#0054ca]">
          <ScanLine size={20} />
          <span className="text-[10px] font-bold">Scan KTP</span>
        </div>
        {/* QR Scan */}
        <button
          onClick={() => navigate(`/petugas/qr-scan/${eventId}`)}
          className="flex flex-col items-center gap-1 px-4 py-1.5 text-slate-400 hover:text-emerald-500 transition-colors"
        >
          <QrCode size={20} />
          <span className="text-[10px] font-medium">Scan QR</span>
        </button>
      </nav>

      {/* Decorative background */}
      <div className="fixed top-[-10%] right-[-10%] w-[50%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full -z-10 pointer-events-none" />
      <div className="fixed bottom-[-5%] left-[-10%] w-[40%] h-[30%] bg-indigo-500/5 blur-[100px] rounded-full -z-10 pointer-events-none" />
    </div>
  );
}
