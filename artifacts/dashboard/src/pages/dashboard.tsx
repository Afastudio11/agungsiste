import { useState, useMemo } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import {
  useGetDashboardStats,
  useGetDailyRegistrations,
  useGetEventsSummary,
  getGetDashboardStatsQueryKey,
  getGetDailyRegistrationsQueryKey,
  getGetEventsSummaryQueryKey,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  AreaChart,
  Area,
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
} from "recharts";
import {
  Users,
  CalendarDays,
  ClipboardList,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Download,
  MoreHorizontal,
  MapPin,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function pct(val: number, prev: number) {
  if (!prev) return null;
  return (((val - prev) / prev) * 100).toFixed(1);
}

// ── Subcomponents ─────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  iconBg,
}: {
  icon: any;
  label: string;
  value: number;
  sub?: string;
  trend?: string | null;
  iconBg: string;
}) {
  const positive = trend ? parseFloat(trend) >= 0 : null;
  return (
    <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${iconBg}`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
      </div>
      <p className="mt-3 text-3xl font-bold text-slate-800">{fmt(value)}</p>
      {sub && <p className="mt-0.5 text-xs text-slate-400">{sub}</p>}
      {trend !== undefined && trend !== null && (
        <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${positive ? "text-emerald-600" : "text-rose-500"}`}>
          {positive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
          <span>{positive ? "+" : ""}{trend}% dari minggu lalu</span>
        </div>
      )}
    </div>
  );
}

function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
      <button className="rounded-full p-1.5 hover:bg-slate-100 transition-colors">
        <MoreHorizontal className="h-4 w-4 text-slate-400" />
      </button>
    </div>
  );
}

