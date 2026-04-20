import { useState, useMemo } from "react";
import { Link, useParams, useLocation } from "wouter";
import Layout from "@/components/layout";
import {
  useGetParticipantByNik,
  getGetParticipantByNikQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Calendar, Tag, MapPin, ImageIcon, Download, FileText, Loader2, Pencil, X, Check, Trash2, AlertTriangle } from "@/lib/icons";
import jsPDF from "jspdf";
import { kabupatenList, getKecamatanList, getDesaList } from "@workspace/db/jatimWilayah";

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="w-44 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value ?? "—"}</span>
    </div>
  );
}

function FormRow({
  label,
  name,
  value,
  onChange,
  type = "text",
  options,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (name: string, val: string) => void;
  type?: string;
  options?: string[];
}) {
  const inputClass =
    "w-full text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition";
  return (
    <div className="flex flex-col gap-1 py-1">
      <label className="text-xs font-medium text-slate-400">{label}</label>
      {options ? (
        <select
          name={name}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          className={inputClass}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          name={name}
          value={value}
          onChange={(e) => onChange(name, e.target.value)}
          className={inputClass}
        />
      )}
    </div>
  );
}

const selectCls =
  "w-full text-sm font-semibold text-slate-800 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-blue-400 transition disabled:opacity-40 disabled:cursor-not-allowed";

