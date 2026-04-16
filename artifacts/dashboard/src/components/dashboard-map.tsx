import { useEffect } from "react";
import { MapContainer, TileLayer, GeoJSON, ZoomControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { jatimKabupatenGeo } from "@/data/jatim-geo";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const TOOLTIP_STYLE = `
  .db-map .leaflet-tooltip { border: none !important; outline: none !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.13) !important; border-radius: 10px !important;
    background: #fff !important; padding: 8px 12px !important; font-family: 'Plus Jakarta Sans', sans-serif; }
  .db-map .leaflet-tooltip::before { display: none !important; }
  .db-map .leaflet-container,
  .db-map .leaflet-container *,
  .db-map .leaflet-container *:focus,
  .db-map .leaflet-container path:focus { outline: none !important; box-shadow: none !important; }
`;

function getColor(count: number, max: number): string {
  if (!count || max === 0) return "#e2e8f0";
  const r = count / max;
  if (r < 0.15) return "#dbeafe";
  if (r < 0.35) return "#93c5fd";
  if (r < 0.55) return "#60a5fa";
  if (r < 0.75) return "#3b82f6";
  return "#1d4ed8";
}

interface Props {
  data: { label: string; count: number }[];
  height?: number;
}

export default function DashboardMap({ data, height = 220 }: Props) {
  useEffect(() => {
    let el = document.getElementById("db-map-tooltip-style") as HTMLStyleElement | null;
    if (!el) { el = document.createElement("style"); el.id = "db-map-tooltip-style"; }
    el.textContent = TOOLTIP_STYLE;
    document.head.appendChild(el);
  }, []);

  const countByKab = Object.fromEntries(data.map((d) => [d.label, d.count]));
  const max = Math.max(...data.map((d) => d.count), 1);

  function onEachFeature(feature: any, layer: L.Layer) {
    const name: string = feature.properties?.name ?? "";
    const count = countByKab[name] ?? 0;
    (layer as L.Path).setStyle({
      fillColor: getColor(count, max),
      weight: 1.5,
      opacity: 1,
      color: "white",
      fillOpacity: count ? 0.82 : 0.3,
    });
    if (count) {
      layer.bindTooltip(
        `<div style="font-size:12px;line-height:1.5"><b>${name}</b><br/><span style="color:#3b82f6">${count.toLocaleString()} peserta</span></div>`,
        { sticky: true }
      );
    }
    layer.on({
      mouseover: (e) => count && (e.target as L.Path).setStyle({ fillOpacity: 0.96, weight: 2.5 }),
      mouseout: (e) => count && (e.target as L.Path).setStyle({ fillOpacity: 0.82, weight: 1.5 }),
    });
  }

  return (
    <div className="db-map w-full" style={{ height }}>
      <MapContainer
        center={[-7.87, 111.45]}
        zoom={8}
        style={{ height: "100%", width: "100%", outline: "none", borderRadius: 0 }}
        zoomControl={false}
        scrollWheelZoom={false}
        // @ts-ignore
        tabIndex={-1}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          opacity={0.4}
        />
        <ZoomControl position="bottomright" />
        <GeoJSON
          key={JSON.stringify(countByKab)}
          data={jatimKabupatenGeo as any}
          onEachFeature={onEachFeature}
        />
      </MapContainer>
    </div>
  );
}
