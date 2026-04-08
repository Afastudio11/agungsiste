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
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16"];

function StatCard({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <div className={`rounded-xl border bg-card p-5 shadow-sm`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color ?? ""}`}>
        {typeof value === "number" ? value.toLocaleString("id-ID") : value}
      </p>
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

  // Derive gender chart data from events summary participant info
  const eventBarData = (eventsSummary ?? []).map((e) => ({
    name: e.name.length > 18 ? e.name.slice(0, 18) + "…" : e.name,
    peserta: e.participantCount,
  }));

  // 30-day slice for main chart
  const dailySlice = (daily ?? []).slice(-30);

  // Weekly aggregation
  const weeklyData = (() => {
    const map: Record<string, number> = {};
    (daily ?? []).forEach((d) => {
      const date = new Date(d.date);
      const week = `W${Math.ceil(date.getDate() / 7)} ${date.toLocaleString("id-ID", { month: "short" })}`;
      map[week] = (map[week] ?? 0) + d.count;
    });
    return Object.entries(map).map(([week, total]) => ({ week, total })).slice(-12);
  })();

  return (
    <Layout role="supervisor">
      <div className="space-y-6">
        {/* Header + Date Filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dashboard</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Ringkasan data registrasi peserta</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-muted-foreground">Dari</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <label className="text-xs text-muted-foreground">Sampai</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          <StatCard
            label="Total Peserta"
            value={stats?.totalParticipants ?? 0}
            sub="NIK unik terdaftar"
            color="text-blue-600"
          />
          <StatCard label="Total Event" value={stats?.totalEvents ?? 0} color="text-violet-600" />
          <StatCard
            label="Total Registrasi"
            value={stats?.totalRegistrations ?? 0}
            sub="Termasuk multi-event"
            color="text-emerald-600"
          />
          <StatCard
            label="Multi-Event"
            value={stats?.multiEventParticipants ?? 0}
            sub="Ikut lebih dari 1 event"
            color="text-amber-600"
          />
          <StatCard
            label="7 Hari Terakhir"
            value={stats?.recentRegistrations ?? 0}
            sub="Registrasi baru"
            color="text-rose-600"
          />
        </div>

        {/* Main Charts Row */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Daily Line Chart — 2/3 width */}
          <div className="lg:col-span-2 rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Registrasi Harian (30 hari terakhir)</h2>
              <span className="text-xs text-muted-foreground">{dailySlice.reduce((a, d) => a + d.count, 0).toLocaleString("id-ID")} total</span>
            </div>
            {dailySlice.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={dailySlice}>
                  <defs>
                    <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val) => [Number(val).toLocaleString("id-ID"), "Registrasi"]}
                    labelFormatter={(l) => `Tanggal: ${l}`}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Belum ada data</div>
            )}
          </div>

          {/* Peserta Multi-Event List — 1/3 width */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Peserta Multi-Event</h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
                {multiEvent?.length ?? 0}
              </span>
            </div>
            {multiEvent && multiEvent.length > 0 ? (
              <div className="space-y-1.5 overflow-y-auto max-h-[220px] pr-1">
                {multiEvent.slice(0, 20).map((p) => (
                  <Link key={p.nik} href={`/participants/${p.nik}`}>
                    <div className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm hover:bg-muted transition-colors">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-xs">{p.fullName}</p>
                        <p className="text-xs text-muted-foreground font-mono">{p.nik}</p>
                      </div>
                      <span className="ml-2 shrink-0 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-bold text-blue-700">
                        {p.eventCount}×
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Belum ada data</div>
            )}
          </div>
        </div>

        {/* Second Charts Row */}
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Bar chart per event */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">Peserta per Event</h2>
            {eventBarData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={eventBarData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val) => [Number(val).toLocaleString("id-ID"), "Peserta"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="peserta" radius={[4, 4, 0, 0]}>
                    {eventBarData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Belum ada data</div>
            )}
          </div>

          {/* Weekly trend bar */}
          <div className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold">Tren Mingguan Registrasi</h2>
            {weeklyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={weeklyData} margin={{ left: 0, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="week" tick={{ fontSize: 9 }} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    formatter={(val) => [Number(val).toLocaleString("id-ID"), "Registrasi"]}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="total" fill="#10b981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">Belum ada data</div>
            )}
          </div>
        </div>

        {/* Events Summary Table */}
        <div className="rounded-xl border bg-card shadow-sm">
          <div className="flex items-center justify-between border-b px-5 py-3.5">
            <h2 className="text-sm font-semibold">Ringkasan Event</h2>
            <Link href="/events" className="text-xs font-medium text-primary hover:underline">
              Kelola Event →
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nama Event</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tanggal</th>
                  <th className="px-5 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Lokasi</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Peserta</th>
                  <th className="px-5 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Porsi</th>
                </tr>
              </thead>
              <tbody>
                {eventsSummary && eventsSummary.length > 0 ? (() => {
                  const totalAll = eventsSummary.reduce((s, e) => s + e.participantCount, 0);
                  return eventsSummary.map((event) => (
                    <tr key={event.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                      <td className="px-5 py-3 font-medium">
                        <Link href={`/events/${event.id}`} className="hover:underline text-primary">
                          {event.name}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-muted-foreground">{event.eventDate}</td>
                      <td className="px-5 py-3 text-muted-foreground">{event.location ?? "-"}</td>
                      <td className="px-5 py-3 text-right font-bold">{event.participantCount.toLocaleString("id-ID")}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <div
                              className="h-full rounded-full bg-blue-500"
                              style={{ width: `${totalAll ? (event.participantCount / totalAll) * 100 : 0}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">
                            {totalAll ? Math.round((event.participantCount / totalAll) * 100) : 0}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ));
                })() : (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-muted-foreground">
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
