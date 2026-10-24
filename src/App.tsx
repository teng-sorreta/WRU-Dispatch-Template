import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  RefreshCw, 
  Server, 
  Activity, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  HelpCircle, 
  Terminal, 
  Sliders, 
  Database, 
  ArrowRightLeft,
  ChevronRight,
  ChevronDown,
  DatabaseZap,
  Info,
  PanelLeftClose,
  PanelLeftOpen,
  Truck,
  Map,
  MapPin,
  User,
  SquareDot,
  Wifi
} from 'lucide-react';
import { AppConfig, SyncLogEntry, SchedulerStatus, FleetVehicle, MockTargetReceivedPayload } from './types';
import FleetMonitor from './components/FleetMonitor';
import PayloadInspector from './components/PayloadInspector';
import DispatchManager from './components/DispatchManager';
import FleetManager from './components/FleetManager';
import PoiManager from './components/PoiManager';
import GeofenceManager from './components/GeofenceManager';
import DriverManager from './components/DriverManager';
import InboundManager from './components/InboundManager';

const VEHICLE_PATHS = [
  { name: "Truck Alpha (Dry Cargo)", baseLat: 14.5995, baseLng: 120.9842, heading: 45 },
  { name: "Truck Beta (Reefer)", baseLat: 14.6349, baseLng: 121.0423, heading: 120 },
  { name: "Vessel Gamma (Oil Tanker)", baseLat: 14.5752, baseLng: 120.9412, heading: 270 },
  { name: "Van Delta (Courier)", baseLat: 14.5547, baseLng: 121.0244, heading: 180 },
  { name: "Service Fleet Epsilon", baseLat: 14.6125, baseLng: 121.0012, heading: 90 },
  { name: "Heavy Hauler Zeta", baseLat: 14.5029, baseLng: 121.0515, heading: 315 },
  { name: "Retired Sweeper Eta (Inactive >30 Days)", baseLat: 14.4925, baseLng: 121.0112, heading: 0 },
];

function generateMockFleet(): FleetVehicle[] {
  const seconds = Date.now() / 1000;
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  return VEHICLE_PATHS.map((vp, index) => {
    const deltaLat = Math.sin(seconds / 50 + index) * 0.008;
    const deltaLng = Math.cos(seconds / 60 + index * 1.5) * 0.008;
    const speedVariation = Math.floor(Math.abs(Math.sin(seconds / 15 + index)) * 60) + 10;
    
    let vehicleStatus: FleetVehicle['status'] = 'active';
    let isIgnitionOn = true;
    let computedSpeed = speedVariation;

    if (index === 2) {
      computedSpeed = Math.floor(speedVariation * 0.3);
      vehicleStatus = 'active';
    } else if (index === 4) {
      computedSpeed = 0;
      isIgnitionOn = true;
      vehicleStatus = 'idle';
    } else if (index === 5) {
      computedSpeed = 0;
      isIgnitionOn = false;
      vehicleStatus = 'stopped';
    } else if (index === 6) {
      computedSpeed = 0;
      isIgnitionOn = false;
      vehicleStatus = 'offline';
    }

    const isRetired = index === 6;
    const lastUpdateDate = isRetired 
      ? new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
      : new Date().toISOString();

    return {
      id: `VEH-100${index + 1}`,
      name: vp.name,
      latitude: Number((vp.baseLat + deltaLat).toFixed(6)),
      longitude: Number((vp.baseLng + deltaLng).toFixed(6)),
      speed: computedSpeed,
      heading: Math.floor((vp.heading + (seconds * 2 + index * 10) % 360) % 360),
      altitude: Math.floor(10 + (Math.sin(seconds / 100) * 5)),
      lastUpdate: lastUpdateDate,
      deviceActivity: isRetired ? lastUpdateDate : undefined,
      ignition: isIgnitionOn,
      status: vehicleStatus,
    };
  }).filter(v => {
    const activityTimeStr = v.deviceActivity || v.lastUpdate;
    if (!activityTimeStr) return true;
    const activityTime = new Date(activityTimeStr).getTime();
    if (isNaN(activityTime)) return true;
    return (now - activityTime) <= thirtyDaysMs;
  });
}

