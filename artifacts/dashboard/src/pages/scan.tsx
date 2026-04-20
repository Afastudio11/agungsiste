import { useState, useRef } from "react";
import Layout from "@/components/layout";
const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
import {
  useScanKtp,
  useRegisterKtp,
  useListEvents,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Camera, Upload, Sun, Contrast, Eye, Zap, ScanLine, CheckCircle, RotateCcw, PenLine } from "@/lib/icons";
import KtpCamera from "@/components/ktp-camera";

type QualityWarning = "dark" | "overexposed" | "blurry" | "low_contrast" | null;

type KtpMeta = {
  tesseractScore: number;
  qualityWarning: QualityWarning;
  lowConfidence: boolean;
  engine?: string;
};

const ALLOWED_KABUPATEN = ["Pacitan", "Trenggalek", "Magetan", "Ponorogo", "Ngawi"];

function isOutsideKabupaten(city: string | null | undefined): boolean {
  if (!city) return false;
  const c = city.trim().toLowerCase().replace(/^kab(upaten)?\.?\s*/i, "").replace(/^kota\s*/i, "").trim();
  return !ALLOWED_KABUPATEN.some((k) => k.toLowerCase() === c || city.toLowerCase().includes(k.toLowerCase()));
}

type KtpData = {
  nik?: string | null;
  fullName?: string | null;
  address?: string | null;
  birthPlace?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  religion?: string | null;
  maritalStatus?: string | null;
  occupation?: string | null;
  nationality?: string | null;
  rtRw?: string | null;
  kelurahan?: string | null;
  kecamatan?: string | null;
  province?: string | null;
  city?: string | null;
  bloodType?: string | null;
  validUntil?: string | null;
  phone?: string | null;
  email?: string | null;
  socialStatus?: string | null;
  _meta?: KtpMeta;
};

