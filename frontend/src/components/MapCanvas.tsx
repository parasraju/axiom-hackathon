import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  Eye,
  EyeOff,
  Globe,
  HelpCircle,
  Layers,
  Map as MapIcon,
  Maximize2,
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

const RIVERDALE_BOUNDS: L.LatLngBoundsExpression = [
  [31.626, 74.868],
  [31.644, 74.888],
];

const TILE_STYLES = {
  dark: {
    name: 'Tactical',
    url: 'https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  voyager: {
    name: 'Voyager',
    url: 'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  light: {
    name: 'Day',
    url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
} as const;

type BasemapStyle = keyof typeof TILE_STYLES;
type GeoJsonData = Parameters<typeof L.geoJSON>[0];

const emptyFeatureCollection = {
  type: 'FeatureCollection',
  features: [],
} as const;

function routeFeatureCollection(route: RouteCandidate | null): GeoJsonData {
  if (!route?.geometry) return emptyFeatureCollection as GeoJsonData;

  const geometry = route.geometry as { type?: string; [key: string]: unknown };
  if (geometry.type === 'Feature') {
    return { type: 'FeatureCollection', features: [geometry] } as GeoJsonData;
  }

  return {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { route_id: route.route_id },
        geometry,
      },
    ],
  } as GeoJsonData;
}

function createEdgePopup(properties: Record<string, unknown>): HTMLElement {
  const popup = document.createElement('div');
  popup.className = 'saferoute-leaflet-popup';

  const title = document.createElement('div');
  title.className = 'saferoute-leaflet-popup-title';

  const edgeName = document.createElement('strong');
  edgeName.textContent = String(properties.id || properties.edge_id || 'Road segment');
  title.append(edgeName);

  const status = String(properties.status || 'normal');
  const badge = document.createElement('span');
  badge.className = `saferoute-leaflet-status saferoute-leaflet-status-${status}`;
  badge.textContent = status;
  title.append(badge);
  popup.append(title);

  const rows: [string, string][] = [
    ['Water depth', `${Number(properties.flood_depth_m || 0).toFixed(2)} m`],
    [
      'Travel time',
      properties.travel_time_s === undefined
        ? 'N/A'
        : `${Math.round(Number(properties.travel_time_s))} sec`,
    ],
    ['Congestion', `${Math.round(Number(properties.congestion_ratio || 0) * 100)}%`],
  ];

  rows.forEach(([label, value]) => {
    const row = document.createElement('div');
    row.className = 'saferoute-leaflet-popup-row';
    const labelNode = document.createElement('span');
    labelNode.textContent = label;
    const valueNode = document.createElement('strong');
    valueNode.textContent = value;
    row.append(labelNode, valueNode);
    popup.append(row);
  });

  if (properties.has_stairs) {
    const warning = document.createElement('div');
    warning.className = 'saferoute-leaflet-popup-warning';
    warning.textContent = 'Stairs: not wheelchair accessible';
    popup.append(warning);
  }

  return popup;
}

