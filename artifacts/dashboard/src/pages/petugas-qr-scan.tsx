import { useState, useRef, useEffect, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, AlertCircle, Users, QrCode, RefreshCw, UserCheck, Clock } from "lucide-react";
import { useAuth } from "@/lib/auth";
import jsQR from "jsqr";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface EventInfo { id: number; name: string; location?: string; eventDate: string; participantCount: number; }

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
  const { user } = useAuth();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number>(0);
  const processingRef = useRef(false);

  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [scanCount, setScanCount] = useState(0);

  const { data: event } = useQuery<EventInfo>({
    queryKey: ["event", eventId],
    queryFn: () => fetch(`${BASE}/api/events/${eventId}`, { credentials: "include" }).then((r) => r.json()),
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

  const doCheckin = useCallback(async (nik: string) => {
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
  }, [eventId, submitting, stopCamera]);

  const startCamera = useCallback(async () => {
    setCameraError("");
    setLastResult(null);
    processingRef.current = false;
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
        const canvas = canvasRef.current;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) { rafRef.current = requestAnimationFrame(tick); return; }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
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
      setCameraError(err?.message?.includes("Permission") ? "Izin kamera ditolak" : "Tidak dapat mengakses kamera");
    }
  }, [eventId, doCheckin, stopCamera]);

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const reset = () => {
    setLastResult(null);
    processingRef.current = false;
    startCamera();
  };

  return (
    <div className="min-h-screen bg-[#f0f4ff] pb-8" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <canvas ref={canvasRef} className="hidden" />

      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
        <button onClick={() => { stopCamera(); navigate("/petugas"); }} className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
          <ArrowLeft className="h-4 w-4 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-bold text-emerald-600 tracking-wide">Scan QR Absensi</div>
          <div className="text-sm font-extrabold text-slate-900 truncate">{event?.name || "Memuat..."}</div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {scanCount > 0 && (
            <div className="flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-emerald-200">
              <UserCheck className="h-3 w-3" />
              {scanCount} absen
            </div>
          )}
          {event && (
            <div className="flex items-center gap-1 text-xs font-semibold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg">
              <Users className="h-3 w-3" />
              {event.participantCount}
            </div>
          )}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {!lastResult && (
          <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm">
            <div className="px-4 pt-4 pb-2">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-800 mb-1">
                <QrCode className="h-4 w-4 text-emerald-600" />
                Arahkan kamera ke QR Code peserta
              </div>
              <p className="text-xs text-slate-400">Pastikan QR terlihat jelas di dalam bingkai</p>
            </div>

            <div className="relative bg-black mx-4 mb-4 rounded-xl overflow-hidden" style={{ aspectRatio: "4/3" }}>
              {scanning ? (
                <>
                  <video ref={videoRef} className="w-full h-full object-cover" playsInline muted autoPlay />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="relative w-52 h-52">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-lg" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-full h-0.5 bg-emerald-400/60 animate-pulse" />
                      </div>
                    </div>
                  </div>
                </>
              ) : submitting ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-emerald-900 flex items-center justify-center animate-pulse">
                    <QrCode className="h-6 w-6 text-emerald-400" />
                  </div>
                  <p className="text-sm text-slate-300 font-medium">Memproses absensi...</p>
                </div>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-slate-800 flex items-center justify-center">
                    <QrCode className="h-6 w-6 text-slate-400" />
                  </div>
                  <p className="text-sm text-slate-400">Kamera tidak aktif</p>
                </div>
              )}
            </div>

            {cameraError && (
              <div className="mx-4 mb-4 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 flex items-start gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                {cameraError}
              </div>
            )}
          </div>
        )}

        {lastResult && (
          <div className={`rounded-2xl border p-6 text-center shadow-sm ${lastResult.success ? (lastResult.alreadyCheckedIn ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200") : "bg-red-50 border-red-200"}`}>
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ background: lastResult.success ? (lastResult.alreadyCheckedIn ? "#fef3c7" : "#d1fae5") : "#fee2e2" }}>
              {lastResult.success
                ? lastResult.alreadyCheckedIn
                  ? <Clock className="h-8 w-8 text-amber-600" />
                  : <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                : <AlertCircle className="h-8 w-8 text-red-500" />}
            </div>

            {lastResult.participant && (
              <>
                <div className="text-xl font-extrabold text-slate-900 mb-1" style={{ letterSpacing: "-0.02em" }}>
                  {lastResult.participant.fullName}
                </div>
                <div className="text-xs font-mono text-slate-500 mb-3">{lastResult.participant.nik}</div>
              </>
            )}

            <div className={`text-base font-bold mb-1 ${lastResult.success ? (lastResult.alreadyCheckedIn ? "text-amber-700" : "text-emerald-700") : "text-red-600"}`}>
              {lastResult.message}
            </div>

            {lastResult.alreadyCheckedIn && lastResult.checkedInAt && (
              <div className="text-xs text-amber-600 mb-4">
                Check-in sebelumnya: {new Date(lastResult.checkedInAt).toLocaleString("id-ID")}
              </div>
            )}

            <button
              onClick={reset}
              className="mt-4 flex items-center justify-center gap-2 w-full py-3 bg-white border-2 border-slate-200 hover:border-blue-400 text-slate-700 font-bold rounded-xl transition-colors"
            >
              <RefreshCw className="h-4 w-4" />
              Scan Berikutnya
            </button>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-100 px-4 py-3">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">Petunjuk</p>
          <div className="space-y-1.5 text-xs text-slate-500">
            <div>• Minta peserta menunjukkan QR Code dari HP mereka</div>
            <div>• Arahkan kamera ke QR sampai terbaca otomatis</div>
            <div>• QR hanya berlaku untuk event ini</div>
          </div>
        </div>
      </div>
    </div>
  );
}
