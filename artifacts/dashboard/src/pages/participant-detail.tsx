import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import {
  useGetParticipantByNik,
  getGetParticipantByNikQueryKey,
} from "@workspace/api-client-react";
import { CalendarDays, MapPin, Download, User, ImageIcon, Eye, EyeOff } from "lucide-react";

function KtpCard({ profile }: { profile: NonNullable<ReturnType<typeof useGetParticipantByNik>["data"]> }) {
  return (
    <div className="w-full max-w-[520px] mx-auto select-none" style={{ fontFamily: "'Arial', sans-serif" }}>
      {/* Card */}
      <div
        className="relative rounded-2xl overflow-hidden shadow-2xl border border-slate-200"
        style={{
          background: "linear-gradient(135deg, #f0f7ff 0%, #e8f4fd 40%, #ddeeff 100%)",
          aspectRatio: "85.6 / 54",
        }}
      >
        {/* Top banner */}
        <div
          className="absolute top-0 left-0 right-0 flex items-center gap-2 px-4 py-2"
          style={{ background: "linear-gradient(90deg, #1a4f8b 0%, #1a6fb8 100%)" }}
        >
          {/* Garuda placeholder */}
          <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-base">🦅</div>
          <div className="flex-1 text-center">
            <div className="text-white text-[8px] font-bold tracking-widest leading-none">REPUBLIK INDONESIA</div>
            <div className="text-white/80 text-[6px] tracking-wider leading-none mt-0.5">
              {profile.province ? profile.province.toUpperCase() : "PROVINSI"}
            </div>
          </div>
          <div className="h-8 w-8 shrink-0" />
        </div>

        {/* Body */}
        <div className="absolute top-[44px] left-0 right-0 bottom-0 flex">
          {/* Left: Photo */}
          <div className="flex flex-col items-center justify-center px-3 shrink-0" style={{ width: "28%" }}>
            <div
              className="rounded border-2 border-slate-300 bg-white flex items-center justify-center overflow-hidden"
              style={{ width: "60px", height: "78px" }}
            >
              <div className="flex flex-col items-center text-slate-300">
                <User className="h-8 w-8" />
                <span className="text-[7px] mt-1">FOTO</span>
              </div>
            </div>
            {/* Golongan darah */}
            {profile.bloodType && (
              <div className="mt-1.5 text-center">
                <div className="text-[6px] text-slate-500 font-bold tracking-wider">GOL. DARAH</div>
                <div
                  className="text-white font-extrabold text-xs rounded px-1.5 mt-0.5"
                  style={{ background: "#c0392b" }}
                >
                  {profile.bloodType}
                </div>
              </div>
            )}
          </div>

          {/* Right: Data fields */}
          <div className="flex-1 pr-3 py-2 space-y-0.5">
            {/* NIK */}
            <div className="mb-1.5">
              <div className="text-[7px] font-bold text-slate-500 tracking-widest">NIK</div>
              <div className="text-[11px] font-black tracking-widest text-slate-900 leading-tight">
                {profile.nik || "—"}
              </div>
            </div>

            {[
              { label: "Nama", value: profile.fullName },
              {
                label: "Tempat/Tgl Lahir",
                value: [profile.birthPlace, profile.birthDate].filter(Boolean).join(", ") || undefined,
              },
              { label: "Jenis Kelamin", value: profile.gender },
              {
                label: "Alamat",
                value: profile.address,
              },
              {
                label: "RT/RW",
                value: (profile as Record<string, unknown>).rtRw as string | undefined,
              },
              { label: "Kel/Desa", value: profile.kelurahan },
              { label: "Kecamatan", value: profile.kecamatan },
              { label: "Agama", value: profile.religion },
              {
                label: "Status Perkawinan",
                value: profile.maritalStatus,
              },
              { label: "Pekerjaan", value: profile.occupation },
              { label: "Kewarganegaraan", value: profile.nationality },
              {
                label: "Berlaku Hingga",
                value: (profile as Record<string, unknown>).validUntil as string ?? "SEUMUR HIDUP",
              },
            ]
              .filter((f) => f.value)
              .map(({ label, value }) => (
                <div key={label} className="flex items-start gap-1 leading-tight">
                  <span
                    className="text-slate-600 shrink-0"
                    style={{ fontSize: "6.5px", width: "64px", paddingTop: "1px" }}
                  >
                    {label}
                  </span>
                  <span className="text-slate-400 shrink-0" style={{ fontSize: "6.5px", paddingTop: "1px" }}>:</span>
                  <span
                    className="text-slate-900 font-semibold leading-tight"
                    style={{ fontSize: "7px" }}
                  >
                    {value}
                  </span>
                </div>
              ))}
          </div>
        </div>

        {/* Bottom strip */}
        <div
          className="absolute bottom-0 left-0 right-0 h-4 flex items-center justify-between px-4"
          style={{ background: "linear-gradient(90deg, #1a4f8b 0%, #1a6fb8 100%)" }}
        >
          <div className="text-white/50 text-[5px] tracking-widest">KARTU TANDA PENDUDUK</div>
          <div className="text-white/50 text-[5px] tracking-widest">KTP-el</div>
        </div>

        {/* Subtle watermark lines */}
        <div className="absolute inset-0 pointer-events-none opacity-5">
          {Array.from({ length: 18 }).map((_, i) => (
            <div
              key={i}
              className="absolute w-full border-t border-blue-400"
              style={{ top: `${(i + 1) * 5.5}%` }}
            />
          ))}
        </div>
      </div>

      {/* Label */}
      <div className="text-center text-[10px] text-slate-400 mt-2">Tampilan KTP Digital — Data dari hasil scan OCR</div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 py-1.5 border-b border-slate-50 last:border-0">
      <span className="w-44 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <span className="text-sm font-semibold text-slate-800">{value ?? "—"}</span>
    </div>
  );
}

