import React from 'react';
import { FleetVehicle } from '../types';
import { AlertCircle, RefreshCw, Radio } from 'lucide-react';

interface FleetMonitorProps {
  vehicles: FleetVehicle[];
  isMock: boolean;
  onRefresh?: () => void;
  loading?: boolean;
  selectedVehicleId: string | number | null;
  onSelectVehicle: (id: string | number | null) => void;
}

export default function FleetMonitor({ 
  vehicles, 
  isMock, 
  onRefresh, 
  loading = false,
  selectedVehicleId,
  onSelectVehicle
}: FleetMonitorProps) {

  return (
    <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-850 flex items-center gap-2">
            <Radio className={`w-4 h-4 ${isMock ? 'text-blue-500 animate-pulse' : 'text-emerald-500'}`} />
            Live Fleet Position Monitor
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {isMock 
              ? "Displaying active simulated telemetry nodes with continuous position updates. Click a record to load into the sandbox." 
              : `Tracking ${vehicles.length} physical vehicles. Click a record to inspect and transform its JSON payload.`}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={loading}
              className="px-3 py-1.5 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-1.5 disabled:opacity-50 transition cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Force Poll Telemetry</span>
            </button>
          )}
        </div>
      </div>

      {vehicles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 bg-slate-50/50 rounded-lg border border-dashed border-slate-200">
          <AlertCircle className="w-8 h-8 text-amber-500 mb-2 opacity-60" />
          <p className="text-xs text-slate-700 font-medium">No Live GpsGate Data Retrieved</p>
          <p className="text-[10px] text-slate-400 text-center max-w-[320px] mt-1 pr-2 pl-2">
            Enter GpsGate authentication details and target settings, click "Save Configuration", then click "Trigger Sync Now" or wait for automatic pooling.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-200/80">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                <th className="px-4 py-3 min-w-[120px]">Vehicle Name</th>
                <th className="px-4 py-3">Ground Speed</th>
                <th className="px-4 py-3">Device Activity</th>
                <th className="px-4 py-3 text-right">Coordinates &amp; Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150 text-[11px] font-mono">
              {vehicles.map((v) => {
                const groundSpeedValue = v.groundSpeed !== undefined ? v.groundSpeed : v.speed;
                const formattedTime = v.deviceActivity 
                  ? new Date(v.deviceActivity).toLocaleString('en-US', { hour12: false }) 
                  : (v.lastUpdate ? new Date(v.lastUpdate).toLocaleString('en-US', { hour12: false }) : "N/A");
                const isSelected = v.id === selectedVehicleId;

                return (
                  <tr 
                    key={v.id} 
                    onClick={() => onSelectVehicle(isSelected ? null : v.id)}
                    className={`transition-colors cursor-pointer select-none border-l-2 ${
                      isSelected 
                        ? 'bg-blue-50/80 hover:bg-blue-50 border-l-blue-600 font-medium' 
                        : 'hover:bg-slate-50/90 border-l-transparent'
                    }`}
                    title="Click to load into payload transformer & sandbox"
                  >
                    <td className="px-4 py-3 font-sans">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 text-xs truncate max-w-[200px]" title={v.name}>
                          {v.name}
                        </span>
                        {isSelected && (
                          <span className="text-[8px] font-extrabold px-1.5 py-0.5 bg-blue-100 text-blue-800 border border-blue-200 rounded uppercase tracking-wider">
                            Selected
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded font-bold ${
                        groundSpeedValue > 0 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {groundSpeedValue} km/h
                      </span>
                    </td>
                    <td className="px-4 py-3 font-sans text-slate-600 font-medium">
                      <div className="flex flex-col">
                        <span>{formattedTime}</span>
                        {v.deviceActivity && (
                          <span className="text-[9px] text-slate-400 font-mono font-normal">
                            ISO: {v.deviceActivity}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-sans">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-mono text-slate-500">
                          {v.latitude.toFixed(5)}, {v.longitude.toFixed(5)}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className={`inline-flex h-2 w-2 rounded-full ${
                            v.status === 'active' ? 'bg-emerald-500' :
                            v.status === 'idle' ? 'bg-amber-400 animate-pulse' :
                            'bg-slate-350'
                          }`}></span>
                          <span className="text-[9px] font-bold text-slate-500 uppercase">
                            {v.status}
                          </span>
                        </div>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
