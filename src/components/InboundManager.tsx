import React, { useState, useEffect } from 'react';
import { 
  Wifi, 
  Trash2, 
  RefreshCw, 
  Play, 
  ChevronRight, 
  ChevronDown, 
  Terminal, 
  Search, 
  Copy, 
  Check, 
  Globe, 
  Info,
  Calendar,
  AlertTriangle,
  Clock,
  Plus,
  X
} from 'lucide-react';
import { InboundEventMessage } from '../types';

interface InboundManagerProps {
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

export default function InboundManager({ onNotify }: InboundManagerProps) {
  const [events, setEvents] = useState<InboundEventMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('speeding');
  const [lastSimulatedUrl, setLastSimulatedUrl] = useState<string | null>(null);
  const [queryParamsList, setQueryParamsList] = useState<{ key: string; val: string }[]>([]);

  // Pre-populate query params list when template changes
  useEffect(() => {
    const timestampStr = new Date().toISOString();
    let initialParams: { key: string; val: string }[] = [];
    if (selectedTemplate === 'speeding') {
      initialParams = [
        { key: 'EVENT_NAME', val: 'Speeding Alert' },
        { key: 'USER_USERNAME', val: 'Truck Alpha (Dry Cargo)' },
        { key: 'LICENSE_PLATE', val: 'CP CCK 9585' },
        { key: 'SIGNAL_SPEED', val: '98' },
        { key: 'SPEED_LIMIT', val: '80' },
        { key: 'POS_LATITUDE', val: '14.6125' },
        { key: 'POS_LONGITUDE', val: '121.0012' },
        { key: 'IGNITION', val: 'true' },
        { key: 'ALERT_SEVERITY', val: 'high' },
        { key: 'POS_TIME', val: timestampStr }
      ];
    } else if (selectedTemplate === 'geofence') {
      initialParams = [
        { key: 'EVENT_NAME', val: 'Geofence Exit Alert' },
        { key: 'USER_USERNAME', val: 'Truck Beta (Reefer)' },
        { key: 'LICENSE_PLATE', val: 'CP PLK 8831' },
        { key: 'GEOFENCE_NAME', val: 'North Hub Storage Complex' },
        { key: 'SIGNAL_SPEED', val: '42' },
        { key: 'POS_LATITUDE', val: '14.6349' },
        { key: 'POS_LONGITUDE', val: '121.0423' },
        { key: 'IGNITION', val: 'true' },
        { key: 'ALERT_SEVERITY', val: 'medium' },
        { key: 'POS_TIME', val: timestampStr }
      ];
    } else if (selectedTemplate === 'ignition') {
      initialParams = [
        { key: 'EVENT_NAME', val: 'Ignition Off Alert' },
        { key: 'USER_USERNAME', val: 'Van Delta (Courier)' },
        { key: 'LICENSE_PLATE', val: 'CP TYU 9283' },
        { key: 'SIGNAL_SPEED', val: '0' },
        { key: 'POS_LATITUDE', val: '14.5547' },
        { key: 'POS_LONGITUDE', val: '121.0244' },
        { key: 'IGNITION', val: 'false' },
        { key: 'ALERT_SEVERITY', val: 'low' },
        { key: 'POS_TIME', val: timestampStr }
      ];
    } else {
      initialParams = [
        { key: 'EVENT_NAME', val: 'SOS Emergency Button Pressed' },
        { key: 'USER_USERNAME', val: 'Vessel Gamma (Oil Tanker)' },
        { key: 'LICENSE_PLATE', val: 'SEA GAM 003' },
        { key: 'SIGNAL_SPEED', val: '12' },
        { key: 'POS_LATITUDE', val: '14.5752' },
        { key: 'POS_LONGITUDE', val: '120.9412' },
        { key: 'IGNITION', val: 'true' },
        { key: 'CAPTAIN_NAME', val: 'Manuel Santos' },
        { key: 'ALERT_SEVERITY', val: 'critical' },
        { key: 'POS_TIME', val: timestampStr }
      ];
    }
    setQueryParamsList(initialParams);
  }, [selectedTemplate]);

  // Helpers to manage dynamic query parameters
  const handleAddParam = () => {
    setQueryParamsList([...queryParamsList, { key: 'CUSTOM_PARAM', val: '' }]);
  };

  const handleUpdateParamKey = (index: number, newKey: string) => {
    const list = [...queryParamsList];
    list[index].key = newKey;
    setQueryParamsList(list);
  };

  const handleUpdateParamVal = (index: number, newVal: string) => {
    const list = [...queryParamsList];
    list[index].val = newVal;
    setQueryParamsList(list);
  };

  const handleRemoveParam = (index: number) => {
    const list = queryParamsList.filter((_, i) => i !== index);
    setQueryParamsList(list);
  };

  // Load inbound events from API
  const fetchEvents = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetch('/api/inbound-events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data || []);
      } else {
        onNotify('error', 'Failed to retrieve inbound events.');
      }
    } catch (err) {
      console.error('Error fetching inbound events:', err);
      onNotify('error', 'Network error while fetching inbound events.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    // Auto-refresh every 5 seconds silently
    const interval = setInterval(() => {
      fetchEvents(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Clear all events
  const handleClearEvents = async () => {
    if (!window.confirm('Are you sure you want to clear all received inbound events? This will delete them from Firestore.')) {
      return;
    }
    setClearing(true);
    try {
      const res = await fetch('/api/inbound-events/clear', { method: 'POST' });
      if (res.ok) {
        setEvents([]);
        setSelectedEventId(null);
        onNotify('success', 'All inbound events cleared from database.');
      } else {
        onNotify('error', 'Failed to clear inbound events.');
      }
    } catch (err) {
      console.error(err);
      onNotify('error', 'Network error clearing inbound events.');
    } finally {
      setClearing(false);
    }
  };

  // Simulate a GpsGate Event Notification using custom query parameters
  const handleSimulateEvent = async () => {
    setSimulating(true);
    try {
      const queryParams = new URLSearchParams();
      queryParams.set('source', 'GpsGateExpression');
      
      queryParamsList.forEach(item => {
        if (item.key.trim()) {
          queryParams.set(item.key.trim(), item.val);
        }
      });

      const endpointUrl = getInboundEndpointUrl();
      const queryUrl = `${endpointUrl}?${queryParams.toString()}`;
      setLastSimulatedUrl(queryUrl);

      // To avoid CORS and Google Sign-in redirect blocks in the development sandbox,
      // we transmit the simulated request using a relative path on the same origin.
      // This ensures the local Express engine processes the event and persists it to the
      // shared Firestore database so that it appears in both development and production dashboards.
      const relativeQueryUrl = `/api/inbound-events?${queryParams.toString()}`;
      const res = await fetch(relativeQueryUrl, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'X-GpsGate-AppId': '208',
          'X-GpsGate-EventId': String(Date.now())
        }
      });

      if (res.ok) {
        const eventNameItem = queryParamsList.find(p => p.key.toUpperCase() === 'EVENT_NAME');
        const evName = eventNameItem ? eventNameItem.val : 'Event';
        onNotify('success', `Simulated "${evName}" successfully received by GpsGate Expression endpoint.`);
        fetchEvents(true);
      } else {
        onNotify('error', 'Simulation payload was rejected by endpoint.');
      }
    } catch (err) {
      console.error(err);
      onNotify('error', 'Network error during simulation.');
    } finally {
      setSimulating(false);
    }
  };

  // Helper to copy text to clipboard
  const handleCopyText = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
    onNotify('info', 'Text copied to clipboard.');
  };

  // Filter events based on search query
  const filteredEvents = events.filter(evt => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const idMatch = evt.id.toLowerCase().includes(query);
    const queryStr = JSON.stringify(evt.query || '').toLowerCase();
    return idMatch || queryStr.includes(query);
  });

  const getInboundEndpointUrl = () => {
    const origin = window.location.origin;
    const prodOrigin = origin.replace('ais-dev-', 'ais-pre-');
    return `${prodOrigin}/api/inbound-events`;
  };

  return (
    <div id="inbound_manager_panel" className="grid grid-cols-12 gap-6 h-full overflow-hidden">
      
      {/* LEFT COLUMN: Endpoint Description & Simulator */}
      <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
        
        {/* Endpoint Configuration Card */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-1.5 bg-emerald-50 rounded-lg text-emerald-600 border border-emerald-100">
              <Wifi className="w-4 h-4 animate-pulse" />
            </div>
            <h2 className="font-bold text-slate-800 text-sm">GpsGate Inbound HTTP Endpoint</h2>
          </div>
          
          <p className="text-xs text-slate-600 leading-relaxed mb-4">
            Point your GpsGate server notifications / HTTP Expressions to the following address to capture instant tracking triggers in real time.
          </p>

          <div className="space-y-3.5">
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">HTTP Methods Accepted</span>
              <span className="inline-block bg-slate-100 text-slate-800 text-[10px] font-mono font-bold px-2 py-0.5 rounded border border-slate-200">
                POST
              </span>
            </div>

            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">Target Endpoint URL</span>
              <div className="flex items-center gap-1">
                <input 
                  type="text" 
                  readOnly 
                  value={getInboundEndpointUrl()}
                  className="w-full text-[11px] font-mono p-2 border border-slate-200 rounded bg-slate-50 text-slate-700 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleCopyText(getInboundEndpointUrl(), 'endpoint_url')}
                  className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-500 rounded transition"
                  title="Copy URL"
                >
                  {copiedId === 'endpoint_url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="p-3 bg-blue-50 border border-blue-100 rounded-lg flex gap-2.5">
              <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-blue-800 leading-relaxed">
                <span className="font-bold">As-Is Raw Logging Active:</span> For debugging and planning, the endpoint accepts all payloads and queries as-is without requiring upfront strict parsing rules.
              </div>
            </div>

            <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-lg flex gap-2.5">
              <Globe className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-emerald-800 leading-relaxed">
                <span className="font-bold">Public Endpoint (Production):</span> This URL resolves to the public shared service which allows unauthenticated requests, bypassing Google Sign-In so that external servers like GpsGate can post tracking alerts directly.
              </div>
            </div>
          </div>
        </div>

        {/* Live Simulator Card */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm p-5 flex-1 flex flex-col justify-between overflow-hidden">
          <div className="flex flex-col flex-1 overflow-hidden">
            <div className="flex items-center gap-2 mb-2 shrink-0">
              <div className="p-1.5 bg-blue-50 rounded-lg text-blue-600 border border-blue-100">
                <Globe className="w-4 h-4" />
              </div>
              <h2 className="font-bold text-slate-800 text-sm">GpsGate Notification Emulator</h2>
            </div>

            <p className="text-[11px] text-slate-500 leading-relaxed mb-3 shrink-0">
              Emulate a real-time GET HTTP Expression request from GpsGate. Select a preset template, then configure arbitrary query parameters exactly as GpsGate would.
            </p>

            <div className="space-y-3 flex flex-col flex-1 overflow-hidden">
              <div className="shrink-0">
                <label className="text-[9px] uppercase font-bold text-slate-400 block mb-1">Select Event Preset Template</label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'speeding', label: 'Speed Limit Viol' },
                    { id: 'geofence', label: 'Geofence Exit' },
                    { id: 'ignition', label: 'Ignition Off' },
                    { id: 'sos', label: 'SOS Alert' }
                  ].map(tmpl => (
                    <button
                      type="button"
                      key={tmpl.id}
                      onClick={() => setSelectedTemplate(tmpl.id)}
                      className={`py-1.5 px-2 border text-[11px] font-semibold rounded transition text-center cursor-pointer ${
                        selectedTemplate === tmpl.id 
                          ? 'bg-blue-50 border-blue-300 text-blue-700 shadow-xs' 
                          : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-600'
                      }`}
                    >
                      {tmpl.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dynamic Query Parameters Editor */}
              <div className="flex flex-col flex-1 overflow-hidden min-h-[140px]">
                <div className="flex justify-between items-center mb-1.5 shrink-0">
                  <label className="text-[9px] uppercase font-bold text-slate-400">Configure Query Parameters</label>
                  <button
                    type="button"
                    onClick={handleAddParam}
                    className="text-[10px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-0.5 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Field</span>
                  </button>
                </div>

                <div className="border border-slate-200 rounded-lg overflow-y-auto bg-slate-50 flex-1">
                  <table className="w-full text-[11px]">
                    <thead className="bg-slate-100 border-b border-slate-200 text-slate-500 uppercase font-bold text-[8px] tracking-wider text-left sticky top-0 z-10">
                      <tr>
                        <th className="p-1.5 w-[45%]">Key</th>
                        <th className="p-1.5 w-[45%]">Value</th>
                        <th className="p-1.5 w-[10%] text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 bg-white">
                      {queryParamsList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50">
                          <td className="p-1">
                            <input
                              type="text"
                              value={item.key}
                              onChange={(e) => handleUpdateParamKey(idx, e.target.value)}
                              placeholder="PARAM_NAME"
                              className="w-full px-1 py-0.5 border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white bg-transparent rounded font-mono text-[10px] text-slate-700 focus:outline-none"
                            />
                          </td>
                          <td className="p-1">
                            <input
                              type="text"
                              value={item.val}
                              onChange={(e) => handleUpdateParamVal(idx, e.target.value)}
                              placeholder="value"
                              className="w-full px-1 py-0.5 border border-transparent hover:border-slate-200 focus:border-blue-500 focus:bg-white bg-transparent rounded font-mono text-[10px] text-slate-700 focus:outline-none"
                            />
                          </td>
                          <td className="p-1 text-center">
                            <button
                              type="button"
                              onClick={() => handleRemoveParam(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer"
                              title="Delete Parameter"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {queryParamsList.length === 0 && (
                        <tr>
                          <td colSpan={3} className="p-3 text-center text-slate-400 italic text-[10px]">
                            No parameters. Click "Add Field" to add custom variables.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={handleSimulateEvent}
              disabled={simulating}
              className="w-full mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-3 rounded shadow-md shadow-blue-100 disabled:opacity-70 transition flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Play className={`w-3.5 h-3.5 ${simulating ? 'animate-pulse' : ''}`} />
              <span>{simulating ? 'Transmitting Event...' : 'Transmit GpsGate Event'}</span>
            </button>

            {lastSimulatedUrl && (
              <div className="mt-3 p-2 bg-slate-50 border border-slate-200 rounded text-left">
                <span className="text-[8px] uppercase font-bold text-slate-400 block mb-0.5">Last Transmitted URL (GpsGate GET expression)</span>
                <div className="flex items-start gap-1">
                  <div className="w-full text-[9px] font-mono p-1 border border-slate-200 rounded bg-white text-slate-650 select-all break-all overflow-y-auto max-h-16 leading-tight">
                    {lastSimulatedUrl}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyText(lastSimulatedUrl, 'sim_url')}
                    className="p-1 border border-slate-200 hover:bg-slate-100 text-slate-500 rounded transition shrink-0 cursor-pointer"
                    title="Copy Simulated URL"
                  >
                    {copiedId === 'sim_url' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* RIGHT COLUMN: Received Logs & Viewer */}
      <div className="col-span-12 lg:col-span-8 flex flex-col gap-6 overflow-hidden max-h-[calc(100vh-8.5rem)]">
        
        {/* Main Console & Header */}
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm flex flex-col flex-1 overflow-hidden">
          
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-wrap justify-between items-center gap-2 shrink-0">
            <div>
              <h2 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <Terminal className="w-4 h-4 text-slate-500" />
                <span>Inbound Message Ingest Hub</span>
              </h2>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">Displays payloads saved in Firestore collection</p>
            </div>

            <div className="flex items-center gap-2.5">
              {/* Search input */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                <input
                  type="text"
                  placeholder="Filter events..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-white focus:outline-none focus:border-blue-500 w-44"
                />
              </div>

              <button
                type="button"
                onClick={() => fetchEvents()}
                disabled={loading}
                className="p-1.5 hover:bg-slate-100 border border-slate-200 hover:border-slate-300 rounded text-slate-500 transition cursor-pointer"
                title="Refresh logs"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                type="button"
                onClick={handleClearEvents}
                disabled={clearing || events.length === 0}
                className="p-1.5 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded text-slate-450 hover:text-rose-600 transition cursor-pointer"
                title="Delete all messages"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Table List View */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse">
              <thead className="sticky top-0 bg-slate-100 text-slate-500 uppercase text-[9px] tracking-wider font-extrabold border-b border-slate-200 shrink-0">
                <tr className="text-left">
                  <th className="p-3 w-44">Ingest Time</th>
                  <th className="p-3 w-40">Message ID</th>
                  <th className="p-3 w-20">Method</th>
                  <th className="p-3">Body Payload / Fields Saved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-150 text-xs text-slate-700">
                {filteredEvents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-12 text-center text-slate-400 italic font-medium">
                      {searchQuery ? 'No inbound messages matching search query.' : 'No inbound GpsGate messages received yet. Configure GpsGate server or click "Simulate GpsGate Event" to ingest sample payloads.'}
                    </td>
                  </tr>
                ) : (
                  filteredEvents.map(evt => {
                    const isExpanded = selectedEventId === evt.id;

                    const getQueryVal = (query: any, ...keys: string[]) => {
                      if (!query) return undefined;
                      for (const key of keys) {
                        if (query[key] !== undefined) return query[key];
                        const foundKey = Object.keys(query).find(k => k.toLowerCase() === key.toLowerCase());
                        if (foundKey) return query[foundKey];
                      }
                      return undefined;
                    };

                    const eventName = getQueryVal(evt.query, 'EVENT_NAME', 'event') || 'GpsGate Event';
                    const severity = String(getQueryVal(evt.query, 'ALERT_SEVERITY', 'alertSeverity') || 'low').toLowerCase();
                    const vehicleName = getQueryVal(evt.query, 'USER_USERNAME', 'vehicle') || '';
                    
                    return (
                      <React.Fragment key={evt.id}>
                        <tr
                          onClick={() => setSelectedEventId(isExpanded ? null : evt.id)}
                          className={`hover:bg-slate-50 cursor-pointer transition-all ${
                            isExpanded ? 'bg-slate-50/70 border-l-2 border-blue-600' : ''
                          }`}
                        >
                          <td className="p-3 text-slate-500 font-mono whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              {isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <span>{new Date(evt.timestamp).toLocaleString()}</span>
                            </div>
                          </td>
                          <td className="p-3 font-mono text-[11px] font-semibold text-slate-600 whitespace-nowrap">
                            {evt.id}
                          </td>
                          <td className="p-3">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-150">
                              {evt.method}
                            </span>
                          </td>
                          <td className="p-3 truncate max-w-sm sm:max-w-md">
                            <div className="flex items-center gap-2">
                              {eventName && (
                                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase whitespace-nowrap ${
                                  severity === 'critical' ? 'bg-rose-100 text-rose-800 border border-rose-200' :
                                  severity === 'high' ? 'bg-orange-100 text-orange-800 border border-orange-200' :
                                  severity === 'medium' ? 'bg-amber-100 text-amber-850 border border-amber-200' :
                                  'bg-blue-100 text-blue-800 border border-blue-200'
                                }`}>
                                  {eventName}
                                </span>
                              )}
                              {vehicleName && (
                                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-700 border border-slate-200 uppercase max-w-[120px] truncate">
                                  {vehicleName}
                                </span>
                              )}
                              <span className="text-slate-500 font-mono text-[10px] truncate">
                                {Object.entries(evt.query || {}).filter(([k]) => k !== 'source' && k !== 'template').map(([k, v]) => `${k}=${v}`).join(', ')}
                              </span>
                            </div>
                          </td>
                        </tr>
 
                        {isExpanded && (
                          <tr className="bg-slate-50">
                            <td colSpan={4} className="p-4 border-t border-b border-slate-200">
                              <div className="bg-slate-900 text-slate-200 rounded-lg p-4 font-mono text-xs shadow-inner">
                                <div className="flex justify-between items-center text-[10px] text-slate-400 uppercase tracking-wider font-extrabold pb-2 border-b border-slate-800 mb-3">
                                  <span>Expanded Ingestion Stream Payload</span>
                                  <div className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      onClick={() => handleCopyText(JSON.stringify(evt, null, 2), evt.id)}
                                      className="hover:text-white flex items-center gap-1 bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded transition text-[9px]"
                                    >
                                      {copiedId === evt.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                                      <span>Copy Payload</span>
                                    </button>
                                  </div>
                                </div>
 
                                <div className="space-y-3 font-mono text-[11px] leading-relaxed">
                                  {/* Headers */}
                                  <div>
                                    <span className="text-blue-400 font-bold block mb-1 uppercase text-[10px]">&gt; HTTP Headers</span>
                                    <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 text-slate-300 overflow-x-auto whitespace-pre font-mono">
                                      {JSON.stringify(evt.headers, null, 2)}
                                    </pre>
                                  </div>

                                  {/* Query parameters */}
                                  {Object.keys(evt.query || {}).length > 0 && (
                                    <div>
                                      <span className="text-amber-400 font-bold block mb-1 uppercase text-[10px]">&gt; Query Parameters (Entire Event Payload)</span>
                                      <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 text-slate-300 overflow-x-auto whitespace-pre font-mono">
                                        {JSON.stringify(evt.query, null, 2)}
                                      </pre>
                                    </div>
                                  )}

                                  {/* Body */}
                                  <div>
                                    <span className="text-slate-500 font-bold block mb-1 uppercase text-[10px]">&gt; Message Body</span>
                                    <pre className="bg-slate-950 p-2.5 rounded border border-slate-800 text-slate-400 overflow-x-auto whitespace-pre-wrap font-mono italic">
                                      {evt.body === null ? "Ignored (All event data is captured dynamically from GET query parameters exactly as GpsGate HTTP Expression prescribes)" : JSON.stringify(evt.body)}
                                    </pre>
                                  </div>
                                </div>
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

          {/* Footer status bar */}
          <div className="p-3 border-t border-slate-100 bg-slate-50 flex justify-between items-center text-[10px] uppercase font-bold text-slate-400 tracking-wider shrink-0 select-none">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>Endpoint: Live &amp; Listening</span>
            </div>
            <div>
              <span>Total cached notifications: {events.length}</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
