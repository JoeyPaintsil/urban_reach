"use client";

import { useState, useEffect } from "react";
import { X, RefreshCw, Trash2, Sandwich } from "lucide-react";
import { Location, CustomLocation, SimpleCoverage } from "@/types";

interface Props {
  driveTime: number;
  onDriveTimeChange: (time: number) => void;
  locations: Location[];
  customLocations: CustomLocation[];
  coverage: SimpleCoverage | null;
  loading: boolean;
  selectedId: number | string | null;
  onSelectLocation: (id: number | string | null) => void;
  onRemoveCustomLocation: (id: string) => void;
  onClose: () => void;
  onRecalculate: () => void;
  onClearCustom: () => void;
}

export default function Sidebar({
  driveTime,
  onDriveTimeChange,
  locations,
  customLocations,
  coverage,
  loading,
  selectedId,
  onSelectLocation,
  onRemoveCustomLocation,
  onClose,
  onRecalculate,
  onClearCustom,
}: Props) {
  const [inputVal, setInputVal] = useState(String(driveTime));

  useEffect(() => {
    setInputVal(String(driveTime));
  }, [driveTime]);

  const handleSlider = (val: number) => {
    setInputVal(String(val));
    onDriveTimeChange(val);
  };

  return (
    <aside className="w-full h-full bg-white border-r border-gray-200 flex flex-col overflow-y-auto">
      {/* Mobile close bar */}
      <div className="md:hidden flex items-center justify-between px-5 py-3 border-b border-gray-200 flex-shrink-0">
        <span className="text-sm font-semibold text-gray-800">UrbanReach</span>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
          aria-label="Close menu"
        >
          <X size={18} className="text-gray-500" />
        </button>
      </div>

      {/* Drive Time */}
      <section className="px-5 py-5 border-b border-gray-100">
        <p className="text-sm text-gray-500 mb-3">Drive Time</p>
        <div className="border border-gray-300 rounded-md px-4 py-2.5 flex items-center justify-between bg-white select-none">
          <span className="text-sm text-gray-800 font-medium">
            {driveTime} minute{driveTime !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-gray-400">▾</span>
        </div>
        <div className="mt-4 px-0.5">
          <input
            type="range"
            min={1}
            max={30}
            step={0.5}
            value={Math.min(driveTime, 30)}
            onChange={(e) => handleSlider(parseFloat(e.target.value))}
            className="w-full h-1.5 rounded-full cursor-pointer accent-emerald-600"
          />
          <div className="flex justify-between text-xs text-gray-400 mt-1.5">
            <span>1 min</span>
            <span>30 min</span>
          </div>
        </div>
      </section>

      {/* Coverage Stats */}
      <section className="px-5 py-5 border-b border-gray-100">
        <p className="text-sm text-gray-500 mb-3">Coverage</p>
        <div className="grid grid-cols-3 gap-2">
          <StatBox value={String(locations.length + customLocations.length)} label="Locations" />
          <StatBox value={`${driveTime}m`} label="Drive time" />
          <StatBox
            value={loading ? "…" : coverage ? `${coverage.pct}%` : "—"}
            label="Area covered"
            highlight
          />
        </div>
      </section>

      {/* Custom Locations */}
      <section className="px-5 py-5 border-b border-gray-100">
        <p className="text-sm text-gray-500 mb-3">Custom Locations</p>

        {customLocations.length > 0 && (
          <div className="space-y-2 mb-3">
            {customLocations.map((loc, idx) => (
              <div
                key={loc.id}
                className={`flex items-center gap-3 px-3 py-2.5 border rounded-md cursor-pointer transition-colors ${
                  selectedId === loc.id
                    ? "border-emerald-400 bg-emerald-50"
                    : "border-gray-200 hover:bg-gray-50"
                }`}
                onClick={() => onSelectLocation(selectedId === loc.id ? null : loc.id)}
              >
                <div className="w-5 h-5 bg-teal-500 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
                  {idx + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-700 font-medium">Custom Location #{idx + 1}</p>
                  <p className="text-xs text-gray-400 font-mono truncate">
                    {loc.lat.toFixed(4)}°, {loc.lng.toFixed(4)}°
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveCustomLocation(loc.id);
                  }}
                  className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                  aria-label="Remove"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {customLocations.length > 0 && !loading && (
          <div className="flex gap-2">
            <button
              onClick={onRecalculate}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 rounded-md text-xs font-medium transition-colors"
            >
              <RefreshCw size={12} /> Recalculate
            </button>
            <button
              onClick={onClearCustom}
              className="flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 rounded-md text-xs font-medium transition-colors"
            >
              <Trash2 size={12} /> Clear All
            </button>
          </div>
        )}
      </section>

      {/* McDonald's Locations */}
      <section className="px-5 py-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm text-gray-500">McDonald&rsquo;s Locations</p>
          <span className="text-xs text-gray-400">{locations.length} in Lisbon</span>
        </div>
        <div className="space-y-1.5">
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => {
                onSelectLocation(selectedId === loc.id ? null : loc.id);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 border rounded-md text-left transition-colors ${
                selectedId === loc.id
                  ? "border-emerald-400 bg-emerald-50"
                  : "border-gray-200 hover:bg-gray-50"
              }`}
            >
              <Sandwich size={15} className="text-amber-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-gray-700 font-medium truncate">{loc.name}</p>
                <p className="text-xs text-gray-400 truncate">{loc.address}</p>
              </div>
              {selectedId === loc.id && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function StatBox({
  value,
  label,
  highlight = false,
}: {
  value: string;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="border border-gray-200 rounded-md p-3 text-center">
      <div className={`text-xl font-bold leading-none ${highlight ? "text-emerald-600" : "text-gray-800"}`}>
        {value}
      </div>
      <div className="text-xs text-gray-400 mt-1.5 leading-tight">{label}</div>
    </div>
  );
}
