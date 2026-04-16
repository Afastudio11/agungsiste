import { useState, useRef, useEffect } from "react";
import { useParams } from "wouter";
import {
  Camera, Upload, CheckCircle, AlertTriangle, ArrowLeft,
  Loader2, Download, Smartphone, CreditCard, Fingerprint,
  CalendarDays, MapPin, QrCode, ChevronRight, ScanLine
} from "lucide-react";
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
  nik?: string | null; fullName?: string | null; address?: string | null;
  birthPlace?: string | null; birthDate?: string | null; gender?: string | null;
  religion?: string | null; maritalStatus?: string | null; occupation?: string | null;
  nationality?: string | null; rtRw?: string | null; kelurahan?: string | null;
  kecamatan?: string | null; province?: string | null; city?: string | null;
  bloodType?: string | null;
};

type Step = "loading" | "event-info" | "check-nik" | "scan-ktp" | "fill-form" | "verify-data" | "success" | "error";

/* ─── Glassmorphism shell ────────────────────────────────────────── */
function GlassCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`relative bg-white/75 backdrop-blur-2xl border border-white/60 rounded-3xl shadow-[0_20px_60px_rgba(44,47,49,0.10)] ${className}`}
      style={{ borderTop: "1px solid rgba(255,255,255,0.8)" }}
    >
      {children}
    </div>
  );
}

/* ─── Step pill badge ────────────────────────────────────────────── */
function StepBadge({ label }: { label: string }) {
  return (
    <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-extrabold tracking-[0.12em]">
      {label}
    </div>
  );
}

