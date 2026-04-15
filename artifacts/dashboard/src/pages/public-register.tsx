import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import { Camera, Upload, CheckCircle, AlertTriangle, User, CreditCard, ArrowLeft, Loader2 } from "lucide-react";
import KtpCamera from "@/components/ktp-camera";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type EventInfo = {
  id: number;
  name: string;
  description?: string;
  category?: string;
  location?: string;
  eventDate: string;
  startTime?: string;
  endTime?: string;
  status: string;
  mode: "registration" | "attendance";
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
};

type Step = "loading" | "event-info" | "check-nik" | "scan-ktp" | "fill-form" | "success" | "error";

export default function PublicRegisterPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("loading");
  const [event, setEvent] = useState<EventInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [nikInput, setNikInput] = useState("");
  const [existingParticipant, setExistingParticipant] = useState<any>(null);
  const [ktpData, setKtpData] = useState<KtpData>({});
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [scanning, setScanning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    fetch(`${BASE}/api/events/public/by-token/${token}`)
      .then((r) => {
        if (!r.ok) throw new Error("Event tidak ditemukan");
        return r.json();
      })
      .then((data) => {
        setEvent(data);
        setStep("event-info");
      })
      .catch(() => {
        setErrorMsg("Link tidak valid atau event tidak ditemukan");
        setStep("error");
      });
  }, [token]);

  const checkNik = async () => {
    if (!nikInput || nikInput.length < 16) return;
    try {
      const res = await fetch(`${BASE}/api/events/public/check-nik`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik: nikInput, eventToken: token }),
      });
      const data = await res.json();
      if (data.found && data.eventCount >= 2) {
        setExistingParticipant(data.participant);
        setKtpData({
          nik: data.participant.nik,
          fullName: data.participant.fullName,
          gender: data.participant.gender,
          address: data.participant.address,
          province: data.participant.province,
          city: data.participant.city,
        });
        setStep("fill-form");
      } else if (data.found) {
        setExistingParticipant(data.participant);
        setStep("scan-ktp");
      } else {
        setStep("scan-ktp");
      }
    } catch {
      setStep("scan-ktp");
    }
  };

  const processImage = async (base64: string, preview?: string) => {
    setScanning(true);
    setCapturedImage(base64);
    if (preview) setPreviewUrl(preview);
    try {
      const res = await fetch(`${BASE}/api/ktp/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      const { _meta, ...rest } = data;
      setKtpData(rest);
      setStep("fill-form");
    } catch {
      setErrorMsg("Gagal membaca KTP. Coba lagi.");
    } finally {
      setScanning(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const b64 = result.split(",")[1];
      processImage(b64, result);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async () => {
    if (!ktpData.nik || !ktpData.fullName || !event) return;
    setSubmitting(true);
    try {
      if (capturedImage && !existingParticipant) {
        await fetch(`${BASE}/api/ktp/save-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nik: ktpData.nik, imageBase64: capturedImage, eventToken: token }),
        }).catch(() => {});
      }

      const res = await fetch(`${BASE}/api/events/public/register/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...ktpData, phone, email }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg(data.message || "Berhasil!");
        setStep("success");
      } else {
        setErrorMsg(data.error || "Gagal mendaftar");
        setStep("error");
      }
    } catch {
      setErrorMsg("Terjadi kesalahan. Coba lagi.");
      setStep("error");
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setStep("event-info");
    setNikInput("");
    setExistingParticipant(null);
    setKtpData({});
    setPhone("");
    setEmail("");
    setPreviewUrl(null);
    setCapturedImage(null);
    setErrorMsg("");
    setSuccessMsg("");
  };

  if (step === "loading") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-red-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-slate-800 mb-2">Gagal</h2>
          <p className="text-slate-600 mb-6">{errorMsg}</p>
          <button onClick={resetForm} className="px-6 py-2.5 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700">
            Coba Lagi
          </button>
        </div>
      </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-green-50 to-white flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full text-center">
          <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-slate-800 mb-2">{successMsg}</h2>
          <p className="text-slate-600 mb-2">{event?.name}</p>
          <p className="text-sm text-slate-500 mb-6">
            {event?.eventDate} {event?.startTime ? `• ${event.startTime}` : ""}
            {event?.location ? ` • ${event.location}` : ""}
          </p>
          <button onClick={resetForm} className="px-6 py-2.5 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700">
            Daftar Peserta Lain
          </button>
        </div>
      </div>
    );
  }

  const modeLabel = event?.mode === "attendance" ? "Absensi" : "Registrasi";
  const modeColor = event?.mode === "attendance" ? "orange" : "blue";

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      {showCamera && (
        <KtpCamera
          onCapture={(b64) => {
            setShowCamera(false);
            processImage(b64);
          }}
          onClose={() => setShowCamera(false)}
        />
      )}

      <div className="max-w-lg mx-auto p-4 py-8">
        <div className={`bg-${modeColor}-600 text-white rounded-2xl p-6 mb-6 text-center`}
          style={{ background: event?.mode === "attendance" ? "#ea580c" : "#2563eb" }}>
          <p className="text-sm font-medium opacity-90 mb-1">{modeLabel} Event</p>
          <h1 className="text-2xl font-bold mb-2">{event?.name}</h1>
          {event?.eventDate && <p className="text-sm opacity-90">{event.eventDate} {event.startTime ? `• ${event.startTime}` : ""}</p>}
          {event?.location && <p className="text-sm opacity-80 mt-1">{event.location}</p>}
        </div>

        {step === "event-info" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            {event?.description && <p className="text-slate-600 text-sm mb-6">{event.description}</p>}
            <h3 className="font-semibold text-slate-800 mb-4">Apakah Anda sudah pernah mendaftar sebelumnya?</h3>
            <div className="space-y-3">
              <button
                onClick={() => setStep("check-nik")}
                className="w-full p-4 rounded-xl border-2 border-blue-200 hover:border-blue-400 bg-blue-50 text-left flex items-center gap-3"
              >
                <User className="h-5 w-5 text-blue-600" />
                <div>
                  <p className="font-medium text-blue-900">Ya, sudah pernah</p>
                  <p className="text-sm text-blue-600">Masukkan NIK saja</p>
                </div>
              </button>
              <button
                onClick={() => setStep("scan-ktp")}
                className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-slate-400 bg-slate-50 text-left flex items-center gap-3"
              >
                <CreditCard className="h-5 w-5 text-slate-600" />
                <div>
                  <p className="font-medium text-slate-800">Belum pernah</p>
                  <p className="text-sm text-slate-600">Scan KTP untuk mendaftar</p>
                </div>
              </button>
            </div>
          </div>
        )}

        {step === "check-nik" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <button onClick={() => setStep("event-info")} className="flex items-center gap-1 text-sm text-slate-500 mb-4 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Kembali
            </button>
            <h3 className="font-semibold text-slate-800 mb-4">Masukkan NIK Anda</h3>
            <input
              type="text"
              maxLength={16}
              value={nikInput}
              onChange={(e) => setNikInput(e.target.value.replace(/\D/g, ""))}
              placeholder="Masukkan 16 digit NIK"
              className="w-full px-4 py-3 border border-slate-200 rounded-xl text-lg tracking-wider text-center font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={checkNik}
              disabled={nikInput.length < 16}
              className="w-full mt-4 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-40 hover:bg-blue-700"
            >
              Lanjutkan
            </button>
          </div>
        )}

        {step === "scan-ktp" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <button onClick={() => setStep("event-info")} className="flex items-center gap-1 text-sm text-slate-500 mb-4 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Kembali
            </button>
            <h3 className="font-semibold text-slate-800 mb-4">Scan KTP Anda</h3>
            {scanning ? (
              <div className="py-12 text-center">
                <Loader2 className="h-10 w-10 animate-spin text-blue-500 mx-auto mb-3" />
                <p className="text-slate-600 font-medium">Membaca data KTP...</p>
                <p className="text-sm text-slate-400 mt-1">Harap tunggu</p>
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  onClick={() => setShowCamera(true)}
                  className="w-full p-4 rounded-xl border-2 border-blue-200 hover:border-blue-400 bg-blue-50 flex items-center justify-center gap-2 font-medium text-blue-700"
                >
                  <Camera className="h-5 w-5" /> Buka Kamera
                </button>
                <div className="relative">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="w-full p-4 rounded-xl border-2 border-slate-200 hover:border-slate-400 bg-slate-50 flex items-center justify-center gap-2 font-medium text-slate-700"
                  >
                    <Upload className="h-5 w-5" /> Upload Foto KTP
                  </button>
                  <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
                </div>
                {previewUrl && (
                  <div className="mt-4">
                    <img src={previewUrl} alt="Preview" className="rounded-xl w-full" />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {step === "fill-form" && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <button onClick={() => setStep("event-info")} className="flex items-center gap-1 text-sm text-slate-500 mb-4 hover:text-slate-700">
              <ArrowLeft className="h-4 w-4" /> Kembali
            </button>
            <h3 className="font-semibold text-slate-800 mb-4">Periksa Data Anda</h3>
            {existingParticipant && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-3 mb-4 text-sm text-green-800">
                Data Anda sudah ada di sistem. Silakan langsung lanjutkan.
              </div>
            )}
            <div className="space-y-3">
              <FormField label="NIK" value={ktpData.nik || ""} onChange={(v) => setKtpData({ ...ktpData, nik: v })} />
              <FormField label="Nama Lengkap" value={ktpData.fullName || ""} onChange={(v) => setKtpData({ ...ktpData, fullName: v })} />
              <FormField label="Jenis Kelamin" value={ktpData.gender || ""} onChange={(v) => setKtpData({ ...ktpData, gender: v })} />
              <FormField label="Alamat" value={ktpData.address || ""} onChange={(v) => setKtpData({ ...ktpData, address: v })} />
              <FormField label="Provinsi" value={ktpData.province || ""} onChange={(v) => setKtpData({ ...ktpData, province: v })} />
              <FormField label="Kota/Kabupaten" value={ktpData.city || ""} onChange={(v) => setKtpData({ ...ktpData, city: v })} />
              <div className="border-t border-slate-100 pt-3">
                <FormField label="No. Telepon (opsional)" value={phone} onChange={setPhone} />
                <FormField label="Email (opsional)" value={email} onChange={setEmail} />
              </div>
            </div>
            <button
              onClick={handleSubmit}
              disabled={submitting || !ktpData.nik || !ktpData.fullName}
              className="w-full mt-6 py-3 bg-blue-600 text-white rounded-xl font-medium disabled:opacity-40 hover:bg-blue-700 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {event?.mode === "attendance" ? "Konfirmasi Absensi" : "Daftar Sekarang"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function FormField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-medium text-slate-500 mb-1 block">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );
}
