export interface Location {
  id: number;
  name: string;
  lat: number;
  lng: number;
  address: string;
}

export interface IsochroneData {
  id: number | string;
  name: string;
  center: { lat: number; lng: number };
  polygon: [number, number][];
}

export interface CustomLocation {
  id: string;
  lat: number;
  lng: number;
}

export interface SimpleCoverage {
  total: number;
  covered: number;
  pct: number;
}
