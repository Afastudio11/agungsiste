import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, QrCode, CheckCircle2, AlertCircle, ScanLine, User, Search, RefreshCw } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface EventInfo {
  id: number; name: string; location?: string; eventDate: string; participantCount: number;
}

interface RsvpResult {
  valid: boolean;
  participant: {
    nik: string;
    fullName: string;
    gender?: string;
    city?: string;
    occupation?: string;
    birthDate?: string;
    birthPlace?: string;
  };
  registration: {
    registeredAt: string;
    phone?: string;
    email?: string;
    tags?: string;
    staffName?: string;
  };
}

export default function PetugasRsvpPage() {
  const { id } = useParams();
  const eventId = parseInt(id || "0");
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);

  const [nikInput, setNikInput] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "not_registered" | "not_found" | "error">("idle");
  const [result, setResult] = useState<RsvpResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [notFoundInfo, setNotFoundInfo] = useState<{ fullName?: string; nik?: string } | null>(null);

  const { data: event } = useQuery<EventInfo>({
    queryKey: ["event", eventId],
    queryFn: () => fetch(`${BASE}/api/events/${eventId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: eventId > 0,
  });

  const handleCheck = async () => {
    const nik = nikInput.trim();
    if (!nik) return;

    setStatus("loading");
    setResult(null);
    setErrorMsg("");
    setNotFoundInfo(null);

    try {
      const r = await fetch(`${BASE}/api/events/${eventId}/rsvp/check`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nik }),
      });

      const data = await r.json();

      if (r.ok) {
        setResult(data);
        setStatus("success");
        setNikInput("");
      } else if (r.status === 404) {
        if (data.participant) {
          setStatus("not_registered");
          setNotFoundInfo(data.participant);
        } else {
          setStatus("not_found");
          setErrorMsg(data.error || "NIK tidak ditemukan");
        }
      } else {
        setStatus("error");
        setErrorMsg(data.error || "Terjadi kesalahan");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Gagal terhubung ke server");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleCheck();
  };

  const reset = () => {
    setStatus("idle");
    setResult(null);
    setErrorMsg("");
    setNotFoundInfo(null);
    setNikInput("");
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Top bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/petugas")} className="p-1.5 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="h-4 w-4 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-blue-600">Scan RSVP — Verifikasi Kehadiran</div>
          <div className="text-sm font-bold text-slate-900 truncate">{event?.name || "Memuat..."}</div>
        </div>
        {event && (
          <div className="text-xs text-slate-400 shrink-0">{event.participantCount} terdaftar</div>
        )}
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">

        {/* Success result */}
        {status === "success" && result && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 shrink-0" />
              <div className="font-bold text-green-800">✓ Peserta Terverifikasi</div>
            </div>
            <div className="bg-white rounded-xl border border-green-100 p-3 mb-3">
              <div className="font-bold text-slate-900 text-base mb-0.5">{result.participant.fullName}</div>
              <div className="font-mono text-xs text-slate-500 mb-2">{result.participant.nik}</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                {result.participant.gender && <div><span className="text-slate-400">Kelamin:</span> {result.participant.gender}</div>}
                {result.participant.city && <div><span className="text-slate-400">Kota:</span> {result.participant.city}</div>}
                {result.participant.occupation && <div><span className="text-slate-400">Pekerjaan:</span> {result.participant.occupation}</div>}
                {result.participant.birthDate && <div><span className="text-slate-400">Tgl Lahir:</span> {result.participant.birthDate}</div>}
              </div>
              {result.registration.phone && (
                <div className="mt-2 text-xs text-slate-500">📱 {result.registration.phone}</div>
              )}
              {result.registration.tags && (
                <div className="mt-1 text-xs text-slate-500">🏷 {result.registration.tags}</div>
              )}
              <div className="mt-2 text-[10px] text-slate-400">
                Didaftarkan: {new Date(result.registration.registeredAt).toLocaleString("id-ID")}
                {result.registration.staffName && ` · via ${result.registration.staffName}`}
              </div>
            </div>
            <button
              onClick={reset}
              className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-sm transition"
            >
              <RefreshCw className="h-4 w-4" />
              Verifikasi Peserta Berikutnya
            </button>
          </div>
        )}

        {/* Not registered in this event */}
        {status === "not_registered" && notFoundInfo && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
              <div className="font-bold text-amber-800">Peserta Tidak Terdaftar di Event Ini</div>
            </div>
            <div className="bg-white rounded-xl border border-amber-100 p-3 mb-3">
              <div className="font-semibold text-slate-900">{notFoundInfo.fullName}</div>
              <div className="font-mono text-xs text-slate-500">{notFoundInfo.nik}</div>
              <div className="text-xs text-amber-700 mt-2">
                Peserta ada di database tapi belum didaftarkan di event ini. Arahkan ke scan KTP untuk mendaftarkan on-the-spot.
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={reset} className="flex-1 border border-amber-300 text-amber-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-amber-50 transition">
                Cek Ulang
              </button>
              <button
                onClick={() => navigate(`/petugas/scan/${eventId}`)}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm transition"
              >
                📷 Scan KTP
              </button>
            </div>
          </div>
        )}

        {/* NIK not found */}
        {status === "not_found" && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="h-5 w-5 text-red-600 shrink-0" />
              <div className="font-bold text-red-800">NIK Tidak Ditemukan</div>
            </div>
            <p className="text-sm text-red-700 mb-3">{errorMsg}</p>
            <div className="flex gap-2">
              <button onClick={reset} className="flex-1 border border-red-200 text-red-700 font-semibold py-2.5 rounded-xl text-sm hover:bg-red-50 transition">
                Coba Lagi
              </button>
              <button
                onClick={() => navigate(`/petugas/scan/${eventId}`)}
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm transition"
              >
                📷 Daftarkan via KTP
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm">Terjadi Kesalahan</div>
              <div className="text-sm">{errorMsg}</div>
              <button onClick={reset} className="mt-2 text-xs underline">Coba lagi</button>
            </div>
          </div>
        )}

        {/* Input area (always visible when idle or after reset) */}
        {(status === "idle" || status === "loading") && (
          <>
            <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
              <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
                <QrCode className="h-8 w-8 text-blue-600" />
              </div>
              <div className="font-bold text-slate-900 mb-1">Verifikasi NIK / Scan QR</div>
              <div className="text-sm text-slate-500 mb-5">
                Masukkan NIK peserta atau scan QR Code untuk memverifikasi kehadiran
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    ref={inputRef}
                    value={nikInput}
                    onChange={(e) => setNikInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ketik NIK atau scan QR Code..."
                    autoFocus
                    disabled={status === "loading"}
                    className="w-full pl-9 pr-4 py-3 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition disabled:opacity-60"
                  />
                </div>
                <button
                  onClick={handleCheck}
                  disabled={!nikInput.trim() || status === "loading"}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold px-4 py-3 rounded-xl transition flex items-center gap-1.5"
                >
                  {status === "loading" ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  ) : (
                    <ScanLine className="h-4 w-4" />
                  )}
                  Cek
                </button>
              </div>
              <p className="mt-3 text-[11px] text-slate-400">
                Tekan Enter atau klik Cek setelah scan QR Code
              </p>
            </div>

            <div className="text-center text-slate-400 text-sm font-medium">— atau —</div>

            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center gap-2 mb-2">
                <User className="h-4 w-4 text-orange-500" />
                <div className="text-sm font-bold text-slate-800">Peserta Tanpa RSVP / QR Rusak?</div>
              </div>
              <div className="text-xs text-slate-500 mb-4">
                Jika peserta datang tanpa RSVP sebelumnya atau QR Code rusak/tidak ada, daftarkan langsung via scan KTP.
              </div>
              <button
                onClick={() => navigate(`/petugas/scan/${eventId}`)}
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
              >
                📷 Scan KTP — Daftar On The Spot
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
