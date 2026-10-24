import React, { useState, useEffect, useMemo } from 'react';
import { Trip, FleetVehicle } from '../types';
import { 
  Truck, 
  MapPin, 
  ArrowLeft, 
  Calendar, 
  Clock, 
  CheckCircle2, 
  ChevronRight, 
  Search, 
  FileText, 
  AlertCircle, 
  User, 
  Compass, 
  ExternalLink,
  ShieldCheck,
  RefreshCw,
  TrendingUp,
  Map as MapIcon
} from 'lucide-react';

interface DriverManagerProps {
  vehicles: FleetVehicle[];
  onNotify: (type: 'success' | 'error' | 'warning' | 'info', message: string) => void;
}

export default function DriverManager({ vehicles = [], onNotify }: DriverManagerProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState<FleetVehicle | { id: string; name: string } | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [manualPlate, setManualPlate] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  // Fetch trips from API
  const fetchTrips = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trips');
      if (res.ok) {
        const data = await res.json();
        setTrips(data || []);
      } else {
        onNotify('error', 'Failed to retrieve trips database for driver terminal.');
      }
    } catch (err) {
      console.error(err);
      onNotify('error', 'Network error while retrieving trips.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTrips();
  }, []);

  // Matching logic: see how many trips are assigned to a vehicle
  const getVehicleTrips = (vName: string, vId: string | number) => {
    const nameLower = vName.toLowerCase();
    const idLower = String(vId).toLowerCase();
    return trips.filter(t => {
      if (!t.licensePlate) return false;
      const plateLower = t.licensePlate.toLowerCase();
      return (
        plateLower === nameLower ||
        plateLower === idLower ||
        nameLower.includes(plateLower) ||
        plateLower.includes(idLower) ||
        plateLower.includes(nameLower.split(' ')[0].toLowerCase()) // e.g. "Alpha"
      );
    });
  };

  // Filtered vehicle list based on search
  const filteredVehicles = useMemo(() => {
    return vehicles.filter(v => {
      const query = vehicleSearch.toLowerCase();
      return (
        v.name.toLowerCase().includes(query) ||
        String(v.id).toLowerCase().includes(query)
      );
    });
  }, [vehicles, vehicleSearch]);

  // Trips assigned to currently selected vehicle
  const assignedTrips = useMemo(() => {
    if (!selectedVehicle) return [];
    return getVehicleTrips(selectedVehicle.name, selectedVehicle.id);
  }, [selectedVehicle, trips]);

  const handleSelectVehicle = (vehicle: FleetVehicle) => {
    setSelectedVehicle(vehicle);
    setSelectedTrip(null);
    onNotify('info', `Switched driver focus to: ${vehicle.name}`);
  };

  const handleManualPlateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualPlate.trim()) {
      onNotify('warning', 'Please enter a valid license plate number.');
      return;
    }
    const pseudoVehicle = {
      id: manualPlate.toUpperCase(),
      name: `Custom Plate: ${manualPlate.toUpperCase()}`
    };
    setSelectedVehicle(pseudoVehicle);
    setSelectedTrip(null);
    setShowManualInput(false);
    onNotify('success', `Driver loaded custom license plate: ${pseudoVehicle.id}`);
  };

  // Action to mock update trip state
  const handleUpdateTripStatus = async (tripId: string, statusField: string) => {
    try {
      const tripToUpdate = trips.find(t => t.id === tripId);
      if (!tripToUpdate) return;

      const dateStr = new Date().toISOString();
      const updatedTrip: Trip = {
        ...tripToUpdate,
        [statusField]: dateStr,
      };

      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedTrip),
      });

      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          onNotify('success', `Trip status updated successfully!`);
          // Sync state
          setTrips(prev => prev.map(t => t.id === tripId ? result.trip : t));
          if (selectedTrip && selectedTrip.id === tripId) {
            setSelectedTrip(result.trip);
          }
        } else {
          onNotify('error', 'Failed to update status: ' + result.message);
        }
      } else {
        onNotify('error', 'Operational server error updating status.');
      }
    } catch (err) {
      console.error(err);
      onNotify('error', 'Network failure during state update.');
    }
  };

  return (
    <div id="driver_terminal_page" className="w-full max-w-lg mx-auto flex flex-col gap-4 min-h-[calc(100vh-10rem)] pb-12">
      
      {/* VIEW 1: VEHICLE SELECTOR */}
      {!selectedVehicle ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-4 animate-fade-in flex flex-col gap-4">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
                Select Your Vehicle
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Select or search for the vehicle plate assigned to your shifts.
              </p>
            </div>
            <button
              type="button"
              onClick={fetchTrips}
              disabled={loading}
              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition active:scale-95 shrink-0"
              title="Refresh assignments"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          {/* Search bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={vehicleSearch}
              onChange={(e) => setVehicleSearch(e.target.value)}
              placeholder="Search vehicles by name, code or ID..."
              className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50/50"
            />
          </div>

          {/* List of active live fleet vehicles */}
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            {filteredVehicles.map((v) => {
              const count = getVehicleTrips(v.name, v.id).length;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => handleSelectVehicle(v)}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-100 hover:border-indigo-200 bg-white hover:bg-slate-50 transition text-left cursor-pointer active:scale-[0.99] group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 group-hover:bg-indigo-50 flex items-center justify-center text-slate-600 group-hover:text-indigo-600 transition">
                      <Truck className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="font-bold text-slate-800 text-xs block group-hover:text-indigo-600 transition">
                        {v.name}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono block mt-0.5">
                        ID: {v.id} &bull; Status: <span className="capitalize">{v.status}</span>
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {count > 0 ? (
                      <span className="text-[10px] font-bold bg-indigo-50 border border-indigo-100 text-indigo-700 px-2.5 py-1 rounded-full">
                        {count} {count === 1 ? 'trip' : 'trips'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-slate-400">
                        No trips
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </button>
              );
            })}

            {filteredVehicles.length === 0 && (
              <div className="text-center py-8 text-slate-400 text-xs">
                No vehicles matched your search.
              </div>
            )}
          </div>

          {/* Manual Entry Toggle */}
          <div className="border-t border-slate-100 pt-3">
            {!showManualInput ? (
              <button
                type="button"
                onClick={() => setShowManualInput(true)}
                className="w-full py-2.5 text-center text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50/50 hover:bg-indigo-50 rounded-xl transition cursor-pointer"
              >
                No GPS device in vehicle? Enter License Plate manually
              </button>
            ) : (
              <form onSubmit={handleManualPlateSubmit} className="flex gap-2 animate-fade-in">
                <input
                  type="text"
                  value={manualPlate}
                  onChange={(e) => setManualPlate(e.target.value)}
                  placeholder="Enter Plate (e.g. CP CCK 9585)..."
                  className="flex-1 px-3 py-2 text-xs rounded-xl border border-slate-200 focus:outline-none focus:border-indigo-500 uppercase font-mono font-bold"
                />
                <button
                  type="submit"
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2 rounded-xl transition cursor-pointer"
                >
                  Go
                </button>
                <button
                  type="button"
                  onClick={() => setShowManualInput(false)}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl hover:bg-slate-50 transition"
                >
                  Cancel
                </button>
              </form>
            )}
          </div>
        </div>
      ) : (
        /* VIEW 2: TRIPS FOR SELECTED VEHICLE */
        <div className="flex flex-col gap-4 animate-fade-in">
          
          {/* Active vehicle header */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 shadow-xs flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                <Truck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] text-slate-400 font-bold uppercase block tracking-wider">Assigned Vehicle</span>
                <span className="text-xs font-extrabold text-slate-800 block truncate">{selectedVehicle.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={fetchTrips}
                disabled={loading}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition active:scale-95"
                title="Refresh assignments"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedVehicle(null);
                  setSelectedTrip(null);
                }}
                className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1.5 rounded-lg transition"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Change</span>
              </button>
            </div>
          </div>

          {/* TRIP DETAILS DRAWER / MODAL / FULL-SCREEN FOR MOBILE */}
          {selectedTrip ? (
            <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-xl overflow-hidden animate-fade-in flex flex-col">
              
              {/* Trip detail header */}
              <div className="p-4 bg-indigo-50 border-b border-indigo-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-mono font-bold text-indigo-700 uppercase tracking-widest block">
                    Active Assignment Detail
                  </span>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-tight mt-0.5">
                    Order No: {selectedTrip.orderNo}
                  </h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedTrip(null)}
                  className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>List View</span>
                </button>
              </div>

              {/* Trip details content */}
              <div className="p-4 space-y-4">
                
                {/* Visual Status Stages Timeline */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-2 font-mono">
                    Delivery Lifecycle Status
                  </span>
                  
                  <div className="grid grid-cols-4 gap-1 text-center relative">
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedTrip.statusDispatchDate ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        1
                      </div>
                      <span className="text-[8px] font-bold mt-1 text-slate-600">Dispatched</span>
                      {selectedTrip.statusDispatchDate && (
                        <span className="text-[7px] font-mono text-slate-400">{new Date(selectedTrip.statusDispatchDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      )}
                    </div>
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedTrip.statusEnrouteDate ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        2
                      </div>
                      <span className="text-[8px] font-bold mt-1 text-slate-600">Enroute</span>
                      {selectedTrip.statusEnrouteDate && (
                        <span className="text-[7px] font-mono text-slate-400">{new Date(selectedTrip.statusEnrouteDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      )}
                    </div>
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedTrip.statusAtLocationDate ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        3
                      </div>
                      <span className="text-[8px] font-bold mt-1 text-slate-600">Arrived</span>
                      {selectedTrip.statusAtLocationDate && (
                        <span className="text-[7px] font-mono text-slate-400">{new Date(selectedTrip.statusAtLocationDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      )}
                    </div>
                    <div className="flex flex-col items-center">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${selectedTrip.statusDeliveredDate ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-500'}`}>
                        ✓
                      </div>
                      <span className="text-[8px] font-bold mt-1 text-slate-600">Delivered</span>
                      {selectedTrip.statusDeliveredDate && (
                        <span className="text-[7px] font-mono text-emerald-600">{new Date(selectedTrip.statusDeliveredDate).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      )}
                    </div>
                  </div>

                  {/* Operational Action Buttons for Driver */}
                  <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-slate-200/50">
                    {!selectedTrip.statusDispatchDate && (
                      <button
                        type="button"
                        onClick={() => handleUpdateTripStatus(selectedTrip.id, 'statusDispatchDate')}
                        className="col-span-2 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition shadow-sm active:scale-95 cursor-pointer"
                      >
                        Start Dispatch (Mark Dispatched)
                      </button>
                    )}
                    {selectedTrip.statusDispatchDate && !selectedTrip.statusEnrouteDate && (
                      <button
                        type="button"
                        onClick={() => handleUpdateTripStatus(selectedTrip.id, 'statusEnrouteDate')}
                        className="col-span-2 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition shadow-sm active:scale-95 cursor-pointer"
                      >
                        Set Status to: Enroute
                      </button>
                    )}
                    {selectedTrip.statusEnrouteDate && !selectedTrip.statusAtLocationDate && (
                      <button
                        type="button"
                        onClick={() => handleUpdateTripStatus(selectedTrip.id, 'statusAtLocationDate')}
                        className="col-span-2 w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition shadow-sm active:scale-95 cursor-pointer"
                      >
                        Set Status to: At Location (Arrived)
                      </button>
                    )}
                    {selectedTrip.statusAtLocationDate && !selectedTrip.statusDeliveredDate && (
                      <div className="col-span-2 flex gap-2 w-full">
                        <button
                          type="button"
                          onClick={() => handleUpdateTripStatus(selectedTrip.id, 'statusDeliveredDate')}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold uppercase tracking-wider rounded-xl transition shadow-sm active:scale-95 cursor-pointer"
                        >
                          Mark Delivered
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateTripStatus(selectedTrip.id, 'statusUndeliverableDate')}
                          className="flex-1 py-2 bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 text-xs font-extrabold uppercase tracking-wider rounded-xl transition cursor-pointer"
                        >
                          Undeliverable
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Primary Destination block */}
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono">
                      Destination & Mapping
                    </span>
                    {selectedTrip.poi_name && selectedTrip.ship_to_point_lat !== null && (
                      <span className="text-[8px] font-mono font-bold uppercase bg-teal-100 text-teal-800 px-1.5 py-0.5 rounded border border-teal-200">
                        Location Verified
                      </span>
                    )}
                  </div>
                  
                  <div>
                    <span className="text-[10px] text-slate-400 block font-mono">SHIP TO POINT (FARM)</span>
                    <strong className="text-xs text-slate-800 block mt-0.5">{selectedTrip.shipTo}</strong>
                  </div>

                  {selectedTrip.poi_name && (
                    <div>
                      <span className="text-[10px] text-slate-400 block font-mono">VERIFIED POI TARGET</span>
                      <strong className="text-xs text-slate-800 block mt-0.5">{selectedTrip.poi_name}</strong>
                    </div>
                  )}

                  {selectedTrip.ship_to_point_lat && selectedTrip.ship_to_point_lon ? (
                    <div className="pt-2 border-t border-slate-200/40 flex items-center justify-between gap-2">
                      <div className="font-mono text-[10px] text-slate-500">
                        Lat: {selectedTrip.ship_to_point_lat.toFixed(5)}, Lon: {selectedTrip.ship_to_point_lon.toFixed(5)}
                      </div>
                      <a
                        href={`https://www.google.com/maps/search/?api=1&query=${selectedTrip.ship_to_point_lat},${selectedTrip.ship_to_point_lon}`}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded-lg transition active:scale-95 shadow-sm shadow-blue-500/10 cursor-pointer"
                      >
                        <Compass className="w-3.5 h-3.5" />
                        <span>Navigate</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ) : (
                    <div className="pt-2 border-t border-slate-200/40 flex items-center gap-1.5 text-[10px] text-amber-600 font-mono">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>GPS coordinates are not mapped. Coordinate mapping required.</span>
                    </div>
                  )}
                </div>

                {/* Additional Prominent Trip Data Table */}
                <div className="space-y-2">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block font-mono">
                    Trip Technical Parameters
                  </span>

                  <div className="bg-white border border-slate-100 rounded-xl overflow-hidden divide-y divide-slate-100 text-xs">
                    <div className="p-2.5 flex justify-between items-start gap-4">
                      <span className="text-slate-500 font-semibold">Local Name</span>
                      <span className="text-slate-800 text-right font-medium">{selectedTrip.localName || 'N/A'}</span>
                    </div>
                    <div className="p-2.5 flex justify-between items-start gap-4">
                      <span className="text-slate-500 font-semibold">Customer Code</span>
                      <span className="text-slate-800 text-right font-mono">{selectedTrip.customerCode || 'N/A'}</span>
                    </div>
                    <div className="p-2.5 flex justify-between items-start gap-4">
                      <span className="text-slate-500 font-semibold">Delivery Date</span>
                      <span className="text-slate-800 text-right font-mono">{selectedTrip.deliveryDate || 'N/A'}</span>
                    </div>
                    <div className="p-2.5 flex justify-between items-start gap-4">
                      <span className="text-slate-500 font-semibold">Created By</span>
                      <span className="text-slate-800 text-right font-mono text-[11px]">{selectedTrip.createdBy || 'N/A'}</span>
                    </div>
                    {selectedTrip.approvedResult && (
                      <div className="p-2.5 flex justify-between items-start gap-4">
                        <span className="text-slate-500 font-semibold">Approved Result</span>
                        <span className="text-slate-800 text-right font-mono">{selectedTrip.approvedResult}</span>
                      </div>
                    )}
                    {selectedTrip.issueSlipNo && (
                      <div className="p-2.5 flex justify-between items-start gap-4">
                        <span className="text-slate-500 font-semibold">Issue Slip No.</span>
                        <span className="text-slate-800 text-right font-mono">{selectedTrip.issueSlipNo}</span>
                      </div>
                    )}
                    {selectedTrip.invoiceNo && (
                      <div className="p-2.5 flex justify-between items-start gap-4">
                        <span className="text-slate-500 font-semibold">Invoice No.</span>
                        <span className="text-slate-800 text-right font-mono">{selectedTrip.invoiceNo}</span>
                      </div>
                    )}
                    {selectedTrip.documentNo && (
                      <div className="p-2.5 flex justify-between items-start gap-4">
                        <span className="text-slate-500 font-semibold">Document No.</span>
                        <span className="text-slate-800 text-right font-mono">{selectedTrip.documentNo}</span>
                      </div>
                    )}
                    {selectedTrip.remark && (
                      <div className="p-2.5 flex flex-col gap-1">
                        <span className="text-slate-500 font-semibold">Driver Instructions / Remark</span>
                        <span className="text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-100 text-[11px] leading-relaxed">
                          {selectedTrip.remark}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          ) : (
            /* Trips Checklist overview */
            <div className="bg-white rounded-2xl border border-slate-200/80 shadow-md p-4 animate-fade-in flex flex-col gap-3">
              <div>
                <h3 className="text-sm font-black uppercase text-slate-800 tracking-wide font-sans">
                  Shift Assignments ({assignedTrips.length})
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Click on an assignment below to load delivery details, map coordinates, and update status.
                </p>
              </div>

              {assignedTrips.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-xl flex flex-col items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-8 h-8 text-slate-300" />
                  <span className="text-xs font-bold text-slate-600">No shift trips found</span>
                  <span className="text-[10px] text-slate-400">There are no orders currently dispatched to {selectedVehicle.name}.</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {assignedTrips.map((t) => {
                    const isLocationOk = t.poi_name && t.ship_to_point_lat !== null && t.ship_to_point_lon !== null;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTrip(t)}
                        className="w-full text-left p-3.5 rounded-xl border border-slate-100 hover:border-indigo-100 bg-white hover:bg-slate-50 transition active:scale-[0.99] cursor-pointer flex flex-col gap-2 relative shadow-xs"
                      >
                        {/* Order info */}
                        <div className="flex items-start justify-between w-full">
                          <div>
                            <span className="text-[10px] font-mono text-slate-400 font-bold">ORDER: {t.orderNo}</span>
                            <span className="font-bold text-slate-800 text-xs block leading-tight mt-0.5">{t.shipTo}</span>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 self-center" />
                        </div>

                        {/* Location OK or Mapped badges */}
                        <div className="flex flex-wrap gap-1.5 items-center">
                          {isLocationOk && (
                            <span className="text-[8px] font-mono font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded">
                              Location OK
                            </span>
                          )}
                          {t.statusDeliveredDate ? (
                            <span className="text-[8px] font-mono font-extrabold uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded">
                              Delivered
                            </span>
                          ) : t.statusAtLocationDate ? (
                            <span className="text-[8px] font-mono font-extrabold uppercase bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded">
                              At Location
                            </span>
                          ) : t.statusEnrouteDate ? (
                            <span className="text-[8px] font-mono font-extrabold uppercase bg-indigo-600 text-white px-1.5 py-0.5 rounded">
                              Enroute
                            </span>
                          ) : t.statusDispatchDate ? (
                            <span className="text-[8px] font-mono font-extrabold uppercase bg-slate-800 text-slate-100 px-1.5 py-0.5 rounded">
                              Dispatched
                            </span>
                          ) : (
                            <span className="text-[8px] font-mono font-extrabold uppercase bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                              Pending
                            </span>
                          )}
                        </div>

                        {/* Delivery date & client */}
                        <div className="text-[10px] text-slate-400 font-mono flex items-center justify-between w-full border-t border-slate-100/50 pt-2">
                          <span>{t.localName || 'No Client Name'}</span>
                          <span>{t.deliveryDate || 'No Date'}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        </div>
      )}

    </div>
  );
}