export default function App() {
  // App Config States
  const [config, setConfig] = useState<AppConfig>({
    gpsgateUrl: 'wru2.server93.com',
    gpsgateAppId: '208',
    gpsgateUsername: 'api_fleet_sync',
    gpsgatePassword: '',
    useGpsgateMock: false,
    gpsgateToken: 'v2:MDAwMDAwNzk3OTphZWExNjdhYjA4OTBjYTc3NmI3MQ==',
    gpsgateGroupId: '14925',
    targetUrl: '',
    targetAuthHeader: 'Authorization',
    targetAuthToken: '',
    targetTimeout: 5000,
    targetAuthType: 'custom',
    targetUsername: '',
    targetPassword: '',
    syncIntervalMinutes: 60,
    retryAttempts: 3,
    retryBackoffMs: 1000
  });

  // App Runtime States
  const [schedulerStatus, setSchedulerStatus] = useState<SchedulerStatus>({
    isActive: false,
    syncIntervalMinutes: 60,
    lastSyncTime: null,
    nextSyncTime: null,
    gpsgateConnected: 'untested',
    targetConnected: 'untested'
  });

  const [logs, setLogs] = useState<SyncLogEntry[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [mockPayloads, setMockPayloads] = useState<MockTargetReceivedPayload[]>([]);
  const [lastTargetResponse, setLastTargetResponse] = useState<any | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | number | null>(null);
  const [currentTab, setCurrentTab] = useState<'sync' | 'dispatch' | 'fleet' | 'pois' | 'geofences' | 'driver'>('dispatch');
  const [integrationSubTab, setIntegrationSubTab] = useState<'outbound' | 'inbound'>('outbound');
  
  // Loading & status flags
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);
  const [syncingNow, setSyncingNow] = useState(false);
  const [testingGpsgate, setTestingGpsgate] = useState(false);
  const [testingTarget, setTestingTarget] = useState(false);
  
  // Notice & banner states
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  
  // Search and log filters
  const [logFilter, setLogFilter] = useState<'ALL' | 'SUCCESS' | 'WARNING' | 'ERROR'>('ALL');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [countdownText, setCountdownText] = useState<string>('Calculated on tick...');
  const [currentTime, setCurrentTime] = useState<string>('');
  const [leftPanelCollapsed, setLeftPanelCollapsed] = useState<boolean>(false);

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString('en-US', { hour12: false }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Toast auto-dismissal
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Fetch initial configuration & operational status
  const fetchOperationalState = async (skipLoadingIndicator = false) => {
    if (!skipLoadingIndicator) setLoadingConfig(true);
    try {
      // 1. Config
      const configRes = await fetch('/api/config');
      if (configRes.ok) {
        const configData = await configRes.json();
        setConfig(configData);
      }

      // 2. Status & Logs
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setSchedulerStatus(statusData.status);
        setLogs(statusData.logs || []);
        setVehicles(statusData.vehicles || []);
        setLastTargetResponse(statusData.lastTargetResponse || null);
      }

      // 3. Mock telemetry receiver store
      const receiverRes = await fetch('/api/mock/target-endpoint/payloads');
      if (receiverRes.ok) {
        const receiverData = await receiverRes.json();
        setMockPayloads(receiverData);
      }
    } catch (err) {
      console.error("Operational query failed", err);
    } finally {
      if (!skipLoadingIndicator) setLoadingConfig(false);
    }
  };

  // Fetch only live status, logs, and received payloads without overwriting unsaved configuration inputs
  const fetchLiveStatus = async () => {
    try {
      const statusRes = await fetch('/api/status');
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setSchedulerStatus(statusData.status);
        setLogs(statusData.logs || []);
        setVehicles(statusData.vehicles || []);
        setLastTargetResponse(statusData.lastTargetResponse || null);
      }

      const receiverRes = await fetch('/api/mock/target-endpoint/payloads');
      if (receiverRes.ok) {
        const receiverData = await receiverRes.json();
        setMockPayloads(receiverData);
      }
    } catch (err) {
      console.error("Live status background sync failed", err);
    }
  };

  // Continuous background updates for real-time connection telemetry monitoring
  useEffect(() => {
    fetchOperationalState();
    const interval = setInterval(() => {
      fetchLiveStatus();
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Update dynamic countdown badge
  useEffect(() => {
    const updateCountdown = () => {
      if (!schedulerStatus.nextSyncTime) {
        setCountdownText("Not Scheduled");
        return;
      }
      
      const nextTime = new Date(schedulerStatus.nextSyncTime).getTime();
      const diffMs = nextTime - Date.now();
      
      if (diffMs <= 0) {
        setCountdownText("Sync running...");
        return;
      }
      
      const totalSeconds = Math.floor(diffMs / 1000);
      const minutes = Math.floor(totalSeconds / 60);
      const seconds = totalSeconds % 60;
      
      setCountdownText(`${minutes}m ${seconds}s`);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [schedulerStatus.nextSyncTime]);

  // Change config bindings
  const updateConfigField = (field: keyof AppConfig, value: any) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Submit and save configuration
  const handleSubmitConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      
      const resData = await response.json();
      if (response.ok && resData.success) {
        setToast({ type: 'success', message: 'Settings saved. Background automatic synchronization reset successfully.' });
        fetchOperationalState(true);
      } else {
        setToast({ type: 'error', message: resData.message || 'Saving config failed' });
      }
    } catch (err: any) {
      setToast({ type: 'error', message: `Server error: ${err.message}` });
    } finally {
      setSavingConfig(false);
    }
  };

  // Test GpsGate server connection directly
  const testGpsgateConnection = async () => {
    setTestingGpsgate(true);
    try {
      const res = await fetch('/api/conn-test/gpsgate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToast({ type: 'success', message: `GpsGate Handshake Verified: ${data.message}` });
      } else {
        setToast({ type: 'error', message: `GpsGate Verification Failed: ${data.message || 'Could not log in'}` });
      }
      fetchLiveStatus();
    } catch (err: any) {
      setToast({ type: 'error', message: `Network request error during test: ${err.message}` });
    } finally {
      setTestingGpsgate(false);
    }
  };

  // Test target server endpoint connection directly
  const testTargetConnection = async () => {
    setTestingTarget(true);
    try {
      const res = await fetch('/api/conn-test/target', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setToast({ type: 'success', message: `Target Handshake Verified: ${data.message}` });
      } else {
        setToast({ type: 'error', message: `Target Verification Failed: ${data.message || 'Target refused request'}` });
      }
      fetchLiveStatus();
    } catch (err: any) {
      setToast({ type: 'error', message: `Target server ping failed: ${err.message}` });
    } finally {
      setTestingTarget(false);
    }
  };

  // Trigger Fleet Sync immediately
  const triggerManualSync = async () => {
    setSyncingNow(true);
    try {
      const res = await fetch('/api/sync/trigger', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setToast({ type: 'success', message: `Manual trigger processed! Telemetry of ${data.count} vehicles pushed successfully.` });
      } else {
        setToast({ type: 'error', message: `Data push failed: ${data.error || 'Server error'}` });
      }
      fetchLiveStatus();
    } catch (err: any) {
      setToast({ type: 'error', message: `Fetch Error triggering push: ${err.message}` });
    } finally {
      setSyncingNow(false);
    }
  };

  // Clear system interaction activity logs
  const handleClearLogs = async () => {
    try {
      const res = await fetch('/api/logs/clear', { method: 'POST' });
      if (res.ok) {
        setToast({ type: 'success', message: 'Activity log records deleted from memory cache.' });
        fetchLiveStatus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Clear sandbox store payloads
  const handleClearSandboxStore = async () => {
    try {
      const res = await fetch('/api/mock/target-endpoint/clear', { method: 'POST' });
      if (res.ok) {
        setToast({ type: 'info', message: 'Target Mock sandbox payloads cleared.' });
        fetchLiveStatus();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Calculate telemetry statistics
  const totalSyncAttempts = logs.filter(l => l.type === 'SYNC_TRIGGER').length;
  const errorSyncAttempts = logs.filter(l => l.type === 'SYNC_ERROR').length;
  const successRate = totalSyncAttempts > 0 
    ? (((totalSyncAttempts - errorSyncAttempts) / totalSyncAttempts) * 100).toFixed(2)
    : "100.00";

  const totalLoadedPositions = logs
    .filter(l => l.type === 'TRANSFORM' && l.status === 'success')
    .slice(0, 1)
    .map(l => {
      const match = l.message.match(/Formatted\s+(\d+)\s+clean/);
      return match ? parseInt(match[1]) : 0;
    })[0] || (config.useGpsgateMock ? 6 : 0);

  // Filter system logs
  const filteredLogs = logs.filter(log => {
    if (logFilter === 'ALL') return true;
    if (logFilter === 'SUCCESS' && log.status === 'success') return true;
    if (logFilter === 'WARNING' && log.status === 'warning') return true;
    if (logFilter === 'ERROR' && log.status === 'error') return true;
    return false;
  });

  return (
    <div id="app_root" className="min-h-screen bg-[#f8fafc] text-slate-800 font-sans flex flex-col antialiased">
      
      {/* Toast Alert Banner */}
      {toast && (
        <div 
          id="system_alert_banner"
          className={`fixed top-4 right-4 z-50 max-w-md p-4 rounded-lg shadow-xl border flex items-start gap-3 transition-all duration-300 transform translate-y-0 ${
            toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-900 shadow-emerald-100' :
            toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900 shadow-rose-100' :
            'bg-blue-50 border-blue-200 text-blue-900 shadow-blue-100'
          }`}
        >
          <div className="shrink-0 mt-0.5">
            {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
            {toast.type === 'error' && <XCircle className="w-5 h-5 text-rose-600" />}
            {toast.type === 'info' && <Info className="w-5 h-5 text-blue-600" />}
          </div>
          <div className="flex-1">
            <h4 className="text-xs font-bold uppercase tracking-wider">
              {toast.type === 'success' ? 'Task Completed' : toast.type === 'error' ? 'Operational Alert' : 'System Information'}
            </h4>
            <p className="text-xs mt-1 text-slate-700 font-medium">{toast.message}</p>
          </div>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1 select-none">
            ✕
          </button>
        </div>
      )}

      {/* HEADER SECTION */}
      <header id="main_header" className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm">
        <div className="flex items-center gap-4">
          {currentTab === 'sync' && (
            <>
              <button 
                type="button"
                onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
                className="p-1.5 hover:bg-slate-50 border border-slate-200 rounded-lg text-slate-500 hover:text-slate-800 transition flex items-center gap-1.5 cursor-pointer shadow-sm select-none"
                title={leftPanelCollapsed ? "Expand Configuration Panel" : "Collapse Configuration Panel"}
              >
                {leftPanelCollapsed ? (
                  <>
                    <PanelLeftOpen className="w-4 h-4 text-blue-600" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 hidden sm:inline">Show Configs</span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose className="w-4 h-4 text-slate-500" />
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 hidden sm:inline">Hide Configs</span>
                  </>
                )}
              </button>

              <div className="h-6 w-px bg-slate-200 hidden sm:block"></div>
            </>
          )}

          <div className="flex items-center gap-2 select-none">
            {/* Green Map Pin with Calendar Icon */}
            <svg viewBox="0 0 100 120" className="h-9 w-auto shrink-0" fill="none" xmlns="http://www.w3.org/2000/svg">
              {/* Beautiful Green Location Pin Path */}
              <path
                d="M50 6C25.7 6 6 25.7 6 50C6 77.2 50 114 50 114C50 114 94 77.2 94 50C94 25.7 74.3 6 50 6Z"
                fill="#8cc441"
              />
              {/* White Calendar Icon Outer Box */}
              <rect x="28" y="36" width="44" height="38" rx="6" stroke="white" strokeWidth="5.5" fill="none" />
              {/* Calendar hanger binders */}
              <rect x="37" y="29" width="6" height="12" rx="2" fill="white" />
              <rect x="57" y="29" width="6" height="12" rx="2" fill="white" />
              {/* Checkmark inside Calendar */}
              <path
                d="M39 56L47 64L61 50"
                stroke="white"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            
            {/* Logo Text (DISPATCH by WRU) */}
            <div className="flex flex-col justify-center -space-y-1">
              <span className="text-[18px] font-black tracking-tight text-slate-800 font-sans">
                DISPATCH
              </span>
              <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase font-sans">
                by WRU
              </span>
            </div>
          </div>

          {currentTab !== 'driver' && (
            <>
              <div className="h-6 w-px bg-slate-200 hidden md:block"></div>

              <div className="hidden md:flex bg-slate-100 border border-slate-200/80 p-0.5 rounded-lg text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setCurrentTab('dispatch')}
                  className={`px-3 py-1.5 font-bold uppercase rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    currentTab === 'dispatch' ? 'bg-white text-blue-600 shadow-xs border border-slate-200/30' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>Dispatch Manager</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('fleet')}
                  className={`px-3 py-1.5 font-bold uppercase rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    currentTab === 'fleet' ? 'bg-white text-blue-600 shadow-xs border border-slate-200/30 font-extrabold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Map className="w-3.5 h-3.5" />
                  <span>Fleet</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('pois')}
                  className={`px-3 py-1.5 font-bold uppercase rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    currentTab === 'pois' ? 'bg-white text-blue-600 shadow-xs border border-slate-200/30 font-extrabold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <MapPin className={`w-3.5 h-3.5 ${currentTab === 'pois' ? 'text-blue-600' : ''}`} />
                  <span>POIs</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('geofences')}
                  className={`px-3 py-1.5 font-bold uppercase rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    currentTab === 'geofences' ? 'bg-white text-blue-600 shadow-xs border border-slate-200/30 font-extrabold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <SquareDot className={`w-3.5 h-3.5 ${currentTab === 'geofences' ? 'text-blue-600' : ''}`} />
                  <span>Geofences</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('sync')}
                  className={`px-3 py-1.5 font-bold uppercase rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    currentTab === 'sync' ? 'bg-white text-blue-600 shadow-xs border border-slate-200/30 font-extrabold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${currentTab === 'sync' ? 'text-blue-600' : ''}`} />
                  <span>Integration</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentTab('driver')}
                  className={`px-3 py-1.5 font-bold uppercase rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                    currentTab === 'driver' ? 'bg-white text-blue-600 shadow-xs border border-slate-200/30 font-extrabold' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <User className={`w-3.5 h-3.5 ${currentTab === 'driver' ? 'text-blue-600' : ''}`} />
                  <span>Driver</span>
                </button>
              </div>
            </>
          )}
        </div>
        
        {currentTab !== 'driver' && (
          <div className="flex items-center gap-6">
            <div className="h-9 w-px bg-slate-200 hidden sm:block"></div>
            
            <div className="flex flex-col items-end">
              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                Next Sync Cycle {currentTime && <span className="text-slate-500 font-mono font-bold normal-case ml-1.5 bg-slate-100 border border-slate-200/60 px-1.5 py-0.2 rounded text-[10px] tracking-normal">({currentTime})</span>}
              </span>
              <span className="text-xs font-mono font-semibold text-slate-700 bg-slate-100 border border-slate-200 px-2 py-0.5 mt-0.5 rounded flex items-center gap-1.5 justify-center">
                <Clock className="w-3 h-3 text-slate-500 animate-pulse" />
                {countdownText}
              </span>
            </div>

            <div className="h-9 w-px bg-slate-200"></div>

            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider hidden sm:inline">Active daemon</span>
            </div>
          </div>
        )}

        {currentTab === 'driver' && (
          <div className="flex items-center gap-3 select-none">
            <div className="flex flex-col items-end">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Active Session
                </span>
                <h1 className="text-xs font-black uppercase text-slate-800 tracking-wider flex items-center gap-1.5 font-sans">
                  <User className="w-4 h-4 text-blue-600" />
                  Driver
                </h1>
              </div>
              <p className="text-[9px] text-slate-400 font-mono mt-0.5 text-right hidden sm:block">
                Real-time driver assignment dashboard
              </p>
            </div>
          </div>
        )}
      </header>

      {/* MOBILE SCROLLABLE TAB SELECTOR */}
      {currentTab !== 'driver' && (
        <div className="md:hidden flex bg-white border-b border-slate-200/80 overflow-x-auto scrollbar-none px-4 py-2.5 gap-2 sticky top-0 z-40 shrink-0">
          <button
            type="button"
            onClick={() => setCurrentTab('dispatch')}
            className={`px-3 py-1.5 font-bold uppercase rounded-lg text-[10px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 border select-none ${
              currentTab === 'dispatch' ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-slate-50 border-slate-200/60 text-slate-500'
            }`}
          >
            <Truck className="w-3.5 h-3.5" />
            <span>Dispatch</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('fleet')}
            className={`px-3 py-1.5 font-bold uppercase rounded-lg text-[10px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 border select-none ${
              currentTab === 'fleet' ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-slate-50 border-slate-200/60 text-slate-500'
            }`}
          >
            <Map className="w-3.5 h-3.5" />
            <span>Fleet</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('pois')}
            className={`px-3 py-1.5 font-bold uppercase rounded-lg text-[10px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 border select-none ${
              currentTab === 'pois' ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-slate-50 border-slate-200/60 text-slate-500'
            }`}
          >
            <MapPin className="w-3.5 h-3.5" />
            <span>POIs</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('geofences')}
            className={`px-3 py-1.5 font-bold uppercase rounded-lg text-[10px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 border select-none ${
              currentTab === 'geofences' ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-slate-50 border-slate-200/60 text-slate-500'
            }`}
          >
            <SquareDot className="w-3.5 h-3.5" />
            <span>Geofences</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('sync')}
            className={`px-3 py-1.5 font-bold uppercase rounded-lg text-[10px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 border select-none ${
              currentTab === 'sync' ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-slate-50 border-slate-200/60 text-slate-500'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Integration</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentTab('driver')}
            className={`px-3 py-1.5 font-bold uppercase rounded-lg text-[10px] transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 border select-none ${
              currentTab === 'driver' ? 'bg-blue-600 border-blue-600 text-white shadow-xs' : 'bg-slate-50 border-slate-200/60 text-slate-500'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Driver</span>
          </button>
        </div>
      )}

      {/* MAIN CONTAINER */}
      {currentTab === 'dispatch' ? (
        <main id="dispatch_body" className="flex-1 p-6 overflow-y-auto max-w-[1600px] mx-auto w-full">
          <DispatchManager vehicles={vehicles} onNotify={(type, message) => setToast({ type, message })} />
        </main>
      ) : currentTab === 'driver' ? (
        <main id="driver_body" className="flex-1 p-4 md:p-6 overflow-y-auto max-w-[1600px] mx-auto w-full">
          <DriverManager vehicles={vehicles} onNotify={(type, message) => setToast({ type, message })} />
        </main>
      ) : currentTab === 'fleet' ? (
        <main id="fleet_body" className="flex-1 p-6 overflow-hidden max-w-[1600px] mx-auto w-full">
          <FleetManager 
            vehicles={vehicles} 
            onNotify={(type, message) => setToast({ type, message })} 
            onRefresh={fetchLiveStatus}
            isRefreshing={loadingConfig}
            onTriggerSync={triggerManualSync}
            isSyncing={syncingNow}
          />
        </main>
      ) : currentTab === 'pois' ? (
        <main id="pois_body" className="flex-1 p-6 overflow-hidden max-w-[1600px] mx-auto w-full">
          <PoiManager onNotify={(type, message) => setToast({ type, message })} />
        </main>
      ) : currentTab === 'geofences' ? (
        <main id="geofences_body" className="flex-1 p-6 overflow-hidden max-w-[1600px] mx-auto w-full">
          <GeofenceManager onNotify={(type, message) => setToast({ type, message })} />
        </main>
      ) : (
        <main id="dashboard_body" className="flex-1 p-6 flex flex-col gap-6 overflow-hidden max-w-[1600px] mx-auto w-full">
          
          {/* Sub Tab Switcher for OUTBOUND vs INBOUND */}
          <div className="flex justify-between items-center bg-white border border-slate-200/80 p-3 rounded-lg shadow-sm shrink-0">
            <div className="flex flex-col select-none">
              <h1 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                <ArrowRightLeft className="w-4 h-4 text-blue-600 animate-pulse" />
                <span>Integration Control Center</span>
              </h1>
              <p className="text-[10px] text-slate-400 font-bold mt-0.5">Manage and monitor Outbound sync daemons and Inbound event streams</p>
            </div>
            
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-bold shadow-inner">
              <button
                type="button"
                onClick={() => setIntegrationSubTab('outbound')}
                className={`px-4 py-2 uppercase rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                  integrationSubTab === 'outbound' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/20' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Outbound (GpsGate Sync)</span>
              </button>
              <button
                type="button"
                onClick={() => setIntegrationSubTab('inbound')}
                className={`px-4 py-2 uppercase rounded-md transition-all flex items-center gap-1.5 cursor-pointer select-none ${
                  integrationSubTab === 'inbound' ? 'bg-white text-blue-600 shadow-sm border border-slate-200/20' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Wifi className="w-3.5 h-3.5" />
                <span>Inbound (HTTP Expression Endpoint)</span>
              </button>
            </div>
          </div>

          {integrationSubTab === 'inbound' ? (
            <div className="flex-1 overflow-hidden">
              <InboundManager onNotify={(type, message) => setToast({ type, message })} />
            </div>
          ) : (
            <div className="grid grid-cols-12 gap-6 overflow-hidden flex-1">
        
        {/* LEFT COLUMN: Settings & Configuration Panel */}
        <aside 
          id="side_configs_panel" 
          className={leftPanelCollapsed ? `hidden` : `col-span-12 lg:col-span-4 flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-8.5rem)] pr-1`}
        >
          
          {/* Quick Actions Panel */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-4">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              Operational Controls
            </h2>
            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={triggerManualSync}
                disabled={syncingNow}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-4 rounded-md shadow-md shadow-blue-100 hover:shadow-blue-200 disabled:opacity-75 transition active:scale-[0.98] cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncingNow ? 'animate-spin' : ''}`} />
                <span>{syncingNow ? 'Transmitting Data Package...' : 'Trigger Sync Now'}</span>
              </button>
            </div>
          </div>

          {/* Configuration Form Card */}
          <section className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col">
            
            {/* Card Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
              <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <Settings className="w-4 h-4 text-slate-500" />
                <span>Sync Configuration</span>
              </h2>
              
              <button 
                type="button"
                onClick={() => fetchOperationalState()}
                className="text-slate-500 hover:text-blue-600 text-xs font-bold uppercase transition"
              >
                Reload
              </button>
            </div>

            {/* Config Fields Form */}
            <form onSubmit={handleSubmitConfig} className="p-4 space-y-4">
              
              {/* Integration Source: GpsGate Server */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    1. GpsGate Server Details
                  </label>
                  
                  {/* Simulation Toggle Option */}
                  <label className="inline-flex items-center gap-1.5 cursor-pointer selection:bg-transparent">
                    <input 
                      type="checkbox"
                      checked={config.useGpsgateMock}
                      onChange={(e) => updateConfigField('useGpsgateMock', e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-100 w-3.5 h-3.5"
                    />
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase">
                      Run Demo Simulation
                    </span>
                  </label>
                </div>

                <div className="space-y-2 mt-2">
                  <div className="group relative">
                    <input 
                      type="text" 
                      className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                      placeholder="GpsGate Host URL (e.g. https://your-domain.com)"
                      value={config.gpsgateUrl}
                      onChange={(e) => updateConfigField('gpsgateUrl', e.target.value)}
                      disabled={config.useGpsgateMock}
                      required
                    />
                    <span className="text-[9px] text-slate-400 font-sans block mt-1">Host Domain of GpsGate Web Console API</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <input 
                        type="text" 
                        className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                        placeholder="App ID (e.g. 208)"
                        value={config.gpsgateAppId}
                        onChange={(e) => updateConfigField('gpsgateAppId', e.target.value)}
                        disabled={config.useGpsgateMock}
                        required
                      />
                      <span className="text-[9px] text-slate-400 font-sans block mt-1">Application ID</span>
                    </div>

                    <div>
                      <input 
                        type="text" 
                        className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                        placeholder="Group ID (e.g. 14925)"
                        value={config.gpsgateGroupId || ''}
                        onChange={(e) => updateConfigField('gpsgateGroupId', e.target.value)}
                        disabled={config.useGpsgateMock}
                      />
                      <span className="text-[9px] text-slate-400 font-sans block mt-1">GpsGate Group ID</span>
                    </div>
                  </div>

                  <div>
                    <input 
                      type="text" 
                      className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                      placeholder="GpsGate API Token (Static Auth)"
                      value={config.gpsgateToken || ''}
                      onChange={(e) => updateConfigField('gpsgateToken', e.target.value)}
                      disabled={config.useGpsgateMock}
                    />
                    <span className="text-[9px] text-slate-400 font-sans block mt-1">Direct API Token Authorization (Overrides Session Op)</span>
                  </div>


                </div>

                {!config.useGpsgateMock && (
                  <button
                    type="button"
                    onClick={testGpsgateConnection}
                    disabled={testingGpsgate}
                    className="w-full mt-2 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 rounded text-[11px] font-bold text-slate-700 transition flex items-center justify-center gap-1.5"
                  >
                    {testingGpsgate ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Verifying GpsGate endpoints...</span>
                      </>
                    ) : (
                      <>
                        <Server className="w-3.5 h-3.5 text-slate-500" />
                        <span>Test GpsGate Credentials Login</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Destination Target Parameters */}
              <div className="space-y-2 border-b border-slate-100 pb-3">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                  2. Telemetry Destination Target Server
                </label>

                <div className="space-y-2">
                  <div>
                    <input 
                      type="url" 
                      className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                      placeholder="Destination API Endpoint URL"
                      value={config.targetUrl}
                      onChange={(e) => updateConfigField('targetUrl', e.target.value)}
                      required
                    />
                    <div className="flex items-center justify-between mt-1 text-[9px] text-slate-400">
                      <span>Server URL to forward transformed fleet JSON data</span>
                      <button
                        type="button"
                        onClick={() => updateConfigField('targetUrl', 'http://localhost:3000/api/mock/target-endpoint')}
                        className="text-blue-600 hover:underline font-bold"
                      >
                        Use Local Sandbox URL
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                        Authentication Type
                      </label>
                      <select
                        className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-medium"
                        value={config.targetAuthType || 'custom'}
                        onChange={(e) => updateConfigField('targetAuthType', e.target.value)}
                      >
                        <option value="none">None (No Authentication)</option>
                        <option value="bearer">Bearer Token Authentication</option>
                        <option value="basic">Basic Access Authentication (Username / Password)</option>
                        <option value="custom">Custom Header Key/Value</option>
                      </select>
                    </div>

                    {/* Conditionally reveal inputs based on authentication type selection */}
                    {(config.targetAuthType === 'bearer') && (
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                          API Token / Bearer Key
                        </label>
                        <input 
                          type="text" 
                          className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                          placeholder="e.g. sYnc_KeY_2026_SeCrEt"
                          value={config.targetAuthToken}
                          onChange={(e) => updateConfigField('targetAuthToken', e.target.value)}
                        />
                        <span className="text-[9px] text-slate-400 font-sans block mt-1">
                          The Bearer prefix will be automatically formatted into the Authorization header.
                        </span>
                      </div>
                    )}

                    {(config.targetAuthType === 'basic') && (
                      <div className="grid grid-cols-2 gap-2 p-2.5 bg-slate-50 rounded border border-slate-150">
                        <div className="col-span-2 text-[10px] uppercase font-bold text-slate-550 leading-tight">
                          Basic Auth Credentials
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-450 uppercase block mb-0.5">
                            Username
                          </label>
                          <input 
                            type="text" 
                            className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-600 font-mono" 
                            placeholder="MyUsername"
                            value={config.targetUsername || ''}
                            onChange={(e) => updateConfigField('targetUsername', e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="text-[9px] font-bold text-slate-450 uppercase block mb-0.5">
                            Password
                          </label>
                          <input 
                            type="password" 
                            className="w-full text-xs p-1.5 border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-600 font-mono" 
                            placeholder="••••••••"
                            value={config.targetPassword || ''}
                            onChange={(e) => updateConfigField('targetPassword', e.target.value)}
                          />
                        </div>
                      </div>
                    )}

                    {(!config.targetAuthType || config.targetAuthType === 'custom') && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Auth Header Key
                          </label>
                          <input 
                            type="text" 
                            className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                            placeholder="Header Key"
                            value={config.targetAuthHeader}
                            onChange={(e) => updateConfigField('targetAuthHeader', e.target.value)}
                          />
                          <span className="text-[9px] text-slate-400 font-sans block mt-1">e.g. "Authorization" or "X-Api-Key"</span>
                        </div>

                        <div>
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Secret Token Value
                          </label>
                          <input 
                            type="text" 
                            className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                            placeholder="Bearer / API Key Value"
                            value={config.targetAuthToken}
                            onChange={(e) => updateConfigField('targetAuthToken', e.target.value)}
                          />
                          <span className="text-[9px] text-slate-400 font-sans block mt-1">Direct literal header value</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {config.targetUrl && (
                  <button
                    type="button"
                    onClick={testTargetConnection}
                    disabled={testingTarget}
                    className="w-full mt-2 py-1.5 px-3 bg-slate-100 hover:bg-slate-200 border border-slate-200 hover:border-slate-300 rounded text-[11px] font-bold text-slate-700 transition flex items-center justify-center gap-1.5"
                  >
                    {testingTarget ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Sending payload handshake...</span>
                      </>
                    ) : (
                      <>
                        <DatabaseZap className="w-3.5 h-3.5 text-slate-500" />
                        <span>Test Connection to Target Endpoint</span>
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Fail-Safe and Scheduling Controls */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide block">
                  3. Scheduler Settings &amp; Backoff Parameters
                </label>
                
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <input 
                      type="number" 
                      min="1"
                      className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                      value={config.syncIntervalMinutes}
                      onChange={(e) => updateConfigField('syncIntervalMinutes', parseInt(e.target.value) || 60)}
                      required
                    />
                    <span className="text-[9px] text-slate-400 font-sans block mt-1">Polling Interval (min)</span>
                  </div>

                  <div>
                    <input 
                      type="number" 
                      min="1"
                      max="10"
                      className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                      value={config.retryAttempts}
                      onChange={(e) => updateConfigField('retryAttempts', parseInt(e.target.value) || 3)}
                      required
                    />
                    <span className="text-[9px] text-slate-400 font-sans block mt-1">Failed Retries Cap</span>
                  </div>

                  <div>
                    <input 
                      type="number" 
                      min="100"
                      max="10000"
                      step="500"
                      className="w-full text-xs p-2 border border-slate-200 rounded bg-[#fdfdfd] focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-50 font-mono" 
                      value={config.retryBackoffMs}
                      onChange={(e) => updateConfigField('retryBackoffMs', parseInt(e.target.value) || 1000)}
                      required
                    />
                    <span className="text-[9px] text-slate-400 font-sans block mt-1">Exponential Backoff (ms)</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={savingConfig}
                className="w-full mt-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-4 rounded transition disabled:opacity-70 flex items-center justify-center gap-1.5 border border-slate-950"
              >
                {savingConfig ? 'Applying & Reloading Scheduler...' : 'Save Configuration & Apply Scheduler'}
              </button>
            </form>
          </section>
        </aside>

        {/* RIGHT COLUMN: Operational Monitoring Dashboard */}
        <section 
          id="operational_dashboard" 
          className={`flex flex-col gap-6 overflow-y-auto max-h-[calc(100vh-8.5rem)] pr-1 ${leftPanelCollapsed ? 'col-span-12' : 'col-span-12 lg:col-span-8'}`}
        >
          
          {/* Operational Metrics Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
            
            {/* GpsGate Connection Status */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">GpsGate Connection Status</span>
              <div className="flex items-center gap-2 mt-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  schedulerStatus.gpsgateConnected === 'connected' ? 'bg-emerald-500 animate-pulse' :
                  schedulerStatus.gpsgateConnected === 'error' ? 'bg-rose-500' : 'bg-slate-300'
                }`}></span>
                <span className="text-xl font-bold font-mono text-slate-800 uppercase xl:text-2xl">
                  {schedulerStatus.gpsgateConnected === 'connected' ? 'Connected' :
                   schedulerStatus.gpsgateConnected === 'error' ? 'Handshake Fail' : 'Pending'}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono block mt-1">
                {config.useGpsgateMock ? 'Demo server simulator active' : `Connecting as App ID: ${config.gpsgateAppId}`}
              </span>
              <div className="absolute right-3 top-3 opacity-10 group-hover:opacity-20 transition">
                <Server className="w-10 h-10 text-slate-900" />
              </div>
            </div>

            {/* Target Integration Success Rate */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Target Receiver Status</span>
              <div className="flex items-center gap-2 mt-2">
                <span className={`w-2.5 h-2.5 rounded-full ${
                  schedulerStatus.targetConnected === 'connected' ? 'bg-emerald-500 animate-pulse' :
                  schedulerStatus.targetConnected === 'error' ? 'bg-rose-500' : 'bg-slate-300'
                }`}></span>
                <span className="text-xl font-bold font-mono text-slate-800 uppercase xl:text-2xl">
                  {schedulerStatus.targetConnected === 'connected' ? 'Ready (200)' :
                   schedulerStatus.targetConnected === 'error' ? 'Timeout / Error' : 'Untested'}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono block mt-1 truncate max-w-full" title={config.targetUrl}>
                {config.targetUrl ? config.targetUrl.substring(0, 36) + '...' : 'Destination endpoint undefined'}
              </span>
              <div className="absolute right-3 top-3 opacity-10 group-hover:opacity-20 transition">
                <DatabaseZap className="w-10 h-10 text-slate-900" />
              </div>
            </div>

            {/* Integration Transmission Success Rate */}
            <div className="bg-white border border-slate-200 rounded-lg p-4 flex flex-col justify-between shadow-sm relative overflow-hidden group">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest block">Operational Reliability</span>
              <div className="flex items-center gap-1.5 mt-2">
                <span className={`text-xl font-bold font-mono xl:text-2xl ${
                  parseFloat(successRate) > 95 ? 'text-emerald-600' :
                  parseFloat(successRate) > 75 ? 'text-amber-500' :
                  'text-rose-500'
                }`}>
                  {successRate}% 
                </span>
                <span className="text-[10px] text-slate-400 font-sans font-medium">Data Rate</span>
              </div>
              <span className="text-[9px] text-slate-400 font-mono block mt-1">
                {totalLoadedPositions} active vehicles in transit
              </span>
              <div className="absolute right-3 top-3 opacity-10 group-hover:opacity-20 transition">
                <Activity className="w-10 h-10 text-slate-900" />
              </div>
            </div>

          </div>

          {/* GpsGate Positions Monitor */}
          <FleetMonitor 
            vehicles={vehicles.length > 0 ? vehicles : (logs.slice(0, 15).some(l => l.type === 'TRANSFORM') ? generateMockFleet() : [])}
            isMock={config.useGpsgateMock}
            onRefresh={() => fetchOperationalState(false)}
            loading={syncingNow}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
          />

          {/* Payload JSON Structure Inspector */}
          <PayloadInspector 
            receivedPayloads={mockPayloads}
            activeVehicles={vehicles.length > 0 ? vehicles : generateMockFleet()}
            onClearReceived={handleClearSandboxStore}
            gpsgateAppId={config.gpsgateAppId}
            selectedVehicleId={selectedVehicleId}
            onSelectVehicle={setSelectedVehicleId}
            config={config}
            logs={logs}
            lastTargetResponse={lastTargetResponse}
          />

          {/* Detailed Real-time Transmission Activity Logs */}
          <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col flex-1 overflow-hidden min-h-[340px]">
            
            {/* Log Control Header */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2">
              <div>
                <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-slate-500" />
                  <span>Real-time Operational Logs</span>
                </h2>
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">Captures GpsGate pulls &amp; target retries securely</p>
              </div>

              {/* Log Level Filters */}
              <div className="flex items-center gap-2">
                <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded-md text-[10px]">
                  {(['ALL', 'SUCCESS', 'WARNING', 'ERROR'] as const).map(flt => (
                    <button
                      key={flt}
                      onClick={() => setLogFilter(flt)}
                      className={`px-2 py-0.5 font-bold uppercase rounded transition-all ${
                        logFilter === flt ? 'bg-white border border-slate-200/80 text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      {flt}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="text-[10px] font-bold text-slate-400 hover:text-slate-600 bg-slate-100 border border-slate-200 px-2 py-1 rounded transition"
                >
                  Clear logs
                </button>
              </div>
            </div>

            {/* Action Logs Table View (matches professional theme table style) */}
            <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-200 text-xs font-mono max-h-[460px]">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-slate-900 text-slate-500 uppercase text-[9px] tracking-wider font-extrabold border-b border-slate-800/80">
                  <tr className="text-left">
                    <th className="p-2.5 border-b border-slate-800 font-mono">Timestamp</th>
                    <th className="p-2.5 border-b border-slate-800 font-mono">Operations Event</th>
                    <th className="p-2.5 border-b border-slate-800 font-mono">Severity Status</th>
                    <th className="p-2.5 border-b border-slate-800 font-mono">Log Trace Stream Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 font-mono">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-6 text-center text-slate-500 italic">
                        No operations logs currently stored for the selected filter ({logFilter}).
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => {
                      const isExpanded = expandedLogId === log.id;
                      return (
                        <React.Fragment key={log.id}>
                          <tr 
                            onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                            className={`hover:bg-slate-900/60 transition-colors cursor-pointer select-none ${
                              isExpanded ? 'bg-slate-900' : ''
                            } ${
                              log.status === 'error' ? 'bg-rose-950/20 text-rose-300' :
                              log.status === 'warning' ? 'bg-amber-950/20 text-amber-300' :
                              log.type === 'SYNC_COMPLETE' ? 'bg-emerald-950/20 text-emerald-300' :
                              'text-slate-300'
                            }`}
                          >
                            <td className="p-2.5 text-[11px] text-slate-500 font-mono whitespace-nowrap border-b border-slate-900">
                              <div className="flex items-center gap-1.5">
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                                )}
                                <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                              </div>
                            </td>
                            <td className="p-2.5 text-[11px] font-bold tracking-tight whitespace-nowrap border-b border-slate-900">
                              {log.type}
                            </td>
                            <td className="p-2.5 border-b border-slate-900">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                                log.status === 'success' ? 'bg-emerald-900/60 text-emerald-400 border border-emerald-800' :
                                log.status === 'error' ? 'bg-rose-900/60 text-rose-400 border border-rose-800' :
                                log.status === 'warning' ? 'bg-amber-900/60 text-amber-400 border border-amber-800' :
                                'bg-slate-900 text-slate-400 border border-slate-800'
                              }`}>
                                {log.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-[11px] max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl truncate border-b border-slate-900 leading-relaxed" title={log.details || log.message}>
                              <span className="font-medium text-slate-200">{log.message}</span>
                              {log.details && (
                                <span className="text-[10px] text-slate-500 block mt-0.5 italic truncate font-mono">
                                  {log.details}
                                </span>
                              )}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="bg-slate-950 border-none">
                              <td colSpan={4} className="p-4 bg-slate-900/30 border-b border-slate-900">
                                <div className="space-y-2.5">
                                  <div className="flex justify-between items-center text-[10px] text-slate-400 uppercase tracking-widest font-extrabold pb-1.5 border-b border-slate-800/60">
                                    <span>Log Event Trace Details &amp; Response Body</span>
                                    <span className="font-mono text-[9px] text-slate-500">Log ID: {log.id}</span>
                                  </div>
                                  <pre className="text-[11px] leading-relaxed select-all whitespace-pre-wrap font-mono break-all max-h-[300px] overflow-y-auto bg-slate-950 p-4 rounded-lg border border-slate-850 text-slate-300">
                                    {log.details ? (() => {
                                      try {
                                        const trimmed = log.details.trim();
                                        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                                          return JSON.stringify(JSON.parse(log.details), null, 2);
                                        }
                                      } catch (_) {}
                                      return log.details;
                                    })() : "No additional payload details captured for this log step."}
                                  </pre>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

          </div>

        </section>

            </div>
          )}
      </main>
      )}

      {/* FOOTER BAR */}
      <footer id="dashboard_footer" className="h-10 border-t border-slate-200 bg-white flex items-center justify-between px-8 text-[9px] text-slate-400 uppercase font-bold tracking-wider mt-auto shrink-0 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
          <span>Secure AES payload transit (TLS 1.3)</span>
        </div>
        <div>
          <span>© 2026  WRU Corporation</span>
        </div>
      </footer>

    </div>
  );
}
