import React, { useState, useMemo, useRef, useEffect } from 'react';
import { GeofenceGroup, Geofence } from '../types';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { 
  Search, 
  Layers, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Info, 
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Tag,
  Compass,
  SquareDot,
  Compass as CompassIcon
} from 'lucide-react';

const API_KEY =
  process.env.GOOGLE_MAPS_PLATFORM_KEY ||
  (import.meta as any).env?.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
  (globalThis as any).GOOGLE_MAPS_PLATFORM_KEY ||
  '';

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

interface GeofenceMapControlHandlerProps {
  zoomInTrigger: number;
  zoomOutTrigger: number;
  resetTrigger: number;
  selectedGeofence: Geofence | null;
  geofences: Geofence[];
}

function GeofenceMapControlHandler({ 
  zoomInTrigger, 
  zoomOutTrigger, 
  resetTrigger, 
  selectedGeofence,
  geofences
}: GeofenceMapControlHandlerProps) {
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
      if (geofences.length > 0) {
        const boundsInstance = new google.maps.LatLngBounds();
        let validCount = 0;
        geofences.forEach(g => {
          if (g.polygonShape?.vertices) {
            g.polygonShape.vertices.forEach(v => {
              boundsInstance.extend({ lat: v.latitude, lng: v.longitude });
              validCount++;
            });
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
  }, [resetTrigger, map, geofences]);

  useEffect(() => {
    if (map && selectedGeofence && typeof google !== 'undefined') {
      if (lastFocusedIdRef.current !== selectedGeofence.id) {
        let lat = 15.0;
        let lng = 120.0;
        if (selectedGeofence.boundingBox) {
          lat = (selectedGeofence.boundingBox.minY + selectedGeofence.boundingBox.maxY) / 2;
          lng = (selectedGeofence.boundingBox.minX + selectedGeofence.boundingBox.maxX) / 2;
        } else if (selectedGeofence.polygonShape?.vertices && selectedGeofence.polygonShape.vertices.length > 0) {
          const lats = selectedGeofence.polygonShape.vertices.map(v => v.latitude);
          const lngs = selectedGeofence.polygonShape.vertices.map(v => v.longitude);
          lat = lats.reduce((a, b) => a + b, 0) / lats.length;
          lng = lngs.reduce((a, b) => a + b, 0) / lngs.length;
        }

        map.panTo({ lat, lng });

        if (selectedGeofence.polygonShape?.vertices) {
          const boundsInstance = new google.maps.LatLngBounds();
          selectedGeofence.polygonShape.vertices.forEach(v => {
            boundsInstance.extend({ lat: v.latitude, lng: v.longitude });
          });
          map.fitBounds(boundsInstance);
        } else {
          map.setZoom(14);
        }

        lastFocusedIdRef.current = selectedGeofence.id;
      }
    } else {
      lastFocusedIdRef.current = null;
    }
  }, [selectedGeofence, map]);

  useEffect(() => {
    if (map && geofences.length > 0 && typeof google !== 'undefined') {
      const boundsInstance = new google.maps.LatLngBounds();
      let validCount = 0;
      geofences.forEach(g => {
        if (g.polygonShape?.vertices) {
          g.polygonShape.vertices.forEach(v => {
            boundsInstance.extend({ lat: v.latitude, lng: v.longitude });
            validCount++;
          });
        }
      });
      if (validCount > 0) {
        map.fitBounds(boundsInstance);
      }
    }
  }, [geofences, map]);

  return null;
}

interface GeofencePolygonsProps {
  geofences: Geofence[];
  selectedGeofenceId: number | null;
  onSelectGeofence: (id: number) => void;
  groupColour?: string;
}

function GeofencePolygons({ geofences, selectedGeofenceId, onSelectGeofence, groupColour }: GeofencePolygonsProps) {
  const map = useMap();
  const polygonsRef = useRef<google.maps.Polygon[]>([]);

  useEffect(() => {
    if (!map || typeof google === 'undefined') return;

    // Clear existing
    polygonsRef.current.forEach(poly => poly.setMap(null));
    polygonsRef.current = [];

    // Draw new
    geofences.forEach(g => {
      if (g.shapeType === 'Polygon' && g.polygonShape?.vertices) {
        const paths = g.polygonShape.vertices.map(v => ({
          lat: v.latitude,
          lng: v.longitude
        }));

        const isSelected = g.id === selectedGeofenceId;
        const color = groupColour || '#3b82f6';

        const polygon = new google.maps.Polygon({
          paths: paths,
          strokeColor: color,
          strokeOpacity: isSelected ? 0.9 : 0.6,
          strokeWeight: isSelected ? 4 : 2,
          fillColor: color,
          fillOpacity: isSelected ? 0.45 : 0.25,
          map: map,
        });

        polygon.addListener('click', () => {
          onSelectGeofence(g.id);
        });

        polygonsRef.current.push(polygon);
      }
    });

    return () => {
      polygonsRef.current.forEach(poly => poly.setMap(null));
      polygonsRef.current = [];
    };
  }, [geofences, selectedGeofenceId, map, groupColour, onSelectGeofence]);

  return null;
}

interface GeofenceManagerProps {
  onNotify?: (type: 'success' | 'warning' | 'error' | 'info', message: string) => void;
}

export default function GeofenceManager({ onNotify }: GeofenceManagerProps) {
  const [groups, setGroups] = useState<GeofenceGroup[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [geofences, setGeofences] = useState<Geofence[]>([]);
  const [selectedGeofenceId, setSelectedGeofenceId] = useState<number | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');

  // UI status states
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingGeofences, setLoadingGeofences] = useState(false);
  const [isCycling, setIsCycling] = useState(false);
  const [checkingGroupName, setCheckingGroupName] = useState('');
  const [errorText, setErrorText] = useState<string | null>(null);
  const [showSatelliteOverlay, setShowSatelliteOverlay] = useState(false);
  const [sourceType, setSourceType] = useState<string>('simulation');

  // Trigger states for map controls
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Local log trace
  const [simulatedLog, setSimulatedLog] = useState<string[]>(["GEOFENCES Manager initialized. Ready to query GpsGate."]);

  // Google maps key
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

  const logGeofenceEvent = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setSimulatedLog(prev => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // Fetch Geofence Groups
  useEffect(() => {
    const fetchGroups = async () => {
      setLoadingGroups(true);
      setErrorText(null);
      try {
        const response = await fetch('/api/geofence-groups');
        const resJson = await response.json();
        if (resJson.success) {
          const sorted = [...resJson.data].sort((a: GeofenceGroup, b: GeofenceGroup) => a.name.localeCompare(b.name));
          setGroups(sorted);
          setSourceType(resJson.source);
          if (sorted.length > 0) {
            setSelectedGroupId(sorted[0].id);
          }
          logGeofenceEvent(`Loaded ${sorted.length} Geofence Groups from backend (${resJson.source}).`);
        } else {
          throw new Error(resJson.message || 'Failed loading Geofence Groups');
        }
      } catch (err: any) {
        console.error("Error fetching geofence groups", err);
        setErrorText(err.message);
        if (onNotify) onNotify('error', `Failed to load Geofence groups: ${err.message}`);
      } finally {
        setLoadingGroups(false);
      }
    };

    fetchGroups();
  }, []);

  // Fetch Geofences when group changes
  useEffect(() => {
    if (selectedGroupId === null) return;

    const activeGroup = groups.find(g => g.id === selectedGroupId);
    const groupName = activeGroup ? activeGroup.name : 'Group';

    const fetchGeofences = async () => {
      setLoadingGeofences(true);
      setSelectedGeofenceId(null);
      try {
        const response = await fetch(`/api/geofence-groups/${selectedGroupId}/geofences`);
        const resJson = await response.json();
        if (resJson.success) {
          setGeofences(resJson.data);
          logGeofenceEvent(`Loaded ${resJson.data.length} Geofence boundary records for group "${groupName}" (ID: ${selectedGroupId}).`);
        } else {
          throw new Error(resJson.message || 'Failed loading Geofences');
        }
      } catch (err: any) {
        console.error("Error fetching geofences", err);
        if (onNotify) onNotify('error', `Failed to load Geofences: ${err.message}`);
      } finally {
        setLoadingGeofences(false);
      }
    };

    fetchGeofences();
  }, [selectedGroupId, groups]);

  // Filters by Search Term & Sorts Alphabetically
  const filteredGeofences = useMemo(() => {
    return geofences
      .filter(g => {
        return (
          g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (g.description && g.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
          String(g.id).includes(searchTerm)
        );
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [geofences, searchTerm]);

  const selectedGeofence = useMemo(() => {
    return geofences.find(g => g.id === selectedGeofenceId) || null;
  }, [geofences, selectedGeofenceId]);

  const selectedGroup = useMemo(() => {
    return groups.find(g => g.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  // Compute map center using first vertex
  const mapCenter = useMemo(() => {
    if (geofences.length > 0) {
      const valid = geofences.filter(g => g.polygonShape?.vertices && g.polygonShape.vertices.length > 0);
      if (valid.length > 0) {
        return {
          lat: valid[0].polygonShape!.vertices[0].latitude,
          lng: valid[0].polygonShape!.vertices[0].longitude
        };
      }
    }
    return { lat: 15.364, lng: 120.661 }; // fallback center (Tarlac sector)
  }, [geofences]);

  const handleSelectGeofence = (gId: number) => {
    const geo = geofences.find(x => x.id === gId);
    if (!geo) return;
    setSelectedGeofenceId(gId);
    logGeofenceEvent(`Focused map onto Geofence boundary: ${geo.name} (ShapeType: ${geo.shapeType})`);
  };

  const handleSearchAllGroups = async () => {
    if (groups.length <= 1) {
      if (onNotify) onNotify('info', 'No other geofence groups available to search.');
      return;
    }
    setIsCycling(true);
    let matchFound = false;

    const currentIdx = groups.findIndex(g => g.id === selectedGroupId);
    const orderedGroups = currentIdx !== -1
      ? [
          ...groups.slice(currentIdx + 1),
          ...groups.slice(0, currentIdx)
        ]
      : groups;

    for (const group of orderedGroups) {
      setCheckingGroupName(group.name);
      logGeofenceEvent(`Scanning group "${group.name}" for matches...`);
      try {
        const response = await fetch(`/api/geofence-groups/${group.id}/geofences`);
        const resJson = await response.json();
        if (resJson.success && Array.isArray(resJson.data)) {
          const matched = resJson.data.filter((g: Geofence) => {
            return (
              g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              (g.description && g.description.toLowerCase().includes(searchTerm.toLowerCase())) ||
              String(g.id).includes(searchTerm)
            );
          });
          if (matched.length > 0) {
            logGeofenceEvent(`Match found in group "${group.name}"! Switching group.`);
            if (onNotify) onNotify('success', `Found match in geofence group "${group.name}"!`);
            setSelectedGroupId(group.id);
            matchFound = true;
            break;
          }
        }
      } catch (err) {
        console.error(`Error checking group ${group.name}`, err);
      }
    }

    if (!matchFound) {
      logGeofenceEvent(`No matches found for "${searchTerm}" in any geofence group.`);
      if (onNotify) onNotify('warning', `No matches found for "${searchTerm}" in any group.`);
    }
    setIsCycling(false);
    setCheckingGroupName('');
  };

  const handleZoomIn = () => setZoomInTrigger(p => p + 1);
  const handleZoomOut = () => setZoomOutTrigger(p => p + 1);
  const handleResetView = () => setResetTrigger(p => p + 1);

  return (
    <div id="geofence_manager_container" className="h-[calc(100vh-10rem)] w-full flex flex-col bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
      {/* HUD HEADER */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2 font-sans">
              <SquareDot className="w-5 h-5 text-blue-600" />
              GEOFENCES REGISTRY
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
            Retrieve Geofence boundaries dynamically and project high-accuracy polygonal shapes onto maps.
          </p>
        </div>

        {/* Group switcher dropdown */}
        <div className="flex items-center gap-3">
          <label className="text-xs font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            Group:
          </label>
          <select
            value={selectedGroupId || ''}
            onChange={(e) => setSelectedGroupId(Number(e.target.value))}
            className="text-xs font-bold bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100 transition shadow-xs cursor-pointer min-w-[200px]"
          >
            {loadingGroups ? (
              <option>Loading groups...</option>
            ) : groups.length === 0 ? (
              <option>No Geofence Groups Available</option>
            ) : (
              groups.map(g => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.geofenceIds?.length || 0})
                </option>
              ))
            )}
          </select>
        </div>
      </header>

      {/* BODY SPLIT */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative min-h-0">
        
        {/* LEFT SIDEBAR */}
        <div className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col shrink-0 min-h-0 h-[320px] md:h-full">
          {/* Active Group Metadata */}
          {selectedGroup && (
            <div className="p-3 bg-slate-50 border-b border-slate-200/60 flex items-center justify-between text-xs font-medium text-slate-600 gap-2 shrink-0">
              <div className="truncate">
                <span className="font-extrabold text-slate-800 uppercase block truncate">{selectedGroup.name}</span>
                <span className="text-[9px] text-slate-400 font-mono block truncate">{selectedGroup.description || "No description provided."}</span>
              </div>
              <span 
                className="w-3 h-3 rounded-full shrink-0 shadow-xs border border-white"
                style={{ backgroundColor: selectedGroup.colour || '#3b82f6' }}
                title={`Theme Color: ${selectedGroup.colour || '#3b82f6'}`}
              />
            </div>
          )}

          {/* Search bar */}
          <div className="p-3 border-b border-slate-100 bg-white shrink-0 relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-6 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Filter active group geofences..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50/50 hover:bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 transition font-medium text-slate-700"
            />
          </div>

          {/* List Viewport */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-100 min-h-0">
            {loadingGeofences ? (
              <div className="p-12 text-center text-slate-400 font-medium text-xs flex flex-col items-center justify-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                <span>Loading active Geofences...</span>
              </div>
            ) : filteredGeofences.length === 0 ? (
              <div className="p-12 text-center text-slate-400 font-mono text-[11px] flex flex-col items-center justify-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                <span>{geofences.length === 0 ? 'No records returned for this group.' : 'No geofences match search filter.'}</span>
                {geofences.length > 0 && (
                  <button
                    onClick={handleSearchAllGroups}
                    disabled={isCycling}
                    className="mt-3 cursor-pointer text-blue-600 hover:text-blue-800 transition flex items-center justify-center gap-1.5 focus:outline-none"
                  >
                    <h3 className="text-xs font-black uppercase tracking-wider font-sans hover:underline">
                      {isCycling ? `Searching: ${checkingGroupName}...` : 'Search All Groups'}
                    </h3>
                  </button>
                )}
              </div>
            ) : (
              filteredGeofences.map((g) => {
                const isSelected = g.id === selectedGeofenceId;
                return (
                  <button
                    key={g.id}
                    onClick={() => handleSelectGeofence(g.id)}
                    className={`w-full text-left p-3 flex items-start gap-2.5 transition select-none cursor-pointer border-l-3 ${
                      isSelected 
                        ? 'bg-blue-50/60 border-blue-500' 
                        : 'hover:bg-slate-50 border-transparent'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5 text-slate-500">
                      <SquareDot 
                        className="w-4 h-4" 
                        style={{ color: selectedGroup?.colour || '#3b82f6' }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight truncate block">
                          {g.name}
                        </span>
                        <ChevronRight className={`w-3.5 h-3.5 text-slate-300 transition-transform ${isSelected ? 'translate-x-0.5 text-blue-500' : ''}`} />
                      </div>
                      {g.description ? (
                        <p className="text-[10px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                          {g.description}
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-300 mt-1 italic leading-relaxed">
                          No location descriptors.
                        </p>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Stat Footer */}
          <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[9px] text-slate-400 font-mono shrink-0">
            <span>Groups: {groups.length}</span>
            <span>Geofences loaded: {filteredGeofences.length}</span>
          </div>
        </div>

        {/* RIGHT MAP DISPLAY */}
        <div className="flex-1 h-full relative flex flex-col min-w-0 bg-slate-100">
          
          {/* Map Controls */}
          <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-2">
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

            <div className="bg-[#8cc441] border border-slate-800/20 rounded-lg p-1 flex items-center shadow-xl">
              <button
                onClick={() => {
                  setShowSatelliteOverlay(prev => !prev);
                  logGeofenceEvent(`Map display swapped to ${!showSatelliteOverlay ? 'Satellite Imagery' : 'Street Mode'}`);
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

          {/* MAP CANVAS */}
          <div className="flex-1 h-full w-full relative outline-none overflow-hidden select-none min-h-[350px]">
            {apiKey !== null ? (
              <APIProvider apiKey={apiKey || ''} version="weekly">
                <Map
                  id="gmp-geofence-map"
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
                  <GeofenceMapControlHandler 
                    zoomInTrigger={zoomInTrigger}
                    zoomOutTrigger={zoomOutTrigger}
                    resetTrigger={resetTrigger}
                    selectedGeofence={selectedGeofence}
                    geofences={geofences}
                  />

                  <GeofencePolygons 
                    geofences={geofences}
                    selectedGeofenceId={selectedGeofenceId}
                    onSelectGeofence={handleSelectGeofence}
                    groupColour={selectedGroup?.colour}
                  />

                  {geofences.map((g) => {
                    const isSelected = g.id === selectedGeofenceId;
                    const markerColor = selectedGroup?.colour || '#3b82f6';
                    
                    // Compute label position
                    let lat = 15.0;
                    let lng = 120.0;
                    if (g.boundingBox) {
                      lat = (g.boundingBox.minY + g.boundingBox.maxY) / 2;
                      lng = (g.boundingBox.minX + g.boundingBox.maxX) / 2;
                    } else if (g.polygonShape?.vertices && g.polygonShape.vertices.length > 0) {
                      lat = g.polygonShape.vertices[0].latitude;
                      lng = g.polygonShape.vertices[0].longitude;
                    }

                    return (
                      <AdvancedMarker
                        key={g.id}
                        position={{ lat, lng }}
                        onClick={() => {
                          setSelectedGeofenceId(g.id);
                          logGeofenceEvent(`Selected geofence label center: ${g.name}`);
                        }}
                      >
                        <div className="flex flex-col items-center">
                          {/* Label tooltips on map */}
                          <div 
                            className={`px-2 py-1 rounded bg-white/95 text-slate-800 border text-[9px] font-bold shadow-md uppercase tracking-tight transition max-w-[120px] text-center truncate ${
                              isSelected ? 'border-blue-500 scale-105 font-extrabold shadow-blue-200 ring-2 ring-blue-100' : 'border-slate-200'
                            }`}
                          >
                            {g.name}
                          </div>
                          
                          {/* Minimalist dot anchor */}
                          <div 
                            className="w-2.5 h-2.5 rounded-full border border-white mt-1 shadow-sm"
                            style={{ backgroundColor: markerColor }}
                          />
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

          {/* BOTTOM HUD TELEMETRY INFO PANEL */}
          <div id="geofence_telemetry_hud" className="bg-white border-t border-slate-200 p-4 shrink-0 flex flex-col md:flex-row gap-4 relative z-20 text-slate-700">
            {selectedGeofence ? (
              <>
                <div className="flex-1 min-w-0 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                      <CompassIcon className="w-5 h-5 text-blue-500" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-black text-slate-900 truncate uppercase tracking-tight">{selectedGeofence.name}</h4>
                        <span className="px-1.5 py-0.5 rounded text-[8.5px] font-extrabold uppercase bg-blue-100 text-blue-700 border border-blue-200">
                          {selectedGeofence.shapeType || 'Polygon'}
                        </span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-mono">
                        Group Reference: {selectedGroup?.name || 'Unassigned'} (ID: {selectedGroupId}) • Vertex count: {selectedGeofence.polygonShape?.vertices?.length || 0} vertices
                      </p>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-600 font-sans pl-1 border-l-2 border-blue-500/80 mt-1">
                    Descriptors: <span className="text-slate-900 font-medium">{selectedGeofence.description || 'No descriptive location tags defined.'}</span>
                  </div>
                </div>

                {/* Bounding Box / Coordinates */}
                <div className="flex flex-col sm:flex-row gap-4 md:border-l md:border-slate-200 md:pl-4 justify-between items-start md:items-center">
                  {selectedGeofence.boundingBox && (
                    <div className="space-y-1">
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono block">Boundaries Bounding Box (Min/Max coords)</span>
                      <div className="grid grid-cols-2 gap-2 text-[9px] font-mono">
                        <div className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded min-w-[130px]">
                          <span className="text-[8px] text-slate-500 block uppercase font-sans">Min Lat / Min Lng</span>
                          <span className="text-slate-800 font-semibold">{selectedGeofence.boundingBox.minY.toFixed(5)}, {selectedGeofence.boundingBox.minX.toFixed(5)}</span>
                        </div>
                        <div className="bg-slate-100 border border-slate-200 px-2 py-0.5 rounded min-w-[130px]">
                          <span className="text-[8px] text-slate-500 block uppercase font-sans">Max Lat / Max Lng</span>
                          <span className="text-slate-800 font-semibold">{selectedGeofence.boundingBox.maxY.toFixed(5)}, {selectedGeofence.boundingBox.maxX.toFixed(5)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 self-stretch md:self-auto items-center justify-end">
                    <button
                      onClick={() => {
                        let centerLat = 15.0;
                        let centerLng = 120.0;
                        if (selectedGeofence.boundingBox) {
                          centerLat = (selectedGeofence.boundingBox.minY + selectedGeofence.boundingBox.maxY) / 2;
                          centerLng = (selectedGeofence.boundingBox.minX + selectedGeofence.boundingBox.maxX) / 2;
                        } else if (selectedGeofence.polygonShape?.vertices && selectedGeofence.polygonShape.vertices.length > 0) {
                          centerLat = selectedGeofence.polygonShape.vertices[0].latitude;
                          centerLng = selectedGeofence.polygonShape.vertices[0].longitude;
                        }
                        const coordStr = `${centerLat.toFixed(6)}, ${centerLng.toFixed(6)}`;
                        navigator.clipboard.writeText(coordStr);
                        if (onNotify) onNotify('success', `Center coordinates copied to clipboard: ${coordStr}`);
                        logGeofenceEvent(`Copied center coordinate payload for "${selectedGeofence.name}" directly to clipboard`);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg cursor-pointer transition active:scale-95 whitespace-nowrap"
                    >
                      Copy Center Coords
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col md:flex-row justify-between items-start md:items-center text-slate-500 text-xs">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500" />
                  <span>Select a group and choose a Geofence boundary zone from the registry on the left to project its polygon shape and analyze details.</span>
                </div>
                
                <div className="mt-2 md:mt-0 text-[10px] font-mono bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 max-w-sm w-full truncate text-slate-600">
                  <span className="text-blue-500 font-bold mr-1">FEED:</span>
                  {simulatedLog[0] || 'Awaiting geofence boundary queries.'}
                </div>
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
