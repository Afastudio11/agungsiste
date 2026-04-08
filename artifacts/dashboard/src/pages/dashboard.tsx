import { useState } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import {
  useGetDashboardStats,
  useGetDailyRegistrations,
  useGetEventsSummary,
  useGetMultiEventParticipants,
  getGetDashboardStatsQueryKey,
  getGetDailyRegistrationsQueryKey,
  getGetEventsSummaryQueryKey,
} from "@workspace/api-client-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

function StatCard({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-bold">{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const params = {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const { data: stats } = useGetDashboardStats(params, {
    query: { queryKey: getGetDashboardStatsQueryKey(params) },
  });
  const { data: daily } = useGetDailyRegistrations(params, {
    query: { queryKey: getGetDailyRegistrationsQueryKey(params) },
  });
  const { data: eventsSummary } = useGetEventsSummary(params, {
    query: { queryKey: getGetEventsSummaryQueryKey(params) },
  });
  const { data: multiEvent } = useGetMultiEventParticipants();

  return (
    <Layout role="supervisor">
      <div className="space-y-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-xl font-bold">Dashboard</h1>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Dari</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded border px-2 py-1 text-xs"
            />
            <label className="text-xs text-muted-foreground">Sampai</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded border px-2 py-1 text-xs"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="rounded border px-2 py-1 text-xs hover:bg-muted"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
          <StatCard label="Total Peserta" value={stats?.totalParticipants ?? 0} sub="NIK unik terdaftar" />
          <StatCard label="Total Event" value={stats?.totalEvents ?? 0} />
          <StatCard label="Total Registrasi" value={stats?.totalRegistrations ?? 0} sub="Termasuk multi-event" />
          <StatCard label="Multi-Event" value={stats?.multiEventParticipants ?? 0} sub="Peserta ikut > 1 event" />
          <StatCard label="7 Hari Terakhir" value={stats?.recentRegistrations ?? 0} sub="Registrasi baru" />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-lg border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Registrasi Harian</h2>
            {daily && daily.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)}
                  />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val) => [val, "Registrasi"]}
                    labelFormatter={(l) => `Tanggal: ${l}`}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                Belum ada data registrasi
              </div>
            )}
          </div>

          <div className="rounded-lg border bg-card p-5">
            <h2 className="mb-4 text-sm font-semibold">Peserta Multi-Event</h2>
            {multiEvent && multiEvent.length > 0 ? (
              <div className="space-y-2 overflow-y-auto max-h-[220px]">
                {multiEvent.map((p) => (
                  <Link key={p.nik} href={`/participants/${p.nik}`}>
                    <div className="flex cursor-pointer items-center justify-between rounded px-3 py-2 text-sm hover:bg-muted">
                      <div>
                        <p className="font-medium">{p.fullName}</p>
                        <p className="text-xs text-muted-foreground">{p.nik}</p>
                      </div>
                      <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                        {p.eventCount} event
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
                Belum ada peserta multi-event
              </div>
            )}
          </div>
        </div>

        <div className="rounded-lg border bg-card">
          <div className="flex items-center justify-between border-b px-5 py-3">
            <h2 className="text-sm font-semibold">Ringkasan Event</h2>
            <Link href="/events" className="text-xs text-primary hover:underline">
              Lihat semua
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Nama Event</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Tanggal</th>
                  <th className="px-5 py-2.5 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">Lokasi</th>
                  <th className="px-5 py-2.5 text-right text-xs font-medium uppercase tracking-wider text-muted-foreground">Peserta</th>
                </tr>
              </thead>
              <tbody>
                {eventsSummary && eventsSummary.length > 0 ? (
                  eventsSummary.map((event) => (
                    <tr key={event.id} className="border-b last:border-0 hover:bg-muted/20">
                      <td className="px-5 py-3 font-medium">
                        <Link href={`/events/${event.id}`} className="hover:underline">
                          {event.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{event.eventDate}</td>
                      <td className="px-5 py-3 text-muted-foreground">{event.location ?? "-"}</td>
                      <td className="px-5 py-3 text-right font-bold">{event.participantCount}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="px-5 py-8 text-center text-muted-foreground">
                      Belum ada event
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
