import { useState, useCallback, useRef } from 'react';
import L from 'leaflet';
import MapPanel from './components/MapPanel';
import WktEditor from './components/WktEditor';
import { parseMultiWkt } from './lib/wkt';

function App() {
  const [wkt, setWkt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [externalLayers, setExternalLayers] = useState<L.Layer[] | null>(null);
  const isMapUpdateRef = useRef(false);

  // Called when map layers change (draw/edit/delete)
  const handleMapChange = useCallback((newWkt: string) => {
    isMapUpdateRef.current = true;
    setWkt(newWkt);
    setError(null);
    // Reset after the state update propagates
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
