import { createElement } from "react";
import type { Map as MapLibreMap, MapLayerMouseEvent } from "maplibre-gl";
import { pushPanel } from "@/lib/store/PanelContext";
import { ParkingCard, type GarageProps } from "./ParkingCard";

/**
 * Garages and lots as small "P" icons overhead (z >= 13). At street level
 * (z >= 17) each becomes a taller blade sign standing up from the facade
 * (viewport-aligned icon lifted off the ground), so it reads like the real
 * "PARKING" sign on the building. Tap opens one panel card.
 */
const SRC = "parking";
const ICON = "parking-p";
const SIGN = "parking-sign";

function draw(w: number, h: number, label: string, font: number): ImageData {
  const g = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
  g.canvas.width = w;
  g.canvas.height = h;
  g.fillStyle = "#1d4ed8";
  g.beginPath();
  g.roundRect(1, 1, w - 2, h - 2, Math.min(w, h) / 5);
  g.fill();
  g.strokeStyle = "#ffffff";
  g.lineWidth = 2.5;
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = `bold ${font}px system-ui, sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, w / 2, h / 2 + 1);
  return g.getImageData(0, 0, w, h);
}

export function mount(map: MapLibreMap): () => void {
  if (!map.hasImage(ICON)) map.addImage(ICON, draw(32, 32, "P", 20), { pixelRatio: 2 });
  if (!map.hasImage(SIGN)) map.addImage(SIGN, draw(56, 120, "P", 44), { pixelRatio: 2 });
  if (!map.getSource(SRC)) map.addSource(SRC, { type: "geojson", data: "/api/parking", attribution: "NYC DCWP · © OpenStreetMap (ODbL)" });
  map.addLayer({
    id: "parking-icons",
    type: "symbol",
    source: SRC,
    minzoom: 13,
    maxzoom: 17,
    layout: { "icon-image": ICON, "icon-allow-overlap": false, "icon-size": ["interpolate", ["linear"], ["zoom"], 13, 0.7, 16, 1] },
  });
  map.addLayer({
    id: "parking-signs",
    type: "symbol",
    source: SRC,
    minzoom: 17,
    layout: {
      "icon-image": SIGN,
      "icon-allow-overlap": true,
      "icon-pitch-alignment": "viewport",
      "icon-rotation-alignment": "viewport",
      "icon-anchor": "bottom",
      "icon-offset": [0, -30],
      "icon-size": ["interpolate", ["exponential", 2], ["zoom"], 17, 0.5, 21, 1.4],
    },
  });
  const onClick = (e: MapLayerMouseEvent) => {
    const f = e.features?.[0];
    if (!f || f.geometry.type !== "Point") return;
    const p = f.properties as Omit<GarageProps, "lon" | "lat"> & { id: string; capacity: number | string | null };
    const [lon, lat] = f.geometry.coordinates;
    const capacity = p.capacity == null || String(p.capacity) === "null" ? null : Number(p.capacity);
    const address = (p.address as string | null) === "null" ? null : p.address;
    pushPanel({
      id: `parking:${p.id}`,
      title: p.name,
      subtitle: p.kind === "lot" ? "Parking lot" : "Parking garage",
      details: createElement(ParkingCard, { garage: { ...p, address, capacity, lon, lat } }),
    });
  };
  const pointer = () => (map.getCanvas().style.cursor = "pointer");
  const unpointer = () => (map.getCanvas().style.cursor = "");
  for (const id of ["parking-icons", "parking-signs"]) {
    map.on("click", id, onClick);
    map.on("mouseenter", id, pointer);
    map.on("mouseleave", id, unpointer);
  }
  return () => {
    for (const id of ["parking-icons", "parking-signs"]) {
      map.off("click", id, onClick);
      map.off("mouseenter", id, pointer);
      map.off("mouseleave", id, unpointer);
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource(SRC)) map.removeSource(SRC);
  };
}
