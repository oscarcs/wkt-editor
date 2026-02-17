import { useEffect, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
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

const defaultStyle: L.PathOptions = { color: '#3b82f6', weight: 3, fillColor: '#3b82f680' };
const highlightStyle: L.PathOptions = { color: '#ef4444', weight: 4, fillColor: '#ef444480' };

const defaultIcon = new L.Icon.Default();
const highlightIcon = new L.Icon.Default({ className: 'marker-highlight' });

interface MapPanelProps {
  onLayersChange: (wkt: string) => void;
  externalLayers: L.Layer[] | null;
  hoveredIndex: number | null;
  layerToStatement: number[];
}

export interface MapPanelHandle {
  centerOnLayers: () => void;
}

export default forwardRef<MapPanelHandle, MapPanelProps>(function MapPanel({ onLayersChange, externalLayers, hoveredIndex, layerToStatement }, ref) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const drawnItemsRef = useRef<L.FeatureGroup>(new L.FeatureGroup());
  const isExternalUpdateRef = useRef(false);

  const centerOnLayers = useCallback(() => {
    const map = mapRef.current;
    const drawnItems = drawnItemsRef.current;
    if (!map) return;
    const bounds = drawnItems.getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
    }
  }, []);

  useImperativeHandle(ref, () => ({ centerOnLayers }), [centerOnLayers]);

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
      crs: L.CRS.Simple,
    });

    // Graph paper grid background — pure pixel-based grid, tiles infinitely
    const GraphPaperLayer = L.GridLayer.extend({
      createTile(coords: L.Coords) {
        const tile = document.createElement('canvas');
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;
        const ctx = tile.getContext('2d')!;

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, size.x, size.y);

        const zoom = coords.z;
        // In CRS.Simple, 1 unit = 1px at zoom 0. At zoom z, 1 unit = 2^z px.
        const pixelsPerUnit = Math.pow(2, zoom);

        // Tile origin in pixels
        const tileOriginX = coords.x * size.x;
        const tileOriginY = coords.y * size.y;

        // Adaptive grid spacing in coordinate units
        let gridUnit = 1;
        if (zoom >= 10) gridUnit = 0.01;
        else if (zoom >= 7) gridUnit = 0.1;
        else if (zoom >= 4) gridUnit = 1;
        else gridUnit = 10;

        const gridPixels = pixelsPerUnit * gridUnit;

        // Only draw if grid lines are at least 8px apart
        if (gridPixels < 8) return tile;

        // Minor grid lines
        ctx.strokeStyle = '#e0e0e0';
        ctx.lineWidth = 0.5;
        ctx.beginPath();

        const startX = Math.floor(tileOriginX / gridPixels) * gridPixels;
        for (let px = startX; px <= tileOriginX + size.x; px += gridPixels) {
          const x = px - tileOriginX;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, size.y);
        }

        const startY = Math.floor(tileOriginY / gridPixels) * gridPixels;
        for (let py = startY; py <= tileOriginY + size.y; py += gridPixels) {
          const y = py - tileOriginY;
          ctx.moveTo(0, y);
          ctx.lineTo(size.x, y);
        }
        ctx.stroke();

        // Major grid lines (every 10x the minor spacing)
        const majorGridPixels = gridPixels * 10;
        if (majorGridPixels >= 20) {
          ctx.strokeStyle = '#c0c0c0';
          ctx.lineWidth = 1;
          ctx.beginPath();

          const majorStartX = Math.floor(tileOriginX / majorGridPixels) * majorGridPixels;
          for (let px = majorStartX; px <= tileOriginX + size.x; px += majorGridPixels) {
            const x = px - tileOriginX;
            ctx.moveTo(x, 0);
            ctx.lineTo(x, size.y);
          }

          const majorStartY = Math.floor(tileOriginY / majorGridPixels) * majorGridPixels;
          for (let py = majorStartY; py <= tileOriginY + size.y; py += majorGridPixels) {
            const y = py - tileOriginY;
            ctx.moveTo(0, y);
            ctx.lineTo(size.x, y);
          }
          ctx.stroke();
        }

        return tile;
      },
    });

    new (GraphPaperLayer as any)({ attribution: '' }).addTo(map);

    const drawnItems = drawnItemsRef.current;
    map.addLayer(drawnItems);

    const drawControlRef = { current: null as any };
    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polyline: { shapeOptions: { color: '#3b82f6', weight: 3 }, showLength: false },
        polygon: { shapeOptions: { color: '#3b82f6', fillColor: '#3b82f680', weight: 3 }, showArea: false, showLength: false },
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
    drawControlRef.current = drawControl;

    // Enter key finishes the current draw/edit action
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      // If the WKT textarea is focused, don't intercept
      if ((e.target as HTMLElement)?.tagName === 'TEXTAREA') return;

      const ctrl = drawControlRef.current;
      if (!ctrl) return;

      // Check draw toolbars for active drawing handler
      const drawToolbar = (ctrl as any)._toolbars?.draw;
      if (drawToolbar?._activeMode) {
        const handler = drawToolbar._activeMode.handler;
        // Polyline/Polygon have _finishShape
        if (typeof handler._finishShape === 'function') {
          handler._finishShape();
          return;
        }
        // For other draw modes, disable completes the action
        handler.disable();
        return;
      }

      // Check edit toolbar — click the Save button
      const editToolbar = (ctrl as any)._toolbars?.edit;
      if (editToolbar?._activeMode) {
        editToolbar._save();
        return;
      }
    };
    document.addEventListener('keydown', onKeyDown);

    map.on(L.Draw.Event.CREATED, (e: any) => {
      drawnItems.addLayer(e.layer);
      syncWkt();
    });

    map.on(L.Draw.Event.EDITED, () => syncWkt());
    map.on(L.Draw.Event.DELETED, () => syncWkt());

    mapRef.current = map;

    return () => {
      document.removeEventListener('keydown', onKeyDown);
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

    // Reset flag after a tick so future draw events fire normally
    requestAnimationFrame(() => {
      isExternalUpdateRef.current = false;
    });
  }, [externalLayers]);

  // Highlight hovered layer(s) — hoveredIndex is a statement index
  useEffect(() => {
    const drawnItems = drawnItemsRef.current;
    const layers: L.Layer[] = [];
    drawnItems.eachLayer(l => layers.push(l));

    layers.forEach((layer, i) => {
      const stmtIndex = layerToStatement[i];
      const isHovered = hoveredIndex !== null && stmtIndex === hoveredIndex;
      if (layer instanceof L.Marker) {
        layer.setIcon(isHovered ? highlightIcon : defaultIcon);
      } else if (layer instanceof L.Path) {
        layer.setStyle(isHovered ? highlightStyle : defaultStyle);
      }
    });
  }, [hoveredIndex, layerToStatement]);

  return (
    <div ref={mapContainerRef} className="h-full w-full" />
  );
});
