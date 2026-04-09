import { useState, useRef, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Camera, Upload, CheckCircle2, AlertCircle, Phone, Mail, Tag, FileText, User } from "lucide-react";
import { useAuth } from "@/lib/auth";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface KtpData {
  nik?: string; fullName?: string; address?: string; birthPlace?: string;
  birthDate?: string; gender?: string; religion?: string; maritalStatus?: string;
  occupation?: string; nationality?: string; rtRw?: string; kelurahan?: string;
  kecamatan?: string; province?: string; city?: string; bloodType?: string;
}

interface EventInfo {
  id: number; name: string; location?: string; eventDate: string; participantCount: number;
}

const profesiList = [
  "Karyawan Swasta","PNS","Wiraswasta","Petani","Pedagang","Guru","Dokter",
  "Mahasiswa","Pelajar","TNI/Polri","Buruh","Nelayan","Ibu Rumah Tangga","Freelancer",
  "Arsitek","Insinyur","Akuntan","Programmer","Desainer","Jurnalis","Perawat","Bidan",
];

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

  const processImage = useCallback(async (base64: string) => {
    setScanning(true);
    setError("");
    try {
      const r = await fetch(`${BASE}/api/ktp/scan`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      if (!r.ok) throw new Error("Gagal scan KTP");
      const data: KtpData = await r.json();
      setKtp(data);
      setStep("form");
    } catch (e) {
      setError("Gagal membaca KTP. Coba upload foto yang lebih jelas.");
    } finally {
      setScanning(false);
    }
  }, []);

  const handleFile = async (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      processImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const addTag = (t: string) => {
    if (t && !tags.includes(t)) setTags([...tags, t]);
    setCustomTag("");
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const handleSubmit = async () => {
    if (!ktp.nik || !ktp.fullName) {
      setError("NIK dan nama lengkap diperlukan");
      return;
    }
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
        if (r.status === 409) {
          setError("Peserta ini sudah terdaftar di event ini.");
        } else {
          setError(data.error || "Gagal mendaftarkan");
        }
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
    setKtp({});
    setPhone(""); setEmail(""); setNotes(""); setTags([]);
    setError(""); setSuccessMsg("");
    setStep("upload");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const F = ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-600 mb-1">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
      />
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/petugas")} className="p-1.5 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="h-4 w-4 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-orange-600">Scan KTP — On The Spot</div>
          <div className="text-sm font-bold text-slate-900 truncate">{event?.name || "Memuat..."}</div>
        </div>
        {event && (
          <div className="text-xs text-slate-400 shrink-0">{event.participantCount} terdaftar</div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4">
        {/* STEP: Upload */}
        {step === "upload" && (
          <div>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => !scanning && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition ${
                scanning ? "border-orange-300 bg-orange-50" : "border-slate-300 bg-white hover:border-orange-400 hover:bg-orange-50/50"
              }`}
            >
              <div className="flex justify-center mb-3">
                {scanning ? (
                  <div className="h-12 w-12 rounded-full bg-orange-100 flex items-center justify-center animate-pulse">
                    <Camera className="h-6 w-6 text-orange-500" />
                  </div>
                ) : (
                  <div className="h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center">
                    <Camera className="h-6 w-6 text-slate-500" />
                  </div>
                )}
              </div>
              <div className="font-bold text-sm text-slate-800 mb-1">
                {scanning ? "Membaca KTP dengan AI..." : "Upload Foto KTP"}
              </div>
              <div className="text-xs text-slate-500 mb-4">
                {scanning ? "Mohon tunggu beberapa saat" : "Klik atau drag & drop foto KTP di sini"}
              </div>
              {!scanning && (
                <div className="flex gap-2 justify-center">
                  <div className="flex items-center gap-1.5 bg-orange-500 text-white text-xs font-bold px-4 py-2 rounded-xl">
                    <Upload className="h-3.5 w-3.5" />
                    Pilih Foto
                  </div>
                </div>
              )}
              <div className="text-[10px] text-slate-400 mt-3 flex items-center justify-center gap-1">
                ⚡ AI akan membaca data KTP secara otomatis
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
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
            {/* KTP Data */}
            <div className="bg-blue-900 rounded-2xl p-4 text-white">
              <div className="text-[10px] font-bold tracking-widest opacity-70 mb-2">KARTU TANDA PENDUDUK</div>
              <div className="font-mono text-lg font-bold tracking-wider mb-1">{ktp.nik || "—"}</div>
              <div className="font-bold text-base mb-3">{ktp.fullName || "—"}</div>
              <div className="grid grid-cols-2 gap-2 text-xs opacity-80">
                <div><div className="opacity-60 text-[10px]">Tempat/Tgl Lahir</div><div>{ktp.birthPlace}, {ktp.birthDate}</div></div>
                <div><div className="opacity-60 text-[10px]">Jenis Kelamin</div><div>{ktp.gender}</div></div>
                <div><div className="opacity-60 text-[10px]">Pekerjaan</div><div>{ktp.occupation}</div></div>
                <div><div className="opacity-60 text-[10px]">Gol. Darah</div><div>{ktp.bloodType}</div></div>
              </div>
              <button
                onClick={() => setStep("upload")}
                className="mt-3 text-xs bg-white/15 hover:bg-white/25 px-3 py-1.5 rounded-lg transition"
              >
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
                <div className="col-span-2">
                  <F label="NIK *" value={ktp.nik || ""} onChange={(v) => setKtp({ ...ktp, nik: v })} />
                </div>
                <div className="col-span-2">
                  <F label="Nama Lengkap *" value={ktp.fullName || ""} onChange={(v) => setKtp({ ...ktp, fullName: v })} />
                </div>
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
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+62 8xx xxxx xxxx"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  <Mail className="h-3.5 w-3.5 inline mr-1" />Email
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@domain.com"
                  type="email"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                />
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
                    <button
                      key={p}
                      type="button"
                      onClick={() => {
                        if (tags.includes(p)) removeTag(p);
                        else addTag(p);
                      }}
                      className={`text-xs px-2.5 py-1 rounded-full border transition ${
                        tags.includes(p)
                          ? "bg-orange-500 border-orange-500 text-white"
                          : "border-slate-200 text-slate-600 hover:border-orange-300"
                      }`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Tag Tambahan</label>
                <div className="flex gap-2">
                  <input
                    value={customTag}
                    onChange={(e) => setCustomTag(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(customTag); } }}
                    placeholder="Tambah tag..."
                    className="flex-1 px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                  <button
                    type="button"
                    onClick={() => addTag(customTag)}
                    className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold rounded-xl transition"
                  >
                    +
                  </button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {tags.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 text-xs bg-orange-100 text-orange-700 px-2.5 py-1 rounded-full">
                        {t}
                        <button onClick={() => removeTag(t)} className="hover:text-red-600">×</button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  <FileText className="h-3.5 w-3.5 inline mr-1" />Catatan
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  placeholder="Catatan tambahan..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition resize-none"
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white font-bold rounded-2xl py-3.5 text-sm transition"
            >
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
            <button
              onClick={resetForm}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold px-8 py-3 rounded-2xl text-sm transition"
            >
              📷 Scan Peserta Berikutnya
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