const DOW_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// ── Main Page ─────────────────────────────────────────────────────────────────

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

  // Segments (gender, province, dow) — direct fetch
  const { data: segments } = useQuery({
    queryKey: ["dashboard-segments"],
    queryFn: () => fetch("/api/dashboard/segments").then((r) => r.json()),
    staleTime: 60_000,
  });

  // Day-of-week chart data
  const dowData = useMemo(() => {
    const base = DOW_LABELS.map((label, i) => ({ label, count: 0, dow: i }));
    if (segments?.dow) {
      segments.dow.forEach((d: { dow: number; count: number }) => {
        if (base[d.dow]) base[d.dow].count = d.count;
      });
    }
    return base;
  }, [segments]);

  // Multi-event rate
  const multiEventRate = stats && stats.totalParticipants
    ? Math.round((stats.multiEventParticipants / stats.totalParticipants) * 100)
    : 0;

  // Area chart – last 60 days
  const areaData = (daily ?? []).slice(-60).map((d) => ({
    date: d.date.slice(5),
    count: d.count,
  }));

  // Gender breakdown for segment bars
  const genderData: { label: string; count: number; color: string }[] = useMemo(() => {
    if (!segments?.gender) return [];
    const colors = ["#3b82f6", "#ec4899", "#a78bfa"];
    return segments.gender.map((g: { gender: string; count: number }, i: number) => ({
      label: g.gender ?? "Tidak Diisi",
      count: g.count,
      color: colors[i] ?? "#94a3b8",
    }));
  }, [segments]);
  const totalGender = genderData.reduce((s, g) => s + g.count, 0);

  // Province breakdown
  const provinceData: { label: string; count: number }[] = useMemo(() => {
    if (!segments?.province) return [];
    return segments.province.map((p: { province: string; count: number }) => ({
      label: p.province,
      count: p.count,
    }));
  }, [segments]);
  const maxProvince = provinceData[0]?.count ?? 1;

  // Trend
  const recentTrend = pct(stats?.recentRegistrations ?? 0, stats?.prevWeekRegistrations ?? 0);

  // Max dow for bar scaling
  const maxDow = Math.max(...dowData.map((d) => d.count), 1);

  return (
    <Layout role="supervisor">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">Selamat datang kembali! Ini ringkasan hari ini.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Date range */}
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border-0 bg-transparent text-xs text-slate-600 focus:outline-none w-28"
            />
            <span className="text-slate-300">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border-0 bg-transparent text-xs text-slate-600 focus:outline-none w-28"
            />
            {(startDate || endDate) && (
              <button onClick={() => { setStartDate(""); setEndDate(""); }} className="ml-1 text-slate-400 hover:text-slate-600">✕</button>
            )}
          </div>
          <button className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors">
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4 mb-6">
        <StatCard
          icon={Users}
          label="Total Peserta"
          value={stats?.totalParticipants ?? 0}
          sub="NIK unik terdaftar"
          iconBg="bg-blue-500"
        />
        <StatCard
          icon={CalendarDays}
          label="Total Event"
          value={stats?.totalEvents ?? 0}
          sub="Event aktif"
          iconBg="bg-violet-500"
        />
        <StatCard
          icon={ClipboardList}
          label="Total Registrasi"
          value={stats?.totalRegistrations ?? 0}
          sub="Termasuk multi-event"
          iconBg="bg-emerald-500"
        />
        <StatCard
          icon={TrendingUp}
          label="7 Hari Terakhir"
          value={stats?.recentRegistrations ?? 0}
          sub="Registrasi baru"
          trend={recentTrend}
          iconBg="bg-amber-500"
        />
      </div>

      {/* Middle row: left (2/3) + right (1/3) */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {/* LEFT — Area chart + segments */}
        <div className="col-span-2 space-y-4">
          {/* Area chart */}
          <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
            <SectionHeader
              title="Total Registrasi"
              sub="60 hari terakhir"
            />
            <div className="flex items-end gap-3 mb-4">
              <p className="text-4xl font-bold text-slate-800">{fmt(stats?.totalRegistrations ?? 0)}</p>
              {recentTrend && (
                <span className={`mb-1 flex items-center gap-1 text-sm font-semibold ${parseFloat(recentTrend) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                  <ArrowUpRight className="h-4 w-4" />
                  {parseFloat(recentTrend) >= 0 ? "+" : ""}{recentTrend}%
                  <span className="text-xs font-normal text-slate-400 ml-0.5">vs minggu lalu</span>
                </span>
              )}
            </div>
            {areaData.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={areaData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)" }}
                    formatter={(val) => [fmt(Number(val)), "Registrasi"]}
                    labelFormatter={(l) => `Tgl: ${l}`}
                  />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2.5} fill="url(#areaGrad)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-[180px] items-center justify-center text-sm text-slate-400">Belum ada data</div>
            )}
          </div>

          {/* Gender Segment Bars */}
          <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
            <SectionHeader title="Komposisi Peserta" sub="Berdasarkan jenis kelamin" />
            {genderData.length > 0 ? (
              <div className="space-y-4">
                <div className="flex gap-1 h-3 rounded-full overflow-hidden">
                  {genderData.map((g) => (
                    <div
                      key={g.label}
                      className="h-full rounded-full transition-all"
                      style={{ width: `${(g.count / totalGender) * 100}%`, backgroundColor: g.color }}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {genderData.map((g) => (
                    <div key={g.label} className="flex items-center gap-2.5 rounded-xl bg-slate-50 px-3 py-2.5">
                      <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: g.color }} />
                      <div className="min-w-0">
                        <p className="text-xs text-slate-400 truncate">{g.label === "LAKI-LAKI" ? "Laki-laki" : g.label === "PEREMPUAN" ? "Perempuan" : g.label}</p>
                        <p className="text-sm font-bold text-slate-700">{fmt(g.count)}</p>
                        <p className="text-xs text-slate-400">{Math.round((g.count / totalGender) * 100)}%</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="h-20 flex items-center justify-center text-sm text-slate-400">Memuat...</div>
            )}
          </div>
        </div>

        {/* RIGHT panel */}
        <div className="col-span-1 space-y-4">
          {/* Day-of-week bar chart */}
          <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
            <SectionHeader title="Hari Paling Aktif" />
            <div className="flex items-end gap-1 h-28 mt-2">
              {dowData.map((d) => {
                const h = Math.round((d.count / maxDow) * 100);
                const isMax = d.count === maxDow;
                return (
                  <div key={d.dow} className="flex flex-1 flex-col items-center gap-1">
                    <div
                      className={`w-full rounded-t-md transition-all ${isMax ? "bg-blue-500" : "bg-slate-100"}`}
                      style={{ height: `${Math.max(h, 8)}%` }}
                    />
                    <span className={`text-[10px] font-medium ${isMax ? "text-blue-600" : "text-slate-400"}`}>{d.label}</span>
                  </div>
                );
              })}
            </div>
            {dowData.length > 0 && (
              <p className="mt-3 text-center text-xs text-slate-400">
                Paling aktif: <span className="font-semibold text-slate-700">{DOW_LABELS[dowData.reduce((mx, d) => d.count > mx.count ? d : mx, dowData[0]).dow]}</span>
              </p>
            )}
          </div>

          {/* Multi-event rate gauge */}
          <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
            <SectionHeader title="Multi-Event Rate" sub="Peserta ikut > 1 event" />
            <div className="relative flex justify-center">
              <ResponsiveContainer width="100%" height={130}>
                <PieChart>
                  <Pie
                    data={[
                      { value: multiEventRate },
                      { value: 100 - multiEventRate },
                    ]}
                    cx="50%"
                    cy="85%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={55}
                    outerRadius={72}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f1f5f9" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 text-center">
                <p className="text-2xl font-bold text-slate-800">{multiEventRate}%</p>
                <p className="text-[10px] text-slate-400">dari target</p>
              </div>
            </div>
            <button className="mt-2 w-full text-xs font-medium text-blue-600 hover:underline">Lihat detail →</button>
          </div>

          {/* Province top */}
          <div className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
            <SectionHeader title="Provinsi Teratas" />
            <div className="space-y-3">
              {provinceData.slice(0, 5).map((p) => (
                <div key={p.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-3 w-3 text-slate-400" />
                      <span className="text-xs text-slate-600 truncate max-w-[120px]">{p.label}</span>
                    </div>
                    <span className="text-xs font-bold text-slate-700">{fmt(p.count)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-400 transition-all"
                      style={{ width: `${(p.count / maxProvince) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Best events table */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div>
            <p className="text-sm font-semibold text-slate-700">Top Event</p>
            <p className="text-xs text-slate-400 mt-0.5">Diurutkan berdasarkan jumlah peserta</p>
          </div>
          <Link href="/events">
            <span className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline cursor-pointer">
              Lihat semua <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">ID</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Nama Event</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Tanggal</th>
                <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Lokasi</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Peserta</th>
                <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Porsi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {eventsSummary && eventsSummary.length > 0 ? (() => {
                const total = eventsSummary.reduce((s, e) => s + e.participantCount, 0);
                return eventsSummary.slice(0, 10).map((ev, idx) => {
                  const share = total ? Math.round((ev.participantCount / total) * 100) : 0;
                  return (
                    <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3.5 text-xs font-mono text-slate-400">#{String(idx + 1).padStart(3, "0")}</td>
                      <td className="px-5 py-3.5">
                        <Link href={`/events/${ev.id}`}>
                          <span className="text-sm font-medium text-slate-700 hover:text-blue-600 cursor-pointer hover:underline">
                            {ev.name}
                          </span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-sm text-slate-500">{ev.eventDate}</td>
                      <td className="px-5 py-3.5 text-sm text-slate-500 max-w-[160px] truncate">{ev.location ?? "-"}</td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="text-sm font-bold text-slate-700">{fmt(ev.participantCount)}</span>
                        <span className="text-xs text-slate-400 ml-1">peserta</span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-emerald-400" style={{ width: `${share}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-slate-500 w-7 text-right">{share}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                });
              })() : (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-400">Belum ada data event</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