function normalizeOcr(raw: string): string {
  return raw
    .replace(/\b(KABUPATEN|KOTA|KAB\.|KAB\s|KEC\.|KEC\s|KEL\.|KEL\s|DESA\s|KELURAHAN\s|KECAMATAN\s)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findCanonical(ocrValue: string, list: string[]): string {
  if (!ocrValue) return "";
  const raw = ocrValue.toLowerCase().trim();
  const exact = list.find((k) => k.toLowerCase() === raw);
  if (exact) return exact;
  const norm = normalizeOcr(ocrValue);
  const normExact = list.find((k) => k.toLowerCase() === norm);
  if (normExact) return normExact;
  const contains = list.find((k) => raw.includes(k.toLowerCase()) || norm.includes(k.toLowerCase()));
  if (contains) return contains;
  const starts = list.find((k) => k.toLowerCase().startsWith(norm) && norm.length >= 4);
  if (starts) return starts;
  return "";
}

function WilayahSelectFull({
  city,
  kecamatan,
  kelurahan,
  onChange,
}: {
  city: string;
  kecamatan: string;
  kelurahan: string;
  onChange: (field: "city" | "kecamatan" | "kelurahan", val: string) => void;
}) {
  const canonKab = useMemo(
    () => findCanonical(city, kabupatenList),
    [city]
  );
  const canonKec = useMemo(() => {
    if (!canonKab) return "";
    return findCanonical(kecamatan, getKecamatanList(canonKab));
  }, [canonKab, kecamatan]);

  const kecList = canonKab ? getKecamatanList(canonKab) : [];
  const kelList = canonKab && canonKec ? getDesaList(canonKab, canonKec) : [];

  return (
    <div className="flex flex-col gap-1 py-1">
      <label className="text-xs font-medium text-slate-400">Wilayah</label>
      <div className="grid grid-cols-1 gap-2">
        <div>
          <label className="block text-[10px] font-bold tracking-[0.08em] text-slate-300 mb-1">Kabupaten / Kota</label>
          <select
            value={canonKab}
            onChange={(e) => {
              onChange("city", e.target.value);
              onChange("kecamatan", "");
              onChange("kelurahan", "");
            }}
            className={selectCls}
          >
            <option value="">— Pilih Kabupaten/Kota —</option>
            {kabupatenList.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-[0.08em] text-slate-300 mb-1">Kecamatan</label>
          <select
            value={canonKec}
            disabled={!canonKab}
            onChange={(e) => {
              onChange("kecamatan", e.target.value);
              onChange("kelurahan", "");
            }}
            className={selectCls}
          >
            <option value="">— Pilih Kecamatan —</option>
            {kecList.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-bold tracking-[0.08em] text-slate-300 mb-1">Kelurahan / Desa</label>
          <select
            value={kelurahan}
            disabled={!canonKec}
            onChange={(e) => onChange("kelurahan", e.target.value)}
            className={selectCls}
          >
            <option value="">— Pilih Kelurahan/Desa —</option>
            {kelList.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </div>
      </div>
    </div>
  );
}

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
    doc.text(`Riwayat Kegiatan (${profile.events.length})`, margin, y);
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

type FormState = {
  fullName: string;
  birthPlace: string;
  birthDate: string;
  gender: string;
  religion: string;
  maritalStatus: string;
  occupation: string;
  nationality: string;
  rtRw: string;
  kelurahan: string;
  kecamatan: string;
  city: string;
  province: string;
  bloodType: string;
  address: string;
  phone: string;
  email: string;
  socialStatus: string;
};

function buildForm(profile: any): FormState {
  return {
    fullName: profile.fullName ?? "",
    birthPlace: profile.birthPlace ?? "",
    birthDate: profile.birthDate ?? "",
    gender: profile.gender ?? "",
    religion: profile.religion ?? "",
    maritalStatus: profile.maritalStatus ?? "",
    occupation: profile.occupation ?? "",
    nationality: profile.nationality ?? "",
    rtRw: profile.rtRw ?? "",
    kelurahan: profile.kelurahan ?? "",
    kecamatan: profile.kecamatan ?? "",
    city: profile.city ?? "",
    province: profile.province ?? "",
    bloodType: profile.bloodType ?? "",
    address: profile.address ?? "",
    phone: profile.phone ?? "",
    email: profile.email ?? "",
    socialStatus: profile.socialStatus ?? "",
  };
}

export default function ParticipantDetailPage() {
  const params = useParams();
  const nik = params.nik as string;
  const [, navigate] = useLocation();
  const [pdfLoading, setPdfLoading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: profile, isLoading } = useGetParticipantByNik(nik, {
    query: { enabled: !!nik, queryKey: getGetParticipantByNikQueryKey(nik) },
  });

  const handleOpenEdit = () => {
    if (!profile) return;
    setForm(buildForm(profile));
    setSaveError(null);
    setEditOpen(true);
  };

  const handleCloseEdit = () => {
    setEditOpen(false);
    setForm(null);
    setSaveError(null);
  };

  const handleFieldChange = (name: string, val: string) => {
    setForm((prev) => prev ? { ...prev, [name]: val } : prev);
  };

  const handleSave = async () => {
    if (!form || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/participants/${encodeURIComponent(nik)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(data.error ?? "Gagal menyimpan data");
        return;
      }
      await queryClient.invalidateQueries({ queryKey: getGetParticipantByNikQueryKey(nik) });
      handleCloseEdit();
    } catch {
      setSaveError("Terjadi kesalahan, coba lagi");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`${BASE_URL}/api/participants/${encodeURIComponent(nik)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Gagal menghapus data");
        return;
      }
      navigate("/participants");
    } catch {
      setDeleteError("Terjadi kesalahan, coba lagi");
    } finally {
      setDeleting(false);
    }
  };

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
          <div className="flex items-center gap-2">
            <button
              onClick={() => setDeleteConfirm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-red-200 text-red-600 rounded-xl text-sm font-semibold hover:bg-red-50 hover:border-red-300 transition shadow-sm"
            >
              <Trash2 className="h-4 w-4" />
              Hapus
            </button>
            <button
              onClick={handleOpenEdit}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-semibold hover:bg-slate-50 hover:border-slate-300 transition shadow-sm"
            >
              <Pencil className="h-4 w-4" />
              Edit Data
            </button>
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
              <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-5 pt-5 pb-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] transition-shadow">
                <div className="absolute -top-6 -right-6 h-24 w-24 rounded-full opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 bg-blue-500" />
                <div className="flex items-start justify-between mb-2 relative">
                  <p className="text-[12px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.01em" }}>Total Kegiatan</p>
                  <Calendar className="h-4 w-4 text-blue-400" />
                </div>
                <div className="text-[34px] font-extrabold text-slate-900 leading-none relative" style={{ letterSpacing: "-0.04em" }}>
                  {profile.events?.length ?? 0}
                </div>
              </div>
              <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-5 pt-5 pb-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] transition-shadow">
                <div className={`absolute -top-6 -right-6 h-24 w-24 rounded-full opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 ${(profile.events?.length ?? 0) > 1 ? "bg-amber-500" : "bg-violet-500"}`} />
                <div className="flex items-start justify-between mb-2 relative">
                  <p className="text-[12px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.01em" }}>Status</p>
                  <Tag className="h-4 w-4 text-slate-400" />
                </div>
                <div className="mt-1 relative">
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
                <h2 className="text-xs font-bold text-slate-400 tracking-wider">Riwayat Kegiatan</h2>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold text-slate-400 tracking-wider">Data Lengkap KTP</h2>
            <button
              onClick={handleOpenEdit}
              className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 transition"
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            <div>
              <InfoRow label="NIK" value={profile.nik} />
              <InfoRow label="Nama Lengkap" value={profile.fullName} />
              <InfoRow label="Tempat Lahir" value={profile.birthPlace} />
              <InfoRow label="Tanggal Lahir" value={profile.birthDate} />
              <InfoRow label="Jenis Kelamin" value={profile.gender} />
              <InfoRow label="Agama" value={profile.religion} />
              <InfoRow label="No. HP" value={profile.phone} />
              <InfoRow label="Email" value={profile.email} />
              <InfoRow label="Status Sosial" value={profile.socialStatus} />
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

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <>
          <div className="fixed inset-0 bg-black/40 z-40" onClick={() => { if (!deleting) { setDeleteConfirm(false); setDeleteError(null); } }} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <div className="font-bold text-slate-900">Hapus Data Peserta</div>
                  <div className="text-xs text-slate-400 mt-0.5">Tindakan ini tidak bisa dibatalkan</div>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-1">
                Semua data <span className="font-bold text-slate-900">{profile.fullName}</span> beserta riwayat event akan terhapus permanen.
              </p>
              {deleteError && (
                <div className="mt-3 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-2.5 rounded-xl">
                  {deleteError}
                </div>
              )}
              <div className="flex gap-3 mt-5">
                <button
                  onClick={() => { setDeleteConfirm(false); setDeleteError(null); }}
                  disabled={deleting}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
                >
                  Batal
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition"
                >
                  {deleting ? <><Loader2 className="h-4 w-4 animate-spin" /> Menghapus...</> : <><Trash2 className="h-4 w-4" /> Hapus Permanen</>}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Edit Drawer */}
      {editOpen && form && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40 transition-opacity"
            onClick={handleCloseEdit}
          />
          {/* Drawer */}
          <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white shadow-2xl flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div>
                <div className="text-base font-bold text-slate-900">Edit Data Peserta</div>
                <div className="text-xs text-slate-400 font-mono mt-0.5">NIK: {nik}</div>
              </div>
              <button
                onClick={handleCloseEdit}
                className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-1">
              {saveError && (
                <div className="mb-2 bg-red-50 border border-red-200 text-red-700 text-sm font-semibold px-4 py-2.5 rounded-xl">
                  {saveError}
                </div>
              )}

              <div className="text-[10px] font-bold text-slate-400 tracking-wider pt-1 pb-0.5">Data Pribadi</div>
              <FormRow label="Nama Lengkap *" name="fullName" value={form.fullName} onChange={handleFieldChange} />
              <FormRow label="Tempat Lahir" name="birthPlace" value={form.birthPlace} onChange={handleFieldChange} />
              <FormRow label="Tanggal Lahir" name="birthDate" value={form.birthDate} onChange={handleFieldChange} />
              <FormRow
                label="Jenis Kelamin"
                name="gender"
                value={form.gender}
                onChange={handleFieldChange}
                options={["LAKI-LAKI", "PEREMPUAN"]}
              />
              <FormRow
                label="Agama"
                name="religion"
                value={form.religion}
                onChange={handleFieldChange}
                options={["ISLAM", "KRISTEN", "KATOLIK", "HINDU", "BUDDHA", "KONGHUCU"]}
              />
              <FormRow
                label="Status Perkawinan"
                name="maritalStatus"
                value={form.maritalStatus}
                onChange={handleFieldChange}
                options={["BELUM KAWIN", "KAWIN", "CERAI HIDUP", "CERAI MATI"]}
              />
              <FormRow label="Pekerjaan" name="occupation" value={form.occupation} onChange={handleFieldChange} />
              <FormRow label="Kewarganegaraan" name="nationality" value={form.nationality} onChange={handleFieldChange} />
              <FormRow
                label="Golongan Darah"
                name="bloodType"
                value={form.bloodType}
                onChange={handleFieldChange}
                options={["A", "B", "AB", "O", "A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]}
              />

              <div className="text-[10px] font-bold text-slate-400 tracking-wider pt-3 pb-0.5">Kontak</div>
              <FormRow label="No. HP" name="phone" value={form.phone} onChange={handleFieldChange} type="tel" />
              <FormRow label="Email" name="email" value={form.email} onChange={handleFieldChange} type="email" />
              <FormRow label="Status Sosial" name="socialStatus" value={form.socialStatus} onChange={handleFieldChange} />

              <div className="text-[10px] font-bold text-slate-400 tracking-wider pt-3 pb-0.5">Alamat</div>
              <FormRow label="RT/RW" name="rtRw" value={form.rtRw} onChange={handleFieldChange} />
              <WilayahSelectFull
                city={form.city}
                kecamatan={form.kecamatan}
                kelurahan={form.kelurahan}
                onChange={(field, val) => handleFieldChange(field, val)}
              />
              <FormRow label="Provinsi" name="province" value={form.province} onChange={handleFieldChange} />
              <FormRow label="Alamat Lengkap" name="address" value={form.address} onChange={handleFieldChange} />
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-slate-100 flex items-center gap-3">
              <button
                onClick={handleCloseEdit}
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition"
              >
                Batal
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.fullName.trim()}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition"
              >
                {saving ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Menyimpan...</>
                ) : (
                  <><Check className="h-4 w-4" /> Simpan</>
                )}
              </button>
            </div>
          </div>
        </>
      )}
    </Layout>
  );
}
