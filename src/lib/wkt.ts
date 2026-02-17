import L from 'leaflet';

function coordToWkt(latlng: L.LatLng): string {
  return `${latlng.lng} ${latlng.lat}`;
}

function ringToWkt(latlngs: L.LatLng[]): string {
  const coords = latlngs.map(coordToWkt);
  // Close the ring if not already closed
  const first = latlngs[0];
  const last = latlngs[latlngs.length - 1];
  if (first.lat !== last.lat || first.lng !== last.lng) {
    coords.push(coordToWkt(first));
  }
  return `(${coords.join(', ')})`;
}

export function layerToWkt(layer: L.Layer): string | null {
  if (layer instanceof L.Marker) {
    const ll = layer.getLatLng();
    return `POINT (${ll.lng} ${ll.lat})`;
  }

  if (layer instanceof L.Polygon) {
    // L.Polygon extends L.Polyline, so check polygon first
    const latlngs = layer.getLatLngs();
    // getLatLngs() returns LatLng[][] for polygon (outer + holes)
    const rings = (Array.isArray(latlngs[0]) && latlngs[0] instanceof L.LatLng === false)
      ? latlngs as L.LatLng[][]
      : [latlngs as L.LatLng[]];
    const wktRings = rings.map(ringToWkt).join(', ');
    return `POLYGON (${wktRings})`;
  }

  if (layer instanceof L.Polyline) {
    const latlngs = layer.getLatLngs() as L.LatLng[];
    const coords = latlngs.map(coordToWkt).join(', ');
    return `LINESTRING (${coords})`;
  }

  return null;
}

export function layersToWkt(layers: L.Layer[]): string {
  return layers.map(layerToWkt).filter(Boolean).join('\n');
}

// --- Parsing WKT back to Leaflet layers ---

function parseCoord(s: string): L.LatLng {
  const parts = s.trim().split(/\s+/);
  const lng = parseFloat(parts[0]);
  const lat = parseFloat(parts[1]);
  return L.latLng(lat, lng);
}

function parseCoordList(s: string): L.LatLng[] {
  return s.split(',').map(parseCoord);
}

function parseRing(s: string): L.LatLng[] {
  const inner = s.trim().replace(/^\(/, '').replace(/\)$/, '');
  return parseCoordList(inner);
}

function parseRings(s: string): L.LatLng[][] {
  const rings: L.LatLng[][] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (s[i] === ')') {
      depth--;
      if (depth === 0) {
        rings.push(parseRing(s.slice(start, i + 1)));
      }
    }
  }
  return rings;
}

export function parseWkt(wkt: string): L.Layer | null {
  const trimmed = wkt.trim();
  const match = trimmed.match(/^(\w+)\s*\((.+)\)$/s);
  if (!match) return null;

  const type = match[1].toUpperCase();
  const body = match[2];

  switch (type) {
    case 'POINT': {
      const coord = parseCoord(body);
      return L.marker(coord);
    }
    case 'LINESTRING': {
      const coords = parseCoordList(body);
      return L.polyline(coords);
    }
    case 'POLYGON': {
      const rings = parseRings(body);
      return L.polygon(rings);
    }
    default:
      return null;
  }
}

export function parseMultiWkt(text: string): L.Layer[] {
  const layers: L.Layer[] = [];
  // Split on newlines, each line is a separate WKT geometry
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of lines) {
    const layer = parseWkt(line);
    if (layer) layers.push(layer);
  }
  return layers;
}