/* ─── Form field ─────────────────────────────────────────────────── */
function FormField({
  label, value, onChange, placeholder, type = "text",
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 tracking-wide mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-3 bg-white border border-slate-200 rounded-2xl text-sm text-slate-800 font-medium placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 transition"
      />
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
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
  const [participantQr, setParticipantQr] = useState<{ qrDataUrl: string; fullName: string } | null>(null);
  const [loadingQr, setLoadingQr] = useState(false);

  useEffect(() => {
    fetch(`${BASE}/api/events/public/by-token/${token}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => { setEvent(data); setStep("event-info"); })
      .catch(() => { setErrorMsg("Link tidak valid atau event tidak ditemukan"); setStep("error"); });
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
      if (data.found) {
        setExistingParticipant(data.participant);
        setKtpData({
          nik: data.participant.nik,
          fullName: data.participant.fullName,
          gender: data.participant.gender,
          address: data.participant.address,
          province: data.participant.province,
          city: data.participant.city,
          birthPlace: data.participant.birthPlace,
          birthDate: data.participant.birthDate,
        });
        setStep("verify-data");
      } else {
        setStep("scan-ktp");
      }
    } catch { setStep("scan-ktp"); }
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
    } catch { setErrorMsg("Gagal membaca KTP. Coba lagi."); }
    finally { setScanning(false); }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      processImage(result.split(",")[1], result);
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
        if (data.registrationToken && data.nik) {
          setLoadingQr(true);
          fetch(`${BASE}/api/events/public/reservation-qr/${data.registrationToken}/${data.nik}`)
            .then((r) => r.json())
            .then((qr) => { if (qr.qrDataUrl) setParticipantQr({ qrDataUrl: qr.qrDataUrl, fullName: qr.fullName }); })
            .catch(() => {})
            .finally(() => setLoadingQr(false));
        }
      } else {
        setErrorMsg(data.error || "Gagal mendaftar");
        setStep("error");
      }
    } catch { setErrorMsg("Terjadi kesalahan. Coba lagi."); setStep("error"); }
    finally { setSubmitting(false); }
  };

  const resetForm = () => {
    setStep("event-info"); setNikInput(""); setExistingParticipant(null);
    setKtpData({}); setPhone(""); setEmail(""); setPreviewUrl(null);
    setCapturedImage(null); setErrorMsg(""); setSuccessMsg("");
    setParticipantQr(null); setLoadingQr(false);
  };

  const downloadTicket = async () => {
    if (!participantQr || !event) return;

    const SCALE = 2;
    const W = 400, H = 680;
    const canvas = document.createElement("canvas");
    canvas.width = W * SCALE;
    canvas.height = H * SCALE;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(SCALE, SCALE);

    const radius = 24;

    /* ── Outer ticket shape ── */
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(radius, 0);
    ctx.lineTo(W - radius, 0);
    ctx.quadraticCurveTo(W, 0, W, radius);
    ctx.lineTo(W, H - radius);
    ctx.quadraticCurveTo(W, H, W - radius, H);
    ctx.lineTo(radius, H);
    ctx.quadraticCurveTo(0, H, 0, H - radius);
    ctx.lineTo(0, radius);
    ctx.quadraticCurveTo(0, 0, radius, 0);
    ctx.closePath();
    ctx.clip();

    /* ── Header gradient (top 44%) ── */
    const headerH = H * 0.44;
    const grad = ctx.createLinearGradient(0, 0, W, headerH);
    grad.addColorStop(0, "#1e1b4b");   // indigo-950
    grad.addColorStop(0.5, "#1d4ed8"); // blue-700
    grad.addColorStop(1, "#0e7490");   // cyan-700
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, headerH);

    /* Decorative circles top-right */
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(W - 20, 20, 90, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W + 10, 80, 70, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    /* ── Badge label ── */
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    const badgeW = 170, badgeH = 22, badgeX = (W - badgeW) / 2, badgeY = 26;
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 11);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.90)";
    ctx.font = "bold 10px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.letterSpacing = "2px";
    ctx.textAlign = "center";
    ctx.fillText("✦  TIKET RESERVASI  ✦", W / 2, badgeY + 14.5);
    ctx.letterSpacing = "0px";

    /* ── Event name ── */
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.textAlign = "center";
    const name = event.name;
    const maxW = W - 48;
    // word-wrap the event name manually
    const words = name.split(" ");
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
      else cur = test;
    }
    if (cur) lines.push(cur);
    const lineH = 32;
    const nameY = 68;
    lines.forEach((line, i) => {
      ctx.fillText(line, W / 2, nameY + i * lineH);
    });

    /* ── Date & location ── */
    const detailY = nameY + lines.length * lineH + 10;
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = "500 12px 'Plus Jakarta Sans', Arial, sans-serif";
    const dateStr = `${event.eventDate}${event.startTime ? " · " + event.startTime : ""}`;
    ctx.fillText(dateStr, W / 2, detailY);
    if (event.location) {
      ctx.fillStyle = "rgba(255,255,255,0.55)";
      ctx.font = "500 11px 'Plus Jakarta Sans', Arial, sans-serif";
      ctx.fillText(event.location, W / 2, detailY + 17);
    }

    /* ── White body ── */
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, headerH, W, H - headerH);

    /* ── Perforated divider ── */
    const notchR = 14;
    // left notch
    ctx.fillStyle = "#f1f5f9"; // slate-100 (background colour)
    ctx.beginPath(); ctx.arc(-1, headerH, notchR, -Math.PI / 2, Math.PI / 2); ctx.fill();
    // right notch
    ctx.beginPath(); ctx.arc(W + 1, headerH, notchR, Math.PI / 2, -Math.PI / 2); ctx.fill();
    // dashed line
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(notchR + 4, headerH);
    ctx.lineTo(W - notchR - 4, headerH);
    ctx.stroke();
    ctx.setLineDash([]);

    /* ── Participant name ── */
    ctx.fillStyle = "#0f172a";
    ctx.font = "bold 20px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(participantQr.fullName, W / 2, headerH + 36);

    /* ── "Peserta Terdaftar" label ── */
    ctx.fillStyle = "#94a3b8";
    ctx.font = "500 10px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.letterSpacing = "1.5px";
    ctx.fillText("PESERTA TERDAFTAR", W / 2, headerH + 52);
    ctx.letterSpacing = "0px";

    /* ── QR code ── */
    await new Promise<void>((resolve) => {
      const qrImg = new Image();
      qrImg.onload = () => {
        const qrSize = 180;
        const qrX = (W - qrSize) / 2;
        const qrY = headerH + 66;
        // white border around QR
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = "#e2e8f0";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24, 14);
        ctx.fill();
        ctx.stroke();
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        resolve();
      };
      qrImg.onerror = () => resolve();
      qrImg.src = participantQr.qrDataUrl;
    });

    /* ── "Scan QR untuk check-in" label ── */
    ctx.fillStyle = "#64748b";
    ctx.font = "500 11px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Tunjukkan tiket ini kepada petugas saat check-in", W / 2, headerH + 66 + 180 + 30);

    /* ── Bottom gradient footer strip ── */
    const footerH = 52;
    const footerY = H - footerH;
    const footerGrad = ctx.createLinearGradient(0, footerY, W, footerY);
    footerGrad.addColorStop(0, "#1e1b4b");
    footerGrad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = footerGrad;
    ctx.fillRect(0, footerY, W, footerH);

    /* Footer text */
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "bold 11px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.letterSpacing = "1px";
    ctx.textAlign = "center";
    ctx.fillText("KTP REGISTRASI SYSTEM", W / 2, footerY + 20);
    ctx.letterSpacing = "0px";
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.font = "500 10px 'Plus Jakarta Sans', Arial, sans-serif";
    ctx.fillText(event.eventDate + (event.location ? "  ·  " + event.location : ""), W / 2, footerY + 38);

    ctx.restore();

    /* ── Shadow wrapper: draw on a larger canvas ── */
    const padded = document.createElement("canvas");
    padded.width = (W + 40) * SCALE;
    padded.height = (H + 40) * SCALE;
    const pCtx = padded.getContext("2d")!;
    pCtx.scale(SCALE, SCALE);
    pCtx.fillStyle = "#f1f5f9";
    pCtx.fillRect(0, 0, W + 40, H + 40);
    // draw shadow
    pCtx.shadowColor = "rgba(0,0,0,0.18)";
    pCtx.shadowBlur = 24;
    pCtx.shadowOffsetY = 8;
    pCtx.drawImage(canvas, 20, 16);

    /* ── Download ── */
    const a = document.createElement("a");
    a.href = padded.toDataURL("image/png");
    a.download = `tiket-${event.name.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.click();
  };

  /* ── Loading ─────────────────────────────────────────────────── */
  if (step === "loading") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center animate-pulse">
            <ScanLine className="h-6 w-6 text-white" />
          </div>
          <p className="text-sm text-slate-400 font-medium">Memuat event...</p>
        </div>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────────── */
  if (step === "error") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-red-200/30 blur-[120px] rounded-full pointer-events-none" />
        <GlassCard className="p-10 max-w-sm w-full text-center">
          <div className="w-16 h-16 rounded-3xl bg-red-100 flex items-center justify-center mx-auto mb-5">
            <AlertTriangle className="h-8 w-8 text-red-500" />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2" style={{ letterSpacing: "-0.02em" }}>Terjadi Kesalahan</h2>
          <p className="text-slate-500 text-sm mb-6">{errorMsg}</p>
          <button onClick={resetForm} className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold transition">
            Coba Lagi
          </button>
        </GlassCard>
      </div>
    );
  }

  /* ── Success ─────────────────────────────────────────────────── */
  if (step === "success") {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-start p-5 pb-12 relative overflow-hidden"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", background: "linear-gradient(160deg, #0f172a 0%, #1e3a5f 45%, #0c4a6e 100%)" }}
      >
        {/* Ambient glows */}
        <div className="fixed top-[-20%] left-[-15%] w-[60%] h-[60%] bg-blue-500/10 blur-[160px] rounded-full pointer-events-none" />
        <div className="fixed bottom-[-20%] right-[-15%] w-[60%] h-[60%] bg-cyan-500/10 blur-[160px] rounded-full pointer-events-none" />

        <div className="w-full max-w-sm relative z-10 pt-8 space-y-4">

          {/* ── Celebration header ── */}
          <div className="text-center mb-2">
            <div className="inline-flex items-center gap-2 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[11px] font-extrabold tracking-widest px-4 py-2 rounded-full mb-5">
              <CheckCircle className="h-3.5 w-3.5" />
              {successMsg}
            </div>
            <h1 className="text-[24px] font-extrabold text-white leading-tight mb-2" style={{ letterSpacing: "-0.03em" }}>
              {event?.name}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[12px] text-blue-300/80 font-medium">
              {event?.eventDate && (
                <span className="flex items-center gap-1">
                  <CalendarDays size={11} />
                  {event.eventDate}{event.startTime ? ` · ${event.startTime}` : ""}
                </span>
              )}
              {event?.location && (
                <span className="flex items-center gap-1">
                  <MapPin size={11} />
                  {event.location}
                </span>
              )}
            </div>
          </div>

          {/* ── Concert ticket card ── */}
          <div className="rounded-3xl overflow-hidden shadow-2xl shadow-black/40">
            {/* Ticket header */}
            <div
              className="px-6 pt-6 pb-5 text-center"
              style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #1d4ed8 60%, #0e7490 100%)" }}
            >
              <div className="inline-flex items-center gap-1.5 bg-white/15 border border-white/20 text-white/80 text-[10px] font-extrabold tracking-[0.15em] px-3 py-1 rounded-full mb-4">
                ✦ TIKET RESERVASI ✦
              </div>

              {loadingQr ? (
                <div className="py-8 flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center animate-pulse">
                    <QrCode className="h-6 w-6 text-white/60" />
                  </div>
                  <p className="text-white/60 text-xs font-medium">Membuat tiket...</p>
                </div>
              ) : participantQr ? (
                <>
                  <p className="text-white font-extrabold text-lg leading-tight mb-0.5" style={{ letterSpacing: "-0.02em" }}>
                    {participantQr.fullName}
                  </p>
                  <p className="text-white/50 text-[10px] font-bold tracking-widest">PESERTA TERDAFTAR</p>
                </>
              ) : null}
            </div>

            {/* Perforated divider */}
            <div className="relative bg-white">
              <div className="absolute -left-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900" />
              <div className="absolute -right-3.5 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-900" />
              <div
                className="mx-5 border-0 border-t-2 border-dashed border-slate-200"
                style={{ height: 0 }}
              />
            </div>

            {/* Ticket body — QR */}
            <div className="bg-white px-6 py-6 text-center">
              {loadingQr ? (
                <div className="py-10 flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
                </div>
              ) : participantQr ? (
                <>
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-white border-2 border-slate-100 rounded-2xl shadow-inner">
                      <img src={participantQr.qrDataUrl} alt="QR Tiket" className="w-48 h-48" />
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium">
                    Tunjukkan kepada petugas saat check-in
                  </p>
                </>
              ) : (
                <p className="py-8 text-slate-400 text-sm">QR tidak tersedia</p>
              )}
            </div>

            {/* Ticket footer */}
            <div
              className="px-6 py-3.5 flex items-center justify-between"
              style={{ background: "linear-gradient(90deg, #1e1b4b, #1d4ed8)" }}
            >
              <span className="text-[10px] font-extrabold text-white/50 tracking-widest">KTP REGISTRASI</span>
              <span className="text-[10px] text-white/40 font-medium">{event?.eventDate}</span>
            </div>
          </div>

          {/* ── Action buttons ── */}
          {participantQr && !loadingQr && (
            <button
              onClick={downloadTicket}
              className="w-full flex items-center justify-center gap-2.5 py-4 rounded-2xl font-extrabold text-[15px] transition active:scale-[0.98] shadow-lg"
              style={{ background: "linear-gradient(135deg, #1d4ed8, #0e7490)", color: "#fff", boxShadow: "0 8px 32px rgba(14,116,144,0.35)" }}
            >
              <Download className="h-5 w-5" />
              Download Tiket
            </button>
          )}

          <div className="bg-amber-500/15 border border-amber-400/25 rounded-2xl p-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-amber-300 font-bold text-sm mb-1">
              <Smartphone className="h-4 w-4" /> Screenshot tiket ini!
            </div>
            <p className="text-[11px] text-amber-300/70 font-medium">
              Simpan ke galeri HP. Tiket digunakan saat absensi di lokasi event.
            </p>
          </div>

          <button onClick={resetForm} className="w-full py-3.5 bg-white/10 border border-white/15 text-white/70 rounded-2xl font-bold hover:bg-white/15 transition text-sm">
            Daftar Peserta Lain
          </button>
        </div>
      </div>
    );
  }

  /* ── Main multi-step flow ────────────────────────────────────── */
  const isAttendance = event?.mode === "attendance";

  return (
    <div
      className="min-h-screen bg-[#f4f6f9] flex flex-col items-center justify-start p-5 pb-12 relative overflow-hidden"
      style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
    >
      {showCamera && (
        <KtpCamera
          onCapture={(b64) => { setShowCamera(false); processImage(b64); }}
          onClose={() => setShowCamera(false)}
        />
      )}

      {/* Ambient glows */}
      <div className="fixed top-[-15%] left-[-10%] w-[55%] h-[55%] bg-blue-300/20 blur-[140px] rounded-full pointer-events-none" />
      <div className="fixed bottom-[-15%] right-[-10%] w-[55%] h-[55%] bg-indigo-300/20 blur-[140px] rounded-full pointer-events-none" />

      <div className="w-full max-w-lg relative z-10 pt-6 space-y-4">

        {/* ── Event Header ──────────────────────────────────────── */}
        <div className="text-center mb-2">
          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-extrabold tracking-widest mb-3 ${
            isAttendance
              ? "bg-orange-100 text-orange-700 border border-orange-200"
              : "bg-blue-100 text-blue-700 border border-blue-200"
          }`}>
            {isAttendance ? "ABSENSI EVENT" : "RESERVASI EVENT"}
          </div>
          <h1 className="text-[22px] font-extrabold text-slate-900 leading-tight mb-3" style={{ letterSpacing: "-0.03em" }}>
            {event?.name}
          </h1>
          <div className="flex flex-wrap items-center justify-center gap-3 text-[12px] text-slate-500 font-medium">
            {event?.eventDate && (
              <span className="flex items-center gap-1">
                <CalendarDays size={12} />
                {event.eventDate}{event.startTime ? ` · ${event.startTime}` : ""}
              </span>
            )}
            {event?.location && (
              <span className="flex items-center gap-1">
                <MapPin size={12} />
                {event.location}
              </span>
            )}
          </div>
        </div>

        {/* ── STEP: event-info ─────────────────────────────────── */}
        {step === "event-info" && (
          <GlassCard className="p-8">
            <div className="text-center mb-7">
              <StepBadge label="LANGKAH 1 DARI 3" />
              <h2 className="text-[20px] font-extrabold text-slate-900 mt-4 mb-2 leading-tight" style={{ letterSpacing: "-0.02em" }}>
                Pernah mendaftar sebelumnya?
              </h2>
              <p className="text-[13px] text-slate-400 font-medium">
                Pilih salah satu untuk mempermudah proses pendaftaran
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Ya, sudah pernah */}
              <button
                onClick={() => setStep("check-nik")}
                className="group relative flex flex-col items-center justify-center gap-5 p-7 rounded-2xl bg-white border border-slate-100 hover:border-blue-200 hover:shadow-[0_20px_50px_rgba(0,84,202,0.12)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300 shadow-sm">
                  <Fingerprint size={32} />
                </div>
                <div className="text-center">
                  <span className="block text-[15px] font-extrabold text-slate-900 group-hover:text-blue-700 transition-colors">
                    Ya, sudah pernah
                  </span>
                  <span className="block text-[12px] text-slate-400 font-medium mt-0.5">
                    Masukkan NIK saja
                  </span>
                </div>
                <div className="absolute inset-0 rounded-2xl ring-1 ring-blue-500/0 group-hover:ring-blue-500/20 transition-all duration-300 pointer-events-none" />
              </button>

              {/* Belum pernah */}
              <button
                onClick={() => setStep("scan-ktp")}
                className="group relative flex flex-col items-center justify-center gap-5 p-7 rounded-2xl bg-white border border-slate-100 hover:border-indigo-200 hover:shadow-[0_20px_50px_rgba(106,55,212,0.12)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
              >
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm">
                  <CreditCard size={32} />
                </div>
                <div className="text-center">
                  <span className="block text-[15px] font-extrabold text-slate-900 group-hover:text-indigo-700 transition-colors">
                    Belum pernah
                  </span>
                  <span className="block text-[12px] text-slate-400 font-medium mt-0.5">
                    Scan KTP untuk daftar
                  </span>
                </div>
                <div className="absolute inset-0 rounded-2xl ring-1 ring-indigo-500/0 group-hover:ring-indigo-500/20 transition-all duration-300 pointer-events-none" />
              </button>
            </div>

            {event?.description && (
              <p className="text-[12px] text-slate-400 text-center mt-5 font-medium">{event.description}</p>
            )}
          </GlassCard>
        )}

        {/* ── STEP: check-nik ──────────────────────────────────── */}
        {step === "check-nik" && (
          <GlassCard className="p-8">
            <button
              onClick={() => setStep("event-info")}
              className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-600 font-semibold mb-6 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Kembali
            </button>

            <div className="text-center mb-7">
              <StepBadge label="LANGKAH 2 DARI 3" />
              <h2 className="text-[20px] font-extrabold text-slate-900 mt-4 mb-2" style={{ letterSpacing: "-0.02em" }}>
                Masukkan Nomor NIK
              </h2>
              <p className="text-[13px] text-slate-400 font-medium">
                Kami akan memeriksa apakah data Anda sudah tersimpan
              </p>
            </div>

            <div className="mb-5">
              <input
                type="text"
                inputMode="numeric"
                maxLength={16}
                value={nikInput}
                onChange={(e) => setNikInput(e.target.value.replace(/\D/g, ""))}
                placeholder="1234567890123456"
                className="w-full px-5 py-4 bg-white border-2 border-slate-200 focus:border-blue-400 rounded-2xl text-xl tracking-[0.2em] text-center font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition placeholder:tracking-normal placeholder:text-slate-300 placeholder:text-base placeholder:font-normal"
              />
              <p className="text-center text-[11px] text-slate-400 font-medium mt-2">
                {nikInput.length}/16 digit
              </p>
            </div>

            <button
              onClick={checkNik}
              disabled={nikInput.length < 16}
              className="w-full flex items-center justify-center gap-2 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-2xl font-extrabold text-[15px] transition shadow-sm shadow-blue-200 active:scale-[0.98]"
            >
              Lanjutkan
              <ChevronRight className="h-4 w-4" />
            </button>
          </GlassCard>
        )}

        {/* ── STEP: scan-ktp ───────────────────────────────────── */}
        {step === "scan-ktp" && (
          <GlassCard className="p-8">
            <button
              onClick={() => setStep("event-info")}
              className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-600 font-semibold mb-6 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Kembali
            </button>

            <div className="text-center mb-7">
              <StepBadge label="LANGKAH 2 DARI 3" />
              <h2 className="text-[20px] font-extrabold text-slate-900 mt-4 mb-2" style={{ letterSpacing: "-0.02em" }}>
                Foto KTP Anda
              </h2>
              <p className="text-[13px] text-slate-400 font-medium">
                Data KTP akan terbaca otomatis — pastikan foto jelas dan terang
              </p>
            </div>

            {scanning ? (
              <div className="py-12 text-center">
                <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-4 animate-pulse">
                  <ScanLine className="h-8 w-8 text-blue-600" />
                </div>
                <p className="text-slate-700 font-bold">Membaca data KTP...</p>
                <p className="text-[12px] text-slate-400 mt-1">Harap tunggu beberapa saat</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Camera button */}
                <button
                  onClick={() => setShowCamera(true)}
                  className="group w-full flex flex-col items-center gap-4 p-7 rounded-2xl bg-white border-2 border-blue-100 hover:border-blue-400 hover:shadow-[0_16px_40px_rgba(0,84,202,0.12)] hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-300"
                >
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 group-hover:bg-blue-600 group-hover:text-white transition-all duration-300">
                    <Camera size={28} />
                  </div>
                  <div className="text-center">
                    <span className="block text-[15px] font-extrabold text-slate-900">Buka Kamera</span>
                    <span className="block text-[12px] text-slate-400 font-medium mt-0.5">Foto langsung dengan panduan bingkai</span>
                  </div>
                </button>

                {/* Upload button */}
                <button
                  onClick={() => fileRef.current?.click()}
                  className="group w-full flex items-center gap-4 p-5 rounded-2xl bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:scale-[0.99] transition-all"
                >
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                    <Upload size={20} />
                  </div>
                  <div className="text-left">
                    <span className="block text-[13px] font-bold text-slate-700">Upload dari galeri</span>
                    <span className="block text-[11px] text-slate-400 mt-0.5">Pilih foto KTP dari HP</span>
                  </div>
                  <ChevronRight size={16} className="text-slate-300 ml-auto shrink-0" />
                </button>

                <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />

                {previewUrl && (
                  <div className="mt-2 rounded-2xl overflow-hidden border border-slate-100">
                    <img src={previewUrl} alt="Preview KTP" className="w-full object-cover" />
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        )}

        {/* ── STEP: verify-data (NIK found — show NIK+name+TTL only) ── */}
        {step === "verify-data" && (
          <GlassCard className="p-8">
            <button
              onClick={() => setStep("check-nik")}
              className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-600 font-semibold mb-6 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Kembali
            </button>

            <div className="text-center mb-7">
              <StepBadge label="VERIFIKASI DATA" />
              <h2 className="text-[20px] font-extrabold text-slate-900 mt-4 mb-2" style={{ letterSpacing: "-0.02em" }}>
                Konfirmasi Data Anda
              </h2>
              <p className="text-[13px] text-slate-400 font-medium">
                Pastikan data di bawah sudah benar sebelum mendaftar
              </p>
            </div>

            {/* NIK — read-only badge */}
            <div className="mb-5">
              <p className="text-[11px] font-extrabold text-slate-400 tracking-widest mb-2">NIK</p>
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3.5">
                <span className="font-mono font-bold text-[15px] text-slate-800 tracking-[0.12em] flex-1">
                  {ktpData.nik}
                </span>
                <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
                  TERVERIFIKASI
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {/* Nama Lengkap — editable */}
              <div>
                <label className="block text-[11px] font-extrabold text-slate-500 tracking-widest mb-1.5">
                  NAMA LENGKAP
                </label>
                <input
                  type="text"
                  value={ktpData.fullName || ""}
                  onChange={(e) => setKtpData({ ...ktpData, fullName: e.target.value })}
                  placeholder="Sesuai KTP"
                  className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 focus:border-blue-400 rounded-2xl text-[14px] font-semibold text-slate-900 focus:outline-none transition placeholder:text-slate-300 placeholder:font-normal"
                />
              </div>

              {/* TTL — Tempat & Tanggal Lahir */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-500 tracking-widest mb-1.5">
                    TEMPAT LAHIR
                  </label>
                  <input
                    type="text"
                    value={ktpData.birthPlace || ""}
                    onChange={(e) => setKtpData({ ...ktpData, birthPlace: e.target.value })}
                    placeholder="Kota lahir"
                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 focus:border-blue-400 rounded-2xl text-[14px] font-semibold text-slate-900 focus:outline-none transition placeholder:text-slate-300 placeholder:font-normal"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold text-slate-500 tracking-widest mb-1.5">
                    TANGGAL LAHIR
                  </label>
                  <input
                    type="date"
                    value={ktpData.birthDate || ""}
                    onChange={(e) => setKtpData({ ...ktpData, birthDate: e.target.value })}
                    className="w-full px-4 py-3.5 bg-white border-2 border-slate-200 focus:border-blue-400 rounded-2xl text-[14px] font-semibold text-slate-900 focus:outline-none transition"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !ktpData.nik || !ktpData.fullName}
              className="w-full mt-7 flex items-center justify-center gap-2.5 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-2xl font-extrabold text-[15px] transition shadow-md shadow-blue-500/20 active:scale-[0.98]"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {isAttendance ? "Konfirmasi Absensi" : "Reservasi Sekarang"}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </GlassCard>
        )}

        {/* ── STEP: fill-form ──────────────────────────────────── */}
        {step === "fill-form" && (
          <GlassCard className="p-8">
            <button
              onClick={() => setStep("event-info")}
              className="flex items-center gap-1.5 text-[12px] text-slate-400 hover:text-slate-600 font-semibold mb-6 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Kembali
            </button>

            <div className="text-center mb-7">
              <StepBadge label="LANGKAH 3 DARI 3" />
              <h2 className="text-[20px] font-extrabold text-slate-900 mt-4 mb-2" style={{ letterSpacing: "-0.02em" }}>
                Periksa Data Anda
              </h2>
              <p className="text-[13px] text-slate-400 font-medium">
                Pastikan data sudah benar sebelum mendaftar
              </p>
            </div>

            {existingParticipant && (
              <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-5">
                <div className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[12px] font-bold text-emerald-800">Data ditemukan!</p>
                  <p className="text-[11px] text-emerald-600 mt-0.5">Data Anda sudah ada di sistem. Silakan langsung lanjutkan.</p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <FormField label="NIK *" value={ktpData.nik || ""} onChange={(v) => setKtpData({ ...ktpData, nik: v })} placeholder="16 digit NIK" />
              <FormField label="Nama Lengkap *" value={ktpData.fullName || ""} onChange={(v) => setKtpData({ ...ktpData, fullName: v })} placeholder="Sesuai KTP" />
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Jenis Kelamin" value={ktpData.gender || ""} onChange={(v) => setKtpData({ ...ktpData, gender: v })} />
                <FormField label="Kota/Kabupaten" value={ktpData.city || ""} onChange={(v) => setKtpData({ ...ktpData, city: v })} />
              </div>
              <FormField label="Provinsi" value={ktpData.province || ""} onChange={(v) => setKtpData({ ...ktpData, province: v })} />
              <FormField label="Alamat" value={ktpData.address || ""} onChange={(v) => setKtpData({ ...ktpData, address: v })} />

              <div className="border-t border-slate-100 pt-4 space-y-4">
                <p className="text-[11px] font-extrabold text-slate-400 tracking-widest">KONTAK (OPSIONAL)</p>
                <FormField label="No. Telepon" value={phone} onChange={setPhone} placeholder="+62 8xx xxxx xxxx" type="tel" />
                <FormField label="Email" value={email} onChange={setEmail} placeholder="email@domain.com" type="email" />
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={submitting || !ktpData.nik || !ktpData.fullName}
              className="w-full mt-6 flex items-center justify-center gap-2.5 py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white rounded-2xl font-extrabold text-[15px] transition shadow-md shadow-blue-500/20 active:scale-[0.98]"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  {isAttendance ? "Konfirmasi Absensi" : "Reservasi Sekarang"}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </button>
          </GlassCard>
        )}

        {/* Footer branding */}
        <div className="flex items-center justify-center gap-2 opacity-30 pt-2">
          <div className="w-5 h-5 rounded-md bg-gradient-to-tr from-blue-600 to-indigo-600" />
          <span className="text-[10px] font-extrabold tracking-widest text-slate-600">KTP REGISTRASI</span>
        </div>
      </div>
    </div>
  );
}
