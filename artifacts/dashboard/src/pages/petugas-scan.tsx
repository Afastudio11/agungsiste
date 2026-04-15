import { useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Upload, CheckCircle2, AlertCircle, AlertTriangle, Phone, Mail, Tag, FileText, User, Users, Zap, Sun, Eye, Contrast } from "lucide-react";
import { useAuth } from "@/lib/auth";
import KtpCamera from "@/components/ktp-camera";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type QualityWarning = "dark" | "overexposed" | "blurry" | "low_contrast" | null;

interface KtpMeta { tesseractScore: number; qualityWarning: QualityWarning; lowConfidence: boolean; engine?: string; }

interface KtpData {
  nik?: string; fullName?: string; address?: string; birthPlace?: string;
  birthDate?: string; gender?: string; religion?: string; maritalStatus?: string;
  occupation?: string; nationality?: string; rtRw?: string; kelurahan?: string;
  kecamatan?: string; province?: string; city?: string; bloodType?: string;
  _meta?: KtpMeta;
}

interface EventInfo { id: number; name: string; location?: string; eventDate: string; participantCount: number; }

const profesiList = [
  "Karyawan Swasta","PNS","Wiraswasta","Petani","Pedagang","Guru","Dokter",
  "Mahasiswa","Pelajar","TNI/Polri","Buruh","Nelayan","Ibu Rumah Tangga","Freelancer",
  "Arsitek","Insinyur","Akuntan","Programmer","Desainer","Jurnalis","Perawat","Bidan",
];

