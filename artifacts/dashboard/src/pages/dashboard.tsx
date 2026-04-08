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
  Download,
  ArrowUpRight,
  Repeat2,
  Trophy,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function pctChange(val: number, prev: number) {
  if (!prev) return null;
  return (((val - prev) / prev) * 100).toFixed(1);
}

const DOW_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

// ─── Stat Card — accent-top style ─────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon: Icon,
  accent,
  trend,
}: {
  label: string;
  value: number;
  icon: any;
  accent: string;
  trend?: string | null;
}) {
  const up = trend ? parseFloat(trend) >= 0 : null;
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-5 pt-5 pb-4 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
      {/* Colored top bar */}
      <div className={`absolute inset-x-0 top-0 h-[3px] ${accent}`} />

      <div className="flex items-start justify-between mb-3">
        <p
          className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400"
        >
          {label}
        </p>
        <Icon className="h-4 w-4 text-slate-300" strokeWidth={2} />
      </div>

      <p
        className="text-[32px] font-extrabold text-slate-900 leading-none"
        style={{ letterSpacing: "-0.03em" }}
      >
        {fmt(value)}
      </p>

      {trend !== undefined && trend !== null && (
        <div
          className={`mt-2.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            up
              ? "bg-emerald-50 text-emerald-600"
              : "bg-rose-50 text-rose-500"
          }`}
        >
          {up ? (
            <TrendingUp className="h-3 w-3" />
          ) : (
            <TrendingDown className="h-3 w-3" />
          )}
          {up ? "+" : ""}
          {trend}% minggu lalu
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

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
  const { data: segments } = useQuery({
    queryKey: ["dashboard-segments"],
    queryFn: () => fetch("/api/dashboard/segments").then((r) => r.json()),
    staleTime: 60_000,
  });
  const { data: topStaff } = useQuery<{ staffName: string | null; count: number }[]>({
    queryKey: ["dashboard-top-staff"],
    queryFn: () => fetch("/api/dashboard/top-staff").then((r) => r.json()),
    staleTime: 60_000,
  });

  const areaData = (daily ?? []).slice(-60).map((d) => ({
    date: d.date.slice(5),
    count: d.count,
  }));

  const dowData = useMemo(() => {
    const base = DOW_LABELS.map((label, i) => ({ label, count: 0, dow: i }));
    if (segments?.dow) {
      segments.dow.forEach((d: { dow: number; count: number }) => {
        if (base[d.dow]) base[d.dow].count = d.count;
      });
    }
    return base;
  }, [segments]);
  const peakDay = dowData.reduce((mx, d) => (d.count > mx.count ? d : mx), dowData[0]);

  const multiRate = stats?.totalParticipants
    ? Math.round((stats.multiEventParticipants / stats.totalParticipants) * 100)
    : 0;

  const genderData = useMemo(() => {
    const colors = ["#3b82f6", "#f472b6", "#a78bfa"];
    return (segments?.gender ?? []).map(
      (g: { gender: string; count: number }, i: number) => ({
        label:
          g.gender === "LAKI-LAKI"
            ? "Laki-laki"
            : g.gender === "PEREMPUAN"
            ? "Perempuan"
            : g.gender ?? "Lainnya",
        count: g.count,
        color: colors[i] ?? "#94a3b8",
      })
    );
  }, [segments]);
  const totalGender = genderData.reduce((s: number, g: any) => s + g.count, 0);

  const provinceData: { label: string; count: number }[] = useMemo(
    () =>
      (segments?.province ?? []).map((p: { province: string; count: number }) => ({
        label: p.province,
        count: p.count,
      })),
    [segments]
  );
  const maxProv = provinceData[0]?.count ?? 1;

  const recentTrend = pctChange(
    stats?.recentRegistrations ?? 0,
    stats?.prevWeekRegistrations ?? 0
  );

  return (
    <Layout>
      {/* ── Page header ─────────────────────────────────── */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <h1
            className="text-[26px] font-extrabold text-slate-900 leading-tight"
            style={{ letterSpacing: "-0.03em" }}
          >
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-slate-400 font-medium">
            Ringkasan data registrasi peserta event
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs shadow-sm">
            <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-28"
            />
            <span className="text-slate-300 text-xs">—</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border-0 bg-transparent text-[12px] text-slate-600 focus:outline-none w-28"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="ml-1 text-slate-300 hover:text-slate-500 text-sm leading-none"
              >
                ✕
              </button>
            )}
          </div>

          <button className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-[12px] font-bold text-white shadow-sm shadow-blue-200 hover:bg-blue-700 transition-colors">
            <Download className="h-3.5 w-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* ── Stat cards ──────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Peserta"
          value={stats?.totalParticipants ?? 0}
          icon={Users}
          accent="bg-blue-500"
        />
        <StatCard
          label="Total Event"
          value={stats?.totalEvents ?? 0}
          icon={CalendarDays}
          accent="bg-violet-500"
        />
        <StatCard
          label="Total Registrasi"
          value={stats?.totalRegistrations ?? 0}
          icon={ClipboardList}
          accent="bg-emerald-500"
        />
        <StatCard
          label="7 Hari Terakhir"
          value={stats?.recentRegistrations ?? 0}
          icon={TrendingUp}
          accent="bg-amber-400"
          trend={recentTrend}
        />
      </div>

      {/* ── Middle section ──────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4 mb-4">

        {/* Left — 2 columns */}
        <div className="col-span-2 space-y-4">

          {/* Area chart */}
          <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                  Total Registrasi
                </p>
                <div className="flex items-baseline gap-3 mt-1">
                  <span
                    className="text-[36px] font-extrabold text-slate-900 leading-none"
                    style={{ letterSpacing: "-0.04em" }}
                  >
                    {fmt(stats?.totalRegistrations ?? 0)}
                  </span>
                  {recentTrend && (
                    <span
                      className={`flex items-center gap-1 text-[13px] font-semibold ${
                        parseFloat(recentTrend) >= 0
                          ? "text-emerald-500"
                          : "text-rose-500"
                      }`}
                    >
                      <ArrowUpRight className="h-3.5 w-3.5" />
                      {parseFloat(recentTrend) >= 0 ? "+" : ""}
                      {recentTrend}%
                    </span>
                  )}
                </div>
              </div>
              <span className="text-[11px] text-slate-400 font-medium mt-1">
                60 hari terakhir
              </span>
            </div>

            <div className="mt-4">
              {areaData.length > 0 ? (
                <ResponsiveContainer width="100%" height={170}>
                  <AreaChart data={areaData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                    <defs>
                      <linearGradient id="grad1" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.18} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.01} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "#cbd5e1", fontFamily: "Plus Jakarta Sans" }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "#cbd5e1", fontFamily: "Plus Jakarta Sans" }}
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                    />
                    <Tooltip
                      contentStyle={{
                        fontSize: 12,
                        fontFamily: "Plus Jakarta Sans",
                        borderRadius: 10,
                        border: "1px solid #e2e8f0",
                        boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                        padding: "8px 12px",
                      }}
                      formatter={(val) => [fmt(Number(val)), "Registrasi"]}
                      labelFormatter={(l) => `Tgl: ${l}`}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      fill="url(#grad1)"
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-[170px] items-center justify-center text-sm text-slate-300">
                  Belum ada data
                </div>
              )}
            </div>
          </div>

          {/* Gender segments */}
          <div className="rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-4">
              Komposisi Peserta
            </p>
            {genderData.length > 0 && (
              <>
                {/* Stacked bar */}
                <div className="flex h-2.5 w-full overflow-hidden rounded-full gap-0.5 mb-4">
                  {genderData.map((g: any) => (
                    <div
                      key={g.label}
                      className="h-full first:rounded-l-full last:rounded-r-full transition-all"
                      style={{
                        width: `${(g.count / totalGender) * 100}%`,
                        backgroundColor: g.color,
                      }}
                    />
                  ))}
                </div>

                {/* Stat blocks */}
                <div className="grid grid-cols-3 gap-3">
                  {genderData.map((g: any) => (
                    <div
                      key={g.label}
                      className="rounded-xl bg-slate-50 px-4 py-3 border border-slate-100"
                    >
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ backgroundColor: g.color }}
                        />
                        <span className="text-[11px] text-slate-400 font-medium">
                          {g.label}
                        </span>
                      </div>
                      <p
                        className="text-[22px] font-extrabold text-slate-800"
                        style={{ letterSpacing: "-0.03em" }}
                      >
                        {fmt(g.count)}
                      </p>
                      <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                        {Math.round((g.count / totalGender) * 100)}%
                      </p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right — 1 column */}
        <div className="col-span-1 space-y-4">

          {/* Day-of-week */}
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-1">
              Hari Paling Aktif
            </p>
            <p className="text-[11px] text-slate-400 mb-3">
              Paling aktif:{" "}
              <span className="font-bold text-slate-700">
                {peakDay ? DOW_LABELS[peakDay.dow] : "—"}
              </span>{" "}
              ({fmt(peakDay?.count ?? 0)})
            </p>
            <ResponsiveContainer width="100%" height={110}>
              <BarChart data={dowData} margin={{ top: 4, right: 0, left: -28, bottom: 0 }} barCategoryGap="20%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: "#cbd5e1", fontFamily: "Plus Jakarta Sans", fontWeight: 700 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 9, fill: "#e2e8f0", fontFamily: "Plus Jakarta Sans" }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    fontSize: 11,
                    fontFamily: "Plus Jakarta Sans",
                    borderRadius: 8,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                    padding: "6px 10px",
                  }}
                  formatter={(val) => [fmt(Number(val)), "Registrasi"]}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {dowData.map((d) => (
                    <Cell
                      key={d.dow}
                      fill={d.count === peakDay?.count && peakDay?.count > 0 ? "#3b82f6" : "#e2e8f0"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Multi-event gauge */}
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
                Multi-Event Rate
              </p>
              <Repeat2 className="h-3.5 w-3.5 text-slate-300" />
            </div>
            <p className="text-[11px] text-slate-400 mb-3">
              Peserta yang ikut &gt; 1 event
            </p>

            <div className="relative flex justify-center">
              <ResponsiveContainer width="100%" height={110}>
                <PieChart>
                  <Pie
                    data={[{ value: multiRate }, { value: 100 - multiRate }]}
                    cx="50%"
                    cy="90%"
                    startAngle={180}
                    endAngle={0}
                    innerRadius={50}
                    outerRadius={64}
                    dataKey="value"
                    strokeWidth={0}
                  >
                    <Cell fill="#10b981" />
                    <Cell fill="#f1f5f9" />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-center">
                <p
                  className="text-[26px] font-extrabold text-slate-900"
                  style={{ letterSpacing: "-0.04em" }}
                >
                  {multiRate}%
                </p>
              </div>
            </div>

            <p className="mt-1 text-center text-[11px] text-slate-400 font-medium">
              {fmt(stats?.multiEventParticipants ?? 0)} dari{" "}
              {fmt(stats?.totalParticipants ?? 0)} peserta
            </p>
          </div>

          {/* Top provinces */}
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-5 shadow-[0_1px_4px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400 mb-4">
              Provinsi Teratas
            </p>
            <div className="space-y-3">
              {provinceData.slice(0, 5).map((p, i) => (
                <div key={p.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-bold text-slate-300">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[12px] font-semibold text-slate-600 truncate max-w-[110px]">
                        {p.label}
                      </span>
                    </div>
                    <span className="text-[12px] font-bold text-slate-700 shrink-0 ml-2">
                      {fmt(p.count)}
                    </span>
                  </div>
                  <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-blue-400"
                      style={{ width: `${(p.count / maxProv) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Events table ────────────────────────────────── */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <p
              className="text-[15px] font-extrabold text-slate-900"
              style={{ letterSpacing: "-0.02em" }}
            >
              Top Event
            </p>
            <p className="text-[11px] text-slate-400 font-medium mt-0.5">
              Diurutkan berdasarkan jumlah peserta terbanyak
            </p>
          </div>
          <Link href="/events">
            <span className="flex items-center gap-1 text-[12px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer">
              Kelola semua <ArrowUpRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        </div>

        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-50 bg-slate-50/60">
              {["#", "Nama Event", "Tanggal", "Lokasi", "Peserta", "Porsi"].map(
                (h, i) => (
                  <th
                    key={h}
                    className={`px-6 py-3 text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400 ${
                      i >= 4 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {eventsSummary && eventsSummary.length > 0
              ? (() => {
                  const total = eventsSummary.reduce(
                    (s, e) => s + e.participantCount,
                    0
                  );
                  return eventsSummary.slice(0, 10).map((ev, idx) => {
                    const share = total
                      ? Math.round((ev.participantCount / total) * 100)
                      : 0;
                    return (
                      <tr
                        key={ev.id}
                        className="group hover:bg-blue-50/30 transition-colors"
                      >
                        <td className="px-6 py-3.5 text-[11px] font-bold text-slate-300 font-mono">
                          {String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="px-6 py-3.5">
                          <Link href={`/events/${ev.id}`}>
                            <span className="text-[13px] font-semibold text-slate-700 hover:text-blue-600 cursor-pointer group-hover:underline underline-offset-2">
                              {ev.name}
                            </span>
                          </Link>
                        </td>
                        <td className="px-6 py-3.5 text-[12px] font-medium text-slate-400">
                          {ev.eventDate}
                        </td>
                        <td className="px-6 py-3.5 text-[12px] font-medium text-slate-400 max-w-[160px] truncate">
                          {ev.location ?? "—"}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <span
                            className="text-[15px] font-extrabold text-slate-800"
                            style={{ letterSpacing: "-0.02em" }}
                          >
                            {fmt(ev.participantCount)}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div
                                className="h-full rounded-full bg-blue-400"
                                style={{ width: `${share}%` }}
                              />
                            </div>
                            <span className="text-[11px] font-bold text-slate-400 w-7 text-right">
                              {share}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })()
              : (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-sm text-slate-300"
                  >
                    Belum ada data event
                  </td>
                </tr>
              )}
          </tbody>
        </table>
      </div>

      {/* ── Staff Leaderboard ───────────────────────────── */}
      <div className="mt-4 grid grid-cols-2 gap-4">
        {/* Top staff */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex items-center gap-2 px-6 py-4 border-b border-slate-100">
            <Trophy className="h-4 w-4 text-amber-400" />
            <div>
              <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                Staf Terbanyak Input
              </p>
              <p className="text-[11px] text-slate-400 font-medium">Berdasarkan jumlah registrasi yang diinput</p>
            </div>
          </div>

          <div className="px-6 py-4 space-y-3">
            {topStaff && topStaff.length > 0 ? (() => {
              const maxCount = topStaff[0]?.count ?? 1;
              return topStaff.slice(0, 10).map((s, i) => (
                <div key={s.staffName ?? i} className="flex items-center gap-3">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold ${
                      i === 0
                        ? "bg-amber-100 text-amber-600"
                        : i === 1
                        ? "bg-slate-100 text-slate-500"
                        : i === 2
                        ? "bg-orange-100 text-orange-600"
                        : "bg-slate-50 text-slate-400"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[13px] font-semibold text-slate-700 truncate">
                        {s.staffName ?? "—"}
                      </span>
                      <span className="text-[13px] font-extrabold text-slate-800 ml-2 shrink-0" style={{ letterSpacing: "-0.02em" }}>
                        {fmt(s.count)}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${i === 0 ? "bg-amber-400" : "bg-blue-300"}`}
                        style={{ width: `${(s.count / maxCount) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ));
            })() : (
              <p className="py-8 text-center text-sm text-slate-300">Belum ada data staf</p>
            )}
          </div>
        </div>

        {/* Province breakdown */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_1px_4px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
              Sebaran Provinsi
            </p>
            <p className="text-[11px] text-slate-400 font-medium">Top 10 provinsi asal peserta</p>
          </div>
          <div className="px-6 py-4 space-y-3">
            {provinceData.slice(0, 10).map((p, i) => (
              <div key={p.label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] font-bold text-slate-300 font-mono w-5 text-right shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-[12px] font-semibold text-slate-600 truncate">
                      {p.label}
                    </span>
                  </div>
                  <span className="text-[12px] font-extrabold text-slate-700 shrink-0 ml-2" style={{ letterSpacing: "-0.02em" }}>
                    {fmt(p.count)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-blue-400"
                    style={{ width: `${(p.count / maxProv) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
