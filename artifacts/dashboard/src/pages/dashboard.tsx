import { useMemo, ElementType } from "react";
import { Link } from "wouter";
import Layout from "@/components/layout";
import {
  Users, Calendar, Gift,
  MapPin, ArrowSquareOut,
} from "@/lib/icons";
import { useQuery } from "@tanstack/react-query";
import DashboardMap from "@/components/dashboard-map";

function fmt(n: number) {
  return n.toLocaleString("id-ID");
}

// ─── Stat Card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  Icon,
  circleColor,
  iconColor,
}: {
  label: string;
  value: number;
  Icon: ElementType;
  circleColor: string;
  iconColor: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl bg-white border border-slate-100 px-6 pt-6 pb-5 shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.10)] transition-shadow">
      <div
        className={`absolute -top-6 -right-6 h-24 w-24 rounded-full opacity-10 group-hover:opacity-20 group-hover:scale-110 transition-all duration-500 ${circleColor}`}
      />
      <div className="flex items-start justify-between mb-3 relative">
        <p className="text-[10px] font-bold tracking-[0.1em] text-slate-400">{label}</p>
        <Icon size={20} weight="bold" className={iconColor} />
      </div>
      <p
        className="text-[38px] font-extrabold text-slate-900 leading-none relative"
        style={{ letterSpacing: "-0.04em" }}
      >
        {fmt(value)}
      </p>
    </div>
  );
}

// ─── Gender Donut ─────────────────────────────────────────────────────────────

