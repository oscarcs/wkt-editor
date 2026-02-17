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
  // Z/M ordinates silently ignored (2D canvas)
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

/** Parse top-level paren groups, each of which itself contains paren groups (for MULTIPOLYGON) */
function parsePolygonGroups(s: string): L.LatLng[][][] {
  const groups: L.LatLng[][][] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') {
      if (depth === 0) start = i;
      depth++;
    } else if (s[i] === ')') {
      depth--;
      if (depth === 0) {
        // Each group is a polygon's ring set: ((ring1), (ring2), ...)
        const inner = s.slice(start + 1, i);
        groups.push(parseRings(inner));
      }
    }
  }
  return groups;
}

/** Parse MULTIPOINT which supports both `MULTIPOINT (x y, x y)` and `MULTIPOINT ((x y), (x y))` */
function parseMultiPointCoords(s: string): L.LatLng[] {
  // Check if it uses the parenthesized form
  if (s.includes('(')) {
    return parseRings(s).map(ring => ring[0]);
  }
  return parseCoordList(s);
}

export function parseWkt(wkt: string): L.Layer | L.Layer[] | null {
  const trimmed = wkt.trim();

  // Handle EMPTY geometries
  if (/^\w+\s+EMPTY$/i.test(trimmed)) return null;

  // Strip optional Z/M/ZM qualifier: "POINT Z (...)" -> "POINT (...)"
  const match = trimmed.match(/^(\w+)(?:\s+[ZM]{1,2})?\s*\((.+)\)$/si);
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
    case 'MULTIPOINT': {
      const coords = parseMultiPointCoords(body);
      return coords.map(c => L.marker(c));
    }
    case 'MULTILINESTRING': {
      const lines = parseRings(body);
      return L.polyline(lines);
    }
    case 'POLYGON': {
      const rings = parseRings(body);
      return L.polygon(rings);
    }
    case 'MULTIPOLYGON': {
      const polygonGroups = parsePolygonGroups(body);
      return polygonGroups.map(rings => L.polygon(rings));
    }
    case 'GEOMETRYCOLLECTION': {
      // Recursively parse each geometry in the collection
      const sublayers: L.Layer[] = [];
      const regex = /\b(\w+)\s*\(/g;
      let m;
      while ((m = regex.exec(body)) !== null) {
        const start = m.index;
        let depth = 0;
        let i = m.index + m[0].length - 1;
        for (; i < body.length; i++) {
          if (body[i] === '(') depth++;
          else if (body[i] === ')') {
            depth--;
            if (depth === 0) break;
          }
        }
        if (depth !== 0) continue;
        const subWkt = body.slice(start, i + 1);
        const result = parseWkt(subWkt);
        if (result) {
          if (Array.isArray(result)) sublayers.push(...result);
          else sublayers.push(result);
        }
        regex.lastIndex = i + 1;
      }
      return sublayers;
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
  /** One range per WKT statement (deduplicated) */
  ranges: WktRange[];
  /** Maps each layer index to its statement/range index */
  layerToStatement: number[];
}

export function parseMultiWkt(text: string): ParseMultiWktResult {
  const layers: L.Layer[] = [];
  const ranges: WktRange[] = [];
  const layerToStatement: number[] = [];
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
    const result = parseWkt(wktStr);
    if (result) {
      const stmtIndex = ranges.length;
      ranges.push({ start, end: i + 1 });
      if (Array.isArray(result)) {
        for (const l of result) {
          layers.push(l);
          layerToStatement.push(stmtIndex);
        }
      } else {
        layers.push(result);
        layerToStatement.push(stmtIndex);
      }
    }
    regex.lastIndex = i + 1;
  }
  return { layers, ranges, layerToStatement };
}
