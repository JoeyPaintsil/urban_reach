"use client";

export default function Instructions() {
  return (
    <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-gray-100 px-3 py-2.5 sm:px-4 sm:py-3 text-xs pointer-events-none w-40 sm:w-48">
      <p className="font-bold text-gray-600 mb-2 text-[11px] uppercase tracking-wide">
        How to use
      </p>
      <div className="space-y-1.5 sm:space-y-2">
        <Step num={1} text="Click on map to add a location" />
        <Step num={2} text="Drag points to recalculate" />
        <Step num={3} text="Click any point to highlight it" />
      </div>
    </div>
  );
}

function Step({ num, text }: { num: number; text: string }) {
  return (
    <div className="flex items-start gap-1.5 sm:gap-2">
      <span className="hidden sm:flex w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold items-center justify-center flex-shrink-0 mt-px">
        {num}
      </span>
      <span className="text-gray-500 text-[10px] sm:text-[11px] leading-snug">{text}</span>
    </div>
  );
}
