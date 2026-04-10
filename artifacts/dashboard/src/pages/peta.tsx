import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import osmtogeojson from "osmtogeojson";
import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import { ChevronLeft, MapPin, Users, Map } from "lucide-react";
import { useLocation } from "wouter";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const KABUPATEN_LIST = ["Pacitan", "Trenggalek", "Magetan", "Ponorogo", "Ngawi"];
const MAP_CENTER: [number, number] = [-7.87, 111.45];
const CACHE_KEY_PREFIX = "ktp_geo_v2_";

interface KabupatenRow {
  kabupaten: string;
  totalInput: number;
  totalDesa: number;
  totalKecamatan: number;
  totalEvent: number;
}

function getColor(count: number, max: number): string {
  if (!count || max === 0) return "#e2e8f0";
  const r = count / max;
  if (r < 0.15) return "#dbeafe";
  if (r < 0.35) return "#93c5fd";
  if (r < 0.55) return "#60a5fa";
  if (r < 0.75) return "#3b82f6";
  return "#1d4ed8";
}

async function fetchOverpassGeo(query: string): Promise<any> {
  const key = CACHE_KEY_PREFIX + btoa(query).slice(0, 40);
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch {}

  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error("Overpass API error: " + res.status);
  const osm = await res.json();
  const geo = osmtogeojson(osm);
  try { sessionStorage.setItem(key, JSON.stringify(geo)); } catch {}
  return geo;
}

