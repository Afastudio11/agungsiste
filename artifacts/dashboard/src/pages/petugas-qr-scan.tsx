import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft, CheckCircle2, AlertCircle, Users, QrCode,
  RefreshCw, UserCheck, Clock, Scan, XCircle, Keyboard, Camera
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import jsQR from "jsqr";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface EventInfo {
  id: number;
  name: string;
  location?: string;
  eventDate: string;
  participantCount: number;
}

type ScanResult = {
  success: boolean;
  alreadyCheckedIn?: boolean;
  message: string;
  participant?: { fullName: string; nik: string };
  checkedInAt?: string;
  error?: string;
};

export default function PetugasQrScanPage() {
  const { id } = useParams();
  const eventId = parseInt(id || "0");
  const [, navigate] = useLocation();
  const { user: _user } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const processingRef = useRef(false);
  const lastScanAtRef = useRef(0);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanCount, setScanCount] = useState(0);
  const [manualMode, setManualMode] = useState(false);
  const [manualNik, setManualNik] = useState("");

  const { data: event } = useQuery<EventInfo>({
    queryKey: ["event", eventId],
    queryFn: () =>
      fetch(`${BASE}/api/events/${eventId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: eventId > 0,
  });

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  const doCheckin = useCallback(
    async (nik: string) => {
      if (submitting || processingRef.current) return;
      processingRef.current = true;
      setSubmitting(true);
      try {
        const r = await fetch(`${BASE}/api/events/${eventId}/qr-checkin`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nik }),
        });
        const data = await r.json();
        if (!r.ok) {
          setLastResult({ success: false, message: data.error || "Gagal check-in", error: data.error });
        } else {
          setLastResult(data);
          setScanCount((c) => c + 1);
        }
      } catch {
        setLastResult({ success: false, message: "Terjadi kesalahan jaringan" });
      } finally {
        setSubmitting(false);
        stopCamera();
      }
    },
    [eventId, submitting, stopCamera]
  );

  const startCamera = useCallback(async () => {
    setCameraError("");
    setLastResult(null);
    processingRef.current = false;
    lastScanAtRef.current = 0;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setScanning(true);

      const tick = () => {
        if (!videoRef.current || !canvasRef.current || processingRef.current) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        const video = videoRef.current;
        if (video.readyState !== video.HAVE_ENOUGH_DATA) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        // Throttle: run jsQR at ~6fps instead of 60fps to reduce CPU overload
        const now = Date.now();
        if (now - lastScanAtRef.current < 150) {
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        lastScanAtRef.current = now;

        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        // attemptBoth: handle both normal and inverted QR (phone screens)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: "attemptBoth",
        });
        if (code) {
          const raw = code.data;
          const parts = raw.split("|");
          if (parts.length === 3 && parts[0] === "KTP-EVENT") {
            const qrEventId = parseInt(parts[1]);
            const nik = parts[2];
            if (qrEventId === eventId && nik) {
              processingRef.current = true;
              doCheckin(nik);
              return;
            } else {
              setLastResult({ success: false, message: "QR dari event yang berbeda" });
              processingRef.current = true;
              stopCamera();
              return;
            }
          }
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch (err: any) {
      setCameraError(
        err?.message?.includes("Permission")
          ? "Izin kamera ditolak. Mohon izinkan akses kamera di browser."
          : "Tidak dapat mengakses kamera. Coba muat ulang halaman."
      );
    }
  }, [eventId, doCheckin, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const reset = () => {
    setLastResult(null);
    setManualNik("");
    processingRef.current = false;
    lastScanAtRef.current = 0;
    if (!manualMode) startCamera();
  };

  const submitManualNik = () => {
    const nik = manualNik.trim();
    if (nik.length < 16) return;
    doCheckin(nik);
  };

  const switchToManual = () => {
    setManualMode(true);
    setManualNik("");
    stopCamera();
  };

  const switchToCamera = () => {
    setManualMode(false);
    setManualNik("");
    // Small delay to let React re-mount the video element before starting stream
    setTimeout(startCamera, 80);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Hidden canvas for QR processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* ── Top Bar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-[0_1px_8px_rgba(0,0,0,0.06)]">
        <button
          onClick={() => { stopCamera(); navigate("/petugas"); }}
          className="p-2 hover:bg-slate-100 rounded-xl transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-extrabold text-emerald-600 tracking-widest">SCAN QR ABSENSI</div>
          <div className="text-[13px] font-extrabold text-slate-900 truncate leading-tight">
            {event?.name || "Memuat..."}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {scanCount > 0 && (
            <div className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-[11px] font-extrabold px-3 py-1.5 rounded-xl border border-emerald-200">
              <UserCheck className="h-3.5 w-3.5" />
              {scanCount} absen
            </div>
          )}
          {event && (
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded-xl">
              <Users className="h-3 w-3" />
              {event.participantCount}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-4">

        {/* ── Scanner Card ─────────────────────────────────────────────── */}
        {!lastResult && (
          <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden shadow-sm">

            {/* Card header with mode toggle */}
            <div className="px-5 py-4 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${manualMode ? "bg-blue-100" : "bg-emerald-100"}`}>
                {manualMode
                  ? <Keyboard className="h-5 w-5 text-blue-600" />
                  : <QrCode className="h-5 w-5 text-emerald-600" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-extrabold text-slate-900">
                  {manualMode ? "Input NIK Manual" : "Scan QR Code Peserta"}
                </div>
                <div className="text-[11px] text-slate-400 font-medium">
                  {manualMode ? "Ketik NIK jika QR tidak terbaca" : "Arahkan kamera ke QR, terbaca otomatis"}
                </div>
              </div>
              <button
                onClick={manualMode ? switchToCamera : switchToManual}
                className={`shrink-0 flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-xl border transition ${
                  manualMode
                    ? "border-emerald-200 text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                    : "border-blue-200 text-blue-700 bg-blue-50 hover:bg-blue-100"
                }`}
              >
                {manualMode
                  ? <><Camera size={12} /> Kamera</>
                  : <><Keyboard size={12} /> Manual</>
                }
              </button>
            </div>

            {/* ── Camera mode ── */}
            {!manualMode && (
              <>
                {/* Camera viewport */}
                <div className="relative bg-slate-900 mx-4 mb-4 rounded-2xl overflow-hidden" style={{ aspectRatio: "4/3" }}>

                  {/* Video: ref used for stream capture AND display */}
                  <video
                    ref={videoRef}
                    className={`w-full h-full object-cover ${scanning ? "block" : "hidden"}`}
                    playsInline
                    muted
                    autoPlay
                  />

                  {/* QR corner brackets + scan line */}
                  {scanning && (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="relative w-56 h-56">
                          <div className="absolute top-0 left-0 w-10 h-10 border-t-[3px] border-l-[3px] border-emerald-400 rounded-tl-xl" />
                          <div className="absolute top-0 right-0 w-10 h-10 border-t-[3px] border-r-[3px] border-emerald-400 rounded-tr-xl" />
                          <div className="absolute bottom-0 left-0 w-10 h-10 border-b-[3px] border-l-[3px] border-emerald-400 rounded-bl-xl" />
                          <div className="absolute bottom-0 right-0 w-10 h-10 border-b-[3px] border-r-[3px] border-emerald-400 rounded-br-xl" />
                          <div
                            className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent rounded-full"
                            style={{ animation: "scanLine 2s ease-in-out infinite", top: "50%" }}
                          />
                        </div>
                      </div>
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ background: "radial-gradient(ellipse 200px 200px at center, transparent 40%, rgba(0,0,0,0.5) 100%)" }}
                      />
                      <style>{`
                        @keyframes scanLine {
                          0%, 100% { transform: translateY(-80px); opacity: 0; }
                          20%, 80% { opacity: 1; }
                          50% { transform: translateY(80px); }
                        }
                      `}</style>
                    </>
                  )}

                  {/* Processing overlay */}
                  {submitting && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-emerald-900 flex items-center justify-center animate-pulse">
                        <Scan className="h-8 w-8 text-emerald-400" />
                      </div>
                      <div className="text-center">
                        <p className="text-white font-bold text-sm">Memproses absensi...</p>
                        <p className="text-slate-400 text-xs mt-1">Mohon tunggu</p>
                      </div>
                    </div>
                  )}

                  {/* Inactive state */}
                  {!scanning && !submitting && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center">
                        <QrCode className="h-8 w-8 text-slate-500" />
                      </div>
                      <div className="text-center">
                        <p className="text-slate-300 font-semibold text-sm">Kamera tidak aktif</p>
                        <button
                          onClick={startCamera}
                          className="mt-3 flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition mx-auto"
                        >
                          <RefreshCw size={13} /> Aktifkan Kamera
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Camera error */}
                {cameraError && (
                  <div className="mx-4 mb-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-2xl px-4 py-3.5 flex items-start gap-2.5">
                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                    <div>
                      <p>{cameraError}</p>
                      <button
                        onClick={switchToManual}
                        className="mt-2 text-blue-600 font-bold underline text-xs"
                      >
                        Gunakan input NIK manual →
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ── Manual NIK mode ── */}
            {manualMode && (
              <div className="mx-4 mb-4 space-y-3">
                <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
                  <p className="text-[12px] text-blue-700 font-semibold mb-3">
                    Masukkan 16 digit NIK peserta untuk absen manual
                  </p>
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={16}
                    value={manualNik}
                    onChange={(e) => setManualNik(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => e.key === "Enter" && submitManualNik()}
                    placeholder="1234567890123456"
                    autoFocus
                    className="w-full px-4 py-3 bg-white border-2 border-blue-200 focus:border-blue-500 rounded-2xl text-lg tracking-[0.18em] text-center font-mono font-bold text-slate-900 focus:outline-none placeholder:tracking-normal placeholder:text-slate-300 placeholder:text-sm placeholder:font-normal transition"
                  />
                  <p className="text-center text-[11px] text-slate-400 mt-1.5">{manualNik.length}/16 digit</p>
                </div>
                <button
                  onClick={submitManualNik}
                  disabled={manualNik.length < 16 || submitting}
                  className="w-full flex items-center justify-center gap-2 py-3.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-2xl font-extrabold transition active:scale-[0.98]"
                >
                  {submitting
                    ? <><Scan className="h-4 w-4 animate-pulse" /> Memproses...</>
                    : <><UserCheck className="h-4 w-4" /> Absen Sekarang</>
                  }
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Result Card ──────────────────────────────────────────────── */}
        {lastResult && (
          <div
            className={`rounded-3xl border overflow-hidden shadow-md ${
              lastResult.success
                ? lastResult.alreadyCheckedIn
                  ? "bg-amber-50 border-amber-200"
                  : "bg-emerald-50 border-emerald-200"
                : "bg-red-50 border-red-200"
            }`}
          >
            <div className="p-8 text-center">
              <div
                className={`inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-5 shadow-lg ${
                  lastResult.success
                    ? lastResult.alreadyCheckedIn
                      ? "bg-amber-100 shadow-amber-200"
                      : "bg-emerald-500 shadow-emerald-200"
                    : "bg-red-100 shadow-red-200"
                }`}
              >
                {lastResult.success ? (
                  lastResult.alreadyCheckedIn
                    ? <Clock className="h-10 w-10 text-amber-600" />
                    : <CheckCircle2 className="h-10 w-10 text-white" />
                ) : (
                  <XCircle className="h-10 w-10 text-red-500" />
                )}
              </div>

              {lastResult.participant && (
                <div className="mb-3">
                  <div className="text-[22px] font-extrabold text-slate-900 leading-tight" style={{ letterSpacing: "-0.03em" }}>
                    {lastResult.participant.fullName}
                  </div>
                  <div className="text-xs font-mono text-slate-400 mt-1">
                    {lastResult.participant.nik}
                  </div>
                </div>
              )}

              <div className={`text-[15px] font-bold mb-1 ${
                lastResult.success
                  ? lastResult.alreadyCheckedIn ? "text-amber-700" : "text-emerald-700"
                  : "text-red-600"
              }`}>
                {lastResult.message}
              </div>

              {lastResult.alreadyCheckedIn && lastResult.checkedInAt && (
                <div className="text-xs text-amber-600 font-medium mt-1 mb-2">
                  Check-in sebelumnya:{" "}
                  {new Date(lastResult.checkedInAt).toLocaleString("id-ID", {
                    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit"
                  })}
                </div>
              )}

              {scanCount > 0 && lastResult.success && !lastResult.alreadyCheckedIn && (
                <div className="inline-flex items-center gap-1.5 bg-emerald-200/60 text-emerald-800 text-[11px] font-bold px-3 py-1.5 rounded-full mt-1 mb-2">
                  <UserCheck size={11} />
                  Scan ke-{scanCount} hari ini
                </div>
              )}
            </div>

            <div className="border-t px-5 py-4 flex gap-3" style={{
              borderColor: lastResult.success
                ? lastResult.alreadyCheckedIn ? "#fde68a" : "#a7f3d0"
                : "#fecaca"
            }}>
              <button
                onClick={reset}
                className="flex-1 flex items-center justify-center gap-2 py-3 bg-white border-2 border-slate-200 hover:border-blue-400 hover:bg-blue-50 text-slate-700 font-extrabold rounded-2xl transition-all active:scale-[0.98]"
              >
                <RefreshCw className="h-4 w-4" />
                Scan Berikutnya
              </button>
            </div>
          </div>
        )}

        {/* ── Tips Card ────────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-slate-100 px-5 py-4">
          <div className="text-[10px] font-extrabold text-slate-400 tracking-widest mb-3">PETUNJUK</div>
          <div className="space-y-2 text-[12px] text-slate-500">
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-extrabold text-emerald-600">1</span>
              </div>
              <span>Minta peserta menunjukkan QR Code dari HP mereka</span>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-extrabold text-emerald-600">2</span>
              </div>
              <span>Arahkan kamera ke QR Code hingga terbaca otomatis</span>
            </div>
            <div className="flex items-start gap-2.5">
              <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[9px] font-extrabold text-blue-600">3</span>
              </div>
              <span>Jika kamera tidak bisa membaca, tekan tombol <strong>Manual</strong> dan masukkan NIK peserta</span>
            </div>
          </div>
        </div>

        <div className="h-4" />
      </div>
    </div>
  );
}
