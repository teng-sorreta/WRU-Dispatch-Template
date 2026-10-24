import React from 'react';
import { MockTargetReceivedPayload, FleetVehicle, AppConfig, SyncLogEntry } from '../types';
import { Code, Server, CheckCircle2, ChevronDown, ChevronRight, Ban, HelpCircle, Eye, Copy, Check } from 'lucide-react';

interface PayloadInspectorProps {
  receivedPayloads: MockTargetReceivedPayload[];
  activeVehicles: FleetVehicle[];
  onClearReceived: () => void;
  gpsgateAppId: string;
  selectedVehicleId: string | number | null;
  onSelectVehicle: (id: string | number | null) => void;
  config: AppConfig;
  logs: SyncLogEntry[];
  lastTargetResponse?: { status: number; statusText: string; body: string; timestamp: string } | null;
}

export default function PayloadInspector({ 
  receivedPayloads, 
  activeVehicles, 
  onClearReceived,
  gpsgateAppId,
  selectedVehicleId,
  onSelectVehicle,
  config,
  logs,
  lastTargetResponse
}: PayloadInspectorProps) {
  const [activeTab, setActiveTab] = React.useState<'converter' | 'sandbox'>('converter');
  const [expandedPayloadId, setExpandedPayloadId] = React.useState<string | null>(null);
  const [transmitting, setTransmitting] = React.useState(false);
  const [sandboxResponse, setSandboxResponse] = React.useState<{
    status: number;
    statusText: string;
    headers: Record<string, string>;
    body: string;
    latencyMs: number;
    error?: string;
  } | null>(null);

  // Schema example mappings
  const chosenVehicle = (selectedVehicleId && activeVehicles.find(v => v.id === selectedVehicleId)) || 
    (activeVehicles && activeVehicles.length > 0 ? activeVehicles[0] : null);

  const gpsgateMockSchema = chosenVehicle?.rawPayload ? chosenVehicle.rawPayload : {
    trackPoint: {
      position: {
        altitude: 4,
        longitude: 120.187876,
        latitude: 16.005825
      },
      velocity: {
        groundSpeed: 12.777777777777777,
        heading: 264
      },
      utc: "2026-05-24T07:51:49Z",
      valid: true
    },
    calculatedSpeed: 12.777777777777777,
    deviceActivity: "2026-05-24T07:51:59Z",
    username: "217743",
    name: "CP GAW 4583",
    surname: "",
    description: "Date Installed: 2025-05-22 Technician: Crizandro Parado",
    email: "",
    devices: [
      {
        id: 6481,
        created: "2025-05-21T23:51:52Z",
        name: "FifoTrack S20",
        hidePosition: false,
        proximity: 0,
        imei: "867556046588557",
        msisdn: {
          raw: "+639154677086"
        },
        email: "",
        apn: "",
        gprsUsername: "",
        gprsPassword: "",
        lastIP: "",
        lastPort: 0,
        staticIP: "",
        staticPort: 0,
        protocolID: "FifoTrack",
        profileId: 0,
        protocolVersionID: 0,
        msgFieldDictionaryID: 26849,
        deviceDefinitionID: 154,
        mobileNetworkID: 0,
        longitude: 0,
        latitude: 0,
        timeStamp: "0001-01-01T00:00:00",
        ownerID: 7277,
        ownerUsername: "",
        ownerName: "",
        ownerEmail: "",
        devicePassword: "",
        oneWireVariables: []
      }
    ],
    userTemplateID: 0,
    originalApplicationID: 208,
    id: 7277,
    accumulators: []
  };

  function formatToWruTimezone(dateInput: Date | string): string {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return typeof dateInput === 'string' ? dateInput : "";
    const utcMs = date.getTime();
    const manilaMs = utcMs + (8 * 60 * 60 * 1000);
    const manilaDate = new Date(manilaMs);
    
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = manilaDate.getUTCFullYear();
    const mm = pad(manilaDate.getUTCMonth() + 1);
    const dd = pad(manilaDate.getUTCDate());
    const hh = pad(manilaDate.getUTCHours());
    const min = pad(manilaDate.getUTCMinutes());
    const ss = pad(manilaDate.getUTCSeconds());
    
    return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}+08:00`;
  }

  function getRecordId(deviceId: any, utcTimeStr: string): string {
    const cleanId = String(deviceId).replace(/\D/g, '');
    const date = new Date(utcTimeStr);
    if (isNaN(date.getTime())) {
      return cleanId + "20260524075149";
    }
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = date.getUTCFullYear();
    const mm = pad(date.getUTCMonth() + 1);
    const dd = pad(date.getUTCDate());
    const hh = pad(date.getUTCHours());
    const min = pad(date.getUTCMinutes());
    const ss = pad(date.getUTCSeconds());
    return `${cleanId}${yyyy}${mm}${dd}${hh}${min}${ss}`;
  }

  const gpsUtc = gpsgateMockSchema.trackPoint?.utc || "2026-05-24T07:51:49Z";
  const gpsTimeStr = formatToWruTimezone(gpsUtc);
  const sentTimeStr = formatToWruTimezone(gpsgateMockSchema.deviceActivity || gpsUtc);
  
  const tempDeviceId = gpsgateMockSchema.devices?.[0]?.id ?? gpsgateMockSchema.id ?? 7277;
  const recordIdVal = getRecordId(tempDeviceId, gpsUtc);
  const imeiVal = gpsgateMockSchema.devices?.[0]?.imei ?? "867556046588557";
  const licensePlateVal = gpsgateMockSchema.name ?? "CP GAW 4583";
  
  const latVal = gpsgateMockSchema.trackPoint?.position?.latitude ?? 16.005825;
  const lngVal = gpsgateMockSchema.trackPoint?.position?.longitude ?? 120.187876;
  
  // Calculate speed in km/h exactly as the server does:
  // - velocity.groundSpeed is in m/s, so multiply by 3.6
  // - calculatedSpeed or position.speed is in km/h
  let speedKmh = 0;
  if (gpsgateMockSchema.trackPoint?.velocity?.groundSpeed !== undefined) {
    speedKmh = Math.round(gpsgateMockSchema.trackPoint.velocity.groundSpeed * 3.6);
  } else if (gpsgateMockSchema.calculatedSpeed !== undefined) {
    speedKmh = Math.round(gpsgateMockSchema.calculatedSpeed);
  } else if (gpsgateMockSchema.trackPoint?.position?.speed !== undefined) {
    speedKmh = Math.round(gpsgateMockSchema.trackPoint.position.speed * 3.6);
  } else {
    // Default mock data speed is 46 km/h if velocity groundSpeed is 12.77 m/s
    speedKmh = 46;
  }

  const headingVal = gpsgateMockSchema.trackPoint?.velocity?.heading ?? 264;
  const validVal = gpsgateMockSchema.trackPoint?.valid ? 1 : 0;
  const drivingStatusVal = speedKmh > 0 ? "1" : "0";
  const parkingStatusVal = speedKmh <= 0 ? "1" : "0";
  
  const convertedMockSchema = [
    {
      "RECORD_ID": recordIdVal,
      "PROVIDER": "WRU",
      "BOX_ID": String(imeiVal),
      "LICENSE_PLATE": String(licensePlateVal),
      "PROVINCE": "0",
      "SENT_DATE_TIME": sentTimeStr,
      "GPS_DATE_TIME": gpsTimeStr,
      "LATITUDE": latVal,
      "LONGITUDE": lngVal,
      "SPEED": speedKmh,
      "DIRECTION": headingVal,
      "GPS_FIX": validVal,
      "TEMP": 0,
      "DRIVING_STATUS": drivingStatusVal,
      "VEHICLE_IO_STATUS": "0",
      "VEHICLE_PARKING": parkingStatusVal,
      "OVER_SPEED": "0",
      "PTO_IO_STATUS": "0",
      "GPS_IO_STATUS": "1",
      "GPS_RESET_BOX": "0",
      "MIAGE": 0
    }
  ];

  const [copied, setCopied] = React.useState(false);

  // Derive active Authorization headers formatted with Windows CMD line continuation (^)
  let activeAuthHeaderH = '';
  const authType = config.targetAuthType || 'custom';
  if (authType === 'bearer') {
    if (config.targetAuthToken) {
      const token = config.targetAuthToken.startsWith('Bearer ') 
        ? config.targetAuthToken 
        : `Bearer ${config.targetAuthToken}`;
      activeAuthHeaderH = `^\n-H "Authorization: ${token}" `;
    }
  } else if (authType === 'basic') {
    if (config.targetUsername || config.targetPassword) {
      const username = config.targetUsername || '';
      const password = config.targetPassword || '';
      let encoded = '';
      try {
        encoded = btoa(`${username}:${password}`);
      } catch (_) {
        encoded = '...';
      }
      activeAuthHeaderH = `^\n-H "Authorization: Basic ${encoded}" `;
    }
  } else if (authType === 'custom') {
    if (config.targetAuthHeader && config.targetAuthToken) {
      activeAuthHeaderH = `^\n-H "${config.targetAuthHeader}: ${config.targetAuthToken}" `;
    }
  }

  const escapedPayload = JSON.stringify(convertedMockSchema).replace(/"/g, '\\"');
  const curlCommandStr = `curl -X POST "${config.targetUrl || 'https://app.cpf-phil.com/CPFAPI/app/api/oracle/inbound-gps-data'}" ^
-H "Content-Type: application/json" ${activeAuthHeaderH}^
-d "${escapedPayload}"`;

  const copyCurlToClipboard = () => {
    navigator.clipboard.writeText(curlCommandStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSandboxTransmit = async () => {
    setTransmitting(true);
    setSandboxResponse(null);
    try {
      const response = await fetch('/api/sandbox/transmit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          payload: convertedMockSchema
        })
      });
      const data = await response.json();
      if (response.ok) {
        if (data.success !== undefined) {
          setSandboxResponse({
            status: data.status,
            statusText: data.statusText,
            headers: data.headers,
            body: data.body,
            latencyMs: data.latencyMs,
            error: data.success ? undefined : (data.message || 'Error occurred')
          });
        } else {
          setSandboxResponse({
            status: response.status,
            statusText: response.statusText,
            headers: {},
            body: JSON.stringify(data),
            latencyMs: 0
          });
        }
      } else {
        setSandboxResponse({
          status: response.status,
          statusText: response.statusText,
          headers: {},
          body: data.message || 'Transmission test failed',
          latencyMs: 0,
          error: data.message || 'HTTP error response'
        });
      }
    } catch (err: any) {
      setSandboxResponse({
        status: 0,
        statusText: 'Network / Timeout Error',
        headers: {},
        body: '',
        latencyMs: 0,
        error: err.message || 'Unable to connect to service'
      });
    } finally {
      setTransmitting(false);
    }
  };

  const toggleExpandPayload = (id: string) => {
    setExpandedPayloadId(prev => prev === id ? null : id);
  };

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between border-b border-slate-100 pb-3 mb-4 gap-2">
        <div className="flex items-center gap-2">
          <Code className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-slate-800 font-sans">JSON Payload Transformer &amp; Sandbox</h3>
        </div>
        
        {/* Sub-tabs */}
        <div className="flex bg-slate-100/80 p-0.5 rounded-lg border border-slate-200">
          <button
            onClick={() => setActiveTab('converter')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
              activeTab === 'converter' 
                ? 'bg-white text-blue-600 font-extrabold shadow-sm border border-slate-200/40' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Data Transform Mapping
          </button>
          <button
            onClick={() => setActiveTab('sandbox')}
            className={`px-3 py-1 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${
              activeTab === 'sandbox' 
                ? 'bg-white text-amber-600 font-extrabold shadow-sm border border-slate-200/40' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Target Sandbox Interceptor</span>
            {receivedPayloads.length > 0 && (
              <span className="bg-amber-100 text-amber-750 font-extrabold border border-amber-200 text-[9px] px-1.5 py-0 rounded-full">
                {receivedPayloads.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {activeTab === 'converter' ? (
        <div className="space-y-4">
          <div className="bg-slate-50 border border-slate-150 p-3 rounded-lg text-xs text-slate-600">
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-slate-500">
              <HelpCircle className="w-3.5 h-3.5 text-slate-400 flex-shrink-0 mt-0.5" />
              This full-stack engine seamlessly accesses the <strong className="text-slate-700">GpsGate v1 Positions REST contract</strong>. It handles credential logins, captures vehicle variables (like Ignition signals), normalizes metrics (e.g., speed), and bundles tracks into a standard JSON payload.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Source GpsGate representation */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono font-medium">
                <span className="flex items-center gap-1.5">
                  <span>[INPUT] Client GpsGate Format</span>
                  {selectedVehicleId && (
                    <span className="text-[9px] font-bold text-blue-605 bg-blue-50 border border-blue-150 rounded px-1.5 uppercase font-sans">
                      {chosenVehicle?.name || 'Selected'}
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-pink-600 bg-pink-50 border border-pink-100 px-1.5 py-0.5 rounded font-bold uppercase">REST positions api</span>
              </div>
              <pre className="text-[10px] leading-relaxed font-mono p-3 bg-slate-950 text-slate-300 rounded-lg max-h-[220px] overflow-y-auto border border-slate-850">
                {JSON.stringify(gpsgateMockSchema, null, 2)}
              </pre>
            </div>

            {/* Target Representation */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono font-medium">
                <span>[OUTPUT] Synchronized JSON format</span>
                <span className="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-110 px-1.5 py-0.5 rounded font-bold uppercase">Forwarded format</span>
              </div>
              <pre className="text-[10px] leading-relaxed font-mono p-3 bg-slate-950 text-slate-100 rounded-lg max-h-[220px] overflow-y-auto border border-slate-850">
                {JSON.stringify(convertedMockSchema, null, 2)}
              </pre>
            </div>
          </div>

          {/* Diagnostic Raw CURL Commands */}
          <div className="space-y-2 pt-2 border-t border-slate-100/60">
            <div className="flex items-center justify-between text-[11px] font-sans">
              <span className="font-bold text-slate-600">Generated Live Transmit CURL Command</span>
              <button
                onClick={copyCurlToClipboard}
                type="button"
                className="text-[10.5px] text-blue-600 bg-blue-50/50 hover:bg-blue-100 border border-blue-150 px-3 py-1 rounded transition flex items-center gap-1.5 font-bold cursor-pointer"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span className="text-emerald-700">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy CURL</span>
                  </>
                )}
              </button>
            </div>
            <div className="relative">
              <pre className="text-[10px] leading-relaxed font-mono p-3 bg-slate-950 text-slate-300 rounded-lg overflow-x-auto border border-slate-850 break-all select-all whitespace-pre-wrap max-h-[165px]">
                {curlCommandStr}
              </pre>
            </div>
          </div>

          {/* Diagnostic Raw Target Server Response */}
          <div className="space-y-2 pt-3 border-t border-slate-100/60">
            <div className="flex items-center justify-between text-[11px] font-sans">
              <span className="font-bold text-slate-600">Target Server Response</span>
              <button
                onClick={handleSandboxTransmit}
                disabled={transmitting || !config.targetUrl}
                type="button"
                className={`text-[10.5px] px-3 py-1 rounded transition flex items-center gap-1.5 font-bold cursor-pointer border ${
                  transmitting 
                    ? 'bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed' 
                    : 'bg-amber-50 text-amber-750 border-amber-200 hover:bg-amber-100'
                }`}
              >
                {transmitting ? (
                  <>
                    <div className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin"></div>
                    <span>Transmitting...</span>
                  </>
                ) : (
                  <>
                    <Server className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                    <span>Send Sandbox Data</span>
                  </>
                )}
              </button>
            </div>

            {/* Display the response body */}
            <div className="rounded-lg border border-slate-150 bg-slate-50/50 p-3 overflow-hidden">
               {sandboxResponse ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold uppercase text-slate-400 tracking-wider">Source:</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-200">
                        Active Sandbox Test
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      {sandboxResponse.status ? (
                        <span className={`font-bold px-1.5 py-0.5 rounded ${
                          sandboxResponse.status >= 200 && sandboxResponse.status < 300 
                            ? 'bg-emerald-105 text-emerald-800' 
                            : 'bg-rose-105 text-rose-800'
                        }`}>
                          HTTP {sandboxResponse.status} {sandboxResponse.statusText}
                        </span>
                      ) : (
                        <span className="bg-rose-105 text-rose-800 font-bold px-1.5 py-0.5 rounded">
                          Network Fail / Timeout
                        </span>
                      )}
                      {sandboxResponse.latencyMs > 0 && (
                        <span className="text-slate-500 font-medium">
                          {sandboxResponse.latencyMs}ms
                        </span>
                      )}
                    </div>
                  </div>
                  
                  {sandboxResponse.error && (
                    <div className="text-[10px] text-rose-600 font-semibold font-mono bg-rose-50 border border-rose-100 p-2 rounded">
                      {sandboxResponse.error}
                    </div>
                  )}

                  {(() => {
                    let isSandboxSuccess = true;
                    try {
                      if (sandboxResponse.body) {
                        const parsed = JSON.parse(sandboxResponse.body);
                        if (parsed.success === false) {
                          isSandboxSuccess = false;
                        }
                      }
                    } catch (_) {}

                    return (
                      <pre className={`text-[10px] leading-relaxed font-mono p-2.5 bg-slate-950 rounded overflow-x-auto border border-slate-900 break-all select-all max-h-[140px] whitespace-pre-wrap ${
                        isSandboxSuccess ? 'text-emerald-300' : 'text-rose-400 font-bold'
                      }`}>
                        {sandboxResponse.body ? (() => {
                          try {
                            const trimmed = sandboxResponse.body.trim();
                            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                              return JSON.stringify(JSON.parse(trimmed), null, 2);
                            }
                          } catch (_) {}
                          return sandboxResponse.body;
                        })() : "No response body returned from target server [Success]"}
                      </pre>
                    );
                  })()}
                </div>
              ) : lastTargetResponse ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[10px]">
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold uppercase text-slate-400 tracking-wider">Source:</span>
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-105 text-emerald-800 border border-emerald-200">
                        Live Endpoint Server Response
                      </span>
                    </div>
                    <div className="flex items-center gap-2 font-mono text-[10px]">
                      {lastTargetResponse.status ? (
                        <span className={`font-bold px-1.5 py-0.5 rounded ${
                          lastTargetResponse.status >= 200 && lastTargetResponse.status < 300 
                            ? 'bg-emerald-105 text-emerald-800 font-bold' 
                            : 'bg-rose-105 text-rose-800 font-bold'
                        }`}>
                          HTTP {lastTargetResponse.status} {lastTargetResponse.statusText}
                        </span>
                      ) : (
                        <span className="bg-rose-105 text-rose-800 font-bold px-1.5 py-0.5 rounded">
                          Network Fail / Timeout
                        </span>
                      )}
                      <span className="text-slate-400 text-[9px] font-sans">
                        {new Date(lastTargetResponse.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>

                  {(() => {
                    let isResponseSuccess = true;
                    try {
                      if (lastTargetResponse.body) {
                        const parsed = JSON.parse(lastTargetResponse.body);
                        if (parsed.success === false) {
                          isResponseSuccess = false;
                        }
                      }
                    } catch (_) {}

                    return (
                      <pre className={`text-[10px] leading-relaxed font-mono p-2.5 bg-slate-950 rounded overflow-x-auto border border-slate-900 break-all select-all max-h-[140px] whitespace-pre-wrap font-bold ${
                        isResponseSuccess ? 'text-emerald-300' : 'text-rose-400'
                      }`}>
                        {lastTargetResponse.body ? (() => {
                          try {
                            const trimmed = lastTargetResponse.body.trim();
                            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                              return JSON.stringify(JSON.parse(trimmed), null, 2);
                            }
                          } catch (_) {}
                          return lastTargetResponse.body;
                        })() : "No response body returned from target server [Success]"}
                      </pre>
                    );
                  })()}
                </div>
              ) : (() => {
                const latestTargetPostLog = logs?.find(log => log.type === 'TARGET_POST');
                if (latestTargetPostLog) {
                  return (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold uppercase text-slate-400 tracking-wider">Source:</span>
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase bg-slate-200 text-slate-700 border border-slate-300">
                            Latest Sync Log
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono text-[10px]">
                          <span className={`font-bold px-1.5 py-0.5 rounded capitalize ${
                            latestTargetPostLog.status === 'success' 
                              ? 'bg-emerald-100 text-emerald-850' 
                              : latestTargetPostLog.status === 'error' 
                                ? 'bg-rose-105 text-rose-800' 
                                : 'bg-slate-100 text-slate-850'
                          }`}>
                            {latestTargetPostLog.status}
                          </span>
                          <span className="text-slate-400 text-[9px] font-sans">
                            {new Date(latestTargetPostLog.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>

                      <div className="text-[10.5px] font-sans text-slate-600 line-clamp-2 leading-relaxed pb-1 select-text">
                        {latestTargetPostLog.message}
                      </div>

                      <pre className="text-[10px] leading-relaxed font-mono p-2.5 bg-slate-950 text-slate-300 rounded overflow-x-auto border border-slate-900 break-all select-all max-h-[140px] whitespace-pre-wrap">
                        {latestTargetPostLog.details ? (() => {
                          try {
                            const trimmed = latestTargetPostLog.details.trim();
                            if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
                              return JSON.stringify(JSON.parse(trimmed), null, 2);
                            }
                          } catch (_) {}
                          return latestTargetPostLog.details;
                        })() : "No response details captured for this log step."}
                      </pre>
                    </div>
                  );
                }
                
                return (
                  <div className="flex flex-col items-center justify-center py-4 text-center">
                    <p className="text-[11px] text-slate-500 font-medium font-sans">No response recorded yet</p>
                    <p className="text-[10px] text-slate-400 max-w-[345px] mt-0.5">
                      Click <strong className="text-amber-700">Send Sandbox Data</strong> above or hit <strong className="text-slate-700">Trigger Sync Now</strong> to sync fleet telemetry and inspect full server responses.
                    </p>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-slate-50 border border-slate-200 p-2.5 rounded-lg text-xs">
            <span className="text-slate-655 flex items-center gap-1.5 font-sans font-medium">
              <Server className="w-3.5 h-3.5 text-amber-600" />
              Target Endpoint: <code className="text-amber-700 bg-amber-50 border border-amber-100 px-1.5 py-0.5 rounded font-mono text-[10px] font-bold">/api/mock/target-endpoint</code>
            </span>
            {receivedPayloads.length > 0 && (
              <button
                onClick={onClearReceived}
                className="text-[10px] font-bold text-slate-500 hover:text-rose-600 border border-slate-200 bg-white hover:bg-rose-50 hover:border-rose-200 px-2 py-1 rounded transition"
              >
                Clear Sandbox Store
              </button>
            )}
          </div>

          {receivedPayloads.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
              <span className="text-2xl mb-1.5">📡</span>
              <p className="text-xs text-slate-700 font-medium font-sans">No transmissions intercepted yet</p>
              <p className="text-[10px] text-slate-400 text-center max-w-[280px] mt-1">
                Configure your Target URL to <code className="text-amber-650 bg-amber-50 px-1 py-0.5 rounded font-bold">http://localhost:3000/api/mock/target-endpoint</code> and hit "Trigger Sync Now" above to catch live data packets.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
              {receivedPayloads.map((payload) => {
                const isExpanded = expandedPayloadId === payload.id;
                return (
                  <div 
                    key={payload.id}
                    className="border border-slate-200 bg-slate-50/20 rounded-lg overflow-hidden transition hover:border-slate-300"
                  >
                    <div 
                      onClick={() => toggleExpandPayload(payload.id)}
                      className="p-2.5 flex items-center justify-between cursor-pointer select-none bg-slate-50/40 hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" /> : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />}
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        <span className="text-xs font-mono font-bold text-slate-700">
                          {payload.id}
                        </span>
                        <span className="text-[10px] text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200 font-medium font-sans">
                          {payload.vehiclesCount} vehicles tracked
                        </span>
                      </div>
                      <span className="text-[10px] font-mono text-slate-450">
                        {new Date(payload.timestamp).toLocaleTimeString()}
                      </span>
                    </div>

                    {isExpanded && (
                      <div className="p-3 border-t border-slate-150 bg-slate-100/20 space-y-3">
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-450 tracking-wider block font-sans font-bold">HEADERS VERIFIED AT TARGET:</span>
                          <pre className="text-[10px] font-mono text-slate-300 bg-slate-950 p-2.5 rounded overflow-x-auto border border-slate-900 leading-relaxed">
                            {JSON.stringify(payload.headers, null, 2)}
                          </pre>
                        </div>
                        <div className="space-y-1">
                          <span className="text-[9px] text-slate-450 tracking-wider block font-sans font-bold">DELIVERED TELEMETRY PAYLOAD BODY:</span>
                          <pre className="text-[10px] font-mono text-amber-355 bg-slate-955 p-2.5 rounded overflow-x-auto max-h-[160px] border border-slate-900 leading-relaxed">
                            {JSON.stringify(payload.payload, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
