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
    const latlngs = layer.getLatLngs();
    // Multi-linestring: getLatLngs() returns LatLng[][] when it has multiple lines
    if (Array.isArray(latlngs[0]) && !(latlngs[0] instanceof L.LatLng)) {
      const lines = (latlngs as L.LatLng[][]).map(
        line => `(${line.map(coordToWkt).join(', ')})`
      );
      return `MULTILINESTRING (${lines.join(', ')})`;
    }
    const coords = (latlngs as L.LatLng[]).map(coordToWkt).join(', ');
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
    case 'MULTILINESTRING': {
      const lines = parseRings(body);
      return L.polyline(lines);
    }
    case 'POLYGON': {
      const rings = parseRings(body);
      return L.polygon(rings);
    }
    default:
      return null;
  }
}

export interface WktRange {
  start: number;
  end: number;
}

export interface ParseMultiWktResult {
  layers: L.Layer[];
  ranges: WktRange[];
}

export function parseMultiWkt(text: string): ParseMultiWktResult {
  const layers: L.Layer[] = [];
  const ranges: WktRange[] = [];
  // Match each top-level WKT statement: TYPE (...) allowing multiline content
  const regex = /\b(\w+)\s*\(/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    // Find the matching closing paren by tracking depth
    let depth = 0;
    let i = match.index + match[0].length - 1; // position of opening '('
    for (; i < text.length; i++) {
      if (text[i] === '(') depth++;
      else if (text[i] === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue; // unmatched parens, skip
    const wktStr = text.slice(start, i + 1);
    const layer = parseWkt(wktStr);
    if (layer) {
      layers.push(layer);
      ranges.push({ start, end: i + 1 });
    }
    regex.lastIndex = i + 1;
  }
  return { layers, ranges };
}
