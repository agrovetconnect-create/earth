/** Degrees to radians. */
export function toRad(deg) {
    return (deg * Math.PI) / 180;
}
/**
 * Great-circle distance between two coordinates, in kilometres.
 *
 * Used as a proximity aid for "what is near this point", never as a claim that
 * two observations belong to the same geological site.
 */
export function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}