const BASE_URL = import.meta.env.BASE_URL.replace(/\/$/, "");

function KtpImageViewer({ nik }: { nik: string }) {
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImage, setShowImage] = useState(false);

  useEffect(() => {
    fetch(`${BASE_URL}/api/ktp/image/${nik}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.image) setImage(d.image); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [nik]);

  if (loading) return null;
  if (!image) return (
    <div className="bg-slate-50 rounded-xl p-4 text-center text-sm text-slate-400">
      <ImageIcon className="h-8 w-8 mx-auto mb-2 text-slate-300" />
      Foto KTP belum tersimpan
    </div>
  );

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Foto KTP Asli</span>
        <button onClick={() => setShowImage(!showImage)}
          className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-600">
          {showImage ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showImage ? "Sembunyikan" : "Tampilkan"}
        </button>
      </div>
      {showImage && <img src={image} alt="Foto KTP" className="rounded-lg w-full" />}
    </div>
  );
}

export default function ParticipantDetailPage() {
  const params = useParams();
  const nik = params.nik as string;

  const { data: profile, isLoading } = useGetParticipantByNik(nik, {
    query: { enabled: !!nik, queryKey: getGetParticipantByNikQueryKey(nik) },
  });

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
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Link href="/participants" className="hover:text-slate-700 hover:underline transition">
            Peserta
          </Link>
          <span>/</span>
          <span className="text-slate-900 font-semibold">{profile.fullName}</span>
        </div>

        {/* KTP Card + Summary row */}
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          {/* KTP Visual */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 flex flex-col items-center">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 self-start">
              Kartu Tanda Penduduk
            </div>
            <KtpCard profile={profile} />
            <button className="mt-4 flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 border border-slate-200 hover:border-blue-300 px-3 py-1.5 rounded-lg transition">
              <Download className="h-3.5 w-3.5" />
              Unduh KTP Digital
            </button>
            <div className="mt-4 w-full">
              <KtpImageViewer nik={nik} />
            </div>
          </div>

          {/* Event history + extra info */}
          <div className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Total Event</div>
                <div
                  className="text-3xl font-extrabold text-slate-900"
                  style={{ letterSpacing: "-0.04em" }}
                >
                  {profile.events?.length ?? 0}
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-slate-100 p-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Status</div>
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
                <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Riwayat Event</h2>
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
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Data Lengkap KTP</h2>
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