export const MapCanvas: React.FC<MapCanvasProps> = ({
  snapshot,
  primaryRoute,
  selectedAlternative,
  onEdgeClick,
  onShelterClick,
}) => {
  const [mapMode, setMapMode] = useState<'simulated' | 'geographic'>('simulated');
  const [basemap, setBasemap] = useState<BasemapStyle>('light');
  const [legendOpen, setLegendOpen] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tilesUnavailable, setTilesUnavailable] = useState(false);

  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const overlayLayersRef = useRef<L.LayerGroup | null>(null);
  const markerLayersRef = useRef<L.LayerGroup | null>(null);
  const tileErrorCountRef = useRef(0);
  const propsRef = useRef({ snapshot, primaryRoute, selectedAlternative, onEdgeClick, onShelterClick });

  useEffect(() => {
    propsRef.current = { snapshot, primaryRoute, selectedAlternative, onEdgeClick, onShelterClick };
  });

  const handleFitBounds = useCallback(() => {
    mapRef.current?.fitBounds(RIVERDALE_BOUNDS, {
      padding: [48, 48],
      maxZoom: 16,
      animate: true,
      duration: 0.65,
    });
  }, []);

  useEffect(() => {
    if (mapMode !== 'geographic' || !mapContainer.current || mapRef.current) return;

    let map: L.Map;
    try {
      map = L.map(mapContainer.current, {
        zoomControl: false,
        attributionControl: true,
        preferCanvas: true,
      }).fitBounds(RIVERDALE_BOUNDS, { padding: [48, 48], maxZoom: 16 });
      mapRef.current = map;

      L.control.zoom({ position: 'topright' }).addTo(map);
      overlayLayersRef.current = L.layerGroup().addTo(map);
      markerLayersRef.current = L.layerGroup().addTo(map);

      const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
      resizeObserver.observe(mapContainer.current);
      requestAnimationFrame(() => map.invalidateSize({ pan: false }));

      return () => {
        resizeObserver.disconnect();
        map.remove();
        mapRef.current = null;
        tileLayerRef.current = null;
        overlayLayersRef.current = null;
        markerLayersRef.current = null;
      };
    } catch (error) {
      console.error('Failed to initialize Leaflet map:', error);
      setMapError(error instanceof Error ? error.message : 'Unable to initialize the map.');
      return;
    }
  }, [mapMode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    tileLayerRef.current?.remove();
    tileErrorCountRef.current = 0;

    const style = TILE_STYLES[basemap];
    const tiles = L.tileLayer(style.url, {
      maxZoom: 19,
      attribution: style.attribution,
      crossOrigin: true,
    });
    tiles.on('tileerror', () => {
      tileErrorCountRef.current += 1;
      if (tileErrorCountRef.current >= 3) setTilesUnavailable(true);
    });
    tiles.on('tileload', () => {
      tileErrorCountRef.current = Math.max(0, tileErrorCountRef.current - 1);
      if (tileErrorCountRef.current < 3) setTilesUnavailable(false);
    });
    tiles.addTo(map);
    tileLayerRef.current = tiles;
  }, [basemap, mapMode]);

  useEffect(() => {
    const map = mapRef.current;
    const overlayLayers = overlayLayersRef.current;
    const markerLayers = markerLayersRef.current;
    if (!map || !overlayLayers || !markerLayers) return;

    overlayLayers.clearLayers();
    markerLayers.clearLayers();

    const floodData = (snapshot?.flood_geojson || emptyFeatureCollection) as GeoJsonData;
    L.geoJSON(floodData, {
      style: {
        color: '#0284c7',
        weight: 2,
        fillColor: '#38bdf8',
        fillOpacity: 0.26,
      },
    }).addTo(overlayLayers);

    const roadsData = (snapshot?.edges_geojson || emptyFeatureCollection) as GeoJsonData;
    L.geoJSON(roadsData, {
      style: (feature) => {
        const status = feature?.properties?.status;
        return {
          color: status === 'closed' ? '#ef4444' : status === 'caution' ? '#f59e0b' : '#059669',
          weight: 5,
          opacity: 0.9,
          lineCap: 'round',
          lineJoin: 'round',
        };
      },
      onEachFeature: (feature, layer) => {
        const properties = (feature.properties || {}) as Record<string, unknown>;
        layer.on('click', (event: L.LeafletMouseEvent) => {
          const edgeId = String(properties.id || properties.edge_id || 'Unknown Edge');
          propsRef.current.onEdgeClick?.(edgeId);
          L.popup({ maxWidth: 280, className: 'saferoute-leaflet-popup-container' })
            .setLatLng(event.latlng)
            .setContent(createEdgePopup(properties))
            .openOn(map);
        });
      },
    }).addTo(overlayLayers);

    L.geoJSON(routeFeatureCollection(selectedAlternative), {
      style: { color: '#8b7ac8', weight: 4, opacity: 0.9, dashArray: '7 7', lineCap: 'round' },
    }).addTo(overlayLayers);

    L.geoJSON(routeFeatureCollection(primaryRoute), {
      style: { color: '#0f9d8a', weight: 6, opacity: 1, lineCap: 'round', lineJoin: 'round' },
    }).addTo(overlayLayers);

    (snapshot?.shelters || []).forEach((shelter) => {
      if (!Number.isFinite(shelter.lat) || !Number.isFinite(shelter.lon)) return;
      const occupancy = shelter.occupancy || 0;
      const capacity = shelter.capacity || 0;
      const isFull = shelter.status?.toLowerCase() === 'full' || occupancy >= capacity;
      const markerContent = document.createElement('div');
      markerContent.className = `saferoute-shelter-marker${isFull ? ' is-full' : ''}`;

      const markerName = document.createElement('span');
      markerName.className = 'saferoute-shelter-name';
      markerName.textContent = shelter.name;
      const markerCount = document.createElement('span');
      markerCount.className = 'saferoute-shelter-count';
      markerCount.textContent = `${occupancy}/${capacity}`;
      markerContent.append(markerName, markerCount);

      const marker = L.marker([shelter.lat, shelter.lon], {
        icon: L.divIcon({
          className: 'saferoute-leaflet-div-icon',
          html: markerContent,
          iconSize: [0, 0],
          iconAnchor: [0, 16],
        }),
        keyboard: true,
        title: `${shelter.name}, ${occupancy} of ${capacity} places`,
      });
      marker.on('click', () => propsRef.current.onShelterClick?.(shelter.id));
      marker.addTo(markerLayers);
    });

    (snapshot?.origins || []).forEach((origin) => {
      if (!Number.isFinite(origin.lat) || !Number.isFinite(origin.lon)) return;
      const markerContent = document.createElement('div');
      markerContent.className = 'saferoute-origin-marker';
      markerContent.textContent = `${origin.name} · ${origin.population}`;
      L.marker([origin.lat, origin.lon], {
        icon: L.divIcon({
          className: 'saferoute-leaflet-div-icon',
          html: markerContent,
          iconSize: [0, 0],
          iconAnchor: [0, 16],
        }),
        interactive: false,
        title: origin.name,
      }).addTo(markerLayers);
    });
  }, [snapshot, primaryRoute, selectedAlternative, mapMode]);

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-[#071a1e]">
      <div className="pointer-events-auto absolute right-4 top-3 z-[1000] flex items-center rounded-lg border border-[#315256] bg-[#0b2226]/95 p-1 backdrop-blur">
        <button
          type="button"
          onClick={() => setMapMode('simulated')}
          aria-pressed={mapMode === 'simulated'}
          className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            mapMode === 'simulated' ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Open the offline Riverdale map"
        >
          <MapIcon className="h-3.5 w-3.5 text-teal-300" />
          <span>Simulated map</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setMapError(null);
            setTilesUnavailable(false);
            setMapMode('geographic');
          }}
          aria-pressed={mapMode === 'geographic'}
          className={`flex cursor-pointer items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold transition ${
            mapMode === 'geographic' ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-slate-200'
          }`}
          title="Open the geographic street map"
        >
          <Globe className="h-3.5 w-3.5" />
          <span>Street map</span>
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
          <div ref={mapContainer} className="h-full w-full" />

          {mapError && (
            <div role="alert" className="absolute inset-x-4 top-16 z-[1000] rounded-md border border-rose-700/70 bg-[#0b2226]/95 p-3 text-xs text-rose-100 shadow-lg">
              The street map could not be initialized: {mapError}
            </div>
          )}
          {tilesUnavailable && !mapError && (
            <div role="status" className="absolute bottom-10 left-3 z-[1000] max-w-xs rounded-md border border-amber-700/70 bg-[#0b2226]/95 px-3 py-2 text-[11px] text-amber-100 shadow-lg">
              Street map tiles are unavailable. Check your internet connection; the evacuation overlays remain available.
            </div>
          )}

          <div className="pointer-events-auto absolute left-3 top-3 z-[1000] flex max-w-[calc(100%-7rem)] flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleFitBounds}
              className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#315256] bg-[#0b2226]/95 px-3 py-1.5 text-xs font-medium text-slate-200 transition hover:bg-[#173a3e]"
              title="Center and fit the Riverdale evacuation network"
            >
              <Maximize2 className="h-3.5 w-3.5 text-teal-300" />
              <span className="hidden sm:inline">Focus network</span>
            </button>
            <div className="flex items-center rounded-md border border-[#315256] bg-[#0b2226]/95 p-1">
              <Layers className="ml-1.5 mr-1 hidden h-3.5 w-3.5 text-slate-400 sm:inline" />
              {(Object.keys(TILE_STYLES) as BasemapStyle[]).map((styleKey) => (
                <button
                  key={styleKey}
                  type="button"
                  onClick={() => {
                    setTilesUnavailable(false);
                    setBasemap(styleKey);
                  }}
                  aria-pressed={basemap === styleKey}
                  className={`cursor-pointer rounded px-2 py-1 text-[11px] font-medium transition ${
                    basemap === styleKey ? 'bg-teal-700 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {TILE_STYLES[styleKey].name}
                </button>
              ))}
            </div>
          </div>

          <div className="pointer-events-auto absolute bottom-5 left-4 z-[1000]">
            {legendOpen ? (
              <div className="max-w-[210px] space-y-2 rounded-lg border border-[#315256] bg-[#0b2226]/95 p-3 text-xs text-slate-200 shadow-xl backdrop-blur">
                <div className="flex items-center justify-between border-b border-[#244044] pb-1.5">
                  <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-200">
                    <HelpCircle className="h-3 w-3 text-teal-300" />
                    Map legend
                  </span>
                  <button
                    type="button"
                    onClick={() => setLegendOpen(false)}
                    className="cursor-pointer rounded p-0.5 text-slate-400 hover:text-white"
                    title="Collapse map legend"
                  >
                    <EyeOff className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="space-y-1.5">
                  <LegendItem color="bg-emerald-500" label="Road passable" />
                  <LegendItem color="bg-amber-500" label="Road caution" />
                  <LegendItem color="bg-red-500" label="Road closed" />
                  <LegendItem color="bg-sky-500" label="Flood zone" />
                  <LegendItem color="bg-teal-400" label="Primary safe route" />
                  <LegendItem color="bg-violet-400" label="Alternative route" />
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setLegendOpen(true)}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border border-[#315256] bg-[#0b2226]/95 px-3 py-1.5 text-xs font-medium text-slate-300 shadow-sm backdrop-blur transition hover:bg-[#173a3e] hover:text-white"
                title="Open map legend"
              >
                <Eye className="h-3.5 w-3.5 text-teal-300" />
                <span>Map legend</span>
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
};

const LegendItem: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <div className="flex items-center gap-2">
    <span className={`h-1.5 w-3.5 rounded-full ${color}`} />
    <span className="text-[11px] text-slate-300">{label}</span>
  </div>
);

export default MapCanvas;