const qualityMessages: Record<string, { icon: React.ReactNode; text: string }> = {
  dark: { icon: <Sun className="h-3.5 w-3.5 shrink-0" />, text: "Gambar terlalu gelap, coba di tempat lebih terang" },
  overexposed: { icon: <Sun className="h-3.5 w-3.5 shrink-0" />, text: "Gambar terlalu terang, hindari cahaya langsung" },
  blurry: { icon: <Eye className="h-3.5 w-3.5 shrink-0" />, text: "Gambar kurang tajam, tahan kamera lebih stabil" },
  low_contrast: { icon: <Contrast className="h-3.5 w-3.5 shrink-0" />, text: "Kontras rendah, mungkin dari fotokopi pudar" },
};

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

  const [ktp, setKtp] = useState<KtpData>({});
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");

  const { data: event } = useQuery<EventInfo>({
    queryKey: ["event", eventId],
    queryFn: () => fetch(`${BASE}/api/events/${eventId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: eventId > 0,
  });

  const processBase64 = useCallback(async (base64: string) => {
    setScanning(true);
    setError("");
    setOcrMeta(null);
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
      setKtp(rest);
      setStep("form");
    } catch {
      setError("Gagal membaca KTP. Coba foto ulang dengan pencahayaan yang lebih baik.");
    } finally {
      setScanning(false);
    }
  }, []);

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      processBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleCameraCapture = (base64: string) => {
    setShowCamera(false);
    processBase64(base64);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const addTag = (t: string) => { if (t && !tags.includes(t)) setTags([...tags, t]); setCustomTag(""); };
  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const handleSubmit = async () => {
    if (!ktp.nik || !ktp.fullName) { setError("NIK dan nama lengkap diperlukan"); return; }
    setSubmitting(true); setError("");
    try {
      const r = await fetch(`${BASE}/api/ktp/register`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventId, staffId: user?.id, staffName: user?.name,
          phone: phone || undefined, email: email || undefined,
          notes: notes || undefined, tags: tags.join(", ") || undefined,
          ...ktp,
        }),
      });
      const data = await r.json();
      if (!r.ok) {
        setError(r.status === 409 ? "Peserta ini sudah terdaftar di event ini." : (data.error || "Gagal mendaftarkan"));
        return;
      }
      setSuccessMsg(data.message || "Berhasil didaftarkan!");
      setStep("done");
    } catch {
      setError("Terjadi kesalahan jaringan");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setKtp({}); setPhone(""); setEmail(""); setNotes(""); setTags([]);
    setError(""); setSuccessMsg(""); setOcrMeta(null); setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const F = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
    </div>
  );

  const qw = ocrMeta?.qualityWarning;

  return (
    <div className="min-h-screen bg-[#f0f4ff] pb-8" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {showCamera && (
        <KtpCamera
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Top bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <button onClick={() => navigate("/petugas")} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowLeft className="h-4 w-4 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-blue-600 tracking-wide">Scan KTP — On The Spot</div>
          <div className="text-sm font-extrabold text-slate-900 truncate">{event?.name || "Memuat..."}</div>
        </div>
        {event && (
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 shrink-0 bg-slate-50 px-2.5 py-1 rounded-lg">
            <Users className="h-3 w-3" />
            {event.participantCount}
          </div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">

        {/* STEP: Upload */}
        {step === "upload" && (
          <div>
            {/* Camera button (primary) */}
            <button
              onClick={() => !scanning && setShowCamera(true)}
              disabled={scanning}
              className={`w-full border-2 rounded-2xl p-8 text-center transition ${
                scanning ? "border-blue-300 bg-blue-50 cursor-wait" : "border-slate-200 bg-white hover:border-blue-400 hover:bg-blue-50/30 cursor-pointer"
              }`}
            >
              <div className="flex justify-center mb-3">
                {scanning ? (
                  <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center animate-pulse">
                    <Camera className="h-6 w-6 text-blue-600" />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-full bg-blue-600 flex items-center justify-center">
                    <Camera className="h-6 w-6 text-white" />
                  </div>
                )}
              </div>
              <div className="font-bold text-sm text-slate-800 mb-1">
                {scanning ? "Membaca KTP..." : "Buka Kamera"}
              </div>
              <div className="text-xs text-slate-500 mb-2">
                {scanning ? "Mohon tunggu beberapa saat" : "Foto KTP langsung dari kamera dengan panduan bingkai"}
              </div>
              {scanning && (
                <div className="mb-3 mx-8 h-1 overflow-hidden rounded-full bg-blue-100">
                  <div className="h-full rounded-full bg-blue-500 animate-pulse" style={{ width: "70%", animation: "pulse 1.5s ease-in-out infinite" }}></div>
                </div>
              )}
              {!scanning && (
                <div className="flex gap-2 justify-center">
                  <div className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl">
                    <Camera className="h-3.5 w-3.5" />
                    Buka Kamera
                  </div>
                </div>
              )}
              <div className="text-[10px] text-slate-400 mt-3 flex items-center justify-center gap-1">
                <Zap className="h-3 w-3 text-green-500" />
                OCR otomatis — Tesseract tanpa AI
              </div>
            </button>

            {/* Upload from file (secondary) */}
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !scanning && fileInputRef.current?.click()}
              className="mt-3 border border-dashed border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:border-slate-300 hover:bg-slate-50 transition"
            >
              <Upload className="h-4 w-4 text-slate-400 shrink-0" />
              <span className="text-xs text-slate-500">Atau upload dari galeri / file</span>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />

            {/* Tips kualitas foto */}
            <div className="mt-3 bg-white rounded-xl border border-slate-100 px-4 py-3">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Tips foto KTP</p>
              <div className="space-y-1.5">
                {[
                  { icon: <Sun className="h-3 w-3 text-amber-500" />, tip: "Foto di tempat terang, hindari bayangan" },
                  { icon: <Eye className="h-3 w-3 text-blue-500" />, tip: "Tahan kamera stabil, jangan blur" },
                  { icon: <Camera className="h-3 w-3 text-slate-500" />, tip: "Masukkan KTP ke dalam bingkai, pastikan terbaca jelas" },
                ].map(({ icon, tip }, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-500">
                    {icon} {tip}
                  </div>
                ))}
              </div>
            </div>

            {error && (
              <div className="mt-3 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}
          </div>
        )}

        {/* STEP: Form */}
        {step === "form" && (
          <div className="space-y-4">
            {/* KTP preview card */}
            <div className="bg-blue-900 rounded-2xl p-4 text-white">
              <div className="flex items-start justify-between mb-2">
                <div className="text-[10px] font-bold tracking-widest opacity-70">KARTU TANDA PENDUDUK</div>
                {/* OCR score badge */}
                {ocrMeta && (
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    ocrMeta.lowConfidence
                      ? "bg-amber-500/30 text-amber-200"
                      : "bg-green-500/30 text-green-200"
                  }`}>
                    <Zap className="h-2.5 w-2.5" /> {ocrMeta.engine === "gemini-flash" ? "Gemini AI" : ocrMeta.engine === "python-opencv" ? "OpenCV" : "Tesseract"} {ocrMeta.tesseractScore}%
                  </span>
                )}
              </div>

              {/* Quality / confidence warning */}
              {(qw || ocrMeta?.lowConfidence) && (
                <div className="flex items-center gap-1.5 bg-amber-400/20 text-amber-200 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg mb-3">
                  {qw ? qualityMessages[qw].icon : <AlertTriangle className="h-3.5 w-3.5 shrink-0" />}
                  <span>
                    {qw ? qualityMessages[qw].text : `Kepercayaan rendah (${ocrMeta?.tesseractScore}%) — periksa data di bawah`}
                  </span>
                </div>
              )}

              <div className="font-mono text-lg font-bold tracking-wider mb-1">{ktp.nik || "—"}</div>
              <div className="font-bold text-base mb-3">{ktp.fullName || "—"}</div>
              <div className="grid grid-cols-2 gap-2 text-xs opacity-80">
                <div><div className="opacity-60 text-[10px]">Tempat/Tgl Lahir</div><div>{ktp.birthPlace}, {ktp.birthDate}</div></div>
                <div><div className="opacity-60 text-[10px]">Jenis Kelamin</div><div>{ktp.gender}</div></div>
                <div><div className="opacity-60 text-[10px]">Pekerjaan</div><div>{ktp.occupation}</div></div>
                <div><div className="opacity-60 text-[10px]">Gol. Darah</div><div>{ktp.bloodType}</div></div>
              </div>
              <button onClick={() => setStep("upload")} className="mt-3 text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition">
                📷 Scan Ulang
              </button>
            </div>

            {/* Edit KTP fields */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                <User className="h-4 w-4 text-slate-500" />
                Data KTP (dapat diedit)
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><F label="NIK *" value={ktp.nik || ""} onChange={(v) => setKtp({ ...ktp, nik: v })} /></div>
                <div className="col-span-2"><F label="Nama Lengkap *" value={ktp.fullName || ""} onChange={(v) => setKtp({ ...ktp, fullName: v })} /></div>
                <F label="Kota/Kabupaten" value={ktp.city || ""} onChange={(v) => setKtp({ ...ktp, city: v })} />
                <F label="Kecamatan" value={ktp.kecamatan || ""} onChange={(v) => setKtp({ ...ktp, kecamatan: v })} />
                <F label="Kelurahan/Desa" value={ktp.kelurahan || ""} onChange={(v) => setKtp({ ...ktp, kelurahan: v })} />
                <F label="Pekerjaan" value={ktp.occupation || ""} onChange={(v) => setKtp({ ...ktp, occupation: v })} />
              </div>
            </div>

            {/* Contact */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                <Phone className="h-4 w-4 text-slate-500" />
                Data Kontak
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Nomor HP</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+62 8xx xxxx xxxx" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1"><Mail className="h-3.5 w-3.5 inline mr-1" />Email</label>
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@domain.com" type="email" className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              </div>
            </div>

            {/* Keterangan & Tagging */}
            <div className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-2">
                <Tag className="h-4 w-4 text-slate-500" />
                Keterangan & Tagging
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Profesi / Kategori</label>
                <div className="flex flex-wrap gap-1.5">
                  {profesiList.slice(0, 8).map((p) => (
                    <button key={p} type="button" onClick={() => { if (tags.includes(p)) removeTag(p); else addTag(p); }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${tags.includes(p) ? "bg-blue-600 border-blue-600 text-white" : "border-slate-200 text-slate-600 hover:border-blue-300"}`}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tag Tambahan</label>
                <div className="flex gap-2">
                  <input value={customTag} onChange={(e) => setCustomTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(customTag); } }}
                    placeholder="Tambah tag..." className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                  <button type="button" onClick={() => addTag(customTag)} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition">+</button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
                        {t}<button onClick={() => removeTag(t)} className="hover:text-red-600">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1"><FileText className="h-3.5 w-3.5 inline mr-1" />Catatan</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Catatan tambahan..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none" />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button onClick={handleSubmit} disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-2xl py-3.5 text-sm transition">
              <CheckCircle2 className="h-5 w-5" />
              {submitting ? "Menyimpan..." : "Submit Absen"}
            </button>
          </div>
        )}

        {/* STEP: Done */}
        {step === "done" && (
          <div className="text-center py-8">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 mb-4">
              <CheckCircle2 className="h-8 w-8 text-green-600" />
            </div>
            <div className="text-xl font-extrabold text-slate-900 mb-2">Berhasil!</div>
            <div className="text-sm text-slate-500 mb-6 max-w-xs mx-auto">{successMsg}</div>
            <button onClick={resetForm} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 py-3 rounded-2xl text-sm transition">
              📷 Scan Peserta Berikutnya
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
