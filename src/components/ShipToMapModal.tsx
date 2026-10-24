import React, { useState, useEffect, useMemo } from 'react';
import { Trip, POI, POICategory } from '../types';
import { APIProvider, Map, AdvancedMarker } from '@vis.gl/react-google-maps';
import { 
  X, 
  Search, 
  MapPin, 
  Check, 
  RefreshCw, 
  AlertCircle, 
  Save, 
  Compass, 
  Loader2, 
  Map as MapIcon, 
  Info
} from 'lucide-react';

const MAPS_API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';
const hasValidKey = Boolean(MAPS_API_KEY) && MAPS_API_KEY !== 'YOUR_API_KEY';

interface ShipToMapModalProps {
  trip: Trip;
  onClose: () => void;
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
  onTripUpdated: (updatedTrip: Trip) => void;
}

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
];

export default function ShipToMapModal({ trip, onClose, onNotify, onTripUpdated }: ShipToMapModalProps) {
  const [categories, setCategories] = useState<POICategory[]>([]);
  const [searchTerm, setSearchTerm] = useState(trip.shipTo || '');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<POI[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<POI | null>(null);
  const [searchStatus, setSearchStatus] = useState<string>('');
  const [isSavingRecord, setIsSavingRecord] = useState(false);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({ lat: 14.5995, lng: 120.9842 });
  const [isConfirmingPoi, setIsConfirmingPoi] = useState<POI | null>(null);

  // Determine initial coordinates if mapped
  const initialLat = trip.ship_to_point_lat ? Number(trip.ship_to_point_lat) : null;
  const initialLon = trip.ship_to_point_lon ? Number(trip.ship_to_point_lon) : null;
  const isCurrentlyMapped = initialLat !== null && initialLon !== null;

  // Set initial map center
  useEffect(() => {
    if (isCurrentlyMapped && initialLat !== null && initialLon !== null) {
      setMapCenter({ lat: initialLat, lng: initialLon });
    }
  }, [trip, isCurrentlyMapped, initialLat, initialLon]);

  // Perform multi-category scan
  const performSearch = async (term: string) => {
    if (!term.trim()) {
      onNotify('warning', 'Please enter a valid term to search.');
      return;
    }
    setIsSearching(true);
    setSearchResults([]);
    setSelectedMatch(null);
    setIsConfirmingPoi(null);
    
    try {
      let cats = categories;
      if (cats.length === 0) {
        setSearchStatus('Fetching categories...');
        const catRes = await fetch('/api/poi-categories');
        const catData = await catRes.json();
        if (catData.success && Array.isArray(catData.data)) {
          cats = catData.data;
          setCategories(cats);
        }
      }
      
      const found: POI[] = [];
      const lowerTerm = term.toLowerCase().trim();
      
      for (let i = 0; i < cats.length; i++) {
        const cat = cats[i];
        setSearchStatus(`Scanning "${cat.name}"...`);
        
        const poiRes = await fetch(`/api/poi-categories/${cat.id}/pois?name=${encodeURIComponent(cat.name)}`);
        const poiData = await poiRes.json();
        
        if (poiData.success && Array.isArray(poiData.data)) {
          const matched = poiData.data.filter((p: POI) => {
            return (
              p.name.toLowerCase().includes(lowerTerm) ||
              (p.description && p.description.toLowerCase().includes(lowerTerm)) ||
              String(p.id).includes(lowerTerm)
            );
          });
          found.push(...matched);
        }
      }
      
      setSearchResults(found);
      if (found.length > 0) {
        setSelectedMatch(found[0]);
        setMapCenter({
          lat: found[0].position.latitude,
          lng: found[0].position.longitude
        });
        onNotify('success', `Found ${found.length} matching POI(s).`);
      } else {
        onNotify('warning', 'No POIs matched this search filter across any category.');
      }
    } catch (err) {
      console.error(err);
      onNotify('error', 'Error occurred while scanning POI categories.');
    } finally {
      setIsSearching(false);
      setSearchStatus('');
    }
  };

  // Auto-activate search if currently unmapped on open
  useEffect(() => {
    if (!isCurrentlyMapped) {
      performSearch(trip.shipTo || '');
    }
  }, []);

  // Update map center when a different match is selected
  const handleSelectMatch = (poi: POI) => {
    setSelectedMatch(poi);
    setMapCenter({
      lat: poi.position.latitude,
      lng: poi.position.longitude
    });
  };

  // Trigger Save Trip Record
  const handleSaveMappedPoi = async (poi: POI) => {
    setIsSavingRecord(true);
    try {
      const updatedTrip: Trip = {
        ...trip,
        poi_name: poi.name,
        ship_to_point_lat: poi.position.latitude,
        ship_to_point_lon: poi.position.longitude,
      };

      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTrip),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          onNotify('success', `Successfully mapped "${poi.name}" coordinates to Trip ${trip.orderNo}.`);
          onTripUpdated(result.trip);
          onClose();
        } else {
          onNotify('error', 'Failed saving trip details: ' + result.message);
        }
      } else {
        onNotify('error', 'Server error while saving trip.');
      }
    } catch (err) {
      console.error(err);
      onNotify('error', 'Network failure while saving updated trip.');
    } finally {
      setIsSavingRecord(false);
      setIsConfirmingPoi(null);
    }
  };

  return (
    <div id="ship_to_modal_overlay" className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[9999] p-4 animate-fade-in">
      <div id="ship_to_modal_card" className="bg-white rounded-2xl border border-slate-200/80 shadow-2xl max-w-5xl w-full flex flex-col overflow-hidden h-[85vh] max-h-[750px]">
        
        {/* Header section */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5">
              <MapIcon className="w-4 h-4 text-blue-600" />
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 font-mono">
                Ship To Point Mapping Engine
              </h3>
            </div>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Trip Order: <strong className="text-slate-700 font-mono">{trip.orderNo}</strong> &bull; Customer: <strong className="text-slate-700">{trip.localName || 'N/A'}</strong>
            </p>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 rounded-lg transition"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Inner Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          
          {/* Left panel: Search and Select */}
          <div className="w-full md:w-[420px] border-r border-slate-200 flex flex-col bg-slate-50/50 overflow-y-auto">
            
            {/* Search inputs section */}
            <div className="p-4 bg-white border-b border-slate-200">
              <label className="text-[10px] font-black uppercase text-slate-500 block mb-1.5 font-mono">
                Ship To Destination Search Term
              </label>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  performSearch(searchTerm);
                }}
                className="flex gap-2"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Enter Farm or Location name..."
                    className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-300 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSearching}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs font-bold px-4 py-1.5 rounded-lg transition shrink-0 cursor-pointer flex items-center justify-center"
                >
                  {isSearching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Search'}
                </button>
              </form>

              {searchStatus && (
                <div className="mt-2 flex items-center gap-1.5 text-[10px] text-blue-600 font-mono animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  <span>{searchStatus}</span>
                </div>
              )}
            </div>

            {/* Results or Status section */}
            <div className="flex-1 p-4 flex flex-col min-h-0">
              
              {/* Prompt Confirmation Screen */}
              {isConfirmingPoi ? (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col items-center text-center justify-between gap-3 animate-fade-in">
                  <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
                    <Check className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black text-emerald-800 uppercase tracking-wide">
                      Confirm Mapping Destination
                    </h4>
                    <p className="text-[11px] text-emerald-700 mt-1.5">
                      Set <strong className="text-slate-900">"{isConfirmingPoi.name}"</strong> as the coordinates location for Ship To Point <strong className="text-slate-900">"{trip.shipTo}"</strong>?
                    </p>
                    <div className="mt-2 bg-white/70 border border-emerald-100/50 rounded-lg p-2 text-[10px] text-slate-600 font-mono space-y-0.5 text-left">
                      <div><strong>POI Name:</strong> {isConfirmingPoi.name}</div>
                      <div><strong>Latitude:</strong> {isConfirmingPoi.position.latitude.toFixed(6)}</div>
                      <div><strong>Longitude:</strong> {isConfirmingPoi.position.longitude.toFixed(6)}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full mt-2">
                    <button
                      type="button"
                      disabled={isSavingRecord}
                      onClick={() => handleSaveMappedPoi(isConfirmingPoi)}
                      className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold uppercase tracking-wider text-[10px] py-2 rounded-lg transition shadow-md shadow-emerald-500/10 cursor-pointer flex items-center justify-center gap-1"
                    >
                      {isSavingRecord ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      <span>Save</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsConfirmingPoi(null)}
                      className="flex-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold uppercase tracking-wider text-[10px] py-2 rounded-lg transition cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Mapped State Information */}
              {isCurrentlyMapped && !isConfirmingPoi && (
                <div className="bg-slate-100 border border-slate-200 rounded-xl p-3 mb-4 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 uppercase tracking-wider text-[10px] font-mono border-b border-slate-200 pb-1 mb-2">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Currently Saved Location</span>
                  </div>
                  <div className="space-y-1 text-[11px] text-slate-600 font-mono">
                    <div><span className="text-slate-400">POI Name:</span> <strong className="text-slate-800">{trip.poi_name || 'Mapped Location'}</strong></div>
                    <div><span className="text-slate-400">Lat:</span> {initialLat?.toFixed(6)}</div>
                    <div><span className="text-slate-400">Lon:</span> {initialLon?.toFixed(6)}</div>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-2 italic leading-tight">
                    Use the search bar above to look for a different POI if you want to override this saved location.
                  </p>
                </div>
              )}

              {/* Matches List */}
              {!isConfirmingPoi && (
                <div className="flex-1 flex flex-col min-h-0">
                  <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2 font-mono">
                    Search Matches ({searchResults.length})
                  </h4>
                  {searchResults.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 font-mono text-[11px]">
                      <AlertCircle className="w-5 h-5 text-amber-500 mb-1.5" />
                      <span>{isSearching ? 'Scanning categories...' : 'No POIs matching search filter.'}</span>
                    </div>
                  ) : (
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[150px]">
                      {searchResults.map((p) => {
                        const isSelected = selectedMatch?.id === p.id;
                        return (
                          <div
                            key={p.id}
                            onClick={() => handleSelectMatch(p)}
                            className={`p-2.5 rounded-xl border text-left cursor-pointer transition ${
                              isSelected 
                                ? 'bg-blue-50/50 border-blue-400 ring-1 ring-blue-400' 
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className="text-xs font-bold text-slate-800 block leading-tight">{p.name}</span>
                                {p.description && (
                                  <span className="text-[10px] text-slate-500 block mt-0.5 max-w-[280px] truncate">{p.description}</span>
                                )}
                                <span className="text-[9px] font-mono text-slate-400 mt-1 block">
                                  ID: {p.id} &bull; Lat: {p.position.latitude.toFixed(5)}, Lon: {p.position.longitude.toFixed(5)}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setIsConfirmingPoi(p);
                                }}
                                className="bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-extrabold uppercase px-2.5 py-1 rounded transition shrink-0 cursor-pointer active:scale-95"
                              >
                                Select
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

          {/* Right panel: Live Map or Fallback coordinates */}
          <div className="flex-1 h-full min-h-[300px] relative bg-slate-900">
            {hasValidKey ? (
              <APIProvider apiKey={MAPS_API_KEY} version="weekly">
                <Map
                  id="gmp-shipto-map"
                  center={mapCenter}
                  zoom={selectedMatch || isCurrentlyMapped ? 14 : 11}
                  mapId="DEMO_MAP_ID"
                  disableDefaultUI={false}
                  gestureHandling="greedy"
                  internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                  style={{ width: '100%', height: '100%' }}
                >
                  {/* Current Trip saved coordinate Pin */}
                  {isCurrentlyMapped && initialLat !== null && initialLon !== null && (
                    <AdvancedMarker position={{ lat: initialLat, lng: initialLon }}>
                      <div className="flex flex-col items-center">
                        <div className="bg-slate-900 text-white font-mono text-[9px] font-bold px-2 py-0.5 rounded shadow-lg whitespace-nowrap border border-slate-700 mb-1">
                          Current Location
                        </div>
                        <div className="w-8 h-8 rounded-full bg-emerald-500 border-2 border-white flex items-center justify-center shadow-lg">
                          <MapPin className="w-4 h-4 text-white" />
                        </div>
                      </div>
                    </AdvancedMarker>
                  )}

                  {/* Highlighted Match Pin */}
                  {selectedMatch && (
                    <AdvancedMarker position={{ lat: selectedMatch.position.latitude, lng: selectedMatch.position.longitude }}>
                      <div className="flex flex-col items-center">
                        <div className="bg-blue-600 text-white font-bold text-[9px] px-2 py-0.5 rounded shadow-lg whitespace-nowrap border border-blue-400 mb-1">
                          Matched: {selectedMatch.name}
                        </div>
                        <div className="w-9 h-9 rounded-full bg-blue-600 border-2 border-white flex items-center justify-center shadow-lg animate-bounce">
                          <Compass className="w-4.5 h-4.5 text-white animate-spin" style={{ animationDuration: '6s' }} />
                        </div>
                      </div>
                    </AdvancedMarker>
                  )}
                </Map>
              </APIProvider>
            ) : (
              // Beautiful coordinates inspect card fallback when API Key is missing or empty
              <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center p-6 text-center text-slate-300">
                <div className="max-w-md bg-slate-900 border border-slate-800 p-6 rounded-2xl shadow-xl flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center border border-slate-700 text-slate-400 animate-pulse">
                    <Compass className="w-6 h-6 text-blue-500" />
                  </div>
                  <h4 className="text-sm font-black uppercase text-slate-200 tracking-wider">
                    Visual Coordinate Grid Fallback
                  </h4>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Google Maps Platform key is unconfigured. Showing raw spatial metadata for this node.
                  </p>

                  <div className="w-full bg-slate-950 rounded-xl p-4 border border-slate-800 text-left space-y-2 mt-2">
                    <div className="flex justify-between items-center text-[11px] font-mono border-b border-slate-800 pb-1.5">
                      <span className="text-slate-500">TARGET STATUS:</span>
                      <span className={selectedMatch || isCurrentlyMapped ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                        {selectedMatch ? 'HIGHLIGHTED' : isCurrentlyMapped ? 'MAPPED' : 'UNMAPPED'}
                      </span>
                    </div>
                    {(selectedMatch || isCurrentlyMapped) ? (
                      <div className="space-y-1 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500">POI NAME:</span>
                          <span className="text-white font-bold max-w-[200px] truncate">{selectedMatch ? selectedMatch.name : (trip.poi_name || 'N/A')}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">LATITUDE:</span>
                          <span className="text-blue-400">{selectedMatch ? selectedMatch.position.latitude.toFixed(6) : initialLat?.toFixed(6)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500">LONGITUDE:</span>
                          <span className="text-blue-400">{selectedMatch ? selectedMatch.position.longitude.toFixed(6) : initialLon?.toFixed(6)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center text-[11px] text-slate-600 font-mono py-2">
                        No coordinates targeted. Enter a search term or match a POI to retrieve coordinates.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
