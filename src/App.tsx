import { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import MapPanel from './components/MapPanel';
import type { MapPanelHandle } from './components/MapPanel';
import WktEditor from './components/WktEditor';
import { parseMultiWkt } from './lib/wkt';
import type { WktRange } from './lib/wkt';

const STORAGE_KEY = 'wkt-editor-geometry';

function loadSavedWkt(): { wkt: string; layers: L.Layer[] | null; ranges: WktRange[]; layerToStatement: number[] } {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { wkt: '', layers: null, ranges: [], layerToStatement: [] };
  try {
    const { layers, ranges, layerToStatement } = parseMultiWkt(saved);
    return { wkt: saved, layers: layers.length > 0 ? layers : null, ranges, layerToStatement };
  } catch {
    return { wkt: saved, layers: null, ranges: [], layerToStatement: [] };
  }
}

function App() {
  const initial = useRef(loadSavedWkt());
  const [wkt, setWkt] = useState(initial.current.wkt);
  const [error, setError] = useState<string | null>(null);
  const [externalLayers, setExternalLayers] = useState<L.Layer[] | null>(initial.current.layers);
  const [wktRanges, setWktRanges] = useState<WktRange[]>(initial.current.ranges);
  const [layerToStatement, setLayerToStatement] = useState<number[]>(initial.current.layerToStatement);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const isMapUpdateRef = useRef(false);
  const mapRef = useRef<MapPanelHandle>(null);

  // Persist WKT to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, wkt);
  }, [wkt]);

  // Called when map layers change (draw/edit/delete)
  const handleMapChange = useCallback((newWkt: string) => {
    isMapUpdateRef.current = true;
    setWkt(newWkt);
    setError(null);
    const { ranges, layerToStatement: lts } = parseMultiWkt(newWkt);
    setWktRanges(ranges);
    setLayerToStatement(lts);
    requestAnimationFrame(() => {
      isMapUpdateRef.current = false;
    });
  }, []);

  // Parse WKT and update layers, returns true if valid
  const applyWkt = useCallback((newWkt: string): boolean => {
    setWkt(newWkt);

    if (!newWkt.trim()) {
      setError(null);
      setExternalLayers([]);
      setWktRanges([]);
      setLayerToStatement([]);
      return true;
    }

    try {
      const { layers, ranges, layerToStatement: lts } = parseMultiWkt(newWkt);
      if (layers.length === 0 && newWkt.trim()) {
        setError('Could not parse WKT. Supported: POINT, MULTIPOINT, LINESTRING, MULTILINESTRING, POLYGON, MULTIPOLYGON, GEOMETRYCOLLECTION');
        return false;
      } else {
        setError(null);
      }
      setExternalLayers(layers);
      setWktRanges(ranges);
      setLayerToStatement(lts);
      return layers.length > 0;
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : 'Unknown error'}`);
      return false;
    }
  }, []);

  // Called when text editor changes
  const handleTextChange = useCallback((newWkt: string) => {
    applyWkt(newWkt);
  }, [applyWkt]);

  // Called on paste — apply WKT then center
  const handlePaste = useCallback((pasted: string) => {
    const valid = applyWkt(pasted);
    if (valid) {
      // Delay to let layers render before fitting bounds
      requestAnimationFrame(() => {
        mapRef.current?.centerOnLayers();
      });
    }
  }, [applyWkt]);

  const handleCenter = useCallback(() => {
    mapRef.current?.centerOnLayers();
  }, []);

  return (
    <div className="flex h-screen w-screen">
      {/* Map panel - left side */}
      <div className="flex-1 min-w-0">
        <MapPanel
          ref={mapRef}
          onLayersChange={handleMapChange}
          externalLayers={isMapUpdateRef.current ? null : externalLayers}
          hoveredIndex={hoveredIndex}
          layerToStatement={layerToStatement}
        />
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-300" />

      {/* WKT editor - right side */}
      <div className="w-[420px] flex-shrink-0 border-l border-gray-200">
        <WktEditor
          value={wkt}
          onChange={handleTextChange}
          onPaste={handlePaste}
          onCenter={handleCenter}
          error={error}
          ranges={wktRanges}
          activeIndex={hoveredIndex}
          onHoverIndex={setHoveredIndex}
        />
      </div>
    </div>
  );
}

export default App;
