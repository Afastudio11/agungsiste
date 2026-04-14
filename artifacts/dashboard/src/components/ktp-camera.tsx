import { useRef, useEffect, useState, useCallback } from "react";
import { Camera, X, ZapIcon, RotateCcw } from "lucide-react";

interface KtpCameraProps {
  onCapture: (base64: string) => void;
  onClose: () => void;
}

export default function KtpCamera({ onCapture, onClose }: KtpCameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment");
  const [flashVisible, setFlashVisible] = useState(false);
  const [hasDualCamera, setHasDualCamera] = useState(false);

  const startCamera = useCallback(async (mode: "environment" | "user") => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: mode, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play();
          setReady(true);
        };
      }
    } catch {
      // fallback: no facingMode constraint
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current?.play();
            setReady(true);
          };
        }
      } catch {
        onClose();
      }
    }
  }, [onClose]);

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const cams = devices.filter((d) => d.kind === "videoinput");
      setHasDualCamera(cams.length > 1);
    }).catch(() => {});
    startCamera(facingMode);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const flipCamera = () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    startCamera(next);
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !ready) return;

    // Flash effect
    setFlashVisible(true);
    setTimeout(() => setFlashVisible(false), 180);

    // Draw full video frame to canvas
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);

    // Crop to KTP frame region
    const vw = video.videoWidth;
    const vh = video.videoHeight;

    // KTP frame: 80% width, centered, aspect ratio 1.585:1 (85.6×54mm)
    const frameW = vw * 0.82;
    const frameH = frameW / 1.585;
    const frameX = (vw - frameW) / 2;
    const frameY = (vh - frameH) / 2;

    const cropped = document.createElement("canvas");
    cropped.width = Math.round(frameW);
    cropped.height = Math.round(frameH);
    const ctx2 = cropped.getContext("2d");
    if (!ctx2) return;
    ctx2.drawImage(canvas, frameX, frameY, frameW, frameH, 0, 0, cropped.width, cropped.height);

    const dataUrl = cropped.toDataURL("image/jpeg", 0.95);
    const base64 = dataUrl.split(",")[1];
    onCapture(base64);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 absolute top-0 left-0 right-0 z-10">
        <button
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-white text-xs font-bold tracking-wider">SCAN KTP</div>
          <div className="text-white/50 text-[10px]">Arahkan KTP ke dalam bingkai</div>
        </div>
        {hasDualCamera ? (
          <button
            onClick={flipCamera}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
          >
            <RotateCcw className="h-5 w-5" />
          </button>
        ) : (
          <div className="w-9" />
        )}
      </div>

      {/* Video */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted
        />

        {/* Flash overlay */}
        {flashVisible && (
          <div className="absolute inset-0 bg-white z-20 pointer-events-none" />
        )}

        {/* KTP frame overlay */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {/* Dark vignette around frame */}
          <div className="absolute inset-0" style={{
            background: "radial-gradient(ellipse 88% 60% at 50% 50%, transparent 55%, rgba(0,0,0,0.72) 100%)"
          }} />

          {/* KTP frame — aspect ratio 85.6:54 = 1.585:1 */}
          <div
            className="relative"
            style={{
              width: "min(82vw, calc(82vh * 1.585))",
              aspectRatio: "1.585 / 1",
            }}
          >
            {/* Corner marks */}
            {[
              "top-0 left-0 border-t-2 border-l-2 rounded-tl-lg",
              "top-0 right-0 border-t-2 border-r-2 rounded-tr-lg",
              "bottom-0 left-0 border-b-2 border-l-2 rounded-bl-lg",
              "bottom-0 right-0 border-b-2 border-r-2 rounded-br-lg",
            ].map((cls, i) => (
              <div
                key={i}
                className={`absolute w-7 h-7 border-white ${cls}`}
              />
            ))}

            {/* Center crosshair */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-5 h-px bg-white/30" />
              <div className="absolute h-5 w-px bg-white/30" />
            </div>

            {/* Alignment guides (thirds) */}
            <div className="absolute inset-0 grid grid-cols-3">
              <div className="border-r border-white/10" />
              <div className="border-r border-white/10" />
            </div>
            <div className="absolute inset-0 grid grid-rows-3">
              <div className="border-b border-white/10" />
              <div className="border-b border-white/10" />
            </div>

            {/* Label */}
            <div className="absolute -bottom-7 left-0 right-0 text-center">
              <span className="text-white/70 text-[11px] font-semibold tracking-wider">
                KARTU TANDA PENDUDUK
              </span>
            </div>
          </div>
        </div>

        {/* Loading overlay */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black z-10">
            <div className="text-white/60 text-sm flex items-center gap-2">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Memuat kamera...
            </div>
          </div>
        )}
      </div>

      {/* Capture button */}
      <div className="pb-safe flex flex-col items-center gap-3 py-6 bg-black/80">
        <button
          onClick={capture}
          disabled={!ready}
          className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-lg disabled:opacity-40 active:scale-95 transition-transform"
        >
          <Camera className="h-7 w-7 text-slate-800" />
        </button>
        <div className="flex items-center gap-1.5 text-white/40 text-[11px] font-semibold">
          <ZapIcon className="h-3 w-3 text-green-400" />
          OCR otomatis setelah foto diambil
        </div>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </div>
  );
}
