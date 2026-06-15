"use client";

import { Menu, ChevronDown, MapPin, Sandwich } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const BUSINESSES = [
  { id: "mcdonalds", label: "McDonald's", Icon: Sandwich, color: "text-amber-500" },
];

interface Props {
  apiError: boolean;
  onMenuClick: () => void;
}

export default function Header({ apiError, onMenuClick }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(BUSINESSES[0]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header
      className="bg-white border-b border-gray-200 flex-shrink-0 h-14 flex items-center relative"
      style={{ zIndex: 1000 }}
    >
      <div className="flex items-center w-full px-4 gap-3">
        {/* Hamburger */}
        <button
          onClick={onMenuClick}
          className="md:hidden p-1.5 rounded-md hover:bg-gray-100 transition-colors flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu size={20} className="text-gray-600" />
        </button>

        {/* Brand — icon hidden on mobile */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="hidden sm:flex w-8 h-8 bg-emerald-600 rounded-lg items-center justify-center flex-shrink-0">
            <MapPin size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="font-bold text-gray-900 text-[15px] tracking-tight whitespace-nowrap">
            UrbanReach
          </span>
        </div>

        {/* Business selector — centered, grows to fill space */}
        <div className="flex-1 flex justify-center min-w-0">
          <div ref={ref} className="relative w-full max-w-xs sm:max-w-sm">
            <button
              onClick={() => setOpen((v) => !v)}
              className="w-full flex items-center gap-2 px-3 sm:px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm hover:border-gray-400 transition-colors text-left"
            >
              <selected.Icon size={18} className={`flex-shrink-0 ${selected.color}`} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-none mb-0.5 hidden xs:block">
                  Select a business
                </p>
                <p className="text-sm font-semibold text-gray-700 leading-none truncate">
                  {selected.label}
                </p>
              </div>
              <ChevronDown
                size={14}
                className={`text-gray-400 flex-shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
              />
            </button>

            {open && (
              <div
                className="absolute top-full left-0 right-0 mt-1.5 bg-white border border-gray-200 rounded-md shadow-xl overflow-hidden"
                style={{ zIndex: 9999 }}
              >
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
                  Select a business
                </p>
                {BUSINESSES.map((b) => (
                  <button
                    key={b.id}
                    onClick={() => { setSelected(b); setOpen(false); }}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                      selected.id === b.id
                        ? "bg-emerald-50 text-emerald-700 font-medium"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <b.Icon size={16} className={b.color} />
                    {b.label}
                    {selected.id === b.id && (
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Status */}
        <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
          <span
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              apiError ? "bg-red-500" : "bg-emerald-500 animate-pulse"
            }`}
          />
          {apiError ? (
            <span className="text-red-600 font-medium hidden sm:inline">Backend offline</span>
          ) : (
            <span className="text-gray-500 hidden md:inline">18 locations · Lisbon</span>
          )}
        </div>
      </div>
    </header>
  );
}
