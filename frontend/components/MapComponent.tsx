"use client";

import { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Polygon,
  Marker,
  Popup,
  useMap,
  useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Location, IsochroneData, CustomLocation } from "@/types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function mcdonaldsIcon(selected: boolean) {
  const bg = selected ? "#DA291C" : "#FFC72C";
  const bd = selected ? "#8B1A1A" : "#DA291C";
  return L.divIcon({
    html: `
      <div style="
        width:40px;height:40px;
        background:${bg};border:3px solid ${bd};
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        box-shadow:0 4px 12px rgba(0,0,0,0.22);
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:19px;display:block;line-height:1;">🍔</span>
      </div>`,
    className: "",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -44],
  });
}

function customLocationIcon(num: number, selected: boolean) {
  const bg = selected
    ? "linear-gradient(135deg,#0d9488,#0f766e)"
    : "linear-gradient(135deg,#2dd4bf,#0d9488)";
  const bd = selected ? "#134e4a" : "#0f766e";
  return L.divIcon({
    html: `
      <div style="
        width:38px;height:38px;
        background:${bg};border:3px solid ${bd};
        border-radius:50% 50% 50% 0;transform:rotate(-45deg);
        box-shadow:0 4px 12px rgba(0,0,0,0.22);
        display:flex;align-items:center;justify-content:center;">
        <span style="transform:rotate(45deg);font-size:13px;display:block;line-height:1;font-weight:800;color:white;font-family:sans-serif;">${num}</span>
      </div>`,
    className: "custom-draggable",
    iconSize: [38, 38],
    iconAnchor: [19, 38],
    popupAnchor: [0, -42],
  });
}

