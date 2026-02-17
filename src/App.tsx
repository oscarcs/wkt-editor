import { useState, useCallback, useRef, useEffect } from 'react';
import L from 'leaflet';
import MapPanel from './components/MapPanel';
import WktEditor from './components/WktEditor';
import { parseMultiWkt } from './lib/wkt';

const STORAGE_KEY = 'wkt-editor-geometry';

function loadSavedWkt(): { wkt: string; layers: L.Layer[] | null } {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return { wkt: '', layers: null };
  try {
    const layers = parseMultiWkt(saved);
    return { wkt: saved, layers: layers.length > 0 ? layers : null };
  } catch {
    return { wkt: saved, layers: null };
  }
}

function App() {
  const initial = useRef(loadSavedWkt());
  const [wkt, setWkt] = useState(initial.current.wkt);
  const [error, setError] = useState<string | null>(null);
  const [externalLayers, setExternalLayers] = useState<L.Layer[] | null>(initial.current.layers);
  const isMapUpdateRef = useRef(false);

  // Persist WKT to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, wkt);
  }, [wkt]);

  // Called when map layers change (draw/edit/delete)
  const handleMapChange = useCallback((newWkt: string) => {
    isMapUpdateRef.current = true;
    setWkt(newWkt);
    setError(null);
    requestAnimationFrame(() => {
      isMapUpdateRef.current = false;
    });
  }, []);

  // Called when text editor changes
  const handleTextChange = useCallback((newWkt: string) => {
    setWkt(newWkt);

    if (!newWkt.trim()) {
      setError(null);
      setExternalLayers([]);
      return;
    }

    try {
      const layers = parseMultiWkt(newWkt);
      if (layers.length === 0 && newWkt.trim()) {
        setError('Could not parse WKT. Supported: POINT, LINESTRING, POLYGON');
      } else {
        setError(null);
      }
      setExternalLayers(layers);
    } catch (e) {
      setError(`Parse error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, []);

  return (
    <div className="flex h-screen w-screen">
      {/* Map panel - left side */}
      <div className="flex-1 min-w-0">
        <MapPanel
          onLayersChange={handleMapChange}
          externalLayers={isMapUpdateRef.current ? null : externalLayers}
        />
      </div>

      {/* Divider */}
      <div className="w-px bg-gray-300" />

      {/* WKT editor - right side */}
      <div className="w-[420px] flex-shrink-0 border-l border-gray-200">
        <WktEditor
          value={wkt}
          onChange={handleTextChange}
          error={error}
        />
      </div>
    </div>
  );
}

export default App;
