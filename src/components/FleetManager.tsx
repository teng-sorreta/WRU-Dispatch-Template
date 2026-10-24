import React, { useState, useMemo, useRef, useEffect } from 'react';
import { FleetVehicle } from '../types';
import { APIProvider, Map, AdvancedMarker, useMap } from '@vis.gl/react-google-maps';
import { 
  Search, 
  MapPin, 
  Compass, 
  Activity, 
  Power, 
  Navigation, 
  ZoomIn, 
  ZoomOut, 
  Maximize2, 
  Grid, 
  Info, 
  Radio, 
  Clock, 
  ChevronRight,
  RefreshCw,
  AlertCircle,
  Layers,
  Map as MapIcon,
  HelpCircle,
  SlidersHorizontal,
  CheckCircle2,
  X,
  Gauge
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

interface MapControlHandlerProps {
  zoomInTrigger: number;
  zoomOutTrigger: number;
  resetTrigger: number;
  selectedVehicle: FleetVehicle | null;
  vehicles: FleetVehicle[];
}

function MapControlHandler({ 
  zoomInTrigger, 
  zoomOutTrigger, 
  resetTrigger, 
  selectedVehicle,
  vehicles
}: MapControlHandlerProps) {
  const map = useMap();
  const hasInitialFitRef = useRef(false);
  const lastFocusedIdRef = useRef<string | number | null>(null);

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
      if (vehicles.length > 0) {
        const boundsInstance = new google.maps.LatLngBounds();
        let validCount = 0;
        vehicles.forEach(v => {
          if (v.latitude && v.longitude) {
            boundsInstance.extend({ lat: v.latitude, lng: v.longitude });
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
  }, [resetTrigger, map, vehicles]);

  useEffect(() => {
    if (map && selectedVehicle) {
      if (lastFocusedIdRef.current !== selectedVehicle.id) {
        map.panTo({ lat: selectedVehicle.latitude, lng: selectedVehicle.longitude });
        map.setZoom(14);
        lastFocusedIdRef.current = selectedVehicle.id;
      }
    } else {
      lastFocusedIdRef.current = null;
    }
  }, [selectedVehicle, map]);

  // Initial fit bounds when map loads
  useEffect(() => {
    if (map && vehicles.length > 0 && typeof google !== 'undefined' && !hasInitialFitRef.current) {
      const boundsInstance = new google.maps.LatLngBounds();
      let validCount = 0;
      vehicles.forEach(v => {
        if (v.latitude && v.longitude) {
          boundsInstance.extend({ lat: v.latitude, lng: v.longitude });
          validCount++;
        }
      });
      if (validCount > 0) {
        map.fitBounds(boundsInstance);
        hasInitialFitRef.current = true;
      }
    }
  }, [map, vehicles]);

  return null;
}

interface FleetManagerProps {
  vehicles: FleetVehicle[];
  onNotify?: (type: 'success' | 'warning' | 'error' | 'info', message: string) => void;
  onRefresh?: () => Promise<void>;
  isRefreshing?: boolean;
  onTriggerSync?: () => Promise<void>;
  isSyncing?: boolean;
}

export default function FleetManager({ 
  vehicles, 
  onNotify,
  onRefresh,
  isRefreshing,
  onTriggerSync,
  isSyncing
}: FleetManagerProps) {
  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'idle' | 'stopped' | 'offline'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'speed' | 'lastUpdate'>('name');
  
  // Google Map trigger states
  const [zoomInTrigger, setZoomInTrigger] = useState(0);
  const [zoomOutTrigger, setZoomOutTrigger] = useState(0);
  const [resetTrigger, setResetTrigger] = useState(0);

  // Selected vehicle tracking
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  const [showSatelliteOverlay, setShowSatelliteOverlay] = useState(false);
  const [simulatedLog, setSimulatedLog] = useState<string[]>(["Fleet Manager active. Awaiting coordinates..."]);

  // Dynamic Google Maps key from server
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>('simulation');

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

    fetch('/api/config')
      .then(res => res.json())
      .then(data => {
        if (data && data.useGpsgateMock !== undefined) {
          setSourceType(data.useGpsgateMock ? 'simulation' : 'live');
        }
      })
      .catch(() => {
        setSourceType('simulation');
      });
  }, []);

  // Local helper to log events inside our Telemetry HUD
  const logTelemetryEvent = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setSimulatedLog(prev => [`[${time}] ${msg}`, ...prev.slice(0, 19)]);
  };

  // Find currently selected vehicle object
  const selectedVehicle = useMemo(() => {
    return vehicles.find(v => v.id === selectedId) || null;
  }, [vehicles, selectedId]);

  // Map center calculation
  const mapCenter = useMemo(() => {
    if (vehicles.length > 0) {
      const validVehicles = vehicles.filter(v => v.latitude && v.longitude);
      if (validVehicles.length > 0) {
        return {
          lat: validVehicles[0].latitude,
          lng: validVehicles[0].longitude
        };
      }
    }
    return { lat: 14.5995, lng: 120.9842 }; // Manila fallback
  }, [vehicles]);

  // Select vehicle handler
  const handleSelectVehicle = (v: FleetVehicle) => {
    setSelectedId(v.id);
    logTelemetryEvent(`Focused map onto ${v.name} at coordinates [${v.latitude.toFixed(5)}, ${v.longitude.toFixed(5)}]`);
  };

  // Filter & Sort vehicles
  const filteredVehicles = useMemo(() => {
    return vehicles
      .filter(v => {
        const matchesSearch = v.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              String(v.id).includes(searchTerm) ||
                              (v.deviceActivity && v.deviceActivity.includes(searchTerm));
        const matchesStatus = statusFilter === 'all' || v.status === statusFilter;
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => {
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        if (sortBy === 'speed') {
          const speedA = a.groundSpeed !== undefined ? a.groundSpeed : a.speed;
          const speedB = b.groundSpeed !== undefined ? b.groundSpeed : b.speed;
          return speedB - speedA;
        }
        if (sortBy === 'lastUpdate') {
          const tA = new Date(a.lastUpdate || 0).getTime();
          const tB = new Date(b.lastUpdate || 0).getTime();
          return tB - tA;
        }
        return 0;
      });
  }, [vehicles, searchTerm, statusFilter, sortBy]);

  // Counts of each status
  const statusCounts = useMemo(() => {
    const counts = { all: vehicles.length, active: 0, idle: 0, stopped: 0, offline: 0 };
    vehicles.forEach(v => {
      if (v.status in counts) {
        counts[v.status as keyof typeof counts]++;
      } else {
        counts.stopped++; // fallback
      }
    });
    return counts;
  }, [vehicles]);

  // Zoom and boundary reset handlers
  const handleZoomIn = () => {
    setZoomInTrigger(p => p + 1);
    logTelemetryEvent("Zoom level increased");
  };

  const handleZoomOut = () => {
    setZoomOutTrigger(p => p + 1);
    logTelemetryEvent("Zoom level decreased");
  };

  const handleResetView = () => {
    setResetTrigger(p => p + 1);
    setSelectedId(null);
    logTelemetryEvent("Map view boundary reset to default");
  };

  return (
    <div id="fleet_manager_container" className="h-[calc(100vh-10rem)] w-full flex flex-col bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm select-none">
      
      {/* HUD CONTROL HEADER BAR */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 shrink-0 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-5 h-5 text-blue-600" />
            <h1 className="text-sm font-black uppercase text-slate-800 tracking-wider flex items-center gap-2 font-sans">
              Fleet
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
            Track WRU active vehicle nodes in real-time, monitor ignition states, and trace live telemetry streams.
          </p>
        </div>
      </header>

      {/* BODY CONTENT: GRID OF SIDEBAR & MAP */}
      <div className="flex-1 grid grid-cols-12 gap-5 p-5 overflow-hidden relative min-h-0">
      
        {/* LEFT COLUMN: VEHICLE SEARCH & LIST PANEL */}
        <div id="vehicle_sidebar" className="col-span-12 lg:col-span-5 bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-sm">
        
        {/* Sidebar Header with Metrics */}
        <div className="p-4 bg-slate-50 border-b border-slate-200">

          {/* Quick search input */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search by vehicle ID, name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs pl-9 pr-8 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-100 transition font-sans"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')} 
                className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="flex gap-1 overflow-x-auto mt-3 pb-1 scrollbar-none items-center">
            {[
              { id: 'all', label: 'All', count: statusCounts.all, color: 'border-slate-300 text-slate-700 bg-white' },
              { id: 'active', label: 'Active', count: statusCounts.active, color: 'border-emerald-200 text-emerald-700 bg-emerald-50/40' },
              { id: 'idle', label: 'Idle', count: statusCounts.idle, color: 'border-amber-200 text-amber-700 bg-amber-50/40' },
              { id: 'stopped', label: 'Stopped', count: statusCounts.stopped, color: 'border-indigo-200 text-indigo-700 bg-indigo-50/40' },
              { id: 'offline', label: 'Offline', count: statusCounts.offline, color: 'border-slate-200 text-slate-600 bg-slate-50' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id as any)}
                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border cursor-pointer shrink-0 transition flex items-center gap-1 ${
                  statusFilter === tab.id 
                    ? 'bg-slate-900 border-slate-900 text-white shadow-xs' 
                    : `${tab.color} hover:bg-slate-100`
                }`}
              >
                <span>{tab.label}</span>
                <span className={`inline-flex items-center justify-center font-mono text-[9px] px-1 rounded ${
                  statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
            <div className="ml-auto flex items-center gap-1.5 pl-2 shrink-0">
              {(onTriggerSync || onRefresh) && (
                <button
                  onClick={onTriggerSync || onRefresh}
                  disabled={isSyncing || isRefreshing}
                  className="p-1 rounded-md text-slate-400 hover:text-blue-600 hover:bg-slate-200/50 cursor-pointer transition-all active:scale-95 flex items-center justify-center"
                  title="Force Sync GpsGate Telemetry"
                >
                  <RefreshCw className={`w-3 h-3 ${(isSyncing || isRefreshing) ? 'animate-spin text-blue-600' : ''}`} />
                </button>
              )}
              <span className="text-[10px] font-mono font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full whitespace-nowrap">
                {vehicles.length} Active Nodes
              </span>
            </div>
          </div>

          {/* Sort selection */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 font-bold uppercase mt-2.5 pt-2 border-t border-slate-150">
            <span className="flex items-center gap-1">
              <SlidersHorizontal className="w-3 h-3" />
              Sort By
            </span>
            <div className="flex gap-2">
              {[
                { id: 'name', label: 'A-Z' },
                { id: 'speed', label: 'Speed' },
                { id: 'lastUpdate', label: 'Updated' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSortBy(opt.id as any)}
                  className={`cursor-pointer ${sortBy === opt.id ? 'text-blue-600 font-black underline underline-offset-2' : 'hover:text-slate-800'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Vehicles Scrolling List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 bg-slate-50/40">
          {filteredVehicles.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
              <AlertCircle className="w-8 h-8 text-slate-350 mb-2" />
              <p className="text-xs font-semibold text-slate-600">No telemetry nodes found</p>
              <p className="text-[10px] text-slate-400 mt-1 max-w-[200px]">
                Try updating your search phrase or choosing another status filter chip.
              </p>
            </div>
          ) : (
            filteredVehicles.map(v => {
              const speedVal = v.groundSpeed !== undefined ? v.groundSpeed : v.speed;
              const isSelected = v.id === selectedId;
              const formattedUpdate = v.lastUpdate
                ? new Date(v.lastUpdate).toLocaleTimeString('en-US', { hour12: false })
                : 'N/A';

              return (
                <div
                  key={v.id}
                  onClick={() => handleSelectVehicle(v)}
                  className={`p-2.5 transition-all cursor-pointer border-l-3 relative flex items-center justify-between gap-3 ${
                    isSelected 
                      ? 'bg-blue-50/70 border-l-blue-600 shadow-2xs' 
                      : 'hover:bg-white border-l-transparent'
                  }`}
                >
                  {/* Left Block: Name & Status Badge */}
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <h4 className="text-xs font-black text-slate-800 truncate" title={v.name}>
                      {v.name}
                    </h4>
                    
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border shrink-0 ${
                      v.status === 'active' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                      v.status === 'idle' ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse' :
                      v.status === 'stopped' ? 'bg-indigo-50 text-indigo-700 border-indigo-150' :
                      'bg-slate-50 text-slate-500 border-slate-200'
                    }`}>
                      <span className={`w-1 h-1 rounded-full ${
                        v.status === 'active' ? 'bg-emerald-500' :
                        v.status === 'idle' ? 'bg-amber-400' :
                        v.status === 'stopped' ? 'bg-indigo-500' :
                        'bg-slate-400'
                      }`} />
                      {v.status}
                    </span>
                  </div>

                  {/* Right Block: Telemetry Row */}
                  <div className="flex items-center gap-2.5 shrink-0 text-[10px] text-slate-600 font-bold font-mono">
                    {/* Velocity */}
                    <span className="flex items-center gap-0.5 w-[72px] shrink-0" title="Velocity">
                      <Gauge className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{speedVal}</span>
                      <span className="text-[8px] text-slate-400 font-normal shrink-0">km/h</span>
                    </span>

                    <span className="text-slate-200 text-[10px] shrink-0">|</span>

                    {/* Ignition */}
                    <span className="flex items-center gap-0.5 w-12 shrink-0" title="Ignition">
                      <Power className={`w-3.5 h-3.5 shrink-0 ${v.ignition ? 'text-emerald-500' : 'text-slate-400'}`} />
                      <span>{v.ignition ? 'ON' : 'OFF'}</span>
                    </span>

                    <span className="text-slate-200 text-[10px] shrink-0">|</span>

                    {/* Heading */}
                    <span className="flex items-center gap-0.5 w-14 shrink-0" title="Heading">
                      <Compass className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{v.heading}°</span>
                    </span>

                    <span className="text-slate-200 text-[10px] shrink-0">|</span>

                    {/* Last Update */}
                    <span className="flex items-center gap-0.5 w-[72px] shrink-0 text-slate-400 font-semibold" title={`Updated: ${formattedUpdate}`}>
                      <Clock className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <span>{formattedUpdate}</span>
                    </span>
                  </div>

                  {/* Selected Indicator indicator */}
                  {isSelected && (
                    <div className="absolute right-1 top-1/2 -translate-y-1/2 flex items-center bg-blue-100 rounded-full p-0.5 border border-blue-200 shadow-xs animate-fade-in">
                      <ChevronRight className="w-3 h-3 text-blue-600" />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT COLUMN: INTERACTIVE MAP & HUD PANEL */}
      <div id="interactive_map_viewport" className="col-span-12 lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl relative overflow-hidden shadow-md flex flex-col">
        
        {/* Map Header Controls */}
        <div className="absolute top-4 left-4 z-20 flex flex-wrap gap-2">
          {/* Zoom & View Controls */}
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
              <span>Reset</span>
            </button>
          </div>

          {/* Style Overlay Toggle */}
          <div className="bg-[#8cc441] border border-slate-800/20 rounded-lg p-1 flex items-center shadow-xl">
            <button
              onClick={() => {
                setShowSatelliteOverlay(prev => !prev);
                logTelemetryEvent(`Map display swapped to ${!showSatelliteOverlay ? 'Satellite Imagery' : 'Street Mode'}`);
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

        {/* MAP CONTAINER CANVAS */}
        <div
          className="flex-1 h-full w-full relative outline-none overflow-hidden select-none min-h-[350px]"
          style={{ height: '100%' }}
        >
          {apiKey !== null ? (
            <APIProvider apiKey={apiKey || ''} version="weekly">
              <Map
                id="gmp-fleet-map"
                defaultCenter={mapCenter}
                defaultZoom={12}
                mapId="DEMO_MAP_ID"
                mapTypeId={showSatelliteOverlay ? 'hybrid' : 'roadmap'}
                styles={showSatelliteOverlay ? undefined : BRAND_MAP_STYLE}
                disableDefaultUI={true}
                gestureHandling="greedy"
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                style={{ width: '100%', height: '100%' }}
              >
                <MapControlHandler 
                  zoomInTrigger={zoomInTrigger}
                  zoomOutTrigger={zoomOutTrigger}
                  resetTrigger={resetTrigger}
                  selectedVehicle={selectedVehicle}
                  vehicles={vehicles}
                />

                {vehicles.map((v) => {
                  const isSelected = v.id === selectedId;
                  
                  // Determine status colors
                  let colorClass = '#3b82f6'; // active (blue)
                  let strokeColor = '#93c5fd';
                  if (v.status === 'active') {
                    colorClass = '#10b981'; // emerald
                    strokeColor = '#6ee7b7';
                  } else if (v.status === 'idle') {
                    colorClass = '#f59e0b'; // amber
                    strokeColor = '#fcd34d';
                  } else if (v.status === 'stopped') {
                    colorClass = '#6366f1'; // indigo
                    strokeColor = '#a5b4fc';
                  } else {
                    colorClass = '#64748b'; // offline slate
                    strokeColor = '#cbd5e1';
                  }

                  return (
                    <AdvancedMarker
                      key={v.id}
                      position={{ lat: v.latitude, lng: v.longitude }}
                      onClick={() => {
                        setSelectedId(v.id);
                        logTelemetryEvent(`Selected vehicle node: ${v.name}`);
                      }}
                    >
                      <div 
                        className="relative flex items-center justify-center cursor-pointer"
                        style={{ width: '40px', height: '40px' }}
                      >
                        {/* selection halo */}
                        {isSelected && (
                          <span 
                            className="absolute inline-flex h-10 w-10 rounded-full animate-ping opacity-25"
                            style={{ backgroundColor: colorClass }}
                          />
                        )}
                        
                        {/* Core pin circle */}
                        <div
                          className="w-5 h-5 rounded-full border-2 border-slate-950 flex items-center justify-center shadow-lg transition-transform duration-300 relative"
                          style={{ 
                            backgroundColor: colorClass,
                            transform: isSelected ? 'scale(1.2)' : 'scale(1)'
                          }}
                        >
                          {/* Center point */}
                          <div className="w-1.5 h-1.5 bg-white rounded-full" />
                          
                          {/* Heading arrow rotating */}
                          {v.heading !== undefined && (
                            <div 
                              className="absolute -top-1.5 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[5px]"
                              style={{ 
                                borderBottomColor: strokeColor,
                                transform: `rotate(${v.heading}deg)`,
                                transformOrigin: 'bottom center'
                              }}
                            />
                          )}
                        </div>

                        {/* Text Label */}
                        <div className="absolute top-7 bg-slate-950/90 text-[8px] font-black font-mono text-white px-1.5 py-0.5 rounded border border-slate-800 whitespace-nowrap shadow-lg">
                          {v.name}
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

        {/* BOTTOM HUD FLOATING CARD: SELECTED VEHICLE TELEMETRY CONSOLE */}
        <div id="telemetry_hud_panel" className="bg-white border-t border-slate-200 p-4 shrink-0 flex flex-col md:flex-row gap-4 relative z-20 text-slate-700">
          {selectedVehicle ? (
            <>
              {/* Column 1: Compass, Name and Details */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 bg-slate-100 border border-slate-200 rounded-lg flex items-center justify-center shrink-0">
                    <Compass 
                      className="w-5 h-5 text-blue-500 transition-transform duration-700"
                      style={{ transform: `rotate(${selectedVehicle.heading || 0}deg)` }}
                    />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-black text-slate-900">{selectedVehicle.name}</h4>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                        selectedVehicle.status === 'active' ? 'bg-emerald-500/20 text-emerald-700 border border-emerald-500/30' :
                        selectedVehicle.status === 'idle' ? 'bg-amber-500/20 text-amber-700 border border-amber-500/30 animate-pulse' :
                        'bg-slate-200 text-slate-600 border border-slate-300'
                      }`}>
                        {selectedVehicle.status}
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 font-mono">
                      Location Geofence: Pasig/Makati Sector Hub. Altitude: {selectedVehicle.altitude || 14}m
                    </p>
                  </div>
                </div>

                {/* Simulated Address Details */}
                <div className="text-[11px] text-slate-600 font-sans pl-1 border-l-2 border-blue-500/80">
                  Estimated Location: <span className="text-slate-900 font-medium">Near Roxas Expressway / Manila Boundary Sector 2</span>
                </div>
              </div>

              {/* Column 2: Live Coordinates Grid & Actions */}
              <div className="flex flex-col sm:flex-row gap-4 md:border-l md:border-slate-200 md:pl-4">
                {/* Coordinates */}
                <div className="space-y-1">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono block">GPS Satellites Connected</span>
                  <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                    <div className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
                      <span className="text-[8px] text-slate-500 block uppercase font-sans">Latitude</span>
                      <span className="text-slate-800 font-semibold">{selectedVehicle.latitude.toFixed(6)}</span>
                    </div>
                    <div className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded">
                      <span className="text-[8px] text-slate-500 block uppercase font-sans">Longitude</span>
                      <span className="text-slate-800 font-semibold">{selectedVehicle.longitude.toFixed(6)}</span>
                    </div>
                  </div>
                </div>

                {/* Quick Interactive Actions */}
                <div className="flex items-end gap-1.5">
                  <button
                    onClick={() => {
                      logTelemetryEvent(`Transmitted priority ping request directly to GPS tracker of ${selectedVehicle.name}`);
                      if (onNotify) onNotify('success', `Direct telemetry request transmitted to vehicle: ${selectedVehicle.name}`);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg cursor-pointer transition active:scale-95 flex items-center gap-1"
                  >
                    <Radio className="w-3 h-3 text-emerald-600 animate-pulse" />
                    <span>Request Ping</span>
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${selectedVehicle.latitude.toFixed(6)}, ${selectedVehicle.longitude.toFixed(6)}`);
                      if (onNotify) onNotify('info', `Copied GPS Coordinates for ${selectedVehicle.name} to clipboard`);
                      logTelemetryEvent(`Copied coordinate payload for ${selectedVehicle.name} to device clipboard`);
                    }}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 text-slate-700 font-bold text-[10px] uppercase rounded-lg cursor-pointer transition active:scale-95 flex items-center gap-1"
                  >
                    <span>Copy GPS Payload</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col md:flex-row justify-between items-start md:items-center text-slate-500 text-xs">
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500" />
                <span>Select a vehicle node from the registry on the left to unlock live telemetry logging, vector routing, and satellite maps.</span>
              </div>
              
              {/* Simulated real-time log event preview */}
              <div className="mt-2 md:mt-0 text-[10px] font-mono bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 max-w-sm w-full truncate text-slate-600">
                <span className="text-blue-500 font-bold mr-1">FEED:</span>
                {simulatedLog[0] || 'Idle listening daemon.'}
              </div>
            </div>
          )}
        </div>

      </div>

      {/* CLOSE BODY CONTENT: GRID OF SIDEBAR & MAP */}
      </div>

    </div>
  );
}
