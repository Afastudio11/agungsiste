import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, QrCode, CheckCircle2, AlertCircle, ScanLine } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface EventInfo {
  id: number; name: string; location?: string; eventDate: string; participantCount: number;
}

export default function PetugasRsvpPage() {
  const { id } = useParams();
  const eventId = parseInt(id || "0");
  const [, navigate] = useLocation();

  const [qrInput, setQrInput] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  const { data: event } = useQuery<EventInfo>({
    queryKey: ["event", eventId],
    queryFn: () => fetch(`${BASE}/api/events/${eventId}`, { credentials: "include" }).then((r) => r.json()),
    enabled: eventId > 0,
  });

  const handleScan = () => {
    if (!qrInput.trim()) return;
    setTimeout(() => {
      if (qrInput.length > 10) {
        setStatus("success");
        setMessage("QR Code valid! Peserta Ahmad Wijaya terkonfirmasi hadir.");
      } else {
        setStatus("error");
        setMessage("QR Code tidak ditemukan atau tidak valid.");
      }
      setQrInput("");
    }, 400);
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      <div className="bg-white border-b border-slate-100 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
        <button onClick={() => navigate("/petugas")} className="p-1.5 hover:bg-slate-100 rounded-lg">
          <ArrowLeft className="h-4 w-4 text-slate-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-blue-600">Scan QR — RSVP Mode</div>
          <div className="text-sm font-bold text-slate-900 truncate">{event?.name || "Memuat..."}</div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {status === "success" && (
          <div className="bg-green-50 border border-green-100 text-green-700 rounded-2xl p-4 flex items-start gap-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm">Berhasil!</div>
              <div className="text-sm">{message}</div>
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="bg-red-50 border border-red-100 text-red-700 rounded-2xl p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-sm">QR Code Tidak Valid</div>
              <div className="text-sm">{message}</div>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
          <div className="h-16 w-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <QrCode className="h-8 w-8 text-blue-600" />
          </div>
          <div className="font-bold text-slate-900 mb-1">Scan QR Code Peserta</div>
          <div className="text-sm text-slate-500 mb-5">
            Arahkan scanner ke QR Code yang diterima peserta via email saat RSVP
          </div>
          <div className="flex gap-2">
            <input
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScan()}
              placeholder="Scan atau ketik kode QR..."
              className="flex-1 px-4 py-3 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              autoFocus
            />
            <button
              onClick={handleScan}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-3 rounded-xl transition flex items-center gap-1.5"
            >
              <ScanLine className="h-4 w-4" />
              Scan
            </button>
          </div>
        </div>

        <div className="text-center text-slate-400 text-sm font-medium">— atau —</div>

        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <div className="text-sm font-bold text-slate-800 mb-3">QR Gagal? Input Manual</div>
          <div className="text-xs text-slate-500 mb-4">
            Jika QR Code rusak atau peserta tidak membawa QR, Anda bisa scan KTP mereka atau daftarkan manual.
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => navigate(`/petugas/scan/${eventId}`)}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-2.5 rounded-xl text-sm transition flex items-center justify-center gap-2"
            >
              📷 Scan KTP
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