function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-white/60 shadow-xl shadow-slate-200/60 ${className}`}
      style={{ background: "rgba(255,255,255,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
    >
      {children}
    </div>
  );
}

function FieldRow({ label, value, onChange, placeholder, textarea, listId }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; textarea?: boolean; listId?: string;
}) {
  const inputClass = "flex-1 min-w-0 px-3 py-1.5 bg-slate-50 rounded-lg text-sm text-slate-800 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition font-medium border-0 shadow-sm";
  return (
    <div className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400 w-28 sm:w-32 shrink-0 pt-2 leading-tight">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "—"}
          rows={2}
          className={`${inputClass} resize-none`}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "—"}
          className={inputClass}
          list={listId}
        />
      )}
    </div>
  );
}

const qualityMessages: Record<string, { icon: React.ReactNode; text: string }> = {
  dark: { icon: <Sun className="h-3.5 w-3.5 shrink-0" />, text: "Gambar terlalu gelap — coba foto di tempat lebih terang" },
  overexposed: { icon: <Sun className="h-3.5 w-3.5 shrink-0" />, text: "Gambar terlalu terang — hindari cahaya langsung di KTP" },
  blurry: { icon: <Eye className="h-3.5 w-3.5 shrink-0" />, text: "Gambar kurang tajam — tahan kamera lebih stabil saat foto" },
  low_contrast: { icon: <Contrast className="h-3.5 w-3.5 shrink-0" />, text: "Kontras rendah — foto mungkin dari fotokopi pudar" },
};

export default function ScanPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedBase64, setCapturedBase64] = useState<string | null>(null);
  const [ktpData, setKtpData] = useState<KtpData | null>(null);
  const [editedData, setEditedData] = useState<KtpData>({});
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [staffName, setStaffName] = useState("");
  const [result, setResult] = useState<{ success: boolean; message: string; totalEventsJoined?: number } | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const getSettings = () => {
    try {
      const raw = localStorage.getItem("ktp_dashboard_settings");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const { data: events } = useListEvents({}, { query: { queryKey: getListEventsQueryKey({}) } });
  const scanKtp = useScanKtp();
  const registerKtp = useRegisterKtp();
  const { data: socialStatusCategories } = useQuery<string[]>({
    queryKey: ["social-status-categories"],
    queryFn: () => fetch(`${BASE}/api/participants/social-status-categories`, { credentials: "include" }).then((r) => r.json()),
    staleTime: 300_000,
  });

  const processBase64 = async (base64: string, previewSrc?: string) => {
    setKtpData(null); setEditedData({}); setResult(null); setIsDuplicate(false);
    setCapturedBase64(base64);
    if (previewSrc) setPreviewUrl(previewSrc);
    try {
      const data = await scanKtp.mutateAsync({ data: { imageBase64: base64 } });
      setKtpData(data as KtpData);
      const { _meta, ...rest } = data as KtpData;
      setEditedData(rest);
    } catch {
      setKtpData({});
      setEditedData({});
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      await processBase64(base64, url);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = (ev.target?.result as string).split(",")[1];
      await processBase64(base64, url);
    };
    reader.readAsDataURL(file);
  };

  const handleCameraCapture = async (base64: string) => {
    setShowCamera(false);
    const previewSrc = `data:image/jpeg;base64,${base64}`;
    await processBase64(base64, previewSrc);
  };

  const handleField = (key: keyof KtpData, val: string) => {
    setEditedData((prev) => ({ ...prev, [key]: val }));
  };

  const handleRegister = async () => {
    if (!selectedEventId) return alert("Pilih kegiatan terlebih dahulu");
    if (!editedData.nik) return alert("NIK tidak boleh kosong");
    if (!editedData.fullName) return alert("Nama lengkap tidak boleh kosong");
    setResult(null); setIsDuplicate(false);
    try {
      const res = await registerKtp.mutateAsync({
        data: {
          eventId: selectedEventId,
          nik: editedData.nik!,
          fullName: editedData.fullName!,
          staffName: staffName.trim() || null,
          ...editedData,
        },
      });
      const s = getSettings();
      const msg = s.showTotalOnSuccess === false ? "Peserta berhasil didaftarkan" : res.message;
      setResult({ success: true, message: msg, totalEventsJoined: res.totalEventsJoined });
      if (capturedBase64 && editedData.nik) {
        fetch(`${BASE}/api/ktp/save-image`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nik: editedData.nik, imageBase64: capturedBase64 }),
        }).catch(() => {});
      }
      if (s.autoResetForm) setTimeout(() => handleReset(), 2500);
    } catch (err: any) {
      const body = err?.response?.data ?? err?.data;
      if (body?.error && body?.totalEventsJoined !== undefined) {
        setIsDuplicate(true);
        setResult({ success: false, message: `Peserta sudah terdaftar di event ini. Total event diikuti: ${body.totalEventsJoined}`, totalEventsJoined: body.totalEventsJoined });
      } else {
        setResult({ success: false, message: "Terjadi kesalahan. Coba lagi." });
      }
    }
  };

  const handleReset = () => {
    setPreviewUrl(null); setCapturedBase64(null); setKtpData(null); setEditedData({});
    setResult(null); setIsDuplicate(false); setSelectedEventId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const meta = ktpData?._meta;
  const qw = meta?.qualityWarning;

  return (
    <Layout role="any">
      {showCamera && (
        <KtpCamera onCapture={handleCameraCapture} onClose={() => setShowCamera(false)} />
      )}

      {/* Background decorative blobs */}
      <div className="fixed top-0 right-0 -z-10 w-[600px] h-[600px] bg-blue-500/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 left-64 -z-10 w-[400px] h-[400px] bg-violet-500/4 rounded-full blur-[100px] pointer-events-none" />

      {/* Success state */}
      {result?.success ? (
        <div className="flex flex-col items-center justify-center py-20">
          <GlassCard className="p-12 max-w-md w-full text-center">
            <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 mb-5 mx-auto">
              <CheckCircle className="h-10 w-10 text-emerald-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Berhasil Didaftarkan!</h2>
            <p className="text-slate-500 text-sm mb-8">{result.message}</p>
            <button
              onClick={handleReset}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all"
            >
              <RotateCcw className="h-4 w-4" />
              Scan KTP Berikutnya
            </button>
          </GlassCard>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Scan status badge */}
          {ktpData !== null && !meta?.lowConfidence && (
            <div className="flex justify-end">
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-full border border-emerald-200/60">
                <CheckCircle className="h-4 w-4 fill-emerald-100" />
                <span className="text-xs font-bold tracking-wider">Data Terdeteksi</span>
              </div>
            </div>
          )}

          {/* Staff name bar */}
          <GlassCard className="px-5 py-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            <label className="text-[10px] font-bold tracking-widest text-slate-500 whitespace-nowrap">Nama Staf</label>
            <input
              type="text"
              placeholder="Masukkan nama Anda sebelum mulai scan..."
              value={staffName}
              onChange={(e) => setStaffName(e.target.value)}
              className="flex-1 rounded-xl border-0 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-sm"
            />
          </GlassCard>

          {/* Duplicate / error result banner */}
          {result && !result.success && (
            <div className={`rounded-2xl border p-4 ${isDuplicate ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900"}`}>
              <p className="font-bold text-sm">{isDuplicate ? "Peserta Sudah Terdaftar" : "Pendaftaran Gagal"}</p>
              <p className="mt-1 text-xs">{result.message}</p>
            </div>
          )}

          {/* Asymmetric 5/7 grid */}
          <div className="grid grid-cols-12 gap-6 items-start">

            {/* Left column: Document Preview */}
            <div className="col-span-12 lg:col-span-5 space-y-5 lg:sticky lg:top-6">
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold text-slate-500 tracking-widest">Document Preview</span>
                  {previewUrl && (
                    <button
                      onClick={handleReset}
                      className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full hover:bg-slate-100 transition"
                      title="Scan ulang"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Image area */}
                {previewUrl ? (
                  <div className="relative group overflow-hidden rounded-xl bg-slate-200" style={{ aspectRatio: "1.58/1" }}>
                    <img
                      src={previewUrl}
                      alt="Foto KTP"
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-4">
                      <p className="text-white text-xs font-medium">Foto KTP yang di-scan</p>
                    </div>
                  </div>
                ) : (
                  <div
                    onDrop={handleDrop}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                    onDragLeave={() => setIsDragging(false)}
                    onClick={() => !scanKtp.isPending && fileRef.current?.click()}
                    className={`relative overflow-hidden rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all ${
                      isDragging
                        ? "border-blue-400 bg-blue-50"
                        : "border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/30"
                    }`}
                    style={{ aspectRatio: "1.58/1" }}
                  >
                    <div className="h-14 w-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                      <ScanLine className="h-7 w-7 text-slate-400" />
                    </div>
                    <p className="text-sm font-semibold text-slate-500">Drag & drop foto KTP</p>
                    <p className="text-xs text-slate-400 mt-1">atau klik untuk upload</p>
                  </div>
                )}

                {/* Scanning progress */}
                {scanKtp.isPending && (
                  <div className="mt-4 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                    <div className="flex items-center gap-2.5 text-sm font-semibold text-blue-700 mb-2">
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                      Membaca data KTP...
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-blue-100">
                      <div className="h-full rounded-full bg-blue-500 animate-pulse" style={{ width: "65%" }} />
                    </div>
                  </div>
                )}

                {/* Quality warning */}
                {qw && qualityMessages[qw] && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
                    {qualityMessages[qw].icon}
                    <span>{qualityMessages[qw].text}</span>
                  </div>
                )}

                {/* Camera & Upload buttons */}
                <div className="mt-5 flex gap-3">
                  <button
                    onClick={() => setShowCamera(true)}
                    disabled={scanKtp.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full text-sm font-bold shadow-md shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                  >
                    <Camera className="h-4 w-4" />
                    Kamera
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={scanKtp.isPending}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-white border border-slate-200 text-slate-600 rounded-full text-sm font-semibold hover:bg-slate-50 transition-all disabled:opacity-50"
                  >
                    <Upload className="h-4 w-4" />
                    Upload
                  </button>
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handleFileChange} className="hidden" />
              </GlassCard>

              {/* Event selection — only after scan */}
              {ktpData !== null && (
                <GlassCard className="p-6">
                  <p className="text-[10px] font-bold text-slate-500 tracking-widest mb-4">Pilih Kegiatan & Daftarkan</p>
                  <select
                    value={selectedEventId ?? ""}
                    onChange={(e) => setSelectedEventId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-xl border-0 bg-slate-50 shadow-sm px-4 py-3 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition mb-4"
                  >
                    <option value="">— Pilih Kegiatan —</option>
                    {events?.map((ev) => (
                      <option key={ev.id} value={ev.id}>{ev.name} ({ev.eventDate})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleRegister}
                    disabled={!selectedEventId || registerKtp.isPending}
                    className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-500 text-white rounded-full font-bold shadow-lg shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {registerKtp.isPending ? "Mendaftarkan..." : "Konfirmasi & Daftarkan"}
                  </button>
                  {result && !result.success && (
                    <button
                      onClick={handleReset}
                      className="mt-3 w-full flex items-center justify-center gap-2 px-6 py-3 bg-white border border-slate-200 text-slate-500 rounded-full text-sm font-semibold hover:bg-slate-50 transition"
                    >
                      Scan Ulang
                    </button>
                  )}
                </GlassCard>
              )}
            </div>

            {/* Right column: Editable form */}
            <div className="col-span-12 lg:col-span-7">
              <GlassCard className="p-7">
                <h3 className="text-lg font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <PenLine className="h-5 w-5 text-blue-600" />
                  Identity Details
                  {ktpData !== null && <span className="ml-auto text-xs font-normal text-slate-400">Edit jika ada yang salah</span>}
                </h3>

                {ktpData === null ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
                      <ScanLine className="h-8 w-8 text-slate-300" />
                    </div>
                    <p className="text-slate-400 font-medium text-sm">Buka kamera atau upload foto KTP</p>
                    <p className="text-slate-300 text-xs mt-1">Data akan terisi otomatis setelah scan</p>
                  </div>
                ) : (
                  <div>
                    <FieldRow label="NIK" value={(editedData.nik as string) ?? ""} onChange={(v) => handleField("nik", v)} placeholder="16 digit NIK" />
                    <FieldRow label="Nama Lengkap" value={(editedData.fullName as string) ?? ""} onChange={(v) => handleField("fullName", v)} placeholder="Sesuai KTP" />
                    <FieldRow label="Tempat Lahir" value={(editedData.birthPlace as string) ?? ""} onChange={(v) => handleField("birthPlace", v)} />
                    <FieldRow label="Tanggal Lahir" value={(editedData.birthDate as string) ?? ""} onChange={(v) => handleField("birthDate", v)} />
                    <FieldRow label="Jenis Kelamin" value={(editedData.gender as string) ?? ""} onChange={(v) => handleField("gender", v)} />
                    <FieldRow label="Agama" value={(editedData.religion as string) ?? ""} onChange={(v) => handleField("religion", v)} />
                    <FieldRow label="Gol. Darah" value={(editedData.bloodType as string) ?? ""} onChange={(v) => handleField("bloodType", v)} />
                    <FieldRow label="Status Kawin" value={(editedData.maritalStatus as string) ?? ""} onChange={(v) => handleField("maritalStatus", v)} />
                    <FieldRow label="Kewarganegaraan" value={(editedData.nationality as string) ?? ""} onChange={(v) => handleField("nationality", v)} />
                    <FieldRow label="Pekerjaan" value={(editedData.occupation as string) ?? ""} onChange={(v) => handleField("occupation", v)} />
                    <FieldRow label="Alamat" value={(editedData.address as string) ?? ""} onChange={(v) => handleField("address", v)} placeholder="Alamat sesuai KTP" textarea />
                    <FieldRow label="RT/RW" value={(editedData.rtRw as string) ?? ""} onChange={(v) => handleField("rtRw", v)} />
                    <FieldRow label="Kelurahan/Desa" value={(editedData.kelurahan as string) ?? ""} onChange={(v) => handleField("kelurahan", v)} />
                    <FieldRow label="Kecamatan" value={(editedData.kecamatan as string) ?? ""} onChange={(v) => handleField("kecamatan", v)} />
                    <div className={isOutsideKabupaten(editedData.city) ? "rounded-xl border border-amber-300 bg-amber-50 px-2 -mx-2" : ""}>
                      <FieldRow label="Kabupaten/Kota" value={(editedData.city as string) ?? ""} onChange={(v) => handleField("city", v)} />
                      {isOutsideKabupaten(editedData.city) && (
                        <div className="flex items-start gap-1.5 pb-2 px-1 text-xs text-amber-800 font-semibold">
                          <span className="text-base leading-none mt-0.5">⚠️</span>
                          <span>Di luar wilayah 5 kabupaten (Pacitan, Trenggalek, Magetan, Ponorogo, Ngawi) — mohon verifikasi data</span>
                        </div>
                      )}
                    </div>
                    <FieldRow label="Provinsi" value={(editedData.province as string) ?? ""} onChange={(v) => handleField("province", v)} />

                    {/* Divider */}
                    <div className="pt-2 pb-1">
                      <p className="text-[10px] font-bold tracking-widest text-slate-400">Informasi Tambahan</p>
                    </div>
                    <FieldRow label="No. Telepon" value={(editedData.phone as string) ?? ""} onChange={(v) => handleField("phone", v)} placeholder="Cth: 08123456789" />
                    <FieldRow label="Email" value={(editedData.email as string) ?? ""} onChange={(v) => handleField("email", v)} placeholder="Cth: nama@email.com" />
                    {(socialStatusCategories ?? []).length > 0 && (
                      <datalist id="social-status-list">
                        {(socialStatusCategories ?? []).map((c) => <option key={c} value={c} />)}
                      </datalist>
                    )}
                    <FieldRow
                      label="Status Sosial"
                      value={(editedData.socialStatus as string) ?? ""}
                      onChange={(v) => handleField("socialStatus", v)}
                      placeholder="Cth: DTKS, Non-DTKS, dll"
                      listId="social-status-list"
                    />
                    <p className="text-[10px] text-slate-400 italic text-right pt-3">Data disimpan saat klik "Konfirmasi & Daftarkan"</p>
                  </div>
                )}
              </GlassCard>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