function GenderCard({ data }: { data: { label: string; count: number; color: string }[] }) {
  const total = data.reduce((s, g) => s + g.count, 0);
  const r = 40;
  const cx = 56;
  const cy = 56;
  const circumference = 2 * Math.PI * r;

  let offset = 0;
  const slices = data.map((g) => {
    const pct = total > 0 ? g.count / total : 0;
    const dash = pct * circumference;
    const gap = circumference - dash;
    const slice = { ...g, dash, gap, offset };
    offset += dash;
    return slice;
  });

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] px-6 py-5">
      <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400 mb-4">JENIS KELAMIN</p>
      {total === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-slate-300">Belum ada data</div>
      ) : (
        <div className="flex items-center gap-6">
          {/* Donut SVG */}
          <svg width={112} height={112} viewBox="0 0 112 112" className="shrink-0">
            {slices.map((s, i) => (
              <circle
                key={i}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={20}
                strokeDasharray={`${s.dash} ${s.gap}`}
                strokeDashoffset={-s.offset}
                style={{ transform: "rotate(-90deg)", transformOrigin: "50% 50%" }}
              />
            ))}
            <text x={cx} y={cy - 6} textAnchor="middle" fontSize="13" fontWeight="800" fill="#0f172a" fontFamily="Plus Jakarta Sans">
              {fmt(total)}
            </text>
            <text x={cx} y={cy + 10} textAnchor="middle" fontSize="9" fill="#94a3b8" fontFamily="Plus Jakarta Sans">
              Total
            </text>
          </svg>
          {/* Legend */}
          <div className="space-y-3 flex-1">
            {slices.map((s) => (
              <div key={s.label}>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-[13px] font-semibold text-slate-600">{s.label}</span>
                  </div>
                  <span className="text-[13px] font-extrabold text-slate-800">{fmt(s.count)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${total > 0 ? (s.count / total) * 100 : 0}%`, background: s.color }}
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5 text-right">
                  {total > 0 ? ((s.count / total) * 100).toFixed(1) : 0}%
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Age Bar Card ─────────────────────────────────────────────────────────────

function AgeCard({ data }: { data: { ageGroup: string; count: number }[] }) {
  const max = data[0]?.count ?? 1;
  const total = data.reduce((s, d) => s + d.count, 0);

  const AGE_COLORS: Record<string, string> = {
    "< 18": "#a78bfa",
    "18-25": "#60a5fa",
    "26-35": "#34d399",
    "36-45": "#fbbf24",
    "46-55": "#f87171",
    "55+": "#fb923c",
  };

  return (
    <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] px-6 py-5">
      <div className="flex items-start justify-between mb-4">
        <p className="text-[11px] font-bold tracking-[0.1em] text-slate-400">KELOMPOK USIA</p>
        {total > 0 && (
          <span className="text-[10px] font-bold text-slate-300">{fmt(total)} data</span>
        )}
      </div>
      {data.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-slate-300">Belum ada data</div>
      ) : (
        <div className="space-y-3">
          {data.map((d) => (
            <div key={d.ageGroup} className="flex items-center gap-3">
              <span
                className="w-12 shrink-0 text-[11px] font-bold text-right"
                style={{ color: AGE_COLORS[d.ageGroup] ?? "#94a3b8" }}
              >
                {d.ageGroup}
              </span>
              <div className="flex-1 h-3 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${(d.count / max) * 100}%`,
                    background: AGE_COLORS[d.ageGroup] ?? "#94a3b8",
                  }}
                />
              </div>
              <span className="text-[12px] font-extrabold text-slate-700 w-12 text-right shrink-0">
                {fmt(d.count)}
              </span>
              <span className="text-[10px] text-slate-400 w-10 text-right shrink-0">
                {total > 0 ? ((d.count / total) * 100).toFixed(0) : 0}%
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => fetch("/api/dashboard/stats").then((r) => r.json()),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: segments } = useQuery({
    queryKey: ["dashboard-segments"],
    queryFn: () => fetch("/api/dashboard/segments").then((r) => r.json()),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: recent } = useQuery<{
    recentEvents: { id: number; name: string; category: string | null; location: string | null; eventDate: string | null; status: string | null; participantCount: number }[];
    recentPrograms: { id: number; name: string; komisi: string | null; mitra: string | null; tahun: string | null; totalKtpPenerima: number | null; registeredCount: number; status: string }[];
  }>({
    queryKey: ["dashboard-recent"],
    queryFn: () => fetch("/api/dashboard/recent").then((r) => r.json()),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: kabupatenData } = useQuery<{ kabupaten: string; totalInput: number }[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () => fetch("/api/pemetaan/kabupaten").then((r) => r.json()),
    staleTime: 30_000,
  });

  // ── Derived data ────────────────────────────────────────────────────────────

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

  const ageGroups: { ageGroup: string; count: number }[] = segments?.ageGroups ?? [];

  const daerahData = useMemo(
    () =>
      (kabupatenData ?? [])
        .slice()
        .sort((a, b) => b.totalInput - a.totalInput)
        .map((d) => ({ label: d.kabupaten, count: d.totalInput })),
    [kabupatenData]
  );
  const maxDaerah = daerahData[0]?.count ?? 1;

  return (
    <Layout>
      {/* ── Row 1: 3 Stat Cards ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
        <StatCard
          label="TOTAL KTP"
          value={stats?.totalParticipants ?? 0}
          Icon={Users}
          circleColor="bg-blue-500"
          iconColor="text-blue-400"
        />
        <StatCard
          label="TOTAL KEGIATAN"
          value={stats?.totalEvents ?? 0}
          Icon={Calendar}
          circleColor="bg-violet-500"
          iconColor="text-violet-400"
        />
        <StatCard
          label="TOTAL PROGRAM"
          value={stats?.totalPrograms ?? 0}
          Icon={Gift}
          circleColor="bg-emerald-500"
          iconColor="text-emerald-400"
        />
      </div>

      {/* ── Row 2: Jenis Kelamin + Usia ──────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
        <GenderCard data={genderData} />
        <AgeCard data={ageGroups} />
      </div>

      {/* ── Row 3: Kegiatan Terbaru + Program Terbaru ────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">

        {/* Kegiatan Terbaru */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <p className="text-[13px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
              Kegiatan Terbaru
            </p>
            <Link href="/events">
              <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer">
                Semua <ArrowSquareOut size={12} weight="bold" />
              </span>
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {(recent?.recentEvents ?? []).length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-slate-300">Belum ada kegiatan</div>
            ) : (recent?.recentEvents ?? []).map((ev) => (
              <div key={ev.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <Calendar size={15} weight="bold" className="text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">{ev.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    {ev.location && (
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                        <MapPin size={10} weight="bold" />{ev.location}
                      </span>
                    )}
                    {ev.category && (
                      <span className="text-[10px] bg-blue-50 text-blue-500 font-semibold px-1.5 py-0.5 rounded-full">{ev.category}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[13px] font-extrabold text-slate-700">{fmt(ev.participantCount)}</p>
                  <p className="text-[9px] text-slate-400">peserta</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Program Terbaru */}
        <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-50">
            <p className="text-[13px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
              Program Terbaru
            </p>
            <Link href="/programs">
              <span className="flex items-center gap-1 text-[11px] font-bold text-blue-600 hover:text-blue-700 cursor-pointer">
                Semua <ArrowSquareOut size={12} weight="bold" />
              </span>
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {(recent?.recentPrograms ?? []).length === 0 ? (
              <div className="flex items-center justify-center py-10 text-sm text-slate-300">Belum ada program</div>
            ) : (recent?.recentPrograms ?? []).map((prog) => (
              <div key={prog.id} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50/60 transition-colors">
                <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                  <Gift size={15} weight="bold" className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-slate-800 truncate leading-tight">{prog.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {prog.komisi && (
                      <span className="text-[10px] bg-emerald-50 text-emerald-600 font-semibold px-1.5 py-0.5 rounded-full">{prog.komisi}</span>
                    )}
                    {prog.tahun && (
                      <span className="text-[10px] bg-slate-100 text-slate-500 font-semibold px-1.5 py-0.5 rounded-full">{prog.tahun}</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {prog.totalKtpPenerima != null && prog.totalKtpPenerima > 0 ? (
                    <>
                      <p className="text-[13px] font-extrabold text-slate-700">{fmt(prog.registeredCount)}<span className="text-slate-300 font-normal">/{fmt(prog.totalKtpPenerima)}</span></p>
                      <p className="text-[9px] text-slate-400">penerima</p>
                    </>
                  ) : (
                    <>
                      <p className="text-[13px] font-extrabold text-slate-700">{fmt(prog.registeredCount)}</p>
                      <p className="text-[9px] text-slate-400">penerima</p>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Row 4: Sebaran Daerah (full width) ───────────────────────── */}
      <div className="rounded-2xl bg-white border border-slate-100 shadow-[0_2px_12px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-50">
          <p className="text-[13px] font-extrabold text-slate-900" style={{ letterSpacing: "-0.02em" }}>
            Sebaran Daerah
          </p>
          <p className="text-[11px] text-slate-400 font-medium">Top 10 kabupaten/kota asal peserta</p>
        </div>

        <div className="flex flex-col md:flex-row">
          {/* Leaflet map */}
          <div className="relative flex-1 min-h-[280px] overflow-hidden">
            <DashboardMap data={daerahData} height={300} />
            {daerahData[0] && (
              <div className="absolute bottom-4 left-4 bg-white/85 backdrop-blur-md border border-white/70 rounded-xl px-3 py-2 shadow-md z-[500] pointer-events-none">
                <p className="text-[10px] font-bold text-slate-400 tracking-wide">Teratas</p>
                <p className="text-[13px] font-extrabold text-slate-800 leading-tight">{daerahData[0].label}</p>
                <p className="text-[11px] text-blue-600 font-bold">{fmt(daerahData[0].count)} peserta</p>
              </div>
            )}
          </div>

          {/* Ranked list */}
          <div className="w-full md:w-64 px-5 py-4 space-y-3 border-t md:border-t-0 md:border-l border-slate-100">
            {daerahData.slice(0, 10).map((p, i) => (
              <div key={p.label} className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-300 w-4 text-right shrink-0 font-mono">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[12px] font-semibold text-slate-600 truncate leading-tight">{p.label}</p>
                    <span className="text-[11px] font-bold text-slate-500 shrink-0 ml-2">{fmt(p.count)}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full bg-blue-400" style={{ width: `${(p.count / maxDaerah) * 100}%` }} />
                  </div>
                </div>
              </div>
            ))}
            {daerahData.length === 0 && (
              <p className="text-center text-sm text-slate-300 py-4">Belum ada data</p>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
