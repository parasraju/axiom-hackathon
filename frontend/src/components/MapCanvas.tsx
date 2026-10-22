import React, { useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ScenarioSnapshot, RouteCandidate } from '../types';

interface MapCanvasProps {
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
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);

  // Initialize Map
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors',
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
      zoom: 14.2,
      pitch: 15,
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    map.on('load', () => {
      // 1. Flood polygon source and layer
      map.addSource('flood-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'flood-fill',
        type: 'fill',
        source: 'flood-source',
        paint: {
          'fill-color': '#3b82f6',
          'fill-opacity': 0.45,
        },
      });
      map.addLayer({
        id: 'flood-stroke',
        type: 'line',
        source: 'flood-source',
        paint: {
          'line-color': '#1d4ed8',
          'line-width': 2.5,
        },
      });

      // 2. Road Network source and layer
      map.addSource('roads-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'roads-casing',
        type: 'line',
        source: 'roads-source',
        paint: {
          'line-color': '#0f172a',
          'line-width': 7,
          'line-opacity': 0.6,
        },
      });
      map.addLayer({
        id: 'roads-line',
        type: 'line',
        source: 'roads-source',
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 5,
        },
      });

      // 3. Alternative Route layer (Dashed purple)
      map.addSource('alt-route-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'alt-route-line',
        type: 'line',
        source: 'alt-route-source',
        paint: {
          'line-color': '#a855f7',
          'line-width': 6,
          'line-dasharray': [2, 2],
        },
      });

      // 4. Primary Safe Route layer (Vibrant Blue/Indigo)
      map.addSource('primary-route-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'primary-route-glow',
        type: 'line',
        source: 'primary-route-source',
        paint: {
          'line-color': '#60a5fa',
          'line-width': 9,
          'line-opacity': 0.5,
        },
      });
      map.addLayer({
        id: 'primary-route-line',
        type: 'line',
        source: 'primary-route-source',
        paint: {
          'line-color': '#2563eb',
          'line-width': 5.5,
        },
      });

      // Interactive road click popup
      map.on('click', 'roads-line', (e: any) => {
        if (!e.features || !e.features[0]) return;
        const feat = e.features[0];
        const props = feat.properties as any;
        const edgeId = props.id;

        if (onEdgeClick) onEdgeClick(edgeId);

        new maplibregl.Popup()
          .setLngLat(e.lngLat)
          .setHTML(`
            <div class="p-2 text-slate-900 text-xs">
              <div class="font-bold text-sm border-b pb-1 mb-1">${edgeId}</div>
              <div><b>Status:</b> <span class="capitalize font-semibold text-${props.status === 'closed' ? 'red' : props.status === 'caution' ? 'amber' : 'emerald'}-600">${props.status}</span></div>
              <div><b>Flood Water:</b> ${props.flood_depth_m} m</div>
              <div><b>Congestion:</b> ${(props.congestion_ratio * 100).toFixed(0)}%</div>
              <div><b>Travel Time:</b> ${props.travel_time_s} s</div>
              ${props.has_stairs ? '<div class="text-amber-700 font-semibold mt-1">Stairs (Inaccessible for Wheelchair)</div>' : ''}
            </div>
          `)
          .addTo(map);
      });

      map.on('mouseenter', 'roads-line', () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', 'roads-line', () => {
        map.getCanvas().style.cursor = '';
      });

      mapRef.current = map;
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Update Road and Flood data when snapshot changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !snapshot) return;

    // Update Roads GeoJSON
    const roadsSource = map.getSource('roads-source') as maplibregl.GeoJSONSource;
    if (roadsSource && snapshot.edges_geojson) {
      roadsSource.setData(snapshot.edges_geojson);
    }

    // Update Flood GeoJSON
    const floodSource = map.getSource('flood-source') as maplibregl.GeoJSONSource;
    if (floodSource && snapshot.flood_geojson) {
      floodSource.setData(snapshot.flood_geojson);
    }

    // Update HTML Markers (Shelters & Origins)
    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    // Add Shelter markers
    snapshot.shelters.forEach((shelter) => {
      const el = document.createElement('div');
      el.className = 'cursor-pointer group flex flex-col items-center';
      const isFull = shelter.occupancy >= shelter.capacity;
      const pct = Math.round((shelter.occupancy / shelter.capacity) * 100);

      el.innerHTML = `
        <div class="px-2 py-0.5 rounded-full text-[10px] font-bold shadow-md border ${
          isFull
            ? 'bg-red-600 text-white border-red-400'
            : 'bg-emerald-600 text-white border-emerald-400'
        } whitespace-nowrap">
          ${shelter.name.split(' ')[0]} ${shelter.occupancy}/${shelter.capacity} (${pct}%)
        </div>
        <div class="w-3.5 h-3.5 bg-blue-600 border-2 border-white rounded-full shadow-lg -mt-1"></div>
      `;

      el.onclick = () => {
        if (onShelterClick) onShelterClick(shelter.id);
      };

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([shelter.lon, shelter.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });

    // Add Origin markers
    snapshot.origins.forEach((origin) => {
      const el = document.createElement('div');
      el.className = 'flex flex-col items-center';
      el.innerHTML = `
        <div class="px-1.5 py-0.5 rounded bg-amber-600 text-white text-[10px] font-bold shadow border border-amber-300 whitespace-nowrap">
          ${origin.name.split(' ')[0]} (${origin.population})
        </div>
        <div class="w-2.5 h-2.5 bg-amber-500 border border-white rounded-full -mt-0.5"></div>
      `;

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([origin.lon, origin.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }, [snapshot]);

  // Update Route Layers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Primary route
    const primSource = map.getSource('primary-route-source') as maplibregl.GeoJSONSource;
    if (primSource) {
      if (primaryRoute && primaryRoute.geometry) {
        primSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: primaryRoute.geometry as any,
            },
          ],
        });
      } else {
        primSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }

    // Alternative route
    const altSource = map.getSource('alt-route-source') as maplibregl.GeoJSONSource;
    if (altSource) {
      if (selectedAlternative && selectedAlternative.geometry) {
        altSource.setData({
          type: 'FeatureCollection',
          features: [
            {
              type: 'Feature',
              properties: {},
              geometry: selectedAlternative.geometry as any,
            },
          ],
        });
      } else {
        altSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  }, [primaryRoute, selectedAlternative]);

  return (
    <div className="relative w-full h-full bg-slate-950">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Floating Map Legend */}
      <div className="absolute bottom-4 left-4 z-10 bg-slate-900/90 backdrop-blur-md border border-slate-800 rounded-lg p-3 text-xs text-slate-200 shadow-xl space-y-1.5 pointer-events-auto">
        <div className="font-semibold text-slate-300 text-[11px] uppercase tracking-wider mb-1">Road Passability</div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-1.5 rounded-full bg-emerald-500"></span>
          <span>Passable (Normal)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-1.5 rounded-full bg-amber-500"></span>
          <span>Caution / Minor Inundation</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-1.5 rounded-full bg-red-500"></span>
          <span>Closed / Flood Depth Exceeded</span>
        </div>
        <div className="border-t border-slate-800 my-1.5 pt-1.5">
          <div className="flex items-center gap-2">
            <span className="w-3.5 h-1.5 bg-blue-500"></span>
            <span>Primary Recommended Route</span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="w-3.5 h-1.5 border-b border-dashed border-purple-400"></span>
            <span>Alternative Feasible Path</span>
          </div>
        </div>
      </div>
    </div>
  );
};
