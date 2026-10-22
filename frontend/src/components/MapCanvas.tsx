import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Map, Marker, Popup, NavigationControl, type GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  Layers,
  Maximize2,
  Eye,
  EyeOff,
  HelpCircle,
  Map as MapIcon,
  Globe,
} from 'lucide-react';

import type { ScenarioSnapshot, RouteCandidate } from '../types';
import { SimulatedCityCanvas } from './SimulatedCityCanvas';

export interface MapCanvasProps {
  snapshot: ScenarioSnapshot | null;
  primaryRoute: RouteCandidate | null;
  selectedAlternative: RouteCandidate | null;
  onEdgeClick?: (edgeId: string) => void;
  onShelterClick?: (shelterId: string) => void;
}

// Bounding box enclosing all 12 Riverdale intersections, origins, and shelters
const RIVERDALE_BOUNDS: [[number, number], [number, number]] = [
  [74.868, 31.626], // Southwest [lon, lat]
  [74.888, 31.644], // Northeast [lon, lat]
];

// Available basemap tile styles
const TILE_STYLES = {
  dark: {
    name: 'Tactical Dark',
    tiles: ['https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png'],
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
  light: {
    name: 'Daylight OSM',
    tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
    attribution: '&copy; OpenStreetMap contributors',
  },
  voyager: {
    name: 'Voyager Clear',
    tiles: ['https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png'],
    attribution: '&copy; OpenStreetMap &copy; CARTO',
  },
};

export const MapCanvas: React.FC<MapCanvasProps> = ({
  snapshot,
  primaryRoute,
  selectedAlternative,
  onEdgeClick,
  onShelterClick,
}) => {
  const [mapMode, setMapMode] = useState<'simulated' | 'geographic'>('simulated');
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const activePopupRef = useRef<Popup | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [basemap, setBasemap] = useState<'dark' | 'light' | 'voyager'>('dark');
  const [legendOpen, setLegendOpen] = useState<boolean>(true);


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

    // 1. Shelter Markers: Blue/Green badge with building icon, name, and occupancy
    (currentSnapshot.shelters || []).forEach((shelter) => {
      const el = document.createElement('div');
      el.className = 'cursor-pointer group flex flex-col items-center select-none';

      const isFull = shelter.status?.toLowerCase() === 'full' || (shelter.occupancy || 0) >= (shelter.capacity || 1);
      const badgeBg = isFull ? 'bg-rose-600 border-rose-400' : 'bg-blue-600 border-blue-400';
      const countBg = isFull ? 'bg-rose-800' : 'bg-blue-800';

      el.innerHTML = `
        <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold text-white shadow-xl border ${badgeBg} whitespace-nowrap transition-transform duration-150 transform hover:scale-105">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="inline-block shrink-0">
            <path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/>
            <path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>
            <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/>
            <path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/>
          </svg>
          <span class="tracking-tight">${shelter.name}</span>
          <span class="${countBg} text-white px-1.5 py-0.5 rounded text-[10px] font-mono font-bold">${shelter.occupancy || 0}/${shelter.capacity}</span>
        </div>
        <div class="w-2 h-2 ${isFull ? 'bg-rose-600' : 'bg-blue-600'} rotate-45 -mt-1 shadow-sm"></div>
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

    // 2. Origin Markers: Amber badge with origin name & population
    (currentSnapshot.origins || []).forEach((origin) => {
      const el = document.createElement('div');
      el.className = 'flex flex-col items-center select-none pointer-events-none';

      el.innerHTML = `
        <div class="flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/90 text-slate-950 shadow-md border border-amber-300 whitespace-nowrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block shrink-0">
            <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          <span>${origin.name}</span>
          <span class="bg-amber-950/20 px-1 rounded text-[10px] font-mono">(${origin.population})</span>
        </div>
        <div class="w-1.5 h-1.5 bg-amber-500 rotate-45 -mt-0.5 shadow-sm"></div>
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

  // Fit camera bounds around the Riverdale network
  const handleFitBounds = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(RIVERDALE_BOUNDS, {
      padding: { top: 60, bottom: 90, left: 60, right: 60 },
      maxZoom: 15.5,
      duration: 800,
    });
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    try {
      const activeStyle = TILE_STYLES[basemap];
      const map = new Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {
            'base-tiles': {
              type: 'raster',
              tiles: activeStyle.tiles,
              tileSize: 256,
              attribution: activeStyle.attribution,
            },
          },
          layers: [
            {
              id: 'base-tiles-layer',
              type: 'raster',
              source: 'base-tiles',
              minzoom: 0,
              maxzoom: 19,
            },
          ],
        },
        center: [74.878, 31.635],
        zoom: 14.2,
      });

      map.addControl(new NavigationControl({ showCompass: true }), 'top-right');

      map.on('load', () => {
        // Fit network bounds on initial load
        map.fitBounds(RIVERDALE_BOUNDS, {
          padding: { top: 50, bottom: 90, left: 50, right: 50 },
          maxZoom: 15.5,
          duration: 0,
        });

        // 1. Flood source & layers: polygon fill and stroke
        map.addSource('flood-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        map.addLayer({
          id: 'flood-layer',
          type: 'fill',
          source: 'flood-source',
          paint: {
            'fill-color': 'rgba(14, 165, 233, 0.45)', // Sky/cyan inundation
            'fill-outline-color': '#0284c7',
          },
        });

        map.addLayer({
          id: 'flood-stroke-layer',
          type: 'line',
          source: 'flood-source',
          paint: {
            'line-color': '#0284c7',
            'line-width': 2.5,
          },
        });

        // 2. Roads source & layers
        map.addSource('roads-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // Background casing for high contrast against any base map
        map.addLayer({
          id: 'roads-casing-layer',
          type: 'line',
          source: 'roads-source',
          paint: {
            'line-color': '#020617',
            'line-width': 8,
            'line-opacity': 0.85,
          },
        });

        // Main road line layer with explicit status-based colors
        map.addLayer({
          id: 'roads-layer',
          type: 'line',
          source: 'roads-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': [
              'match',
              ['get', 'status'],
              'closed',
              '#ef4444', // Crimson for closed
              'caution',
              '#f59e0b', // Amber for caution
              'normal',
              '#10b981', // Emerald for normal passable
              '#10b981',
            ],
            'line-width': 5.5,
          },
        });

        // 3. Alternative route layer (dashed purple)
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

        // 4. Primary route glow and solid line
        map.addSource('primary-route-source', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });

        // Glowing cyan underlayer
        map.addLayer({
          id: 'primary-route-glow-layer',
          type: 'line',
          source: 'primary-route-source',
          layout: {
            'line-cap': 'round',
            'line-join': 'round',
          },
          paint: {
            'line-color': '#38bdf8',
            'line-width': 14,
            'line-opacity': 0.5,
            'line-blur': 4,
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
            'line-color': '#0284c7',
            'line-width': 7,
          },
        });

        // Edge click interaction
        map.on('click', 'roads-layer', (e: any) => {
          if (!e.features || e.features.length === 0) return;
          const feat = e.features[0];
          const props = (feat.properties || {}) as Record<string, any>;
          const edgeId = props.id || props.edge_id || 'Unknown Edge';

          if (propsRef.current.onEdgeClick) {
            propsRef.current.onEdgeClick(edgeId);
          }

          if (activePopupRef.current) {
            activePopupRef.current.remove();
          }

          const status = props.status || 'normal';
          const floodDepth = props.flood_depth_m !== undefined ? `${Number(props.flood_depth_m).toFixed(2)} m` : '0.00 m';
          const travelTime = props.travel_time_s !== undefined ? `${Math.round(Number(props.travel_time_s))} s` : 'N/A';
          const congestionRatio = props.congestion_ratio !== undefined ? Number(props.congestion_ratio) : 0;
          const congestion = `${Math.round(congestionRatio * 100)}%`;

          let statusBadgeColor = '#10b981';
          if (status === 'closed') {
            statusBadgeColor = '#ef4444';
          } else if (status === 'caution') {
            statusBadgeColor = '#f59e0b';
          }

          const popup = new Popup({
            closeButton: true,
            closeOnClick: true,
            maxWidth: '280px',
            className: 'saferoute-popup',
          })
            .setLngLat(e.lngLat)
            .setHTML(`
              <div style="font-family: ui-sans-serif, system-ui, sans-serif; color: #f8fafc; background: #0f172a; padding: 8px; border-radius: 8px; font-size: 12px; line-height: 1.4;">
                <div style="font-weight: 700; font-size: 13px; border-bottom: 1px solid #334155; padding-bottom: 5px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: #38bdf8;">${edgeId}</span>
                  <span style="background-color: ${statusBadgeColor}; color: white; font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 9999px; text-transform: uppercase;">
                    ${status}
                  </span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span style="color: #94a3b8;">Water Depth:</span>
                  <span style="font-weight: 600; color: #f8fafc;">${floodDepth}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span style="color: #94a3b8;">Travel Time:</span>
                  <span style="font-weight: 600; color: #f8fafc;">${travelTime}</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                  <span style="color: #94a3b8;">Congestion:</span>
                  <span style="font-weight: 600; color: #f8fafc;">${congestion}</span>
                </div>
                ${
                  props.has_stairs
                    ? '<div style="margin-top: 6px; padding: 3px 6px; background-color: rgba(245, 158, 11, 0.2); border: 1px solid #f59e0b; color: #fcd34d; border-radius: 4px; font-size: 10px; font-weight: 600;">Stairs: Inaccessible for Wheelchairs</div>'
                    : ''
                }
              </div>
            `)
            .addTo(map);

          activePopupRef.current = popup;
        });

        // Hover cursor
        map.on('mouseenter', 'roads-layer', () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', 'roads-layer', () => {
          map.getCanvas().style.cursor = '';
        });

        mapRef.current = map;
        syncMapSources();
      });
    } catch (err: any) {
      console.error('Failed to initialize MapLibre GL:', err);
      setMapError(err?.message || 'Failed to initialize WebGL map canvas');
    }

    // Auto-resize observer to handle flex layout shifts
    const containerEl = mapContainer.current;
    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.resize();
      }
    });
    if (containerEl) {
      resizeObserver.observe(containerEl);
    }

    // Cleanup
    return () => {
      resizeObserver.disconnect();
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

  // Update basemap tiles when user toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;

    const source = map.getSource('base-tiles') as any;
    if (source && source.setTiles) {
      source.setTiles(TILE_STYLES[basemap].tiles);
    }
  }, [basemap]);

  // Update sources whenever snapshot or route candidate props change
  useEffect(() => {
    syncMapSources();
  }, [snapshot, primaryRoute, selectedAlternative]);

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none">
      {/* Map Mode Switcher Pill */}
      <div className="absolute top-3 right-4 z-20 flex items-center bg-slate-900/95 border border-slate-700/80 rounded-xl p-1 shadow-2xl backdrop-blur-xl pointer-events-auto">
        <button
          type="button"
          onClick={() => setMapMode('simulated')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
            mapMode === 'simulated'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Simulated City Vector Map (100% Offline, Riverdale Cartography)"
        >
          <MapIcon className="w-3.5 h-3.5 text-cyan-300" />
          <span>Simulated Map</span>
        </button>
        <button
          type="button"
          onClick={() => setMapMode('geographic')}
          className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold rounded-lg transition cursor-pointer ${
            mapMode === 'geographic'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Geographic Street Map (MapLibre Tiles)"
        >
          <Globe className="w-3.5 h-3.5" />
          <span>Street Map</span>
        </button>
      </div>

      {mapMode === 'simulated' ? (
        <SimulatedCityCanvas
          snapshot={snapshot}
          primaryRoute={primaryRoute}
          selectedAlternative={selectedAlternative}
          onEdgeClick={onEdgeClick}
          onShelterClick={onShelterClick}
        />
      ) : (
        <>
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

          {/* Top Floating Map Controls: Focus Network & Basemap Switcher */}
          <div className="absolute top-4 left-4 z-10 flex items-center gap-2 pointer-events-auto">
            {/* Fit Network Bounds Button */}
            <button
              type="button"
              onClick={handleFitBounds}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700/80 shadow-xl backdrop-blur-md text-xs font-semibold transition active:scale-95 cursor-pointer"
              title="Center and fit Riverdale evacuation network in view"
            >
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>Focus Network</span>
            </button>

            {/* Basemap Style Switcher */}
            <div className="flex items-center bg-slate-900/90 border border-slate-700/80 rounded-xl p-1 shadow-xl backdrop-blur-md">
              <Layers className="w-3.5 h-3.5 text-slate-400 ml-1.5 mr-1 hidden sm:inline" />
              {(['dark', 'voyager', 'light'] as const).map((styleKey) => (
                <button
                  key={styleKey}
                  type="button"
                  onClick={() => setBasemap(styleKey)}
                  className={`px-2 py-1 text-[11px] font-bold rounded-lg transition capitalize cursor-pointer ${
                    basemap === styleKey
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {styleKey === 'dark' ? 'Tactical' : styleKey === 'voyager' ? 'Voyager' : 'Day'}
                </button>
              ))}
            </div>
          </div>

          {/* Collapsible Map Legend (Bottom-Left) */}
          <div className="absolute bottom-5 left-4 z-10 pointer-events-auto transition-all duration-200">
            {legendOpen ? (
              <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/80 rounded-xl p-3 text-xs text-slate-200 shadow-2xl space-y-2 max-w-[210px] animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                  <span className="font-bold text-slate-300 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <HelpCircle className="w-3 h-3 text-cyan-400" />
                    Map Legend
                  </span>
                  <button
                    type="button"
                    onClick={() => setLegendOpen(false)}
                    className="p-0.5 rounded text-slate-400 hover:text-white cursor-pointer"
                    title="Collapse Legend"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_#10b981]"></span>
                    <span className="text-[11px] text-slate-300">Road Passable</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-1.5 rounded-full bg-amber-500 shadow-[0_0_6px_#f59e0b]"></span>
                    <span className="text-[11px] text-slate-300">Road Caution</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_6px_#ef4444]"></span>
                    <span className="text-[11px] text-slate-300">Road Closed</span>
                  </div>
                </div>

                <div className="border-t border-slate-800 pt-1.5 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-2 rounded bg-sky-500/40 border border-sky-400"></span>
                    <span className="text-[11px] text-slate-300">Inundation Zone</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-1 bg-cyan-400 rounded-full shadow-[0_0_8px_#38bdf8]"></span>
                    <span className="text-[11px] text-slate-300">Primary Safe Route</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3.5 h-0.5 border-b-2 border-dashed border-purple-400"></span>
                    <span className="text-[11px] text-slate-300">Alternative Path</span>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLegendOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 shadow-xl backdrop-blur-md text-xs font-semibold transition cursor-pointer"
                title="Open Map Legend"
              >
                <Eye className="w-3.5 h-3.5 text-cyan-400" />
                <span>Map Legend</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default MapCanvas;