function MapController({
  selectedId,
  locations,
  customLocations,
}: {
  selectedId: number | string | null;
  locations: Location[];
  customLocations: CustomLocation[];
}) {
  const map = useMap();
  useEffect(() => {
    if (selectedId === null) return;
    const loc = locations.find((l) => l.id === selectedId);
    if (loc) { map.flyTo([loc.lat, loc.lng], 14, { duration: 1.1 }); return; }
    const custom = customLocations.find((c) => c.id === selectedId);
    if (custom) map.flyTo([custom.lat, custom.lng], 14, { duration: 1.1 });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
  return null;
}

function MapClickHandler({
  addingMode,
  onMapClick,
}: {
  addingMode: boolean;
  onMapClick: (lat: number, lng: number) => void;
}) {
  const map = useMapEvents({
    click(e) {
      if (addingMode) onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });

  useEffect(() => {
    const container = map.getContainer();
    if (addingMode) {
      container.classList.add("mc-add-mode");
    } else {
      container.classList.remove("mc-add-mode");
    }
    return () => container.classList.remove("mc-add-mode");
  }, [addingMode, map]);

  return null;
}

interface Props {
  locations: Location[];
  boundary: [number, number][];
  airportPolygon: [number, number][];
  isochrones: IsochroneData[];
  mergedPolygons: [number, number][][];
  customLocations: CustomLocation[];
  addingMode: boolean;
  onMapClick: (lat: number, lng: number) => void;
  onDragEnd: (id: string, lat: number, lng: number) => void;
  onRemoveCustomLocation: (id: string) => void;
  selectedId: number | string | null;
  onSelectLocation: (id: number | string | null) => void;
}

const LISBON: [number, number] = [38.7169, -9.1399];

export default function MapComponent({
  locations,
  boundary,
  airportPolygon,
  isochrones,
  mergedPolygons,
  customLocations,
  addingMode,
  onMapClick,
  onDragEnd,
  onRemoveCustomLocation,
  selectedId,
  onSelectLocation,
}: Props) {
  const selectedIsochrone =
    selectedId !== null ? isochrones.find((iso) => iso.id === selectedId) ?? null : null;

  return (
    <MapContainer
      center={LISBON}
      zoom={11}
      style={{ height: "100%", width: "100%" }}
      zoomControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>'
        subdomains="abcd"
        maxZoom={20}
      />

      <ZoomControl />
      <MapController selectedId={selectedId} locations={locations} customLocations={customLocations} />
      <MapClickHandler addingMode={addingMode} onMapClick={onMapClick} />

      {/* Lisboa boundary outline */}
      {boundary.length > 0 && (
        <Polygon
          positions={boundary}
          pathOptions={{
            color: "#ef4444",
            fillColor: "transparent",
            fillOpacity: 0,
            weight: 2.5,
            opacity: 0.85,
            dashArray: "6 4",
          }}
        />
      )}

      {/* Airport polygon */}
      {airportPolygon.length > 0 && (
        <Polygon
          positions={airportPolygon}
          pathOptions={{
            color: "#b91c1c",
            fillColor: "#ef4444",
            fillOpacity: 0.22,
            weight: 2,
            opacity: 0.9,
          }}
        />
      )}

      {/* Merged coverage zone */}
      {mergedPolygons.map((ring, i) => (
        <Polygon
          key={`merged-${i}`}
          positions={ring}
          pathOptions={{
            color: "#059669",
            fillColor: "#10b981",
            fillOpacity: 0.18,
            weight: 2,
            opacity: 0.7,
          }}
        />
      ))}

      {/* Selected location's individual isochrone — dashed black outline */}
      {selectedIsochrone && (
        <Polygon
          positions={selectedIsochrone.polygon as [number, number][]}
          pathOptions={{
            color: "#111827",
            fillColor: "#10b981",
            fillOpacity: 0.12,
            weight: 2,
            opacity: 0.85,
            dashArray: "6 5",
          }}
        />
      )}

      {/* McDonald's markers */}
      {locations.map((loc) => (
        <Marker
          key={`mc-${loc.id}`}
          position={[loc.lat, loc.lng]}
          icon={mcdonaldsIcon(selectedId === loc.id)}
          eventHandlers={{ click: () => onSelectLocation(loc.id) }}
          zIndexOffset={selectedId === loc.id ? 1000 : 0}
        >
          <Popup>
            <div style={{ minWidth: 160 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#1f2937", marginBottom: 4 }}>
                {loc.name}
              </p>
              <p style={{ fontSize: 11, color: "#6b7280" }}>{loc.address}</p>
            </div>
          </Popup>
        </Marker>
      ))}

      {/* Custom location markers — draggable */}
      {customLocations.map((loc, idx) => (
        <Marker
          key={`custom-${loc.id}`}
          position={[loc.lat, loc.lng]}
          icon={customLocationIcon(idx + 1, selectedId === loc.id)}
          draggable={true}
          eventHandlers={{
            click: () => onSelectLocation(loc.id),
            dragend: (e) => {
              const { lat, lng } = (e.target as L.Marker).getLatLng();
              onDragEnd(loc.id, lat, lng);
            },
          }}
          zIndexOffset={selectedId === loc.id ? 1000 : 500}
        >
          <Popup>
            <div style={{ minWidth: 150 }}>
              <p style={{ fontWeight: 700, fontSize: 13, color: "#0d9488", marginBottom: 4 }}>
                Custom Location #{idx + 1}
              </p>
              <p style={{ fontSize: 10, color: "#9ca3af", fontFamily: "monospace", marginBottom: 10 }}>
                {loc.lat.toFixed(4)}°N, {Math.abs(loc.lng).toFixed(4)}°W
              </p>
              <button
                onClick={() => onRemoveCustomLocation(loc.id)}
                style={{
                  width: "100%",
                  padding: "5px 10px",
                  background: "#fee2e2",
                  border: "1px solid #fca5a5",
                  borderRadius: 8,
                  color: "#dc2626",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Remove location
              </button>
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}

function ZoomControl() {
  const map = useMap();
  useEffect(() => {
    L.control.zoom({ position: "bottomright" }).addTo(map);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
