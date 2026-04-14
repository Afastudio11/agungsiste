import { useState, useRef } from "react";
import Layout from "@/components/layout";
import {
  useScanKtp,
  useRegisterKtp,
  useListEvents,
  getListEventsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Camera, Upload, AlertTriangle, Sun, Contrast, Eye, Zap } from "lucide-react";
import KtpCamera from "@/components/ktp-camera";

type QualityWarning = "dark" | "overexposed" | "blurry" | "low_contrast" | null;

type KtpMeta = {
  tesseractScore: number;
  qualityWarning: QualityWarning;
  lowConfidence: boolean;
};

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
  _meta?: KtpMeta;
};

const qualityMessages: Record<string, { icon: React.ReactNode; text: string; color: string }> = {
  dark: { icon: <Sun className="h-3.5 w-3.5" />, text: "Gambar terlalu gelap — coba foto di tempat lebih terang", color: "bg-amber-50 border-amber-200 text-amber-800" },
  overexposed: { icon: <Sun className="h-3.5 w-3.5" />, text: "Gambar terlalu terang — hindari cahaya langsung di KTP", color: "bg-amber-50 border-amber-200 text-amber-800" },
  blurry: { icon: <Eye className="h-3.5 w-3.5" />, text: "Gambar kurang tajam — tahan kamera lebih stabil saat foto", color: "bg-amber-50 border-amber-200 text-amber-800" },
  low_contrast: { icon: <Contrast className="h-3.5 w-3.5" />, text: "Kontras rendah — foto mungkin dari fotokopi pudar", color: "bg-amber-50 border-amber-200 text-amber-800" },
};

