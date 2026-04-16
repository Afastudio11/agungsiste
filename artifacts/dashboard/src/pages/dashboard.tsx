import { useState, useMemo } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import { useHeaderContext } from "@/lib/header-context";
import {
  useGetDailyRegistrations,
  getGetDailyRegistrationsQueryKey,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import DashboardMap from "@/components/dashboard-map";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

function pctChange(val: number, prev: number) {
  if (!prev) return null;
  return (((val - prev) / prev) * 100).toFixed(1);
}

const DOW_LABELS = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

function MsIcon({ name, className, style }: { name: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span
      className={`material-symbols-outlined select-none leading-none ${className ?? ""}`}
      style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 20", ...style }}
    >
      {name}
    </span>
  );
}

// ─── Bento Stat Card ──────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  icon,
  circleColor,
  iconColor,
  trend,
}: {
  label: string;
  value: number;
  icon: string;
  circleColor: string;
  iconColor: string;
  trend?: string | null;
}) {
  const up = trend ? parseFloat(trend) >= 0 : null;
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-5 pt-5 pb-4 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] transition-shadow">
      {/* Decorative circle */}
      <div
        className={`absolute -top-6 -right-6 h-24 w-24 rounded-full opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 ${circleColor}`}
      />

      <div className="flex items-start justify-between mb-3 relative">
        <p className="text-[10px] font-bold tracking-[0.1em] text-slate-400">{label}</p>
        <MsIcon name={icon} className={`text-[20px] ${iconColor}`} />
      </div>

      <p
        className="text-[34px] font-extrabold text-slate-900 leading-none relative"
        style={{ letterSpacing: "-0.04em" }}
      >
        {fmt(value)}
      </p>

      {trend !== undefined && trend !== null && (
        <div className={`mt-3 inline-flex items-center gap-1 text-[11px] font-semibold ${up ? "text-emerald-600" : "text-rose-500"}`}>
          <MsIcon name={up ? "trending_up" : "trending_down"} className="text-[14px]" />
          {up ? "+" : ""}{trend}% vs minggu lalu
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { startDate, endDate, setStartDate, setEndDate } = useHeaderContext();
  const [regPeriod, setRegPeriod] = useState<"day" | "week" | "month">("day");
  const [activePeriod, setActivePeriod] = useState<"hari" | "minggu" | "bulan" | "tahun" | "custom" | null>(null);
  const [filterKabupaten, setFilterKabupaten] = useState("");
  const [filterKecamatan, setFilterKecamatan] = useState("");
  const [filterKelurahan, setFilterKelurahan] = useState("");
  const [showDaerahFilter, setShowDaerahFilter] = useState(false);

  const setPeriod = (p: typeof activePeriod) => {
    const today = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (p === "hari") { setStartDate(fmt(today)); setEndDate(fmt(today)); }
    else if (p === "minggu") { const d = new Date(today); d.setDate(d.getDate() - 7); setStartDate(fmt(d)); setEndDate(fmt(today)); }
    else if (p === "bulan") { const d = new Date(today); d.setDate(d.getDate() - 30); setStartDate(fmt(d)); setEndDate(fmt(today)); }
    else if (p === "tahun") { setStartDate(`${today.getFullYear()}-01-01`); setEndDate(fmt(today)); }
    else { setStartDate(""); setEndDate(""); }
    setActivePeriod(p);
  };

  const daerahParams = new URLSearchParams();
  if (filterKabupaten) daerahParams.set("kabupaten", filterKabupaten);
  if (filterKecamatan) daerahParams.set("kecamatan", filterKecamatan);
  if (filterKelurahan) daerahParams.set("kelurahan", filterKelurahan);
  const daerahQs = daerahParams.toString();

  const params = {
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  };

  const statsQs = new URLSearchParams({
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
    ...(filterKabupaten ? { kabupaten: filterKabupaten } : {}),
    ...(filterKecamatan ? { kecamatan: filterKecamatan } : {}),
    ...(filterKelurahan ? { kelurahan: filterKelurahan } : {}),
  }).toString();
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats", statsQs],
    queryFn: () => fetch(`/api/dashboard/stats${statsQs ? `?${statsQs}` : ""}`).then((r) => r.json()),
    staleTime: 30_000,
  });
  const dateQs = new URLSearchParams({
    ...(startDate ? { startDate } : {}),
    ...(endDate ? { endDate } : {}),
  }).toString();

  const { data: daily } = useGetDailyRegistrations(params, {
    query: { queryKey: getGetDailyRegistrationsQueryKey(params) },
  });
  const { data: eventsSummary } = useQuery({
    queryKey: ["dashboard-events-summary", statsQs],
    queryFn: () => fetch(`/api/dashboard/events-summary${statsQs ? `?${statsQs}` : ""}`).then((r) => r.json()),
    staleTime: 30_000,
  });
  const { data: segments } = useQuery({
    queryKey: ["dashboard-segments", statsQs],
    queryFn: () => fetch(`/api/dashboard/segments${statsQs ? `?${statsQs}` : ""}`).then((r) => r.json()),
    staleTime: 30_000,
  });
  const { data: topStaff } = useQuery<{ staffName: string | null; count: number }[]>({
    queryKey: ["dashboard-top-staff", statsQs],
    queryFn: () => fetch(`/api/dashboard/top-staff${statsQs ? `?${statsQs}` : ""}`).then((r) => r.json()),
    staleTime: 30_000,
  });
  const { data: kabupatenData } = useQuery<{ kabupaten: string; totalInput: number }[]>({
    queryKey: ["pemetaan-kabupaten", dateQs],
    queryFn: () => fetch(`/api/pemetaan/kabupaten${dateQs ? `?${dateQs}` : ""}`).then((r) => r.json()),
    staleTime: 30_000,
  });
  const { data: kecamatanData } = useQuery<{ kecamatan: string }[]>({
    queryKey: ["pemetaan-kecamatan", filterKabupaten],
    queryFn: () => fetch(`/api/pemetaan/kecamatan${filterKabupaten ? `?kabupaten=${encodeURIComponent(filterKabupaten)}` : ""}`).then((r) => r.json()),
    enabled: showDaerahFilter,
    staleTime: 60_000,
  });
  const { data: desaData } = useQuery<{ kelurahan: string }[]>({
    queryKey: ["pemetaan-desa-filter", filterKabupaten, filterKecamatan],
    queryFn: () => {
      const q = new URLSearchParams();
      if (filterKabupaten) q.set("kabupaten", filterKabupaten);
      if (filterKecamatan) q.set("kecamatan", filterKecamatan);
      return fetch(`/api/pemetaan/desa?${q.toString()}`).then((r) => r.json());
    },
    enabled: showDaerahFilter && !!(filterKabupaten || filterKecamatan),
    staleTime: 60_000,
  });
  const { data: topPrizes } = useQuery<{ id: number; name: string; eventName: string | null; quantity: number; distributedCount: number }[]>({
    queryKey: ["dashboard-top-prizes"],
    queryFn: () => fetch("/api/dashboard/top-prizes").then((r) => r.json()),
    staleTime: 60_000,
  });

  const recentTrend = pctChange(
    stats?.recentRegistrations ?? 0,
    stats?.prevWeekRegistrations ?? 0
  );

  // ── Registration chart data ───────────────────────────────────────────────
  const regChartData = useMemo(() => {
    const raw = (daily ?? []).slice(-90);
    if (regPeriod === "day") {
      return raw.slice(-14).map((d) => ({ label: d.date.slice(5), count: d.count }));
    }
    if (regPeriod === "week") {
      const buckets: { label: string; count: number }[] = [];
      for (let i = 0; i < raw.length; i += 7) {
        const chunk = raw.slice(i, i + 7);
        const total = chunk.reduce((s, d) => s + d.count, 0);
        const label = chunk[0]?.date.slice(5) ?? "";
        buckets.push({ label, count: total });
      }
      return buckets.slice(-8);
    }
    const months: Record<string, number> = {};
    raw.forEach((d) => {
      const key = d.date.slice(0, 7);
      months[key] = (months[key] ?? 0) + d.count;
    });
    return Object.entries(months).slice(-6).map(([k, v]) => ({ label: k.slice(5), count: v }));
  }, [daily, regPeriod]);

  const dowData = useMemo(() => {
    const base = DOW_LABELS.map((label, i) => ({ label, count: 0, dow: i }));
    if (segments?.dow) {
      segments.dow.forEach((d: { dow: number; count: number }) => {
        if (base[d.dow]) base[d.dow].count = d.count;
      });
    }
    return base;
  }, [segments]);


  const genderData = useMemo(() => {
    const palette = [
      { bg: "#3b82f6" },
      { bg: "#f472b6" },
      { bg: "#a78bfa" },
    ];
    return (segments?.gender ?? []).map(
      (g: { gender: string; count: number }, i: number) => ({
        label:
          g.gender === "LAKI-LAKI" ? "Laki-laki"
          : g.gender === "PEREMPUAN" ? "Perempuan"
          : g.gender ?? "Lainnya",
        count: g.count,
        color: palette[i]?.bg ?? "#94a3b8",
      })
    );
  }, [segments]);
  const totalGender = genderData.reduce((s: number, g: { count: number }) => s + g.count, 0);

  const daerahData: { label: string; count: number }[] = useMemo(
    () =>
      (kabupatenData ?? [])
        .slice()
        .sort((a, b) => b.totalInput - a.totalInput)
        .map((d) => ({ label: d.kabupaten, count: d.totalInput })),
    [kabupatenData]
  );
  const maxDaerah = daerahData[0]?.count ?? 1;
  const maxStaff = topStaff?.[0]?.count ?? 1;

  return (
    <Layout>
      {/* ── Filter Bar ──────────────────────────────────────────── */}
      <div className="mb-5 space-y-2">
        {/* Period quick-select */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-bold tracking-widest text-slate-400 mr-1">Periode</span>
          {([
            { key: "hari", label: "Hari Ini" },
            { key: "minggu", label: "7 Hari" },
            { key: "bulan", label: "30 Hari" },
            { key: "tahun", label: "Tahun Ini" },
          ] as const).map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(activePeriod === key ? null : key)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
                activePeriod === key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
              }`}
            >
              {label}
            </button>
          ))}
          <button
            onClick={() => {
              if (activePeriod === "custom") { setActivePeriod(null); setStartDate(""); setEndDate(""); }
              else setActivePeriod("custom");
            }}
            className={`px-3 py-1.5 rounded-full text-[12px] font-bold transition-all flex items-center gap-1.5 ${
              activePeriod === "custom"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <MsIcon name="calendar_today" className="text-[13px]" />
            Custom
          </button>

          {/* Inline custom date inputs */}
          {activePeriod === "custom" && (
            <div className="flex items-center gap-1.5 bg-white border border-blue-300 rounded-full px-3 py-1 shadow-sm">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-0 bg-transparent text-[11px] text-slate-700 focus:outline-none w-[108px]"
              />
              <span className="text-slate-300 text-xs">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-0 bg-transparent text-[11px] text-slate-700 focus:outline-none w-[108px]"
              />
            </div>
          )}

          <div className="h-4 w-px bg-slate-200 mx-1" />
          <button
            onClick={() => setShowDaerahFilter((v) => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-bold transition-all ${
              (filterKabupaten || filterKecamatan || filterKelurahan)
                ? "bg-emerald-600 text-white"
                : showDaerahFilter
                ? "bg-slate-800 text-white"
                : "bg-white border border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <MsIcon name="location_on" className="text-[14px]" />
            Daerah
            {(filterKabupaten || filterKecamatan || filterKelurahan) && (
              <span className="ml-0.5 truncate max-w-[80px]">
                : {filterKelurahan || filterKecamatan || filterKabupaten}
              </span>
            )}
          </button>
          {(filterKabupaten || filterKecamatan || filterKelurahan || activePeriod) && (
            <button
              onClick={() => { setPeriod(null); setFilterKabupaten(""); setFilterKecamatan(""); setFilterKelurahan(""); }}
              className="px-3 py-1.5 rounded-full text-[12px] font-medium text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 transition"
            >
              Reset
            </button>
          )}
        </div>

        {/* Daerah dropdowns */}
        {showDaerahFilter && (
          <div className="flex flex-wrap gap-2 pt-1">
            <select
              value={filterKabupaten}
              onChange={(e) => { setFilterKabupaten(e.target.value); setFilterKecamatan(""); setFilterKelurahan(""); }}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="">— Semua Kabupaten —</option>
              {(kabupatenData ?? []).map((k) => (
                <option key={k.kabupaten} value={k.kabupaten}>{k.kabupaten}</option>
              ))}
            </select>
            {filterKabupaten && (
              <select
                value={filterKecamatan}
                onChange={(e) => { setFilterKecamatan(e.target.value); setFilterKelurahan(""); }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">— Semua Kecamatan —</option>
                {(kecamatanData ?? []).map((k) => (
                  <option key={k.kecamatan} value={k.kecamatan}>{k.kecamatan}</option>
                ))}
              </select>
            )}
            {filterKecamatan && (
              <select
                value={filterKelurahan}
                onChange={(e) => setFilterKelurahan(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                <option value="">— Semua Desa/Kel. —</option>
                {(desaData ?? []).map((d) => (
                  <option key={d.kelurahan} value={d.kelurahan}>{d.kelurahan}</option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      {/* ── Stat cards ──────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatCard
          label="Total Peserta"
          value={stats?.totalParticipants ?? 0}
          icon="group"
          circleColor="bg-blue-500"
          iconColor="text-blue-400"
        />
        <StatCard
          label="Total Event"
          value={stats?.totalEvents ?? 0}
          icon="event"
          circleColor="bg-violet-500"
          iconColor="text-violet-400"
        />
        <StatCard
          label="Total Registrasi"
          value={stats?.totalRegistrations ?? 0}
          icon="assignment"
          circleColor="bg-emerald-500"
          iconColor="text-emerald-400"
        />
        <StatCard
          label="Total Hadiah"
          value={stats?.totalPrizesDistributed ?? 0}
          icon="card_giftcard"
          circleColor="bg-purple-500"
          iconColor="text-purple-400"
        />
      </div>

      {/* ── Charts row: 8-col / 4-col ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">

        {/* Left: Registration bar chart */}
        <div className="lg:col-span-8 rounded-2xl bg-white border border-slate-100 px-6 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400">Registrasi</p>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-[32px] font-extrabold text-slate-900 leading-none" style={{ letterSpacing: "-0.04em" }}>
                  {fmt(stats?.totalRegistrations ?? 0)}
                </span>
                {recentTrend && (
                  <span className={`flex items-center gap-0.5 text-[12px] font-semibold ${parseFloat(recentTrend) >= 0 ? "text-emerald-500" : "text-rose-500"}`}>
                    <MsIcon name="arrow_upward" className="text-[14px]" />
                    {parseFloat(recentTrend) >= 0 ? "+" : ""}{recentTrend}%
                  </span>
                )}
              </div>
            </div>

            {/* Period toggle */}
            <div className="flex items-center gap-1 bg-slate-100 rounded-full p-1">
              {(["day", "week", "month"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setRegPeriod(p)}
                  className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all ${
                    regPeriod === p
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {p === "day" ? "Hari" : p === "week" ? "Minggu" : "Bulan"}
                </button>
              ))}
            </div>
          </div>

          {regChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={regChartData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
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
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.08)",
                    padding: "8px 12px",
                  }}
                  formatter={(val) => [fmt(Number(val)), "Registrasi"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[180px] items-center justify-center text-sm text-slate-300">Belum ada data</div>
          )}
        </div>

        {/* Right: Top Hadiah */}
        <div className="lg:col-span-4 rounded-2xl bg-white border border-slate-100 px-5 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400">Top Hadiah</p>
              <p className="text-[11px] text-slate-400 mt-0.5">Terbanyak dibagikan</p>
            </div>
            <Link href="/prizes">
              <span className="text-[11px] font-bold text-blue-600 hover:text-blue-800 cursor-pointer flex items-center gap-0.5">
                Kelola <MsIcon name="arrow_outward" className="text-[13px]" />
              </span>
            </Link>
          </div>
          <div className="space-y-3 flex-1">
            {topPrizes && topPrizes.length > 0 ? topPrizes.slice(0, 6).map((prize, i) => {
              const maxDist = topPrizes[0]?.distributedCount || 1;
              const pct = Math.round((prize.distributedCount / Math.max(maxDist, 1)) * 100);
              return (
                <div key={prize.id}>
                  <div className="flex items-center justify-between mb-1 gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[10px] font-bold text-slate-300 w-4 shrink-0 font-mono text-right">{i + 1}</span>
                      <span className="text-[12px] font-semibold text-slate-700 truncate">{prize.name}</span>
                    </div>
                    <span className="text-[12px] font-extrabold text-blue-600 shrink-0">{prize.distributedCount}/{prize.quantity}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-400" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            }) : (
              <div className="flex flex-col items-center justify-center flex-1 py-8 text-center">
                <MsIcon name="card_giftcard" className="text-[40px] text-slate-200 mb-2" />
                <p className="text-sm text-slate-300">Belum ada hadiah</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Lower grid: 8-col / 4-col ───────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">

        {/* Top Events table (8-col) */}
        <div className="lg:col-span-8 rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-50">
            <div>
              <p className="text-[15px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                Top Event
              </p>
              <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                Diurutkan berdasarkan jumlah peserta terbanyak
              </p>
            </div>
            <Link href="/events">
              <span className="flex items-center gap-1 text-[12px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer">
                Kelola semua
                <MsIcon name="arrow_outward" className="text-[14px]" />
              </span>
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-50 bg-slate-50/60">
                  {["#", "Nama Event", "Tanggal", "Peserta", "Porsi"].map((h, i) => (
                    <th
                      key={h}
                      className={`px-5 py-3 text-[10px] font-bold tracking-[0.08em] text-slate-400 ${i >= 3 ? "text-right" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {eventsSummary && eventsSummary.length > 0 ? (() => {
                  const total = eventsSummary.reduce((s, e) => s + e.participantCount, 0);
                  return eventsSummary.slice(0, 5).map((ev, idx) => {
                    const share = total ? Math.round((ev.participantCount / total) * 100) : 0;
                    return (
                      <tr key={ev.id} className="group hover:bg-blue-50/30 transition-colors">
                        <td className="px-5 py-3.5 text-[11px] font-bold text-slate-300 font-mono w-10">
                          {String(idx + 1).padStart(2, "0")}
                        </td>
                        <td className="px-5 py-3.5">
                          <Link href={`/events/${ev.id}`}>
                            <span className="text-[13px] font-semibold text-slate-700 hover:text-blue-600 cursor-pointer">
                              {ev.name}
                            </span>
                          </Link>
                        </td>
                        <td className="px-5 py-3.5 text-[12px] font-medium text-slate-400 whitespace-nowrap">
                          {ev.eventDate}
                        </td>
                        <td className="px-5 py-3.5 text-right">
                          <span className="text-[14px] font-extrabold text-slate-800" style={{ letterSpacing: "-0.02em" }}>
                            {fmt(ev.participantCount)}
                          </span>
                        </td>
                        <td className="px-5 py-3.5 text-right w-32">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-blue-400" style={{ width: `${share}%` }} />
                            </div>
                            <span className="text-[11px] font-bold text-slate-400 w-7 text-right">{share}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  });
                })() : (
                  <tr>
                    <td colSpan={5} className="px-6 py-10 text-center text-sm text-slate-300">
                      Belum ada data event
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Side panel (4-col): Gender + Province */}
        <div className="lg:col-span-4 space-y-4">
          {/* Komposisi Peserta */}
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 mb-4">Komposisi Peserta</p>
            {genderData.length > 0 ? (
              <>
                <div className="flex h-2.5 w-full overflow-hidden rounded-full gap-0.5 mb-4">
                  {genderData.map((g: { label: string; count: number; color: string }) => (
                    <div
                      key={g.label}
                      className="h-full first:rounded-l-full last:rounded-r-full transition-all"
                      style={{ width: `${(g.count / totalGender) * 100}%`, backgroundColor: g.color }}
                    />
                  ))}
                </div>
                <div className="space-y-2.5">
                  {genderData.map((g: { label: string; count: number; color: string }) => (
                    <div key={g.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: g.color }} />
                        <span className="text-[12px] font-semibold text-slate-600">{g.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[13px] font-extrabold text-slate-800">{fmt(g.count)}</span>
                        <span className="text-[10px] text-slate-400 ml-1.5">{Math.round((g.count / totalGender) * 100)}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-4 text-center text-sm text-slate-300">Belum ada data</div>
            )}
          </div>

          {/* Daerah Teratas */}
          <div className="rounded-2xl bg-white border border-slate-100 px-5 py-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)]">
            <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 mb-4">Daerah Teratas</p>
            <div className="space-y-3">
              {daerahData.slice(0, 5).map((p, i) => (
                <div key={p.label}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-[11px] font-bold text-slate-300 w-5 text-right shrink-0 font-mono">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="text-[12px] font-semibold text-slate-600 truncate max-w-[110px]">{p.label}</span>
                    </div>
                    <span className="text-[12px] font-bold text-slate-700 shrink-0 ml-2">{fmt(p.count)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-400" style={{ width: `${(p.count / maxDaerah) * 100}%` }} />
                  </div>
                </div>
              ))}
              {daerahData.length === 0 && (
                <p className="text-center text-sm text-slate-300 py-2">Belum ada data</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Final row: 5-col / 7-col ─────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">

        {/* Staf Terbanyak Input (5-col) */}
        <div className="lg:col-span-5 rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-50">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-100">
              <MsIcon name="emoji_events" className="text-[18px] text-amber-500" />
            </div>
            <div>
              <p className="text-[14px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
                Staf Terbanyak Input
              </p>
              <p className="text-[11px] text-slate-400 font-medium">Berdasarkan jumlah registrasi yang diinput</p>
            </div>
          </div>

          <div className="px-6 py-4 space-y-3">
            {topStaff && topStaff.length > 0 ? (
              topStaff.slice(0, 8).map((s, i) => {
                const staffInitials = s.staffName
                  ? s.staffName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
                  : "?";
                const rankClasses = [
                  "bg-amber-100 text-amber-600",
                  "bg-slate-100 text-slate-500",
                  "bg-orange-100 text-orange-600",
                ];
                const barColor = i === 0 ? "bg-amber-400" : i === 1 ? "bg-slate-300" : i === 2 ? "bg-orange-300" : "bg-blue-300";
                return (
                  <div key={s.staffName ?? i} className="flex items-center gap-3">
                    <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${rankClasses[i] ?? "bg-slate-50 text-slate-400"}`}>
                      {i < 3 ? staffInitials : <span className="text-[10px] font-bold">{i + 1}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-semibold text-slate-700 truncate">{s.staffName ?? "—"}</span>
                        <span className="text-[13px] font-extrabold text-slate-800 ml-2 shrink-0" style={{ letterSpacing: "-0.02em" }}>
                          {fmt(s.count)}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${(s.count / maxStaff) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-8 text-center text-sm text-slate-300">Belum ada data staf</p>
            )}
          </div>
        </div>

        {/* Sebaran Provinsi (7-col) */}
        <div className="lg:col-span-7 rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-50">
            <p className="text-[14px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
              Sebaran Daerah
            </p>
            <p className="text-[11px] text-slate-400 font-medium">Top 10 kabupaten/kota asal peserta</p>
          </div>

          <div className="flex flex-col md:flex-row">
            {/* Real Leaflet map */}
            <div className="relative flex-1 min-h-[220px] overflow-hidden">
              <DashboardMap data={daerahData} height={260} />

              {/* Floating glass label over map */}
              {daerahData[0] && (
                <div className="absolute bottom-4 left-4 bg-white/85 backdrop-blur-md border border-white/70 rounded-xl px-3 py-2 shadow-md z-[500] pointer-events-none">
                  <p className="text-[10px] font-bold text-slate-400 tracking-wide">Teratas</p>
                  <p className="text-[13px] font-extrabold text-slate-800 leading-tight">{daerahData[0].label}</p>
                  <p className="text-[11px] text-blue-600 font-bold">{fmt(daerahData[0].count)} peserta</p>
                </div>
              )}
            </div>

            {/* Daerah ranked list */}
            <div className="w-full md:w-48 px-4 py-4 space-y-3 border-t md:border-t-0 md:border-l border-slate-100">
              {daerahData.slice(0, 8).map((p, i) => (
                <div key={p.label} className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-300 w-4 text-right shrink-0 font-mono">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-semibold text-slate-600 truncate leading-tight">{p.label}</p>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-slate-100 mt-0.5">
                      <div className="h-full rounded-full bg-blue-400" style={{ width: `${(p.count / maxDaerah) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-[10px] font-bold text-slate-500 shrink-0">{fmt(p.count)}</span>
                </div>
              ))}
              {daerahData.length === 0 && (
                <p className="text-center text-sm text-slate-300 py-4">Belum ada data</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
