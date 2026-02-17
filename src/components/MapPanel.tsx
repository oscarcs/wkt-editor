import { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet-draw';
import { layerToWkt } from '../lib/wkt';

// Fix default marker icon paths (webpack/vite asset issue)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface MapPanelProps {
  onLayersChange: (wkt: string) => void;
  externalLayers: L.Layer[] | null; // layers parsed from WKT text input
}

export default function MapPanel({ onLayersChange, externalLayers }: MapPanelProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const isExternalUpdateRef = useRef(false);

  const syncWkt = useCallback(() => {
    if (isExternalUpdateRef.current) return;
    const layers: L.Layer[] = [];
    drawnItemsRef.current.eachLayer(l => layers.push(l));
    const wktParts = layers.map(layerToWkt).filter(Boolean);
    onLayersChange(wktParts.join('\n'));
  }, [onLayersChange]);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [0, 0],
      zoom: 3,
      zoomControl: true,
    });

    // Blank/minimal canvas - light gray background with grid
    const blankLayer = L.tileLayer('', { attribution: '' });
    blankLayer.addTo(map);

    // Set a light background via CSS on the map container
    mapContainerRef.current.style.backgroundColor = '#f0f0f0';

    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polyline: { shapeOptions: { color: '#3b82f6', weight: 3 } },
        polygon: { shapeOptions: { color: '#3b82f6', fillColor: '#3b82f680', weight: 3 } },
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: {},
      },
      edit: {
        featureGroup: drawnItems,
      },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawnItems.addLayer(e.layer);
      syncWkt();
    });

    map.on(L.Draw.Event.EDITED, () => syncWkt());
    map.on(L.Draw.Event.DELETED, () => syncWkt());

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [syncWkt]);

  // Handle external layers (from WKT text input)
  useEffect(() => {
    if (!externalLayers || !mapRef.current) return;

    isExternalUpdateRef.current = true;
    const drawnItems = drawnItemsRef.current;
    drawnItems.clearLayers();

    for (const layer of externalLayers) {
      drawnItems.addLayer(layer);
    }

    // Fit bounds if there are layers
    if (externalLayers.length > 0) {
      const bounds = drawnItems.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
      }
    }

    // Reset flag after a tick so future draw events fire normally
    requestAnimationFrame(() => {
      isExternalUpdateRef.current = false;
    });
  }, [externalLayers]);

  return (
    <div ref={mapContainerRef} className="h-full w-full" />
  );
}