export default function ScanPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ktpData, setKtpData] = useState<KtpData | null>(null);
  const [editedData, setEditedData] = useState<KtpData>({});
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [staffName, setStaffName] = useState("");
  const [result, setResult] = useState<{ success: boolean; message: string; totalEventsJoined?: number } | null>(null);
  const [isDuplicate, setIsDuplicate] = useState(false);
  const [showCamera, setShowCamera] = useState(false);

  const getSettings = () => {
    try {
      const raw = localStorage.getItem("ktp_dashboard_settings");
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  };

  const { data: events } = useListEvents({}, { query: { queryKey: getListEventsQueryKey({}) } });
  const scanKtp = useScanKtp();
  const registerKtp = useRegisterKtp();

  const processBase64 = async (base64: string, previewSrc?: string) => {
    setKtpData(null); setEditedData({}); setResult(null); setIsDuplicate(false);
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

  const handleCameraCapture = async (base64: string) => {
    setShowCamera(false);
    const previewSrc = `data:image/jpeg;base64,${base64}`;
    await processBase64(base64, previewSrc);
  };

  const handleField = (key: keyof KtpData, val: string) => {
    setEditedData((prev) => ({ ...prev, [key]: val }));
  };

  const handleRegister = async () => {
    if (!selectedEventId) return alert("Pilih event terlebih dahulu");
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
    setPreviewUrl(null); setKtpData(null); setEditedData({});
    setResult(null); setIsDuplicate(false); setSelectedEventId(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const fields: { key: keyof KtpData; label: string }[] = [
    { key: "nik", label: "NIK" },
    { key: "fullName", label: "Nama Lengkap" },
    { key: "birthPlace", label: "Tempat Lahir" },
    { key: "birthDate", label: "Tanggal Lahir" },
    { key: "gender", label: "Jenis Kelamin" },
    { key: "religion", label: "Agama" },
    { key: "maritalStatus", label: "Status Perkawinan" },
    { key: "occupation", label: "Pekerjaan" },
    { key: "nationality", label: "Kewarganegaraan" },
    { key: "address", label: "Alamat" },
    { key: "rtRw", label: "RT/RW" },
    { key: "kelurahan", label: "Kelurahan/Desa" },
    { key: "kecamatan", label: "Kecamatan" },
    { key: "city", label: "Kabupaten/Kota" },
    { key: "province", label: "Provinsi" },
    { key: "bloodType", label: "Golongan Darah" },
  ];

  const meta = ktpData?._meta;
  const qw = meta?.qualityWarning;

  return (
    <Layout role="any">
      {showCamera && (
        <KtpCamera
          onCapture={handleCameraCapture}
          onClose={() => setShowCamera(false)}
        />
      )}

      <div className="space-y-5">
        <div>
          <h1 className="text-[22px] md:text-[26px] font-extrabold text-slate-900 leading-tight" style={{ letterSpacing: "-0.03em" }}>
            Scan KTP
          </h1>
          <p className="mt-1 text-sm text-slate-400 font-medium">Upload atau foto KTP, sistem akan membaca data secara otomatis</p>
        </div>

        {/* Staff name bar */}
        <div className="rounded-2xl border border-slate-100 bg-white px-5 py-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)] flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
          <label className="text-[12px] font-bold uppercase tracking-[0.08em] text-slate-400 whitespace-nowrap">Nama Staf</label>
          <input
            type="text"
            placeholder="Masukkan nama Anda sebelum mulai scan..."
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-blue-400 focus:bg-white transition-colors"
          />
        </div>

        {result && (
          <div className={`rounded-lg border p-4 ${result.success ? "border-green-200 bg-green-50 text-green-900" : isDuplicate ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-900"}`}>
            <p className="font-medium">{result.success ? "Berhasil!" : isDuplicate ? "Peringatan Duplikat" : "Gagal"}</p>
            <p className="mt-1 text-sm">{result.message}</p>
            {result.success && (
              <button onClick={handleReset} className="mt-3 rounded-md bg-green-700 px-4 py-2 text-xs font-medium text-white hover:bg-green-800">
                Scan KTP Berikutnya
              </button>
            )}
          </div>
        )}

        {!result?.success && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-4">
              <div className="rounded-lg border bg-card p-5">
                <h2 className="mb-1 text-sm font-semibold">Foto KTP</h2>
                <p className="mb-3 text-xs text-muted-foreground">Foto hanya digunakan untuk membaca data, tidak disimpan.</p>

                {/* Camera & upload buttons */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowCamera(true)}
                    className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 transition-colors"
                  >
                    <Camera className="h-3.5 w-3.5" />
                    Buka Kamera
                  </button>
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    Upload File
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </div>

                {previewUrl && (
                  <div className="mt-4">
                    <img src={previewUrl} alt="Preview KTP" className="max-h-48 w-full rounded-md object-contain border" />
                  </div>
                )}

                {scanKtp.isPending && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent"></div>
                    Membaca data KTP...
                  </div>
                )}

                {/* Quality warning */}
                {qw && qualityMessages[qw] && (
                  <div className={`mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium ${qualityMessages[qw].color}`}>
                    {qualityMessages[qw].icon}
                    <span>{qualityMessages[qw].text}</span>
                  </div>
                )}

                {/* Low confidence warning */}
                {meta?.lowConfidence && !qw && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-medium text-amber-800">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>Kepercayaan OCR rendah (skor {meta.tesseractScore}/100). Periksa & perbaiki data di bawah.</span>
                  </div>
                )}

                {/* OCR score badge */}
                {meta && (
                  <div className="mt-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      meta.lowConfidence
                        ? "bg-amber-100 text-amber-700"
                        : "bg-green-100 text-green-700"
                    }`}>
                      <Zap className="h-3 w-3" />
                      OCR Tesseract — skor {meta.tesseractScore}/100
                    </span>
                  </div>
                )}
              </div>

              {ktpData !== null && (
                <div className="rounded-lg border bg-card p-5">
                  <h2 className="mb-3 text-sm font-semibold">Pilih Event</h2>
                  <select
                    value={selectedEventId ?? ""}
                    onChange={(e) => setSelectedEventId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">-- Pilih Event --</option>
                    {events?.map((ev) => (
                      <option key={ev.id} value={ev.id}>{ev.name} ({ev.eventDate})</option>
                    ))}
                  </select>
                  <button
                    onClick={handleRegister}
                    disabled={!selectedEventId || registerKtp.isPending}
                    className="mt-3 w-full rounded-md bg-primary py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {registerKtp.isPending ? "Mendaftarkan..." : "Daftarkan Peserta"}
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-lg border bg-card p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold">Data KTP Terdeteksi</h2>
                {ktpData !== null && <span className="text-xs text-muted-foreground">Edit jika ada yang salah</span>}
              </div>
              {ktpData === null ? (
                <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Buka kamera atau upload foto KTP untuk melihat data
                </div>
              ) : (
                <div className="space-y-2">
                  {fields.map((f) => (
                    <div key={f.key} className="flex items-center gap-2">
                      <label className="w-36 shrink-0 text-xs text-muted-foreground">{f.label}</label>
                      <input
                        type="text"
                        value={(editedData[f.key] as string) ?? ""}
                        onChange={(e) => handleField(f.key, e.target.value)}
                        className={`flex-1 rounded border px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring ${
                          !editedData[f.key] ? "border-slate-200 bg-slate-50 text-slate-400 italic" : ""
                        }`}
                        placeholder="Tidak terdeteksi"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
