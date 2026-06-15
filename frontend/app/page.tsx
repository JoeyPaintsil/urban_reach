"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import Sidebar from "@/components/Sidebar";
import Legend from "@/components/Legend";
import Instructions from "@/components/Instructions";
import { Location, IsochroneData, CustomLocation, SimpleCoverage } from "@/types";

const MapComponent = dynamic(() => import("@/components/MapComponent"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 bg-slate-100 flex items-center justify-center">
      <div className="text-center">
        <div className="w-10 h-10 border-[3px] border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-gray-400 text-sm font-medium">Initialising map…</p>
      </div>
    </div>
  ),
});

const API = "http://localhost:8000";

export default function Page() {
  const [driveTime, setDriveTime] = useState(5);
  const [locations, setLocations] = useState<Location[]>([]);
  const [boundary, setBoundary] = useState<[number, number][]>([]);
  const [airportPolygon, setAirportPolygon] = useState<[number, number][]>([]);
  const [isochrones, setIsochrones] = useState<IsochroneData[]>([]);
  const [mergedPolygons, setMergedPolygons] = useState<[number, number][][]>([]);
  const [coverage, setCoverage] = useState<SimpleCoverage | null>(null);
  const [customLocations, setCustomLocations] = useState<CustomLocation[]>([]);
  const [addingMode, setAddingMode] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [dragRecalculating, setDragRecalculating] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [selectedId, setSelectedId] = useState<number | string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customLocationsRef = useRef<CustomLocation[]>([]);
  const driveTimeRef = useRef(driveTime);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { customLocationsRef.current = customLocations; }, [customLocations]);
  useEffect(() => { driveTimeRef.current = driveTime; }, [driveTime]);

  const fetchIsochrones = useCallback(async (minutes: number, extraLocations: CustomLocation[] = []) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/isochrones`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          minutes,
          extra_locations: extraLocations.map((l) => ({ id: l.id, lat: l.lat, lng: l.lng })),
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      setIsochrones(data.isochrones);
      setMergedPolygons(data.merged_polygons ?? []);
      setCoverage(data.coverage);
      setApiError(false);
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      setApiError(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      try {
        const [mcRes, airportRes] = await Promise.all([
          fetch(`${API}/api/mcdonalds`),
          fetch(`${API}/api/airport`),
        ]);
        const mcData = await mcRes.json();
        const airportData = await airportRes.json();
        setLocations(mcData.locations);
        setBoundary(mcData.boundary ?? []);
        setAirportPolygon(airportData.coordinates ?? []);
        setApiError(false);
      } catch {
        setApiError(true);
        setLoading(false);
        return;
      }
      await fetchIsochrones(5);
    };
    init();
  }, [fetchIsochrones]);

  const handleDriveTimeChange = (val: number) => {
    setDriveTime(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchIsochrones(val, customLocationsRef.current);
    }, 500);
  };

  const handleAddPoint = (lat: number, lng: number) => {
    setCustomLocations((prev) => [
      ...prev,
      { id: `custom_${Date.now()}`, lat, lng },
    ]);
  };

  const handleRemoveCustom = (id: string) => {
    setCustomLocations((prev) => prev.filter((l) => l.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // Called from map drag-end: reset all coverage state, then recalculate fresh
  const handleDragEnd = useCallback(async (id: string, lat: number, lng: number) => {
    // Build updated list with the dragged point's new position
    const updated = customLocationsRef.current.map((l) =>
      l.id === id ? { ...l, lat, lng } : l
    );
    customLocationsRef.current = updated;
    setCustomLocations(updated);

    // Wipe previous polygons so nothing from the old position bleeds through
    setIsochrones([]);
    setMergedPolygons([]);
    setCoverage(null);

    setDragRecalculating(true);
    try {
      await fetchIsochrones(driveTimeRef.current, updated);
    } finally {
      setDragRecalculating(false);
    }
  }, [fetchIsochrones]);

  const handleClearCustom = () => {
    setCustomLocations([]);
    setSelectedId(null);
    fetchIsochrones(driveTime, []);
  };

  const handleRecalculate = () => {
    fetchIsochrones(driveTime, customLocationsRef.current);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 overflow-hidden">
      <Header apiError={apiError} onMenuClick={() => setSidebarOpen((v) => !v)} />

      <div className="flex flex-1 overflow-hidden relative">
        {/* Dark backdrop — mobile only */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/40 z-[599] md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Sidebar — drawer on mobile, static on md+ */}
        <div
          className={[
            "fixed inset-y-0 left-0 z-[600] shadow-2xl",
            "transition-transform duration-300 ease-in-out",
            "w-[300px] sm:w-[370px]",
            sidebarOpen ? "translate-x-0" : "-translate-x-full",
            "md:relative md:translate-x-0 md:z-auto md:shadow-none md:w-[370px] md:flex-shrink-0",
          ].join(" ")}
        >
          <Sidebar
            driveTime={driveTime}
            onDriveTimeChange={handleDriveTimeChange}
            locations={locations}
            customLocations={customLocations}
            coverage={coverage}
            loading={loading}
            selectedId={selectedId}
            onSelectLocation={setSelectedId}
            onRemoveCustomLocation={handleRemoveCustom}
            onClose={() => setSidebarOpen(false)}
            onRecalculate={handleRecalculate}
            onClearCustom={handleClearCustom}
          />
        </div>

        <main className="flex-1 relative overflow-hidden">
          {/* Loading pill */}
          {loading && !dragRecalculating && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-white rounded-full px-4 py-2.5 shadow-lg flex items-center gap-2.5 border border-gray-100">
              <div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm font-semibold text-gray-600">Recalculating routes…</span>
            </div>
          )}

          {/* API error banner */}
          {apiError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-red-50 border border-red-200 text-red-700 rounded-full px-4 py-2.5 shadow text-sm font-medium">
              ⚠️ Cannot reach backend — run{" "}
              <code className="font-mono">python backend/main.py</code>
            </div>
          )}

          {/* Add mode banner — changes text during drag recalculation */}
          {addingMode && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[500] bg-teal-50 border border-teal-200 text-teal-700 rounded-full px-3 sm:px-4 py-2 sm:py-2.5 shadow text-xs sm:text-sm font-medium pointer-events-none whitespace-nowrap flex items-center gap-2 max-w-[calc(100vw-8rem)]">
              {dragRecalculating ? (
                <>
                  <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                  <span className="truncate">Recalculating…</span>
                </>
              ) : (
                <span className="truncate">Tap map to place a location</span>
              )}
            </div>
          )}

          {/* Add Location toggle — top right */}
          <div className="absolute top-4 right-4 z-[500]">
            <button
              onClick={() => setAddingMode((prev) => !prev)}
              className={`flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-md shadow-md transition-all duration-150 whitespace-nowrap ${
                addingMode
                  ? "bg-red-500 hover:bg-red-600 text-white"
                  : "bg-white hover:bg-gray-50 text-gray-700 border border-gray-200"
              }`}
            >
              {addingMode ? (
                <><span className="text-base leading-none">✕</span> Cancel</>
              ) : (
                <><span className="text-base leading-none">+</span> Add Location</>
              )}
            </button>
          </div>

          <MapComponent
            locations={locations}
            boundary={boundary}
            airportPolygon={airportPolygon}
            isochrones={isochrones}
            mergedPolygons={mergedPolygons}
            customLocations={customLocations}
            addingMode={addingMode}
            onMapClick={handleAddPoint}
            onDragEnd={handleDragEnd}
            onRemoveCustomLocation={handleRemoveCustom}
            selectedId={selectedId}
            onSelectLocation={setSelectedId}
          />

          {/* Bottom-right panel: instructions always visible, legend desktop-only */}
          <div className="absolute bottom-24 sm:bottom-20 right-3 sm:right-4 z-[400] flex flex-col gap-2 items-end pointer-events-none">
            <Instructions />
            <Legend hasCustomLocations={customLocations.length > 0} />
          </div>
        </main>
      </div>
    </div>
  );
}
