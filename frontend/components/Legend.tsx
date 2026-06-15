"use client";

interface Props {
  hasCustomLocations: boolean;
}

export default function Legend({ hasCustomLocations }: Props) {
  return (
    <div className="hidden sm:block bg-white/95 backdrop-blur-sm rounded-2xl shadow-lg border border-gray-100 px-4 py-3 text-xs pointer-events-none w-48">
      <p className="font-bold text-gray-600 mb-2 text-[11px] uppercase tracking-wide">
        Legend
      </p>
      <div className="space-y-1.5">
        <LegendRow
          color="rgba(16,185,129,0.25)"
          border="2px solid #10b981"
          label="Coverage zone"
        />
        <LegendRow
          color="#FFC72C"
          border="2px solid #DA291C"
          round
          label="McDonald's location"
        />
        <LegendRow
          color="rgba(239,68,68,0.22)"
          border="2px solid #b91c1c"
          label="Humberto Delgado Airport"
        />
        {hasCustomLocations && (
          <LegendRow
            color="#14b8a6"
            border="2px solid #0f766e"
            round
            label="Custom location"
          />
        )}
      </div>
    </div>
  );
}

function LegendRow({
  color,
  border,
  round = false,
  label,
}: {
  color: string;
  border: string;
  round?: boolean;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        style={{
          width: 14,
          height: 14,
          background: color,
          border,
          borderRadius: round ? "50%" : 3,
          flexShrink: 0,
        }}
      />
      <span className="text-gray-500 text-[11px]">{label}</span>
    </div>
  );
}
