import pickle, math
with open("lisbon_boundary.pkl", "rb") as f:
    b = pickle.load(f)
mn_lng, mn_lat, mx_lng, mx_lat = b.bounds
area_km2 = b.area * 111 * 111 * math.cos(math.radians(38.72))
print(f"Boundary: {b.geom_type}")
print(f"Lat: {mn_lat:.3f} to {mx_lat:.3f}  ({(mx_lat-mn_lat)*111:.1f} km tall)")
print(f"Lng: {mn_lng:.3f} to {mx_lng:.3f}  ({(mx_lng-mn_lng)*111*math.cos(math.radians(38.72)):.1f} km wide)")
print(f"Area: {area_km2:.0f} km2")
