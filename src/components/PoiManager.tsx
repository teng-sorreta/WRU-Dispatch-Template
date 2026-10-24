import React, { useState, useMemo, useRef, useEffect } from 'react';
import { POICategory, POI } from '../types';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { 
  Search, 
  MapPin, 
  Compass, 
  Layers, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Info, 
  Radio, 
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Map as MapIcon,
  Tag,
  SlidersHorizontal,
  Compass as CompassIcon
} from 'lucide-react';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(API_KEY) && API_KEY !== 'YOUR_API_KEY';

const BRAND_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#8cc441" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#8cc441" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#0f172a" }] },
  {
    featureType: "administrative.locality",
    elementType: "labels.text.fill",
    stylers: [{ color: "#000000" }],
  },
  {
    featureType: "poi",
    elementType: "labels.text.fill",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "poi.park",
    elementType: "geometry",
    stylers: [{ color: "#7cb036" }],
  },
  {
    featureType: "poi.park",
    elementType: "labels.text.fill",
    stylers: [{ color: "#0f172a" }],
  },
  {
    featureType: "road",
    elementType: "geometry",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "road",
    elementType: "geometry.stroke",
    stylers: [{ color: "#cbd5e1" }],
  },
  {
    featureType: "road",
    elementType: "labels.text.fill",
    stylers: [{ color: "#334155" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry",
    stylers: [{ color: "#f8fafc" }],
  },
  {
    featureType: "road.highway",
    elementType: "geometry.stroke",
    stylers: [{ color: "#94a3b8" }],
  },
  {
    featureType: "road.highway",
    elementType: "labels.text.fill",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "transit",
    elementType: "geometry",
    stylers: [{ color: "#7cb036" }],
  },
  {
    featureType: "transit.station",
    elementType: "labels.text.fill",
    stylers: [{ color: "#0f172a" }],
  },
  {
    featureType: "water",
    elementType: "geometry",
    stylers: [{ color: "#1e293b" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.fill",
    stylers: [{ color: "#ffffff" }],
  },
  {
    featureType: "water",
    elementType: "labels.text.stroke",
    stylers: [{ color: "#1e293b" }],
  },
];

interface PoiMapControlHandlerProps {
  zoomInTrigger: number;
  zoomOutTrigger: number;
  resetTrigger: number;
  selectedPoi: POI | null;
  pois: POI[];
}

function PoiMapControlHandler({ 
  zoomInTrigger, 
  zoomOutTrigger, 
  resetTrigger, 
  selectedPoi,
  pois
}: PoiMapControlHandlerProps) {
  const map = useMap();
  const lastFocusedIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (map && zoomInTrigger > 0) {
      map.setZoom((map.getZoom() || 11) + 1);
    }
  }, [zoomInTrigger, map]);

  useEffect(() => {
    if (map && zoomOutTrigger > 0) {
      map.setZoom((map.getZoom() || 11) - 1);
    }
  }, [zoomOutTrigger, map]);

  useEffect(() => {
    if (map && resetTrigger > 0 && typeof google !== 'undefined') {
      if (pois.length > 0) {
        const boundsInstance = new google.maps.LatLngBounds();
        let validCount = 0;
        pois.forEach(p => {
          if (p.position && p.position.latitude && p.position.longitude) {
            boundsInstance.extend({ lat: p.position.latitude, lng: p.position.longitude });
            validCount++;
          }
        });
        if (validCount > 0) {
          map.fitBounds(boundsInstance);
        } else {
          map.setZoom(11);
        }
      } else {
        map.setZoom(11);
      }
    }
  }, [resetTrigger, map, pois]);

  useEffect(() => {
    if (map && selectedPoi) {
      if (lastFocusedIdRef.current !== selectedPoi.id) {
        map.panTo({ lat: selectedPoi.position.latitude, lng: selectedPoi.position.longitude });
        map.setZoom(14);
        lastFocusedIdRef.current = selectedPoi.id;
      }
    } else {
      lastFocusedIdRef.current = null;
    }
  }, [selectedPoi, map]);

  // Fit bounds when map or POIs update
  useEffect(() => {
    if (map && pois.length > 0 && typeof google !== 'undefined') {
      const boundsInstance = new google.maps.LatLngBounds();
      let validCount = 0;
      pois.forEach(p => {
        if (p.position && p.position.latitude && p.position.longitude) {
          boundsInstance.extend({ lat: p.position.latitude, lng: p.position.longitude });
          validCount++;
        }
      });
      if (validCount > 0) {
        map.fitBounds(boundsInstance);
      }
    }
  }, [pois, map]);

  return null;
}

interface PoiManagerProps {
  onNotify?: (type: 'success' | 'warning' | 'error' | 'info', message: string) => void;
}

export default function PoiManager({ onNotify }: PoiManagerProps) {
  // Category & POI list states
  const [categories, setCategories] = useState<POICategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [selectedPoiId, setSelectedPoiId] = useState<number | null>(null);

  // Filter state
  const [searchTerm, setSearchTerm] = useState('');

  // UI States
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingPois, setLoadingPois] = useState(false);
  const [isCycling, setIsCycling] = useState(false);
  const [checkingCategoryName, setCheckingCategoryName] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showSatelliteOverlay, setShowSatelliteOverlay] = useState(false);
  const [sourceType, setSourceType] = useState<string>('simulation');

  // Trigger states for map controls
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Local log trace console
  const [simulatedLog, setSimulatedLog] = useState<string[]>(["POI Manager initialized. Ready to query GpsGate."]);

  // Dynamic Google Maps key from server
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/maps-key')
      .then(res => res.json())
      .then(data => {
        if (data.key) {
          setApiKey(data.key);
        } else {
          setApiKey(API_KEY);
        }
      })
      .catch(() => {
        setApiKey(API_KEY);
      });
  }, []);

  const logPoiEvent = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setSimulatedLog(prev => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // Fetch Categories on Mount
  useEffect(() => {
    const fetchCategories = async () => {
      setLoadingCategories(true);
      setErrorText(null);
      try {
        const response = await fetch('/api/poi-categories');
        const resJson = await response.json();
        if (resJson.success) {
          setCategories(resJson.data);
          setSourceType(resJson.source);
          if (resJson.data.length > 0) {
            setSelectedCategoryId(resJson.data[0].id);
          }
          logPoiEvent(`Loaded ${resJson.data.length} POI Categories from backend (${resJson.source}).`);
        } else {
          throw new Error(resJson.message || 'Failed loading POI Categories');
        }
      } catch (err: any) {
        console.error("Error fetching categories", err);
        setErrorText(err.message);
        if (onNotify) onNotify('error', `Failed to load POI categories: ${err.message}`);
      } finally {
        setLoadingCategories(false);
      }
    };

    fetchCategories();
  }, []);

  // Fetch POIs when category changes
  useEffect(() => {
    if (selectedCategoryId === null) return;

    const activeCat = categories.find(c => c.id === selectedCategoryId);
    const catName = activeCat ? activeCat.name : 'Category';

    const fetchPois = async () => {
      setLoadingPois(true);
      setSelectedPoiId(null);
      try {
        const response = await fetch(`/api/poi-categories/${selectedCategoryId}/pois?name=${encodeURIComponent(catName)}`);
        const resJson = await response.json();
        if (resJson.success) {
          setPois(resJson.data);
          logPoiEvent(`Loaded ${resJson.data.length} POI records for category "${catName}" (ID: ${selectedCategoryId}).`);
        } else {
          throw new Error(resJson.message || 'Failed loading POIs');
        }
      } catch (err: any) {
        console.error("Error fetching POIs", err);
        if (onNotify) onNotify('error', `Failed to load POIs: ${err.message}`);
      } finally {
        setLoadingPois(false);
      }
    };

    fetchPois();
  }, [selectedCategoryId, categories]);

  // Filtered POIs by Search Term
  const filteredPois = useMemo(() => {
    return pois.filter(p => {
      return (
        p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
        String(p.id).includes(searchTerm)
      );
    });
  }, [pois, searchTerm]);

  // Active Selected POI Details
  const selectedPoi = useMemo(() => {
    return pois.find(p => p.id === selectedPoiId) || null;
  }, [pois, selectedPoiId]);

  // Active Category Details
  const selectedCategory = useMemo(() => {
    return categories.find(c => c.id === selectedCategoryId) || null;
  }, [categories, selectedCategoryId]);

  // Compute map center
  const mapCenter = useMemo(() => {
    if (pois.length > 0) {
      const valid = pois.filter(p => p.position && p.position.latitude && p.position.longitude);
      if (valid.length > 0) {
        return {
          lat: valid[0].position.latitude,
          lng: valid[0].position.longitude
        };
      }
    }
    return { lat: 14.5995, lng: 120.9842 }; // Manila fallback
  }, [pois]);

  const handleSelectPoi = (p: POI) => {
    setSelectedPoiId(p.id);
    logPoiEvent(`Focused map onto POI: ${p.name} [Lat: ${p.position.latitude.toFixed(5)}, Lng: ${p.position.longitude.toFixed(5)}]`);
  };

  const handleSearchAllCategories = async () => {
    if (categories.length <= 1) {
      if (onNotify) onNotify('info', 'No other categories available to search.');
      return;
    }
    setIsCycling(true);
    let matchFound = false;

    const currentIdx = categories.findIndex(c => c.id === selectedCategoryId);
    const orderedCategories = currentIdx !== -1
      ? [
          ...categories.slice(currentIdx + 1),
          ...categories.slice(0, currentIdx)
        ]
      : categories;

    for (const cat of orderedCategories) {
      setCheckingCategoryName(cat.name);
      logPoiEvent(`Scanning category "${cat.name}" for matches...`);
      try {
        const response = await fetch(`/api/poi-categories/${cat.id}/pois?name=${encodeURIComponent(cat.name)}`);
        const resJson = await response.json();
        if (resJson.success && Array.isArray(resJson.data)) {
          const matched = resJson.data.filter((p: POI) => {
            return (
              p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
              String(p.id).includes(searchTerm)
            );
          });
          if (matched.length > 0) {
            logPoiEvent(`Match found in category "${cat.name}"! Switching category.`);
            if (onNotify) onNotify('success', `Found match in category "${cat.name}"!`);
            setSelectedCategoryId(cat.id);
            matchFound = true;
            break;
          }
        }
      } catch (err) {
        console.error(`Error checking category ${cat.name}`, err);
      }
    }

    if (!matchFound) {
      logPoiEvent(`No matches found for "${searchTerm}" in any category.`);
      if (onNotify) onNotify('warning', `No matches found for "${searchTerm}" in any category.`);
    }
    setIsCycling(false);
    setCheckingCategoryName('');
  };

  const handleZoomIn = () => setZoomInTrigger(p => p + 1);
  const handleZoomOut = () => setZoomOutTrigger(p => p + 1);
  const handleResetView = () => setResetTrigger(p => p + 1);

  return (
    <div id="poi_manager_container" className="h-[calc(100vh-10rem)] w-full flex flex-col bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* HUD CONTROL HEADER BAR */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2 font-sans">
              <MapPin className="w-5 h-5 text-blue-600" />
              Points of Interests (POIs)
            </h1>
            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase ${
              sourceType === 'live' 
                ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' 
                : 'bg-amber-100 text-amber-800 border border-amber-200'
            }`}>
              {sourceType === 'live' ? 'Live WRU' : 'Simulated DB'}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono mt-0.5">
            Retrieve Point of Interest (POI) databases dynamically and project them onto high-contrast vector layers.
          </p>
        </div>

        {/* Category switcher dropdown in header */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            Category:
          </label>
          <select
            value={selectedCategoryId || ''}
            onChange={(e) => setSelectedCategoryId(Number(e.target.value))}
            className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 transition shadow-xs cursor-pointer min-w-[200px]"
          >
            {loadingCategories ? (
              <option>Loading categories...</option>
            ) : categories.length === 0 ? (
              <option>No Categories Available</option>
            ) : (
              categories.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.name} ({cat.id})
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      {/* BODY SPLIT CONTAINER */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative min-h-0">
        
        {/* LEFT SIDEBAR: POIs Registry List */}
        <div className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 min-h-0 h-[320px] md:h-full">
          
          {/* Active Category Meta Details */}
          {selectedCategory && (
            <div className="p-3 bg-slate-50 border-b border-slate-200/60 flex items-center justify-between text-xs font-medium text-slate-600 gap-2 shrink-0">
              <div className="truncate">
                <span className="font-extrabold text-slate-800 uppercase block truncate">{selectedCategory.name}</span>
                <span className="text-[9px] text-slate-400 font-mono block truncate">{selectedCategory.description || "No description provided."}</span>
              </div>
              <span 
                className="w-3 h-3 rounded-full shrink-0 shadow-xs border border-white"
                style={{ backgroundColor: selectedCategory.color || '#3b82f6' }}
                title={`Marker Theme Color: ${selectedCategory.color || '#3b82f6'}`}
              />
            </div>
          )}

          {/* Search box header */}
          <div className="p-3 border-b border-slate-100 bg-white shrink-0 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter active category POIs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition font-medium text-slate-700"
            />
          </div>

          {/* List Viewport */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0">
            {loadingPois ? (
              <div className="p-12 text-center text-slate-400 font-medium text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                <span>Loading active POIs from GpsGate...</span>
              </div>
            ) : filteredPois.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-mono text-[11px] flex flex-col items-center justify-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <span>{pois.length === 0 ? 'No records returned for this category.' : 'No POIs matched search filter.'}</span>
                {pois.length > 0 && (
                  <button
                    onClick={handleSearchAllCategories}
                    disabled={isCycling}
                    className="mt-3 cursor-pointer text-blue-600 hover:text-blue-800 transition flex items-center justify-center gap-1.5 focus:outline-none"
                  >
                    <h3 className="text-xs font-black uppercase tracking-wider font-sans hover:underline">
                      {isCycling ? `Searching: ${checkingCategoryName}...` : 'Search All Categories'}
                    </h3>
                  </button>
                )}
              </div>
            ) : (
              filteredPois.map((p) => {
                const isSelected = p.id === selectedPoiId;
                return (
                  <button
                    key={p.id}
                    onClick={() => handleSelectPoi(p)}
                    className={`w-full text-left p-3 flex items-start gap-2.5 transition select-none cursor-pointer border-l-3 ${
                      isSelected 
                        ? 'bg-blue-50/60 border-blue-500' 
                        : 'hover:bg-slate-50 border-transparent'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-slate-500">
                      <MapPin 
                        className="w-4 h-4" 
                        style={{ color: selectedCategory?.color || '#3b82f6' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight truncate block">
                          {p.name}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${isSelected ? 'translate-x-0.5 text-blue-500' : ''}`} />
                      </div>
                      {p.description && (
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {p.description}
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Badge footer with loaded stats */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400 font-mono shrink-0">
            <span>Category Count: {categories.length}</span>
            <span>POIs Loaded: {filteredPois.length}</span>
          </div>
        </div>

        {/* RIGHT INTERACTIVE MAP SYSTEM */}
        <div className="flex-1 h-full relative flex flex-col min-w-0 bg-slate-100">
          
          {/* Map floating control headers */}
          <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-2">
            {/* Zoom controls with BRAND color background */}
            <div className="bg-[#8cc441] border border-slate-800/20 rounded-lg p-1 flex items-center gap-1 shadow-xl">
              <button
                onClick={handleZoomIn}
                className="p-1.5 hover:bg-black/10 rounded text-slate-950 cursor-pointer transition active:scale-95"
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleZoomOut}
                className="p-1.5 hover:bg-black/10 rounded text-slate-950 cursor-pointer transition active:scale-95"
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetView}
                className="p-1.5 hover:bg-black/10 rounded text-slate-950 cursor-pointer transition active:scale-95 text-xs font-mono font-bold px-2.5 flex items-center gap-1"
                title="Reset View Boundaries"
              >
                <Maximize2 className="w-3 h-3" />
                <span>Fit</span>
              </button>
            </div>

            {/* Satellite vs Street mode with BRAND color background */}
            <div className="bg-[#8cc441] border border-slate-800/20 rounded-lg p-1 flex items-center shadow-xl">
              <button
                onClick={() => {
                  setShowSatelliteOverlay(prev => !prev);
                  logPoiEvent(`Map display swapped to ${!showSatelliteOverlay ? 'Satellite Imagery' : 'Street Mode'}`);
                }}
                className={`p-1.5 px-3 rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer transition ${
                  showSatelliteOverlay 
                    ? 'bg-slate-950 text-[#8cc441]' 
                    : 'text-slate-950 hover:bg-black/10'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>{showSatelliteOverlay ? 'Satellite Mode' : 'Street Mode'}</span>
              </button>
            </div>
          </div>

          {/* MAP CANVAS CONTAINER */}
          <div className="flex-1 h-full w-full relative outline-none overflow-hidden select-none min-h-[350px]">
            {apiKey !== null ? (
              <APIProvider apiKey={apiKey || ''} version="weekly">
                <Map
                  id="gmp-poi-map"
                  defaultCenter={mapCenter}
                  defaultZoom={11}
                  mapId="DEMO_MAP_ID"
                  mapTypeId={showSatelliteOverlay ? 'hybrid' : 'roadmap'}
                  styles={showSatelliteOverlay ? undefined : BRAND_MAP_STYLE}
                  disableDefaultUI={true}
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  <PoiMapControlHandler 
                    zoomInTrigger={zoomInTrigger}
                    zoomOutTrigger={zoomOutTrigger}
                    resetTrigger={resetTrigger}
                    selectedPoi={selectedPoi}
                    pois={pois}
                  />

                  {pois.map((p) => {
                    const isSelected = p.id === selectedPoiId;
                    const markerColor = selectedCategory?.color || '#3b82f6';
                    return (
                      <AdvancedMarker
                        key={p.id}
                        position={{ lat: p.position.latitude, lng: p.position.longitude }}
                        onClick={() => {
                          setSelectedPoiId(p.id);
                          logPoiEvent(`Selected POI from map pin: ${p.name}`);
                        }}
                      >
                        <div 
                          className="relative flex items-center justify-center cursor-pointer"
                          style={{ width: '36px', height: '36px' }}
                        >
                          {/* Selected ping halo */}
                          {isSelected && (
                            <span 
                              className="absolute inline-flex h-9 w-9 rounded-full animate-ping opacity-25"
                              style={{ backgroundColor: markerColor }}
                            />
                          )}
                          <div 
                            className={`w-7 h-7 rounded-full flex items-center justify-center shadow-lg border-2 text-white transition ${
                              isSelected ? 'scale-110 shadow-blue-500/20' : 'hover:scale-105'
                            }`}
                            style={{ 
                              backgroundColor: markerColor,
                              borderColor: '#ffffff'
                            }}
                          >
                            <MapPin className="w-3.5 h-3.5 text-white" />
                          </div>
                        </div>
                      </AdvancedMarker>
                    );
                  })}
                </Map>
              </APIProvider>
            ) : (
              <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center p-8 text-center text-slate-300">
                <RefreshCw className="w-10 h-10 text-blue-500 animate-spin mb-3" />
                <span className="text-sm font-black uppercase text-white tracking-widest block">Initializing Google Maps...</span>
              </div>
            )}
          </div>

          {/* TELEMETRY OVERLAY BOTTOM HUD PANEL (White bg, dark text) */}
          <div id="poi_telemetry_hud" className="bg-white border-t border-slate-200 p-4 shrink-0 flex flex-col md:flex-row gap-4 relative z-20 text-slate-700">
            {selectedPoi ? (
              <>
                {/* Left block: Compass and POI Name */}
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                      <CompassIcon className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-slate-900 truncate uppercase tracking-tight">{selectedPoi.name}</h4>
                        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-extrabold uppercase bg-blue-100 text-blue-700 border border-blue-200">
                          {selectedCategory?.name || 'POI'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Category Reference ID: {selectedPoi.categoryId} • Altitude: {selectedPoi.position.altitude || 0}m
                      </p>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 font-sans pl-1 border-l-2 border-blue-500/80 mt-1">
                    Description: <span className="text-slate-900 font-medium">{selectedPoi.description || 'No descriptive tags defined.'}</span>
                  </div>
                </div>

                {/* Right block: GPS coordinates and actions */}
                <div className="flex flex-col sm:flex-row gap-4 md:border-l md:border-slate-200 md:pl-4 justify-between items-start md:items-center">
                  <div className="space-y-1">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono block">Exact Location Specs</span>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      <div className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded min-w-[110px]">
                        <span className="text-[8px] text-slate-500 block uppercase font-sans">Latitude</span>
                        <span className="text-slate-800 font-semibold">{selectedPoi.position.latitude.toFixed(6)}</span>
                      </div>
                      <div className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded min-w-[110px]">
                        <span className="text-[8px] text-slate-500 block uppercase font-sans">Longitude</span>
                        <span className="text-slate-800 font-semibold">{selectedPoi.position.longitude.toFixed(6)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2 self-stretch md:self-auto items-center justify-end">
                    <button
                      onClick={() => {
                        const coordStr = `${selectedPoi.position.latitude}, ${selectedPoi.position.longitude}`;
                        navigator.clipboard.writeText(coordStr);
                        if (onNotify) onNotify('success', `Coordinates copied to clipboard: ${coordStr}`);
                        logPoiEvent(`Copied coordinate payload for "${selectedPoi.name}" directly to clipboard`);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg cursor-pointer transition active:scale-95 whitespace-nowrap"
                    >
                      Copy Coordinates
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col md:flex-row justify-between items-start md:items-center text-slate-500 text-xs">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500" />
                  <span>Select a category and choose a POI node from the registry on the left to display its coordinates and metadata tags.</span>
                </div>
                
                <div className="mt-2 md:mt-0 text-[10px] font-mono bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 max-w-sm w-full truncate text-slate-600">
                  <span className="text-blue-500 font-bold mr-1">FEED:</span>
                  {simulatedLog[0] || 'Awaiting POI tracking requests.'}
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