export default function PetaPage() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<"kabupaten" | "kecamatan">("kabupaten");
  const [selectedKab, setSelectedKab] = useState<string | null>(null);
  const [kabGeo, setKabGeo] = useState<any>(null);
  const [kecGeo, setKecGeo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingKec, setLoadingKec] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: kabData = [] } = useQuery<KabupatenRow[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/kabupaten`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => Array.isArray(d) ? d : []),
  });

  const countByKab = Object.fromEntries(kabData.map((k) => [k.kabupaten, k.totalInput]));
  const maxCount = Math.max(...kabData.map((k) => k.totalInput), 1);

  useEffect(() => {
    const query = `[out:json][timeout:60];(${KABUPATEN_LIST.map(
      (k) => `relation["name"="${k}"]["boundary"="administrative"]["admin_level"="5"];`
    ).join("")});out geom;`;
    setLoading(true);
    fetchOverpassGeo(query)
      .then((geo) => { setKabGeo(geo); setLoading(false); })
      .catch(() => { setError("Gagal memuat data peta. Coba refresh halaman."); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selectedKab) return;
    const query = `[out:json][timeout:60];area["name"="${selectedKab}"]["admin_level"="5"]->.a;relation["boundary"="administrative"]["admin_level"="6"](area.a);out geom;`;
    setLoadingKec(true);
    fetchOverpassGeo(query)
      .then((geo) => { setKecGeo(geo); setLoadingKec(false); })
      .catch(() => setLoadingKec(false));
  }, [selectedKab]);

  function onEachKab(feature: any, layer: L.Layer) {
    const name = feature.properties?.name || "";
    const count = countByKab[name] || 0;
    const path = layer as L.Path;
    path.setStyle({
      fillColor: getColor(count, maxCount),
      weight: 2, opacity: 1, color: "white", fillOpacity: 0.78,
    });
    layer.bindTooltip(
      `<div style="font-family:sans-serif;font-size:13px"><b>${name}</b><br/><span style="color:#64748b">${count.toLocaleString()} peserta</span></div>`,
      { sticky: true, className: "leaflet-tooltip-ktp" }
    );
    layer.on({
      click: () => { setSelectedKab(name); setView("kecamatan"); },
      mouseover: (e) => (e.target as L.Path).setStyle({ weight: 3, fillOpacity: 0.92 }),
      mouseout: (e) => (e.target as L.Path).setStyle({ weight: 2, fillOpacity: 0.78 }),
    });
  }

  function onEachKec(feature: any, layer: L.Layer) {
    const name = feature.properties?.name || "";
    (layer as L.Path).setStyle({
      fillColor: "#3b82f6", weight: 1.5, opacity: 1, color: "white", fillOpacity: 0.55,
    });
    layer.bindTooltip(`<b>${name}</b>`, { sticky: true });
    layer.on({
      click: () => navigate(`/pemetaan?kab=${encodeURIComponent(selectedKab!)}`),
      mouseover: (e) => (e.target as L.Path).setStyle({ fillOpacity: 0.8, weight: 2.5 }),
      mouseout: (e) => (e.target as L.Path).setStyle({ fillOpacity: 0.55, weight: 1.5 }),
    });
  }

  function goBack() { setView("kabupaten"); setSelectedKab(null); setKecGeo(null); }

  const selectedInfo = kabData.find((k) => k.kabupaten === selectedKab);

  return (
    <Layout>
      <div className="flex flex-col h-full p-4 md:p-6 gap-4">
        {/* Header */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {view === "kecamatan" && (
            <button onClick={goBack} className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition shrink-0">
              <ChevronLeft className="h-5 w-5 text-slate-600" />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
              {view === "kecamatan" ? `Kab. ${selectedKab}` : "Peta Wilayah"}
            </h1>
            <p className="text-sm text-slate-500">
              {view === "kecamatan"
                ? `${selectedInfo?.totalKecamatan ?? "..."} kecamatan · ${selectedInfo?.totalInput.toLocaleString() ?? "..."} peserta`
                : "5 Kabupaten Jawa Timur — klik kabupaten untuk detail"}
            </p>
          </div>
        </div>

        {/* Map Container */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-100 overflow-hidden relative" style={{ minHeight: 400 }}>
          {loading ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-50">
              <div className="h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
              <div className="text-sm font-semibold text-slate-600">Memuat batas wilayah...</div>
              <div className="text-xs text-slate-400 mt-1">Mengambil data dari OpenStreetMap</div>
            </div>
          ) : error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50">
              <Map className="h-10 w-10 text-red-300 mb-3" />
              <div className="text-sm font-semibold text-red-600">{error}</div>
            </div>
          ) : (
            <MapContainer
              center={MAP_CENTER}
              zoom={view === "kecamatan" ? 10 : 9}
              style={{ height: "100%", width: "100%" }}
              zoomControl={false}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <ZoomControl position="bottomright" />
              {view === "kabupaten" && kabGeo && (
                <GeoJSON key="kab" data={kabGeo} onEachFeature={onEachKab} />
              )}
              {view === "kecamatan" && (
                <>
                  {kabGeo && (
                    <GeoJSON
                      key="kab-bg"
                      data={{ ...kabGeo, features: kabGeo.features?.filter((f: any) => f.properties?.name !== selectedKab) }}
                      style={() => ({ fillColor: "#e2e8f0", weight: 1, color: "white", fillOpacity: 0.4 })}
                    />
                  )}
                  {loadingKec ? null : kecGeo && (
                    <GeoJSON key={`kec-${selectedKab}`} data={kecGeo} onEachFeature={onEachKec} />
                  )}
                </>
              )}
            </MapContainer>
          )}

          {/* Loading kecamatan overlay */}
          {view === "kecamatan" && loadingKec && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-[1000]">
              <div className="bg-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-3">
                <div className="h-5 w-5 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm font-semibold text-slate-700">Memuat kecamatan...</span>
              </div>
            </div>
          )}
        </div>

        {/* Legend + Stats */}
        {view === "kabupaten" && !loading && !error && (
          <div className="flex-shrink-0 space-y-3">
            {/* Legend */}
            <div className="bg-white rounded-2xl border border-slate-100 px-4 py-3 flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wider shrink-0">Kepadatan</span>
              {[
                { bg: "#e2e8f0", label: "0" },
                { bg: "#dbeafe", label: "Sedikit" },
                { bg: "#93c5fd", label: "" },
                { bg: "#60a5fa", label: "" },
                { bg: "#3b82f6", label: "Sedang" },
                { bg: "#1d4ed8", label: "Banyak" },
              ].map(({ bg, label }, i) => (
                <div key={i} className="flex items-center gap-1">
                  <div className="h-4 w-6 rounded" style={{ background: bg }} />
                  {label && <span className="text-xs text-slate-500">{label}</span>}
                </div>
              ))}
            </div>

            {/* Kabupaten cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {kabData.filter((k) => KABUPATEN_LIST.includes(k.kabupaten)).map((k) => (
                <button
                  key={k.kabupaten}
                  onClick={() => { setSelectedKab(k.kabupaten); setView("kecamatan"); }}
                  className="bg-white rounded-xl border border-slate-100 p-3 text-left hover:border-blue-300 hover:shadow-sm transition group"
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: getColor(k.totalInput, maxCount) }} />
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider truncate">{k.kabupaten}</span>
                  </div>
                  <div className="text-xl font-extrabold text-slate-900">{k.totalInput.toLocaleString()}</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">{k.totalDesa} desa · {k.totalKecamatan} kec</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
