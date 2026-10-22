import React, { useEffect, useRef, useState } from 'react';
import { Map, Marker, Popup, NavigationControl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ScenarioSnapshot, RouteCandidate } from '../types';

export interface MapCanvasProps {
  snapshot: ScenarioSnapshot | null;
  primaryRoute: RouteCandidate | null;
  selectedAlternative: RouteCandidate | null;
  onEdgeClick?: (edgeId: string) => void;
  onShelterClick?: (shelterId: string) => void;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  snapshot,
  primaryRoute,
  selectedAlternative,
  onEdgeClick,
  onShelterClick,
}) => {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const activePopupRef = useRef<Popup | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Store latest callbacks and props in ref for map event handlers
  const propsRef = useRef({
    snapshot,
    primaryRoute,
    selectedAlternative,
    onEdgeClick,
    onShelterClick,
  });

  useEffect(() => {
    propsRef.current = {
      snapshot,
      primaryRoute,
      selectedAlternative,
      onEdgeClick,
      onShelterClick,
    };
  });

  // Convert RouteCandidate geometry to GeoJSON FeatureCollection
  const toRouteGeoJSON = (route: RouteCandidate | null): any => {
    if (!route || !route.geometry) {
      return { type: 'FeatureCollection', features: [] };
    }

    const geom = route.geometry as any;
    if (geom.type === 'Feature') {
      return {
        type: 'FeatureCollection',
        features: [geom],
      };
    }

    return {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: {
            route_id: route.route_id,
            distance_m: route.distance_m,
            estimated_duration_s: route.estimated_duration_s,
            resilience_score: route.resilience_score,
          },
          geometry: geom,
        },
      ],
    };
  };

  // Update shelter and origin markers
  const updateMarkers = (currentSnapshot: ScenarioSnapshot | null) => {
    const map = mapRef.current;
    if (!map) return;

    // Remove old markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    if (!currentSnapshot) return;

    // 1. Shelter Markers: Blue badge with building icon, name, and occupancy (e.g. "320/500")
    (currentSnapshot.shelters || []).forEach((shelter) => {
      const el = document.createElement('div');
      el.className = 'cursor-pointer group flex flex-col items-center select-none';

      el.innerHTML = `
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-lg border border-blue-400 whitespace-nowrap transition-transform duration-150 transform hover:scale-105">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block shrink-0">
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
            <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
          </svg>
          <span class="tracking-tight">${shelter.name}</span>
          <span class="bg-blue-800/90 text-blue-100 px-1.5 py-0.5 rounded text-[10px] font-mono font-medium">${shelter.occupancy}/${shelter.capacity}</span>
        </div>
        <div class="w-2 h-2 bg-blue-600 rotate-45 -mt-1 shadow-sm"></div>
      `;

      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (propsRef.current.onShelterClick) {
          propsRef.current.onShelterClick(shelter.id);
        }
      });

      const marker = new Marker({ element: el })
        .setLngLat([shelter.lon, shelter.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    // 2. Origin Markers: Amber badge with origin name
    (currentSnapshot.origins || []).forEach((origin) => {
      const el = document.createElement('div');
      el.className = 'flex flex-col items-center select-none pointer-events-none';

      el.innerHTML = `
        <div class="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-amber-600 text-white shadow-md border border-amber-400 whitespace-nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block shrink-0">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span>${origin.name}</span>
        </div>
        <div class="w-1.5 h-1.5 bg-amber-600 rotate-45 -mt-0.5 shadow-sm"></div>
      `;

      const marker = new Marker({ element: el })
        .setLngLat([origin.lon, origin.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  };

  // Synchronize sources with current state
  const syncMapSources = () => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const currentSnapshot = propsRef.current.snapshot;
    const currentPrimary = propsRef.current.primaryRoute;
    const currentAlt = propsRef.current.selectedAlternative;

    // 1. Flood source
    const floodSource = map.getSource('flood-source') as GeoJSONSource | undefined;
    if (floodSource) {
      const floodData = (currentSnapshot && currentSnapshot.flood_geojson)
        ? (currentSnapshot.flood_geojson as any)
        : { type: 'FeatureCollection', features: [] };
      floodSource.setData(floodData);
    }

    // 2. Roads source
    const roadsSource = map.getSource('roads-source') as GeoJSONSource | undefined;
    if (roadsSource) {
      const roadsData = (currentSnapshot && currentSnapshot.edges_geojson)
        ? (currentSnapshot.edges_geojson as any)
        : { type: 'FeatureCollection', features: [] };
      roadsSource.setData(roadsData);
    }

    // 3. Alternative route source
    const altSource = map.getSource('alt-route-source') as GeoJSONSource | undefined;
    if (altSource) {
      altSource.setData(toRouteGeoJSON(currentAlt));
    }

    // 4. Primary route source
    const primSource = map.getSource('primary-route-source') as GeoJSONSource | undefined;
    if (primSource) {
      primSource.setData(toRouteGeoJSON(currentPrimary));
    }

    // Update DOM markers
    updateMarkers(currentSnapshot);
  };

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    try {
      const map = new Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'osm-tiles': {
              type: 'raster',
              tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© OpenStreetMap contributors',
            },
          },
          layers: [
            {
              id: 'osm-tiles-layer',
              type: 'raster',
              source: 'osm-tiles',
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        },
        center: [74.876, 31.635],
        zoom: 14.0,
      });

      map.addControl(new NavigationControl({ showCompass: true }), 'top-right');

    map.on('load', () => {
      // 1. flood-source & flood-layer: polygon fill rgba(59, 130, 246, 0.4) and line stroke #2563eb
      map.addSource('flood-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'flood-layer',
        type: 'fill',
        source: 'flood-source',
        paint: {
          'fill-color': 'rgba(59, 130, 246, 0.4)',
          'fill-outline-color': '#2563eb',
        },
      });

      map.addLayer({
        id: 'flood-stroke-layer',
        type: 'line',
        source: 'flood-source',
        paint: {
          'line-color': '#2563eb',
          'line-width': 2,
        },
      });

      // 2. roads-source & roads-layer: line layer with line-color: ['get', 'color'], line-width: 5
      map.addSource('roads-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Background casing for high contrast against raster base map
      map.addLayer({
        id: 'roads-casing-layer',
        type: 'line',
        source: 'roads-source',
        paint: {
          'line-color': '#0f172a',
          'line-width': 7,
          'line-opacity': 0.6,
        },
      });

      map.addLayer({
        id: 'roads-layer',
        type: 'line',
        source: 'roads-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': ['coalesce', ['get', 'color'], '#3b82f6'],
          'line-width': 5,
        },
      });

      // 3. alt-route-source & alt-route-layer: dashed line #c084fc, width 6, dasharray [2, 2]
      map.addSource('alt-route-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      map.addLayer({
        id: 'alt-route-layer',
        type: 'line',
        source: 'alt-route-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#c084fc',
          'line-width': 6,
          'line-dasharray': [2, 2],
        },
      });

      // 4. primary-route-source & primary-route-layer: glowing solid line #3b82f6, width 7
      map.addSource('primary-route-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });

      // Glowing underlayer
      map.addLayer({
        id: 'primary-route-glow-layer',
        type: 'line',
        source: 'primary-route-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#93c5fd',
          'line-width': 12,
          'line-opacity': 0.45,
          'line-blur': 3,
        },
      });

      map.addLayer({
        id: 'primary-route-layer',
        type: 'line',
        source: 'primary-route-source',
        layout: {
          'line-cap': 'round',
          'line-join': 'round',
        },
        paint: {
          'line-color': '#3b82f6',
          'line-width': 7,
        },
      });

      // Edge click interaction
      map.on('click', 'roads-layer', (e: any) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = (feat.properties || {}) as Record<string, any>;
        const edgeId = props.id || props.edge_id || 'Unknown Edge';

        // Trigger onEdgeClick callback
        if (propsRef.current.onEdgeClick) {
          propsRef.current.onEdgeClick(edgeId);
        }

        // Remove any prior active popup
        if (activePopupRef.current) {
          activePopupRef.current.remove();
        }

        const status = props.status || 'normal';
        const floodDepth = props.flood_depth_m !== undefined ? `${Number(props.flood_depth_m).toFixed(2)} m` : '0.00 m';
        const travelTime = props.travel_time_s !== undefined ? `${Math.round(Number(props.travel_time_s))} s` : 'N/A';
        const congestionRatio = props.congestion_ratio !== undefined ? Number(props.congestion_ratio) : 0;
        const congestion = `${Math.round(congestionRatio * 100)}%`;

        let statusBadgeColor = '#10b981'; // emerald
        if (status === 'closed') {
          statusBadgeColor = '#ef4444'; // red
        } else if (status === 'caution') {
          statusBadgeColor = '#f59e0b'; // amber
        }

        const popup = new Popup({
          closeButton: true,
          closeOnClick: true,
          maxWidth: '260px',
        })
          .setLngLat(e.lngLat)
          .setHTML(`
            <div style="font-family: ui-sans-serif, system-ui, sans-serif; color: #0f172a; padding: 4px; font-size: 12px; line-height: 1.4;">
              <div style="font-weight: 700; font-size: 13px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                <span>${edgeId}</span>
                <span style="background-color: ${statusBadgeColor}; color: white; font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 9999px; text-transform: uppercase;">
                  ${status}
                </span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #64748b;">Flood Depth:</span>
                <span style="font-weight: 600; color: #0f172a;">${floodDepth}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #64748b;">Travel Time:</span>
                <span style="font-weight: 600; color: #0f172a;">${travelTime}</span>
              </div>
              <div style="display: flex; justify-content: space-between; margin-bottom: 3px;">
                <span style="color: #64748b;">Congestion:</span>
                <span style="font-weight: 600; color: #0f172a;">${congestion}</span>
              </div>
              ${
                props.has_stairs
                  ? '<div style="margin-top: 6px; padding: 2px 6px; background-color: #fef3c7; border: 1px solid #fde68a; color: #92400e; border-radius: 4px; font-size: 10px; font-weight: 600;">Stairs Present (Not Wheelchair Accessible)</div>'
                  : ''
              }
            </div>
          `)
          .addTo(map);

        activePopupRef.current = popup;
      });

      // Hover cursor interaction
      map.on('mouseenter', 'roads-layer', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'roads-layer', () => {
        map.getCanvas().style.cursor = '';
      });

      mapRef.current = map;

      // Populate initial data once style is ready
      syncMapSources();
    });
    } catch (err: any) {
      console.error('Failed to initialize MapLibre GL:', err);
      setMapError(err?.message || 'Failed to initialize WebGL map canvas');
    }

    // Cleanup on unmount
    return () => {
      if (activePopupRef.current) {
        activePopupRef.current.remove();
        activePopupRef.current = null;
      }
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update sources whenever snapshot or route candidate props change
  useEffect(() => {
    syncMapSources();
  }, [snapshot, primaryRoute, selectedAlternative]);

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden">
      {mapError ? (
        <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-slate-300 space-y-3">
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-xl">
            <span className="font-bold text-sm">Map Canvas Fallback</span>
          </div>
          <p className="text-xs text-slate-400 max-w-md">
            WebGL is unavailable or restricted in this environment ({mapError}).
            You can still use the Safe Route Planner, Shelter Capacity Directory, and Time Slider in the controls panel.
          </p>
        </div>
      ) : (
        <div ref={mapContainer} className="w-full h-full" />
      )}

      {/* Map Legend Overlay */}
      <div className="absolute bottom-5 left-5 z-10 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-lg p-3 text-xs text-slate-200 shadow-2xl space-y-2 pointer-events-auto max-w-[220px]">
        <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wider">Map Legend</div>

        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1.5 rounded-full bg-emerald-500"></span>
            <span className="text-[11px]">Road Passable</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1.5 rounded-full bg-amber-500"></span>
            <span className="text-[11px]">Road Caution</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1.5 rounded-full bg-red-500"></span>
            <span className="text-[11px]">Road Closed</span>
          </div>
        </div>

        <div className="border-t border-slate-800 pt-1.5 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-2 rounded bg-blue-500/40 border border-blue-500"></span>
            <span className="text-[11px]">Inundation Zone</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1 bg-blue-500 rounded-full shadow-[0_0_6px_#3b82f6]"></span>
            <span className="text-[11px]">Primary Safe Route</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-0.5 border-b-2 border-dashed border-purple-400"></span>
            <span className="text-[11px]">Alternative Path</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MapCanvas;
