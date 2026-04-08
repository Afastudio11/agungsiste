import { Link, useParams } from "wouter";
import Layout from "@/components/layout";
import {
  useGetParticipantByNik,
  getGetParticipantByNikQueryKey,
} from "@workspace/api-client-react";

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex gap-2 py-1.5 border-b last:border-0">
      <span className="w-40 shrink-0 text-xs font-medium text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{value ?? "-"}</span>
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
      <Layout role="supervisor">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent"></div>
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout role="supervisor">
        <div className="py-16 text-center text-muted-foreground">Peserta tidak ditemukan</div>
      </Layout>
    );
  }

  return (
    <Layout role="supervisor">
      <div className="space-y-5">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/participants" className="hover:text-foreground hover:underline">
            Peserta
          </Link>
          <span>/</span>
          <span className="text-foreground">{profile.fullName}</span>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Data KTP</h2>
            <InfoRow label="NIK" value={profile.nik} />
            <InfoRow label="Nama Lengkap" value={profile.fullName} />
            <InfoRow label="Tempat Lahir" value={profile.birthPlace} />
            <InfoRow label="Tanggal Lahir" value={profile.birthDate} />
            <InfoRow label="Jenis Kelamin" value={profile.gender} />
            <InfoRow label="Agama" value={profile.religion} />
            <InfoRow label="Status Perkawinan" value={profile.maritalStatus} />
            <InfoRow label="Pekerjaan" value={profile.occupation} />
            <InfoRow label="Kewarganegaraan" value={profile.nationality} />
            <InfoRow label="Alamat" value={profile.address} />
          </div>

          <div className="rounded-lg border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Riwayat Event</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${(profile.events?.length ?? 0) > 1 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                {profile.events?.length ?? 0} event
              </span>
            </div>
            {profile.events && profile.events.length > 0 ? (
              <div className="space-y-2">
                {profile.events.map((event) => (
                  <Link key={event.id} href={`/events/${event.id}`}>
                    <div className="cursor-pointer rounded-md border p-3 hover:bg-muted/50">
                      <p className="font-medium text-sm">{event.name}</p>
                      <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                        <span>{event.eventDate}</span>
                        {event.location && <span>{event.location}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Belum pernah mengikuti event</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
