import { useState, useEffect } from "react";
import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import {
  useGetParticipantByNik,
  getGetParticipantByNikQueryKey,
} from "@workspace/api-client-react";
import { CalendarDays, MapPin, ImageIcon, Eye, EyeOff } from "lucide-react";

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
  const [hasImage, setHasImage] = useState<boolean | null>(null);
  const [showImage, setShowImage] = useState(false);
  const imageUrl = `${BASE_URL}/api/ktp/image/${encodeURIComponent(nik)}`;

  useEffect(() => {
    fetch(imageUrl, { method: "HEAD", credentials: "include" })
      .then((r) => setHasImage(r.ok))
      .catch(() => setHasImage(false));
  }, [imageUrl]);

  if (hasImage === null) return null;
  if (!hasImage) return (
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
      {showImage && (
        <img
          src={imageUrl}
          alt="Foto KTP"
          className="rounded-lg w-full"
          crossOrigin="use-credentials"
          onError={() => setHasImage(false)}
        />
      )}
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

        {/* KTP Photo + Summary row */}
        <div className="grid gap-5 lg:grid-cols-2 items-start">
          {/* KTP Photo */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">
              Foto KTP
            </div>
            <KtpImageViewer nik={nik} />
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
