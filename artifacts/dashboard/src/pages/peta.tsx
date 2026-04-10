import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import osmtogeojson from "osmtogeojson";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Map } from "lucide-react";
import { useLocation } from "wouter";
import { jatimKabupatenGeo } from "@/data/jatim-geo";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");
const CACHE_KEY_PREFIX = "ktp_geo_v3_";
const MAP_CENTER: [number, number] = [-7.87, 111.45];

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

async function fetchKecamatanGeo(kabupaten: string): Promise<any> {
  const key = CACHE_KEY_PREFIX + kabupaten;
  try {
    const cached = sessionStorage.getItem(key);
    if (cached) return JSON.parse(cached);
  } catch {}
  const query = `[out:json][timeout:60];area["name"="${kabupaten}"]["admin_level"="5"]->.a;relation["boundary"="administrative"]["admin_level"="6"](area.a);out geom;`;
  const res = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error("Overpass error: " + res.status);
  const osm = await res.json();
  const geo = osmtogeojson(osm);
  try { sessionStorage.setItem(key, JSON.stringify(geo)); } catch {}
  return geo;
}

export default function PetaMapContent() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<"kabupaten" | "kecamatan">("kabupaten");
  const [selectedKab, setSelectedKab] = useState<string | null>(null);
  const [kecGeo, setKecGeo] = useState<any>(null);
  const [loadingKec, setLoadingKec] = useState(false);
  const [kecError, setKecError] = useState(false);

  const { data: kabData = [] } = useQuery<KabupatenRow[]>({
    queryKey: ["pemetaan-kabupaten"],
    queryFn: () =>
      fetch(`${BASE}/api/pemetaan/kabupaten`, { credentials: "include" })
        .then((r) => r.json())
        .then((d) => (Array.isArray(d) ? d : [])),
  });

  const countByKab = Object.fromEntries(kabData.map((k) => [k.kabupaten, k.totalInput]));
  const maxCount = Math.max(...kabData.map((k) => k.totalInput), 1);

  useEffect(() => {
    if (!selectedKab) return;
    setKecError(false);
    setLoadingKec(true);
    fetchKecamatanGeo(selectedKab)
      .then((geo) => { setKecGeo(geo); setLoadingKec(false); })
      .catch(() => { setLoadingKec(false); setKecError(true); });
  }, [selectedKab]);

  function onEachKab(feature: any, layer: L.Layer) {
    const name = feature.properties?.name || "";
    const count = countByKab[name] || 0;
    const path = layer as L.Path;
    path.setStyle({
      fillColor: getColor(count, maxCount),
      weight: 2, opacity: 1, color: "white", fillOpacity: 0.82,
    });
    layer.bindTooltip(
      `<div style="font-family:sans-serif;font-size:13px"><b>${name}</b><br/><span style="color:#64748b">${count.toLocaleString()} peserta</span></div>`,
      { sticky: true }
    );
    layer.on({
      click: () => { setSelectedKab(name); setView("kecamatan"); },
      mouseover: (e) => (e.target as L.Path).setStyle({ weight: 3, fillOpacity: 0.94 }),
      mouseout: (e) => (e.target as L.Path).setStyle({ weight: 2, fillOpacity: 0.82 }),
    });
  }

  function onEachKec(feature: any, layer: L.Layer) {
    const name = feature.properties?.name || "";
    (layer as L.Path).setStyle({
      fillColor: "#3b82f6", weight: 1.5, opacity: 1, color: "white", fillOpacity: 0.55,
    });
    layer.bindTooltip(`<b>${name}</b>`, { sticky: true });
    layer.on({
      click: () => navigate(`/pemetaan`),
      mouseover: (e) => (e.target as L.Path).setStyle({ fillOpacity: 0.8, weight: 2.5 }),
      mouseout: (e) => (e.target as L.Path).setStyle({ fillOpacity: 0.55, weight: 1.5 }),
    });
  }

  function goBack() { setView("kabupaten"); setSelectedKab(null); setKecGeo(null); setKecError(false); }

  const selectedInfo = kabData.find((k) => k.kabupaten === selectedKab);

  return (
    <div className="flex flex-col gap-4">
      {/* Sub-header */}
      <div className="flex items-center gap-3">
        {view === "kecamatan" && (
          <button onClick={goBack} className="h-9 w-9 rounded-xl bg-slate-100 flex items-center justify-center hover:bg-slate-200 transition shrink-0">
            <ChevronLeft className="h-5 w-5 text-slate-600" />
          </button>
        )}
        <p className="text-sm font-semibold text-slate-700">
          {view === "kecamatan"
            ? `Kab. ${selectedKab} — ${selectedInfo?.totalKecamatan ?? "..."} kecamatan · ${selectedInfo?.totalInput.toLocaleString() ?? "..."} peserta`
            : "5 Kabupaten Jawa Timur — klik kabupaten untuk detail kecamatan"}
        </p>
      </div>

      {/* Map */}
      <div className="bg-white rounded-2xl border border-slate-100 overflow-hidden relative" style={{ height: 420 }}>
        <MapContainer
          center={MAP_CENTER}
          zoom={view === "kecamatan" ? 10 : 9}
          style={{ height: "100%", width: "100%" }}
          zoomControl={false}
          key={view}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomControl position="bottomright" />

          {/* kabupaten layer — always rendered from static data */}
          <GeoJSON
            key={`kab-${view}-${JSON.stringify(countByKab)}`}
            data={jatimKabupatenGeo as any}
            onEachFeature={onEachKab}
            style={(feature) => ({
              fillColor: getColor(countByKab[feature?.properties?.name] || 0, maxCount),
              weight: view === "kecamatan" && feature?.properties?.name !== selectedKab ? 1 : 2,
              color: "white",
              fillOpacity: view === "kecamatan" && feature?.properties?.name !== selectedKab ? 0.25 : 0.82,
            })}
          />

          {/* kecamatan layer — loaded from Overpass on demand */}
          {view === "kecamatan" && !loadingKec && kecGeo && (
            <GeoJSON key={`kec-${selectedKab}`} data={kecGeo} onEachFeature={onEachKec} />
          )}
        </MapContainer>

        {/* Loading kecamatan overlay */}
        {view === "kecamatan" && loadingKec && (
          <div className="absolute inset-0 bg-white/60 flex items-center justify-center z-[1000]">
            <div className="bg-white rounded-xl shadow-lg px-5 py-3 flex items-center gap-3">
              <div className="h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-semibold text-slate-700">Memuat kecamatan dari OSM…</span>
            </div>
          </div>
        )}
        {view === "kecamatan" && kecError && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold px-4 py-2 rounded-xl z-[1000]">
            Gagal memuat batas kecamatan — tampil kabupaten saja
          </div>
        )}
      </div>

      {/* Legend + stats cards */}
      {view === "kabupaten" && (
        <div className="space-y-3">
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

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {kabData.map((k) => (
              <button
                key={k.kabupaten}
                onClick={() => { setSelectedKab(k.kabupaten); setView("kecamatan"); }}
                className="bg-white rounded-xl border border-slate-100 p-3 text-left hover:border-blue-300 hover:shadow-sm transition"
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
  );
}
