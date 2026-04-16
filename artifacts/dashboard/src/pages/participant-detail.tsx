import { useState } from "react";
import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import {
  useGetParticipantByNik,
  getGetParticipantByNikQueryKey,
} from "@workspace/api-client-react";
import { CalendarDays, MapPin, ImageIcon, Download, FileText, Loader2 } from "lucide-react";
import jsPDF from "jspdf";

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="w-44 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value ?? "—"}</span>
    </div>
  );
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { credentials: "include" });
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function generateParticipantPDF(profile: any, nik: string) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Data Peserta KTP", margin, y);
  y += 8;

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(`Dicetak: ${new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`, margin, y);
  y += 3;

  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin, y, pageW - margin, y);
  y += 8;

  const imageUrl = `${BASE_URL}/api/ktp/image/${encodeURIComponent(nik)}`;
  const dataUrl = await fetchImageAsDataUrl(imageUrl);

  if (dataUrl) {
    const imgW = contentW;
    const imgH = imgW * (54 / 85.6);
    doc.addImage(dataUrl, "JPEG", margin, y, imgW, imgH);
    y += imgH + 4;
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(148, 163, 184);
    doc.text("Foto KTP", margin, y);
    y += 8;
  } else {
    doc.setFontSize(9);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(148, 163, 184);
    doc.text("[Foto KTP tidak tersedia]", margin, y);
    y += 8;
  }

  doc.setDrawColor(226, 232, 240);
  doc.line(margin, y, pageW - margin, y);
  y += 7;

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(15, 23, 42);
  doc.text("Data Lengkap KTP", margin, y);
  y += 6;

  const fields: [string, string | null | undefined][] = [
    ["NIK", profile.nik],
    ["Nama Lengkap", profile.fullName],
    ["Tempat Lahir", profile.birthPlace],
    ["Tanggal Lahir", profile.birthDate],
    ["Jenis Kelamin", profile.gender],
    ["Agama", profile.religion],
    ["Status Perkawinan", profile.maritalStatus],
    ["Pekerjaan", profile.occupation],
    ["Kewarganegaraan", profile.nationality],
    ["Golongan Darah", profile.bloodType],
    ["Alamat", profile.address],
    ["Kelurahan / Desa", profile.kelurahan],
    ["Kecamatan", profile.kecamatan],
    ["Kabupaten / Kota", profile.city],
    ["Provinsi", profile.province],
  ];

  const labelW = 52;
  const rowH = 7;

  fields.forEach(([label, value], i) => {
    const bg = i % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
    doc.setFillColor(bg[0], bg[1], bg[2]);
    doc.rect(margin, y, contentW, rowH, "F");

    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(label, margin + 2, y + 4.8);

    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    const val = value ?? "—";
    const maxChars = Math.floor((contentW - labelW - 4) / 2.1);
    const truncated = val.length > maxChars ? val.slice(0, maxChars) + "…" : val;
    doc.text(truncated, margin + labelW, y + 4.8);
    y += rowH;
  });

  y += 6;
  if (profile.events && profile.events.length > 0) {
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageW - margin, y);
    y += 7;

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(15, 23, 42);
    doc.text(`Riwayat Event (${profile.events.length})`, margin, y);
    y += 6;

    profile.events.forEach((event: any, i: number) => {
      const bg = i % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
      doc.setFillColor(bg[0], bg[1], bg[2]);
      doc.rect(margin, y, contentW, 7, "F");
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.setTextColor(15, 23, 42);
      doc.text(event.name ?? "-", margin + 2, y + 4.8);
      if (event.eventDate) {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(100, 116, 139);
        doc.text(event.eventDate, pageW - margin - 2, y + 4.8, { align: "right" });
      }
      y += 7;
    });
  }

  doc.save(`peserta_${profile.nik}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function KtpImageViewer({ nik }: { nik: string }) {
  const [status, setStatus] = useState<"loading" | "ok" | "missing">("loading");
  const imageUrl = `${BASE_URL}/api/ktp/image/${encodeURIComponent(nik)}`;

  const handleDownload = async () => {
    const r = await fetch(imageUrl, { credentials: "include" });
    if (!r.ok) return;
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ktp_${nik}.jpg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      {status === "loading" && (
        <div className="rounded-xl w-full bg-slate-100 animate-pulse" style={{ aspectRatio: "85/54" }} />
      )}
      {status === "missing" && (
        <div className="bg-slate-50 rounded-xl p-8 text-center text-sm text-slate-400">
          <ImageIcon className="h-10 w-10 mx-auto mb-2 text-slate-300" />
          Foto KTP belum tersimpan
        </div>
      )}
      <img
        src={imageUrl}
        alt="Foto KTP"
        className={`rounded-xl w-full object-cover border border-slate-100 ${status === "ok" ? "" : "hidden"}`}
        onLoad={() => setStatus("ok")}
        onError={() => setStatus("missing")}
      />
      {status === "ok" && (
        <button
          onClick={handleDownload}
          className="w-full flex items-center justify-center gap-2 text-sm text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-300 py-2 rounded-xl transition"
        >
          <Download className="h-4 w-4" />
          Unduh Foto KTP
        </button>
      )}
    </div>
  );
}

export default function ParticipantDetailPage() {
  const params = useParams();
  const nik = params.nik as string;
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: profile, isLoading } = useGetParticipantByNik(nik, {
    query: { enabled: !!nik, queryKey: getGetParticipantByNikQueryKey(nik) },
  });

  const handleDownloadPDF = async () => {
    if (!profile || pdfLoading) return;
    setPdfLoading(true);
    try {
      await generateParticipantPDF(profile, nik);
    } finally {
      setPdfLoading(false);
    }
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="py-16 text-center text-slate-400">Peserta tidak ditemukan</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-5 max-w-5xl">
        {/* Breadcrumb + actions */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Link href="/participants" className="hover:text-slate-700 hover:underline transition">
              Peserta
            </Link>
            <span>/</span>
            <span className="text-slate-900 font-semibold">{profile.fullName}</span>
          </div>
          <button
            onClick={handleDownloadPDF}
            disabled={pdfLoading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 transition shadow-sm"
          >
            {pdfLoading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Membuat PDF...</>
              : <><FileText className="h-4 w-4" /> Download PDF</>
            }
          </button>
        </div>

        {/* KTP Photo + Summary row */}
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          {/* KTP Photo */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="text-xs font-bold text-slate-400 tracking-wider mb-4">
              Foto KTP
            </div>
            <KtpImageViewer nik={nik} />
          </div>

          {/* Event history + extra info */}
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="text-xs font-bold text-slate-400 tracking-wider mb-1">Total Event</div>
                <div
                  className="text-3xl font-extrabold text-slate-900"
                  style={{ letterSpacing: "-0.04em" }}
                >
                  {profile.events?.length ?? 0}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="text-xs font-bold text-slate-400 tracking-wider mb-1">Status</div>
                <div className="mt-1">
                  {(profile.events?.length ?? 0) > 1 ? (
                    <span className="inline-block text-xs font-bold bg-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                      Multi Event
                    </span>
                  ) : (
                    <span className="inline-block text-xs font-bold bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                      Single Event
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Event history */}
            <div className="bg-white rounded-2xl border border-slate-100 p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xs font-bold text-slate-400 tracking-wider">Riwayat Event</h2>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    (profile.events?.length ?? 0) > 1
                      ? "bg-amber-100 text-amber-800"
                      : "bg-blue-100 text-blue-800"
                  }`}
                >
                  {profile.events?.length ?? 0} event
                </span>
              </div>
              {profile.events && profile.events.length > 0 ? (
                <div className="space-y-2">
                  {profile.events.map((event) => (
                    <Link key={event.id} href={`/events/${event.id}`}>
                      <div className="cursor-pointer rounded-xl border border-slate-100 p-3 hover:bg-slate-50 transition group">
                        <p className="font-semibold text-sm text-slate-900 group-hover:text-blue-600 transition">
                          {event.name}
                        </p>
                        <div className="mt-1 flex gap-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {event.eventDate}
                          </span>
                          {event.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {event.location}
                            </span>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400">Belum pernah mengikuti event</p>
              )}
            </div>
          </div>
        </div>

        {/* Full data table */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5">
          <h2 className="text-xs font-bold text-slate-400 tracking-wider mb-4">Data Lengkap KTP</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <InfoRow label="NIK" value={profile.nik} />
              <InfoRow label="Nama Lengkap" value={profile.fullName} />
              <InfoRow label="Tempat Lahir" value={profile.birthPlace} />
              <InfoRow label="Tanggal Lahir" value={profile.birthDate} />
              <InfoRow label="Jenis Kelamin" value={profile.gender} />
              <InfoRow label="Agama" value={profile.religion} />
            </div>
            <div>
              <InfoRow label="Status Perkawinan" value={profile.maritalStatus} />
              <InfoRow label="Pekerjaan" value={profile.occupation} />
              <InfoRow label="Kewarganegaraan" value={profile.nationality} />
              <InfoRow label="Golongan Darah" value={profile.bloodType} />
              <InfoRow label="Kelurahan / Desa" value={profile.kelurahan} />
              <InfoRow label="Kecamatan" value={profile.kecamatan} />
              <InfoRow label="Kabupaten / Kota" value={profile.city} />
              <InfoRow label="Provinsi" value={profile.province} />
              <InfoRow label="Alamat" value={profile.address} />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
