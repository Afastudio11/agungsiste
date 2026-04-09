import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Globe, Building2, Home, ChevronRight, ArrowLeft, Users, CalendarDays, TrendingUp } from "lucide-react";
import Layout from "@/components/layout";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Summary {
  totalDesa: number;
  totalKecamatan: number;
  totalKabupaten: number;
  desaWithEvents: number;
}

interface KabupatenRow {
  kabupaten: string;
  totalInput: number;
  totalDesa: number;
  totalKecamatan: number;
  totalEvent: number;
}

interface DesaRow {
  kelurahan: string;
  kecamatan: string;
  kabupaten: string;
  totalInput: number;
  totalEvent: number;
}

interface DesaDetail {
  kelurahan: string;
  kecamatan: string;
  kabupaten: string;
  totalInput: number;
  totalEvent: number;
  events: { eventId: number; eventName: string; eventDate: string; location: string; peserta: number }[];
}

type View =
  | { type: "kabupaten" }
  | { type: "desa"; kabupaten: string }
  | { type: "detail"; kelurahan: string; kabupaten: string };

function Breadcrumb({ view, onNav }: { view: View; onNav: (v: View) => void }) {
  const crumbs: { label: string; target: View | null }[] = [
    { label: "Pemetaan Wilayah", target: view.type !== "kabupaten" ? { type: "kabupaten" } : null },
  ];
  if (view.type === "desa" || view.type === "detail") {
    crumbs.push({
      label: view.type === "detail" ? view.kabupaten : view.kabupaten,
      target: view.type === "detail" ? { type: "desa", kabupaten: view.kabupaten } : null,
    });
  }
  if (view.type === "detail") {
    crumbs.push({ label: view.kelurahan, target: null });
  }
  return (
    <div className="flex items-center gap-1.5 text-sm flex-wrap">
      {crumbs.map((c, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
          {c.target ? (
            <button
              onClick={() => onNav(c.target!)}
              className="text-blue-600 hover:text-blue-800 hover:underline font-medium transition"
            >
              {c.label}
            </button>
          ) : (
            <span className="text-slate-900 font-semibold">{c.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ─── VIEW 1: Kabupaten list ───────────────────────────────────────────── */
function KabupatenView({
  summary,
  kabData,
  onSelect,
}: {
  summary?: Summary;
  kabData: KabupatenRow[];
  onSelect: (kab: string) => void;
}) {
  const coverage = summary
    ? Math.round((summary.desaWithEvents / Math.max(summary.totalDesa, 1)) * 100)
    : 0;

  const max = Math.max(...kabData.map((k) => Number(k.totalInput)), 1);

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Desa", value: summary?.totalDesa ?? 0, icon: Home, color: "blue" },
          { label: "Desa Ada Event", value: summary?.desaWithEvents ?? 0, icon: MapPin, color: "green" },
          { label: "Kabupaten", value: summary?.totalKabupaten ?? 0, icon: Building2, color: "purple" },
          { label: "Coverage", value: `${coverage}%`, icon: Globe, color: "amber" },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-100 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Icon className="h-3.5 w-3.5 text-slate-400" />
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</div>
            </div>
            <div className="text-2xl font-extrabold text-slate-900" style={{ letterSpacing: "-0.04em" }}>
              {typeof value === "number" ? value.toLocaleString() : value}
            </div>
          </div>
        ))}
      </div>

      {/* Kabupaten table */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Building2 className="h-4 w-4 text-slate-500" />
          <span className="font-bold text-slate-900">Sebaran per Kabupaten</span>
          <span className="ml-auto text-xs text-slate-400">Klik untuk lihat desa</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-wider">
                <th className="px-5 py-3 text-left">Kabupaten / Kota</th>
                <th className="px-5 py-3 text-right">Total Input</th>
                <th className="px-5 py-3 text-right hidden md:table-cell">Desa</th>
                <th className="px-5 py-3 text-right hidden md:table-cell">Kecamatan</th>
                <th className="px-5 py-3 text-right hidden md:table-cell">Event</th>
                <th className="px-5 py-3 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {kabData.map((k) => (
                <tr
                  key={k.kabupaten}
                  className="hover:bg-blue-50/60 cursor-pointer transition group"
                  onClick={() => onSelect(k.kabupaten)}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1">
                        <div className="font-semibold text-sm text-slate-900 group-hover:text-blue-700 transition">
                          {k.kabupaten}
                        </div>
                        {/* Progress bar */}
                        <div className="mt-1 h-1 w-32 rounded-full bg-slate-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-400 transition-all"
                            style={{ width: `${Math.round((Number(k.totalInput) / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-sm font-bold text-slate-900 text-right">
                    {Number(k.totalInput).toLocaleString()}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-500 text-right hidden md:table-cell">
                    {k.totalDesa}
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-500 text-right hidden md:table-cell">
                    {k.totalKecamatan}
                  </td>
                  <td className="px-5 py-3 text-right hidden md:table-cell">
                    <span className="inline-block text-xs font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">
                      {k.totalEvent}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ─── VIEW 2: Desa list per kabupaten ─────────────────────────────────── */
function DesaView({
  kabupaten,
  onSelect,
}: {
  kabupaten: string;
  onSelect: (kelurahan: string) => void;
}) {
  const { data: desaData = [], isLoading } = useQuery<DesaRow[]>({
    queryKey: ["pemetaan-desa", kabupaten],
    queryFn: () =>
      fetch(
        `${BASE}/api/pemetaan/desa?kabupaten=${encodeURIComponent(kabupaten)}`,
        { credentials: "include" }
      ).then((r) => r.json()),
  });

  const { data: kabData } = useQuery<KabupatenRow[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/kabupaten`, { credentials: "include" }).then((r) => r.json()),
  });

  const kabInfo = kabData?.find((k) => k.kabupaten === kabupaten);
  const maxInput = Math.max(...desaData.map((d) => Number(d.totalInput)), 1);

  return (
    <div className="space-y-5">
      {/* Kabupaten header card */}
      <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-2xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center text-2xl shrink-0">
            🏙️
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold opacity-60 tracking-widest mb-1 uppercase">Kabupaten / Kota</div>
            <div className="text-xl font-extrabold leading-tight">{kabupaten}</div>
          </div>
        </div>
        {kabInfo && (
          <div className="grid grid-cols-3 gap-3 mt-4">
            {[
              { label: "Total Input", value: Number(kabInfo.totalInput).toLocaleString(), icon: TrendingUp },
              { label: "Desa", value: kabInfo.totalDesa, icon: Home },
              { label: "Event", value: kabInfo.totalEvent, icon: CalendarDays },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3">
                <div className="flex items-center gap-1.5 mb-1 opacity-70">
                  <Icon className="h-3 w-3" />
                  <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
                </div>
                <div className="text-lg font-extrabold">{value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Desa list */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Home className="h-4 w-4 text-slate-500" />
          <span className="font-bold text-slate-900">Daftar Desa / Kelurahan</span>
          <span className="ml-auto text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-lg">
            {desaData.length} desa
          </span>
        </div>

        {isLoading ? (
          <div className="p-10 text-center text-slate-400 text-sm">Memuat data desa...</div>
        ) : desaData.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">Tidak ada data desa</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {desaData.map((d, idx) => (
              <button
                key={`${d.kelurahan}-${d.kecamatan}-${idx}`}
                onClick={() => onSelect(d.kelurahan)}
                className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-blue-50/60 transition text-left group"
              >
                <div className="h-8 w-8 rounded-lg bg-slate-100 group-hover:bg-blue-100 flex items-center justify-center shrink-0 transition">
                  <Home className="h-3.5 w-3.5 text-slate-400 group-hover:text-blue-500 transition" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-900 group-hover:text-blue-700 transition truncate">
                    {d.kelurahan}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">Kec. {d.kecamatan}</div>
                  {/* Bar */}
                  <div className="mt-1.5 h-1 rounded-full bg-slate-100 overflow-hidden w-full max-w-[160px]">
                    <div
                      className="h-full rounded-full bg-blue-400 transition-all"
                      style={{ width: `${Math.round((Number(d.totalInput) / maxInput) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-sm text-slate-800">
                    {Number(d.totalInput).toLocaleString()}
                  </div>
                  <div className="text-xs text-slate-400">input</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-bold bg-blue-50 text-blue-600 px-2 py-0.5 rounded-lg">
                    {d.totalEvent} event
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-blue-500 transition" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── VIEW 3: Desa detail ─────────────────────────────────────────────── */
function DesaDetailView({ kelurahan }: { kelurahan: string }) {
  const { data, isLoading } = useQuery<DesaDetail>({
    queryKey: ["pemetaan-desa-detail", kelurahan],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/desa/${encodeURIComponent(kelurahan)}`, { credentials: "include" }).then(
        (r) => r.json()
      ),
  });

  if (isLoading) {
    return <div className="py-16 text-center text-slate-400 text-sm">Memuat data desa...</div>;
  }
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Desa header */}
      <div className="bg-gradient-to-br from-green-700 to-green-900 rounded-2xl p-5 text-white">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-xl bg-white/15 flex items-center justify-center text-2xl shrink-0">
            🏘️
          </div>
          <div>
            <div className="text-xs font-bold opacity-60 tracking-widest mb-1 uppercase">
              Desa / Kelurahan
            </div>
            <div className="text-xl font-extrabold leading-tight">{data.kelurahan}</div>
            <div className="text-sm opacity-70 mt-0.5">
              Kec. {data.kecamatan} · {data.kabupaten}
            </div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1 opacity-70">
              <Users className="h-3 w-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Total Input</span>
            </div>
            <div className="text-xl font-extrabold">{Number(data.totalInput).toLocaleString()}</div>
          </div>
          <div className="bg-white/10 rounded-xl p-3">
            <div className="flex items-center gap-1.5 mb-1 opacity-70">
              <CalendarDays className="h-3 w-3" />
              <span className="text-[10px] font-bold uppercase tracking-wider">Total Event</span>
            </div>
            <div className="text-xl font-extrabold">{Number(data.totalEvent)}</div>
          </div>
        </div>
      </div>

      {/* Event list */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-500" />
          <span className="font-bold text-slate-900">Daftar Event di {data.kelurahan}</span>
          <span className="ml-auto text-xs text-blue-600 font-semibold bg-blue-50 px-2 py-0.5 rounded-lg">
            {data.events.length} event
          </span>
        </div>
        {data.events.length === 0 ? (
          <div className="p-10 text-center text-slate-400 text-sm">Tidak ada event</div>
        ) : (
          <div className="divide-y divide-slate-50">
            {data.events.map((ev) => (
              <div key={ev.eventId} className="flex items-center gap-4 px-5 py-4">
                <div className="h-9 w-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                  <CalendarDays className="h-4 w-4 text-blue-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-slate-900">{ev.eventName}</div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                    <span>{ev.eventDate}</span>
                    {ev.location && (
                      <>
                        <span>·</span>
                        <MapPin className="h-3 w-3" />
                        <span>{ev.location}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-bold text-sm text-slate-800">{Number(ev.peserta).toLocaleString()}</div>
                  <div className="text-xs text-slate-400">peserta</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────── */
export default function PemetaanPage() {
  const [view, setView] = useState<View>({ type: "kabupaten" });

  const { data: summary } = useQuery<Summary>({
    queryKey: ["pemetaan-summary"],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/summary`, { credentials: "include" }).then((r) => r.json()),
  });

  const { data: kabData = [] } = useQuery<KabupatenRow[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/kabupaten`, { credentials: "include" }).then((r) => r.json()),
  });

  return (
    <Layout>
      <div className="p-4 md:p-6 space-y-5 max-w-5xl">
        {/* Header */}
        <div className="flex items-start gap-4">
          {view.type !== "kabupaten" && (
            <button
              onClick={() =>
                setView(
                  view.type === "detail"
                    ? { type: "desa", kabupaten: view.kabupaten }
                    : { type: "kabupaten" }
                )
              }
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 border border-slate-200 hover:border-slate-300 px-3 py-2 rounded-xl transition mt-0.5 shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              Kembali
            </button>
          )}
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Pemetaan Wilayah</h1>
            <div className="mt-1">
              <Breadcrumb view={view} onNav={setView} />
            </div>
          </div>
        </div>

        {/* View switcher */}
        {view.type === "kabupaten" && (
          <KabupatenView
            summary={summary}
            kabData={kabData}
            onSelect={(kab) => setView({ type: "desa", kabupaten: kab })}
          />
        )}
        {view.type === "desa" && (
          <DesaView
            kabupaten={view.kabupaten}
            onSelect={(kel) =>
              setView({ type: "detail", kelurahan: kel, kabupaten: view.kabupaten })
            }
          />
        )}
        {view.type === "detail" && <DesaDetailView kelurahan={view.kelurahan} />}
      </div>
    </Layout>
  );
}
