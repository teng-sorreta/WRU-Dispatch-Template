import React, { useState, useEffect } from 'react';
import { 
  Truck, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  FileText, 
  Calendar, 
  User, 
  Check, 
  AlertCircle,
  Clock, 
  Filter, 
  RefreshCw, 
  Info,
  X,
  Sparkles,
  MapPin,
  ClipboardList,
  CheckCircle2,
  HelpCircle,
  ArrowRight,
  ChevronDown,
  Upload,
  FileSpreadsheet,
  FileUp,
  Download,
  BarChart3,
  Maximize2,
  Minimize2,
  Compass
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Trip, FleetVehicle, POI, Geofence } from '../types';
import { db } from '../lib/firebase';
import ShipToMapModal from './ShipToMapModal';
import { collection, onSnapshot, query } from 'firebase/firestore';

function formatToYYYYMMDD(val: any): string {
  if (val === undefined || val === null) return '';
  
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    return val.toISOString().substring(0, 10);
  }

  const num = Number(val);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const date = new Date((num - 25569) * 86400 * 1000);
    if (!isNaN(date.getTime())) {
      return date.toISOString().substring(0, 10);
    }
  }

  const str = String(val).trim();
  if (!str) return '';

  const spaceMatch = str.match(/^(\d{1,2})\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (spaceMatch) {
    const day = spaceMatch[1].padStart(2, '0');
    const month = spaceMatch[2].padStart(2, '0');
    const year = spaceMatch[3];
    return `${year}-${month}-${day}`;
  }

  const isoMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (isoMatch) {
    const year = isoMatch[1];
    const month = isoMatch[2].padStart(2, '0');
    const day = isoMatch[3].padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const slashMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/);
  if (slashMatch) {
    const part1 = parseInt(slashMatch[1], 10);
    const part2 = parseInt(slashMatch[2], 10);
    const yearPart = slashMatch[3];
    
    let year = parseInt(yearPart, 10);
    if (yearPart.length === 2) {
      year = year < 50 ? 2000 + year : 1900 + year;
    }
    
    let month = part1;
    let day = part2;
    if (part1 > 12) {
      day = part1;
      month = part2;
    }
    const mStr = String(month).padStart(2, '0');
    const dStr = String(day).padStart(2, '0');
    return `${year}-${mStr}-${dStr}`;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return parsed.toISOString().substring(0, 10);
  }

  return str;
}

function formatToDatetimeLocal(val: string | null | undefined): string {
  if (!val) return '';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    const pad = (num: number) => String(num).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  } catch {
    return '';
  }
}

interface DispatchManagerProps {
  onNotify: (type: 'success' | 'error' | 'info', message: string) => void;
  vehicles?: FleetVehicle[];
}

export default function DispatchManager({ onNotify, vehicles = [] }: DispatchManagerProps) {
  const getTodayString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const todayStr = getTodayString();

  const getActiveStatusBadge = (t: Trip) => {
    if (t.statusCancelledDate) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-slate-100 text-slate-800 border border-slate-250 font-mono whitespace-nowrap">
          Cancelled
        </span>
      );
    }
    if (t.statusReturnedDate) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-amber-50 text-amber-850 border border-amber-200 font-mono whitespace-nowrap">
          Returned
        </span>
      );
    }
    if (t.statusUndeliverableDate) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-rose-50 text-rose-800 border border-rose-200 font-mono whitespace-nowrap">
          Undeliverable
        </span>
      );
    }
    if (t.statusDeliveredDate) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-teal-50 text-teal-800 border border-teal-200 font-mono whitespace-nowrap">
          Delivered
        </span>
      );
    }
    if (t.statusTurnaroundDate) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-pink-50 text-pink-800 border border-pink-200 font-mono whitespace-nowrap">
          Turnaround
        </span>
      );
    }
    if (t.statusAtLocationDate) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-violet-50 text-violet-850 border border-violet-200 font-mono whitespace-nowrap">
          At Location
        </span>
      );
    }
    if (t.statusEnrouteDate) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-indigo-50 text-indigo-800 border border-indigo-200 font-mono whitespace-nowrap">
          Enroute
        </span>
      );
    }
    if (t.statusDispatchDate) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-blue-50 text-blue-800 border border-blue-200 font-mono whitespace-nowrap">
          Dispatched
        </span>
      );
    }
    if (t.statusValidDate) {
      return (
        <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono whitespace-nowrap">
          Valid
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase bg-slate-50 text-slate-400 border border-slate-200 font-mono whitespace-nowrap">
        Pending
      </span>
    );
  };

  const [trips, setTrips] = useState<Trip[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCancel, setFilterCancel] = useState<'ALL' | 'Y' | 'N'>('ALL');
  const [filterApproval, setFilterApproval] = useState<'ALL' | 'Y' | 'N' | 'H'>('ALL');
  const [filterStartDate, setFilterStartDate] = useState<string>(todayStr);
  const [filterEndDate, setFilterEndDate] = useState<string>(todayStr);
  const [localVehicles, setLocalVehicles] = useState<FleetVehicle[]>([]);
  
  // Selected trip for inspection/view details
  const [selectedTrip, setSelectedTrip] = useState<Trip | null>(null);

  // Selected trips for bulk operations
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  
  // Custom Confirmation Dialog States
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    actionLabel: string;
    onConfirm: () => void | Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    actionLabel: '',
    onConfirm: () => {}
  });

  const requestConfirm = (title: string, description: string, actionLabel: string, onConfirm: () => void | Promise<void>) => {
    setConfirmModal({
      isOpen: true,
      title,
      description,
      actionLabel,
      onConfirm: async () => {
        await onConfirm();
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
      }
    });
  };
  
  // Modal editor states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Partial<Trip> | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [isStatusModalOpen, setIsStatusModalOpen] = useState(false);
  const [isStatusFullscreen, setIsStatusFullscreen] = useState(false);
  const [activeShipToTrip, setActiveShipToTrip] = useState<Trip | null>(null);

  // Searchable vehicle picker states
  const [showVehiclePicker, setShowVehiclePicker] = useState(false);
  const [vehicleSearchQuery, setVehicleSearchQuery] = useState('');

  // POI-related states for "SHIP TO POINT" selection
  const [allPois, setAllPois] = useState<POI[]>([]);
  const [loadingPois, setLoadingPois] = useState(false);
  const [showPoiPicker, setShowPoiPicker] = useState(false);
  const [poiSearchQuery, setPoiSearchQuery] = useState('');

  // Geofence-related states for "ORIGIN" selection
  const [allGeofences, setAllGeofences] = useState<Geofence[]>([]);
  const [loadingGeofences, setLoadingGeofences] = useState(false);
  const [showGeofencePicker, setShowGeofencePicker] = useState(false);
  const [geofenceSearchQuery, setGeofenceSearchQuery] = useState('');

  // Import-related states
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importRows, setImportRows] = useState<any[][]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, { type: 'skip' | 'add' | 'assign', assignTo?: string }>>({});
  const [importStep, setImportStep] = useState<'upload' | 'mapping' | 'importing' | 'completed'>('upload');
  const [importProgress, setImportProgress] = useState<{ current: number, total: number, successes: number, failures: number, details: string[] }>({
    current: 0,
    total: 0,
    successes: 0,
    failures: 0,
    details: []
  });

  const TRIP_FIELDS = [
    { key: 'deliveryDate', label: 'Delivery Date' },
    { key: 'orderNo', label: 'Order No.' },
    { key: 'shipTo', label: 'Ship To' },
    { key: 'recordDate', label: 'Record Date' },
    { key: 'createdBy', label: 'Created By' },
    { key: 'approvedResult', label: 'Approved Result' },
    { key: 'approveDate1', label: 'Approve Date #1' },
    { key: 'approveDate2', label: 'Approve Date #2' },
    { key: 'referenceSaleOrderNo', label: 'Reference Sale Order No.' },
    { key: 'issueSlipNo', label: 'Issue Slip No.' },
    { key: 'createIssuedSlip', label: 'Create Issued Slip' },
    { key: 'userCreateIssuedSlip', label: 'User Create Issued Slip' },
    { key: 'invoiceNo', label: 'Invoice No.' },
    { key: 'userCreateInvoiceNo', label: 'User Create Invoice No.' },
    { key: 'customerCode', label: 'Customer Code' },
    { key: 'localName', label: 'Local Name' },
    { key: 'licensePlate', label: 'License Plate' },
    { key: 'cancelFlag', label: 'Cancel Flag' },
    { key: 'documentNo', label: 'Document No.' },
    { key: 'remark', label: 'Remark' },
    { key: 'cancelDate', label: 'Cancel Date' },
    { key: 'statusValidDate', label: 'Status: Valid' },
    { key: 'statusDispatchDate', label: 'Status: Dispatch' },
    { key: 'statusEnrouteDate', label: 'Status: Enroute' },
    { key: 'statusAtLocationDate', label: 'Status: At Location' },
    { key: 'statusDeliveredDate', label: 'Status: Delivered' },
    { key: 'statusUndeliverableDate', label: 'Status: Undeliverable' },
    { key: 'statusCancelledDate', label: 'Status: Cancelled' },
    { key: 'statusReturnedDate', label: 'Status: Returned' },
    { key: 'statusTurnaroundDate', label: 'Status: Turnaround' }
  ];

  // Fetch all trips from backend
  const fetchTrips = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trips');
      if (res.ok) {
        const data = await res.json();
        setTrips(data);
        const dataIds = (data || []).map((x: any) => x.id);
        setSelectedTripIds(prev => prev.filter(id => dataIds.includes(id)));
      } else {
        onNotify('error', 'Failed to retrieve dispatches database from server.');
      }
    } catch (err) {
      console.error(err);
      onNotify('error', 'Network error while pulling trips.');
    } finally {
      setLoading(false);
    }
  };

  const fetchVehiclesFallback = async () => {
    try {
      const res = await fetch('/api/status');
      if (res.ok) {
        const data = await res.json();
        if (data.vehicles) {
          setLocalVehicles(data.vehicles);
        }
      }
    } catch (err) {
      console.error('Error fetching fallback vehicles:', err);
    }
  };

  const fetchAllPois = async () => {
    setLoadingPois(true);
    try {
      const catRes = await fetch('/api/poi-categories');
      const catData = await catRes.json();
      if (catData.success && Array.isArray(catData.data)) {
        const cats = catData.data;
        const promises = cats.map(async (cat: any) => {
          const poiRes = await fetch(`/api/poi-categories/${cat.id}/pois?name=${encodeURIComponent(cat.name)}`);
          const poiData = await poiRes.json();
          if (poiData.success && Array.isArray(poiData.data)) {
            return poiData.data;
          }
          return [];
        });
        const results = await Promise.all(promises);
        const combined = results.flat();
        combined.sort((a: POI, b: POI) => a.name.localeCompare(b.name));
        setAllPois(combined);
      }
    } catch (err) {
      console.error('Error fetching all POIs:', err);
    } finally {
      setLoadingPois(false);
    }
  };

  const fetchAllGeofences = async () => {
    setLoadingGeofences(true);
    try {
      const res = await fetch('/api/geofences');
      const resJson = await res.json();
      if (resJson.success && Array.isArray(resJson.data)) {
        const sorted = [...resJson.data].sort((a: Geofence, b: Geofence) => a.name.localeCompare(b.name));
        setAllGeofences(sorted);
      }
    } catch (err) {
      console.error('Error fetching all geofences:', err);
    } finally {
      setLoadingGeofences(false);
    }
  };

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    try {
      const q = query(collection(db, "trips"));
      unsubscribe = onSnapshot(q, (snapshot) => {
        const tripsList: Trip[] = [];
        snapshot.forEach((doc) => {
          tripsList.push(doc.data() as Trip);
        });
        
        // Sort descending by createdAt or recordDate so newer items appear first
        tripsList.sort((a, b) => {
          const valA = a.createdAt || "";
          const valB = b.createdAt || "";
          return valB.localeCompare(valA);
        });
        
        setTrips(tripsList);
        setLoading(false);
      }, (err) => {
        console.error("Real-time Firestore sync error:", err);
        fetchTrips();
      });
    } catch (err) {
      console.error("Firestore subscription setup failed, falling back to REST API:", err);
      fetchTrips();
    }
    
    fetchVehiclesFallback();
    fetchAllPois();
    fetchAllGeofences();
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const currentVehicles = (vehicles && vehicles.length > 0) ? vehicles : localVehicles;

  // INITIALIZE COLUMN MAPPINGS
  const initMappings = (headers: string[]) => {
    const mappings: Record<string, { type: 'skip' | 'add' | 'assign', assignTo?: string }> = {};
    headers.forEach(h => {
      const cleanH = h.trim();
      const cleanHLower = cleanH.toLowerCase();
      
      // Column Vehicle Name = "License Plate" directive
      if (cleanHLower === 'vehicle name') {
        mappings[h] = { type: 'assign', assignTo: 'licensePlate' };
        return;
      }

      // Match other fields
      const exactMatch = TRIP_FIELDS.find(f => f.key.toLowerCase() === cleanHLower);
      if (exactMatch) {
        mappings[h] = { type: 'assign', assignTo: exactMatch.key };
        return;
      }

      const closeMatch = TRIP_FIELDS.find(f => 
        cleanHLower.includes(f.key.toLowerCase()) || 
        f.label.toLowerCase().includes(cleanHLower)
      );

      if (closeMatch) {
        mappings[h] = { type: 'assign', assignTo: closeMatch.key };
      } else {
        mappings[h] = { type: 'skip' }; // Default to skip, letting user configure
      }
    });
    setColumnMappings(mappings);
  };

  const handleOpenImportModal = () => {
    setImportFile(null);
    setImportHeaders([]);
    setImportRows([]);
    setColumnMappings({});
    setImportStep('upload');
    setImportProgress({ current: 0, total: 0, successes: 0, failures: 0, details: [] });
    setIsImportModalOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    setImportFile(file);
    
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert sheet we read into raw matrix of rows (Row 1 at cell indices, etc.)
        const rawJson = XLSX.utils.sheet_to_json<any[]>(worksheet, { header: 1 });
        
        if (!rawJson || rawJson.length === 0) {
          onNotify('error', 'The spreadsheet document contains no text/data records.');
          return;
        }
        
        // Remove blank or void rows from calculation
        const cleanRows = rawJson.filter(row => {
          return row && row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== '');
        });
        
        if (cleanRows.length === 0) {
          onNotify('error', 'No text or non-blank records could be decoded from this excel file.');
          return;
        }

        // Header Row is Row 1
        const headers = cleanRows[0].map((cell: any) => String(cell || '').trim()).filter(h => h !== '');
        
        // Records start at Row 2, Column A
        const records = cleanRows.slice(1);
        
        setImportHeaders(headers);
        setImportRows(records);
        initMappings(headers);
        setImportStep('mapping');
      } catch (err) {
        console.error('Spreadsheet processing error:', err);
        onNotify('error', 'Spreadsheet decoding failed. Please select a valid standard format.');
      }
    };
    reader.readAsBinaryString(file);
  };

  const startImporting = async () => {
    setImportStep('importing');
    setImportProgress({
      current: 0,
      total: importRows.length,
      successes: 0,
      failures: 0,
      details: []
    });

    let succ = 0;
    let fail = 0;
    const detailsLog: string[] = [];

    for (let i = 0; i < importRows.length; i++) {
      const row = importRows[i];
      
      // Auto-assign order defaults matched to Oracle direct maps
      const tripData: any = {
        deliveryDate: new Date().toISOString().substring(0, 10),
        orderNo: `SO-${Math.floor(100000 + Math.random() * 900000)}`,
        shipTo: '',
        recordDate: new Date().toISOString().substring(0, 10),
        createdBy: 'import_manager',
        approvedResult: 'Y',
        approveDate1: new Date().toISOString().substring(0, 10),
        approveDate2: new Date().toISOString().substring(0, 10),
        referenceSaleOrderNo: '',
        issueSlipNo: `IS-${Math.floor(10000 + Math.random() * 90000)}`,
        createIssuedSlip: new Date().toISOString().substring(0, 10),
        userCreateIssuedSlip: 'import_sync',
        invoiceNo: `INV-${Math.floor(500000 + Math.random() * 500000)}`,
        userCreateInvoiceNo: 'import_accounting',
        customerCode: '',
        localName: '',
        licensePlate: '',
        cancelFlag: 'N',
        documentNo: `DOC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
        remark: '',
        cancelDate: '',
        statusValidDate: '',
        statusDispatchDate: '',
        statusEnrouteDate: '',
        statusAtLocationDate: '',
        statusDeliveredDate: '',
        statusUndeliverableDate: '',
        statusCancelledDate: '',
        statusReturnedDate: '',
        statusTurnaroundDate: ''
      };

      const extraProperties: Record<string, string | null> = {};

      importHeaders.forEach((header, colIndex) => {
        const mapping = columnMappings[header];
        if (!mapping || mapping.type === 'skip') return;

        const rawValue = row[colIndex];
        const valStr = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : '';

        if (mapping.type === 'assign' && mapping.assignTo) {
          if (valStr === '') {
            tripData[mapping.assignTo] = null;
          } else if (mapping.assignTo === 'approvedResult') {
            const upVal = valStr.toUpperCase();
            tripData[mapping.assignTo] = (upVal === 'Y' || upVal === 'N' || upVal === 'H') ? upVal : 'Y';
          } else if (['deliveryDate', 'recordDate', 'approveDate1', 'approveDate2', 'createIssuedSlip', 'cancelDate'].includes(mapping.assignTo)) {
            tripData[mapping.assignTo] = formatToYYYYMMDD(rawValue);
          } else {
            tripData[mapping.assignTo] = valStr;
          }
        } else if (mapping.type === 'add') {
          // Store unrecognized columns safely
          extraProperties[header] = valStr === '' ? null : valStr;
        }
      });

      // Assemble added custom fields inside trip remark plus payload
      const addedDesc = Object.entries(extraProperties)
        .map(([k, v]) => `${k}: ${v === null ? 'null' : v}`)
        .join('; ');

      if (addedDesc) {
        tripData.remark = tripData.remark 
          ? `${tripData.remark} | [Custom Extra Fields - ${addedDesc}]`
          : `[Custom Extra Fields - ${addedDesc}]`;
        
        // Preserve them in the JSON payload as well
        Object.assign(tripData, extraProperties);
      }

      // Guard: fallback for license plate selection if empty and NOT mapped in the sheet
      const hasLicensePlateMapping = (Object.values(columnMappings) as Array<{ type: 'skip' | 'add' | 'assign'; assignTo?: string }>).some(
        m => m.type === 'assign' && m.assignTo === 'licensePlate'
      );
      if (!hasLicensePlateMapping && !tripData.licensePlate) {
        tripData.licensePlate = 'CP CCK 9585';
      }

      const identifier = tripData.orderNo || `Row ${i + 2}`;

      try {
        const res = await fetch('/api/trips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(tripData)
        });

        if (res.ok) {
          const resJson = await res.json();
          if (resJson.success) {
            succ++;
            detailsLog.push(`Row ${i + 2}: Successfully imported order ${identifier} (Truck: ${tripData.licensePlate})`);
          } else {
            fail++;
            detailsLog.push(`Row ${i + 2}: Validation Failed - ${resJson.message || 'database reject'}`);
          }
        } else {
          fail++;
          detailsLog.push(`Row ${i + 2}: Failed - Server status ${res.status}`);
        }
      } catch (err) {
        console.error(err);
        fail++;
        detailsLog.push(`Row ${i + 2}: Error - Connection / Network failure`);
      }

      setImportProgress(prev => ({
        ...prev,
        current: i + 1,
        successes: succ,
        failures: fail,
        details: [...detailsLog]
      }));
    }

    setImportStep('completed');
    fetchTrips();
  };

  // Set default values for a brand new trip
  const handleOpenCreateModal = () => {
    setEditingTrip({
      deliveryDate: new Date().toISOString().substring(0, 10),
      orderNo: `SO-${Math.floor(100000 + Math.random() * 900000)}`,
      shipTo: '',
      origin: '',
      origin_geofence_id: null,
      origin_lat: null,
      origin_lon: null,
      recordDate: new Date().toISOString().substring(0, 10),
      createdBy: 'winfeed_sync',
      approvedResult: 'Y',
      approveDate1: new Date().toISOString().substring(0, 10),
      approveDate2: new Date().toISOString().substring(0, 10),
      referenceSaleOrderNo: '',
      issueSlipNo: `IS-${Math.floor(10000 + Math.random() * 90000)}`,
      createIssuedSlip: new Date().toISOString().substring(0, 10),
      userCreateIssuedSlip: 'api_fleet_sync',
      invoiceNo: `INV-${Math.floor(500000 + Math.random() * 500000)}`,
      userCreateInvoiceNo: 'accounting_admin',
      customerCode: '',
      localName: '',
      licensePlate: 'CP CCK 9585',
      cancelFlag: 'N',
      documentNo: `DOC-2026-${Math.floor(1000 + Math.random() * 9000)}`,
      remark: '',
      cancelDate: '',
      statusValidDate: '',
      statusDispatchDate: '',
      statusEnrouteDate: '',
      statusAtLocationDate: '',
      statusDeliveredDate: '',
      statusUndeliverableDate: '',
      statusCancelledDate: '',
      statusReturnedDate: '',
      statusTurnaroundDate: ''
    });
    setFormErrors({});
    setShowVehiclePicker(false);
    setVehicleSearchQuery('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (trip: Trip) => {
    setSelectedTrip(null);
    setEditingTrip({ ...trip });
    setFormErrors({});
    setShowVehiclePicker(false);
    setVehicleSearchQuery('');
    setIsModalOpen(true);
  };

  // Pre-populate with realistic Philippine agriculture order
  const handleLoadDemoData = () => {
    const demos = [
      {
        shipTo: "Vitarich Agri Feedmill, Bulacan",
        customerCode: "CUST-VIT-9011",
        localName: "Vitarich Farms Luzon",
        licensePlate: "CP CCK 9585",
        remark: "Priority delivery - feeds require temperature checking upon arrival.",
      },
      {
        shipTo: "San Miguel Pure Foods, Laguna Hub",
        customerCode: "CUST-SMC-5022",
        localName: "SMC Southern AgriCorp",
        licensePlate: "CP CCK 9586",
        remark: "Consignee requests delivery before 5:00 PM.",
      },
      {
        shipTo: "Cagayan Valley Swine Feeders, Tuguegarao",
        customerCode: "CUST-CAG-3044",
        localName: "Cagayan Livestocks Inc.",
        licensePlate: "CP CCK 9587",
        remark: "Route via North Luzon Expressway (NLEX) to avoid local city truck ban.",
      }
    ];

    const chosen = demos[Math.floor(Math.random() * demos.length)];
    if (editingTrip) {
      setEditingTrip({
        ...editingTrip,
        shipTo: chosen.shipTo,
        customerCode: chosen.customerCode,
        localName: chosen.localName,
        licensePlate: chosen.licensePlate,
        remark: chosen.remark
      });
      onNotify('info', 'Loaded realistic Philippine dispatcher demo data.');
    }
  };

  // Validate fields
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    if (!editingTrip?.deliveryDate) errors.deliveryDate = 'Delivery Date is required';
    if (!editingTrip?.orderNo) errors.orderNo = 'Order No is required';
    if (!editingTrip?.shipTo) errors.shipTo = 'Ship To (Destination) is required';
    if (!editingTrip?.customerCode) errors.customerCode = 'Customer Code is required';
    if (!editingTrip?.localName) errors.localName = 'Local Name is required';
    if (!editingTrip?.licensePlate) errors.licensePlate = 'Truck assignment is required';
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // POST /api/trips (persists in state_store.json)
  const handleSaveTrip = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm() || !editingTrip) return;

    setSaving(true);
    try {
      const res = await fetch('/api/trips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingTrip)
      });
      
      if (res.ok) {
        const result = await res.json();
        if (result.success) {
          onNotify('success', editingTrip.id ? 'Trip updated successfully.' : 'New trip dispatched successfully!');
          setIsModalOpen(false);
          fetchTrips();
          // Auto select if we edited or created
          if (editingTrip.id) {
            setSelectedTrip(result.trip);
          } else {
            setSelectedTrip(result.trip);
          }
        } else {
          onNotify('error', 'Failed saving trip: ' + result.message);
        }
      } else {
        onNotify('error', 'Server error while saving trip.');
      }
    } catch (err) {
      console.error(err);
      onNotify('error', 'Network failure during save operation.');
    } finally {
      setSaving(false);
    }
  };

  // DELETE /api/trips/:id
  const handleDeleteTrip = async (id: string) => {
    requestConfirm(
      'Delete Dispatch Record',
      'Are you absolutely sure you want to delete and wipe out this Trip Record? This operation cannot be easily undone.',
      'Delete',
      async () => {
        try {
          const res = await fetch(`/api/trips/${id}`, {
            method: 'DELETE'
          });
          if (res.ok) {
            onNotify('success', 'Trip order cancelled and permanently removed.');
            if (selectedTrip?.id === id) {
              setSelectedTrip(null);
            }
            setSelectedTripIds(prev => prev.filter(tid => tid !== id));
            fetchTrips();
          } else {
            onNotify('error', 'Server rejected trip deletion.');
          }
        } catch (err) {
          console.error(err);
          onNotify('error', 'Failed to communicate deletion request.');
        }
      }
    );
  };

  // Bulk operations
  const handleBulkDelete = async () => {
    if (selectedTripIds.length === 0) return;
    requestConfirm(
      'Bulk Records Deletion',
      `Are you absolutely sure you want to permanently delete the ${selectedTripIds.length} selected trip records? This cannot be undone.`,
      'Bulk Delete',
      async () => {
        setLoading(true);
        try {
          const res = await fetch('/api/trips/bulk-delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: selectedTripIds })
          });
          if (res.ok) {
            onNotify('success', `${selectedTripIds.length} dispatch logs permanently wiped out.`);
            setSelectedTripIds([]);
            if (selectedTrip && selectedTripIds.includes(selectedTrip.id)) {
              setSelectedTrip(null);
            }
            await fetchTrips();
          } else {
            onNotify('error', 'Server error while executing bulk delete.');
          }
        } catch (err) {
          console.error(err);
          onNotify('error', 'Failed to communicate bulk deletion query.');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  // Filter logic
  const filteredTrips = trips.filter(trip => {
    // Search query matches OrderNo, Local Name, ShipTo, CustomerCode, LicensePlate, DocumentNo
    const q = searchQuery.toLowerCase().trim();
    const queryMatches = !q || 
      (trip.orderNo || '').toLowerCase().includes(q) ||
      (trip.shipTo || '').toLowerCase().includes(q) ||
      (trip.localName || '').toLowerCase().includes(q) ||
      (trip.customerCode || '').toLowerCase().includes(q) ||
      (trip.licensePlate || '').toLowerCase().includes(q) ||
      (trip.documentNo || '').toLowerCase().includes(q);

    const cancelMatches = filterCancel === 'ALL' || trip.cancelFlag === filterCancel;
    const approvalMatches = filterApproval === 'ALL' || trip.approvedResult === filterApproval;

    // Date range matches (comparing YYYY-MM-DD strings of deliveryDate)
    const dateMatches = (() => {
      if (!filterStartDate && !filterEndDate) return true;
      if (!trip.deliveryDate) return false;
      const tripDateStr = trip.deliveryDate.substring(0, 10);
      if (filterStartDate && tripDateStr < filterStartDate) return false;
      if (filterEndDate && tripDateStr > filterEndDate) return false;
      return true;
    })();

    return queryMatches && cancelMatches && approvalMatches && dateMatches;
  });

  // Date-filtered trips specifically for the STATUS modal
  const statusFilteredTrips = trips.filter(trip => {
    if (!filterStartDate && !filterEndDate) return true;
    if (!trip.deliveryDate) return false;
    const tripDateStr = trip.deliveryDate.substring(0, 10);
    if (filterStartDate && tripDateStr < filterStartDate) return false;
    if (filterEndDate && tripDateStr > filterEndDate) return false;
    return true;
  });

  // Selection helpers
  const unmatchedPoisCount = filteredTrips.filter(
    t => !t.poi_name || t.ship_to_point_lat == null || t.ship_to_point_lon == null
  ).length;

  const allFilteredSelected = filteredTrips.length > 0 && filteredTrips.every(t => selectedTripIds.includes(t.id));
  const someFilteredSelected = filteredTrips.length > 0 && filteredTrips.some(t => selectedTripIds.includes(t.id)) && !allFilteredSelected;

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      // Unselect all filtered trips
      const filteredIds = filteredTrips.map(t => t.id);
      setSelectedTripIds(prev => prev.filter(id => !filteredIds.includes(id)));
    } else {
      // Select all filtered trips (union with existing)
      const filteredIds = filteredTrips.map(t => t.id);
      setSelectedTripIds(prev => {
        const union = new Set([...prev, ...filteredIds]);
        return Array.from(union);
      });
    }
  };

  return (
    <div className="space-y-6 w-full animate-fade-in">
      {/* Top action header banner */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 py-2">
        <h2 className="text-2xl font-black uppercase tracking-tight font-sans text-slate-800">
          Dispatch Manager
        </h2>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-extrabold uppercase tracking-wider px-4 py-2.5 rounded-lg shadow-lg hover:shadow-indigo-500/10 transition cursor-pointer active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Trip</span>
          </button>
          <button
            onClick={() => setIsStatusModalOpen(true)}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-emerald-600 border border-slate-200 hover:border-emerald-500/30 text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg shadow-sm transition cursor-pointer active:scale-[0.98]"
          >
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            <span>Status</span>
          </button>
          <button
            onClick={handleOpenImportModal}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider px-4 py-2.5 rounded-lg border border-slate-200 shadow-sm transition cursor-pointer active:scale-[0.98]"
          >
            <Upload className="w-4 h-4 text-slate-500" />
            <span>Import</span>
          </button>
          <button
            onClick={fetchTrips}
            className="flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold uppercase tracking-wider px-3.5 py-2.5 rounded-lg border border-slate-200 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Trips</span>
          </button>
        </div>
      </div>

      {/* Grid view containing List & Detail view side-by-side */}
      <div className="grid grid-cols-12 gap-6">
        
        {/* Left Side: Search, Filters, and List */}
        <div className="col-span-12 flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden min-h-[500px]">
          
          {/* List Search header block */}
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by Order No, Customer, Ship To, Plate..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs pl-9 pr-4 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500 font-medium"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Micro Filters */}
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono">
              <div className="flex items-center gap-2">
                <Filter className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold">Filters:</span>
              </div>

              {/* Date Span Filter */}
              <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 border border-slate-200/50 rounded-lg px-2.5 py-1 text-[10px]">
                <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="text-slate-600 font-bold ml-1">Delivery Date:</span>
                <input
                  type="date"
                  value={filterStartDate}
                  onChange={(e) => setFilterStartDate(e.target.value)}
                  className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer h-5 font-mono"
                  title="Start Date"
                />
                <span className="text-slate-400 font-bold px-0.5">to</span>
                <input
                  type="date"
                  value={filterEndDate}
                  onChange={(e) => setFilterEndDate(e.target.value)}
                  className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] font-bold text-slate-700 outline-none focus:border-blue-500 cursor-pointer h-5 font-mono"
                  title="End Date"
                />
                {(filterStartDate || filterEndDate) && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilterStartDate('');
                      setFilterEndDate('');
                    }}
                    className="text-slate-400 hover:text-slate-600 transition ml-1 cursor-pointer"
                    title="Clear date filter"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Status active/cancelled filter */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-slate-500">Cancel State:</span>
                <select
                  value={filterCancel}
                  onChange={(e: any) => setFilterCancel(e.target.value)}
                  className="bg-white border border-slate-200 text-[10px] font-bold px-1 rounded py-0.5 focus:outline-none"
                >
                  <option value="ALL">All</option>
                  <option value="Y">Cancelled (Y)</option>
                  <option value="N">Active (N)</option>
                </select>
              </div>

              {/* Approval status filter */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-slate-500">Approval:</span>
                <select
                  value={filterApproval}
                  onChange={(e: any) => setFilterApproval(e.target.value)}
                  className="bg-white border border-slate-200 text-[10px] font-bold px-1 rounded py-0.5 focus:outline-none"
                >
                  <option value="ALL">All Levels</option>
                  <option value="Y">Approved (Y)</option>
                  <option value="N">Declined (N)</option>
                  <option value="H">On Hold (H)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Roster Bulk Actions / Selection Bar */}
          {filteredTrips.length > 0 && (
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-150 flex items-center justify-between text-xs font-medium text-slate-700 select-none">
              <div className="flex items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={(input) => {
                    if (input) {
                      input.indeterminate = someFilteredSelected;
                    }
                  }}
                  onChange={handleToggleSelectAll}
                  className="w-4 h-4 accent-blue-600 rounded border-slate-300 cursor-pointer focus:ring-1 focus:ring-blue-100"
                />
                <button
                  onClick={handleToggleSelectAll}
                  className="hover:text-blue-600 text-[11px] font-extrabold uppercase tracking-wide cursor-pointer transition text-left"
                >
                  {allFilteredSelected ? 'Deselect All' : 'Select All'}
                </button>
              </div>

              <div className="flex items-center gap-4">
                {selectedTripIds.length > 0 && (
                  <div className="flex items-center gap-2.5 animate-fade-in border-r border-slate-200 pr-4">
                    <span className="text-[11px] font-bold text-slate-500 font-mono">
                      {selectedTripIds.length} Selected
                    </span>
                    <button
                      onClick={handleBulkDelete}
                      className="flex items-center gap-1 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-extrabold uppercase tracking-wider shadow-sm hover:shadow-red-500/10 transition active:scale-[0.98] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete Selected</span>
                    </button>
                  </div>
                )}
                
                <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500 font-mono">
                  ({filteredTrips.length} loaded | <span className="text-orange-500 font-black">{unmatchedPoisCount}</span> unmatched POIs)
                </span>
              </div>
            </div>
          )}

          {/* Trips roster list in multi-column tabular row format to display more records */}
          <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[550px]">
            {loading ? (
              <div className="flex flex-col items-center justify-center p-16 space-y-2">
                <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
                <span className="text-xs text-slate-400 font-mono">Querying transport logs...</span>
              </div>
            ) : filteredTrips.length === 0 ? (
              <div className="p-16 text-center text-slate-400 flex flex-col items-center justify-center space-y-2">
                <ClipboardList className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold">No dispatch logs found</p>
                <p className="text-xs text-slate-400">Try modifying your search or clear some filters.</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs font-sans min-w-[950px]">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 font-mono">
                    <th className="p-3 pl-4 w-10"></th>
                    <th className="p-3 w-44">Order Number &amp; Status</th>
                    <th className="p-3 w-72">Ship To (Destination)</th>
                    <th className="p-3 w-28">Delivery Date</th>
                    <th className="p-3 w-28">License Plate</th>
                    <th className="p-3 w-28">Trip Status</th>
                    <th className="p-3 w-28">Issue Slip</th>
                    <th className="p-3 text-right pr-4 w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTrips.map((t) => {
                    const isSelected = selectedTrip?.id === t.id;
                    const isCancelled = t.cancelFlag === 'Y';
                    const isMappable = t.poi_name && t.ship_to_point_lat !== null && t.ship_to_point_lon !== null;
                    
                    return (
                      <tr
                        key={t.id}
                        onClick={() => setSelectedTrip(t)}
                        className={`hover:bg-blue-50/25 transition cursor-pointer select-none border-l-4 align-middle ${
                          isSelected 
                            ? 'bg-blue-50/50 border-l-blue-600 font-semibold' 
                            : isCancelled 
                              ? 'border-l-slate-300 bg-slate-50/20' 
                              : 'border-l-transparent'
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="p-3 pl-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedTripIds.includes(t.id)}
                            onChange={() => {}}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTripIds(prev => {
                                if (prev.includes(t.id)) {
                                  return prev.filter(tid => tid !== t.id);
                                } else {
                                  return [...prev, t.id];
                                }
                              });
                            }}
                            className="w-4 h-4 cursor-pointer accent-blue-600 border border-slate-300 rounded focus:ring-blue-500"
                          />
                        </td>

                        {/* Order No & Badges */}
                        <td className="p-3">
                          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                            <span className={`font-mono text-xs font-black tracking-tight ${isCancelled ? 'line-through text-slate-400 font-medium' : 'text-slate-950'}`}>
                              {t.orderNo}
                            </span>
                            <div className="flex items-center gap-1">
                              {isCancelled ? (
                                <span className="px-1 rounded text-[8px] font-extrabold uppercase bg-red-100 text-red-700 border border-red-200 whitespace-nowrap">
                                  Cancelled
                                </span>
                              ) : (
                                <span className="px-1 rounded text-[8px] font-extrabold uppercase bg-emerald-100 text-emerald-700 border border-emerald-200 whitespace-nowrap">
                                  Active
                                </span>
                              )}

                              {t.approvedResult === 'Y' && (
                                <span className="px-1 rounded text-[8px] font-extrabold uppercase bg-emerald-50 text-emerald-850 border border-emerald-100 whitespace-nowrap">
                                  Appr (Y)
                                </span>
                              )}
                              {t.approvedResult === 'H' && (
                                <span className="px-1 rounded text-[8px] font-extrabold uppercase bg-amber-50 text-amber-800 border border-amber-200 whitespace-nowrap">
                                  Hold (H)
                                </span>
                              )}
                              {t.approvedResult === 'N' && (
                                <span className="px-1 rounded text-[8px] font-extrabold uppercase bg-rose-50 text-rose-800 border border-rose-100 whitespace-nowrap">
                                  Decl (N)
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Destination */}
                        <td className="p-3">
                          <div className="flex items-center gap-1.5 min-w-0 max-w-[280px]">
                            <MapPin className={`w-3.5 h-3.5 shrink-0 ${isMappable ? 'text-emerald-500' : 'text-slate-400'}`} />
                            <span className="truncate font-medium text-slate-800 text-[11px]" title={t.shipTo}>
                              {t.shipTo}
                            </span>
                            {isMappable && (
                              <span className="text-[8px] font-mono font-bold bg-emerald-100 text-emerald-850 px-1 rounded shrink-0 whitespace-nowrap">
                                OK
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Delivery Date */}
                        <td className="p-3 whitespace-nowrap">
                          <span className="font-mono text-slate-600 text-[11px] font-medium">{t.deliveryDate || 'N/A'}</span>
                        </td>

                        {/* Plate */}
                        <td className="p-3">
                          <span className="font-mono font-bold text-slate-700 bg-slate-100 border border-slate-200/60 px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap">
                            {t.licensePlate || 'Unassigned'}
                          </span>
                        </td>

                        {/* Trip Status */}
                        <td className="p-3">
                          {getActiveStatusBadge(t)}
                        </td>

                        {/* Issue Slip */}
                        <td className="p-3 whitespace-nowrap">
                          <span className="font-mono text-slate-600 text-[11px] font-medium">{t.issueSlipNo || 'Pending'}</span>
                        </td>

                        {/* Actions */}
                        <td className="p-3 text-right pr-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            <button
                              title="Edit dispatcher info"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenEditModal(t);
                              }}
                              className="p-1 px-1.5 hover:bg-slate-100 rounded text-slate-500 hover:text-blue-600 transition cursor-pointer"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              title="Purge transaction record"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTrip(t.id);
                              }}
                              className="p-1 px-1.5 hover:bg-red-50 rounded text-slate-400 hover:text-red-600 transition cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          
          <div className="p-3 border-t border-slate-100 bg-slate-50/50 text-[10px] text-slate-400 font-mono flex items-center justify-between px-4">
            <span>Showing {filteredTrips.length} of {trips.length} loaded records</span>
            <span>Local Database Store</span>
          </div>

        </div>

        {/* Right Side: Detail Panel Inspector */}
        <div className="col-span-12 lg:col-span-5">
          {selectedTrip ? (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col">
              
              {/* Header card info */}
              <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest font-mono">Order Verification</span>
                    <span className="bg-blue-100 text-blue-800 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded">
                      CPF XML
                    </span>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 font-mono tracking-tight text-ellipsis overflow-hidden">
                    {selectedTrip.orderNo}
                  </h3>
                </div>
                <div className="flex items-center gap-1 bg-white border border-slate-200 p-1.5 rounded-lg shrink-0">
                  <button
                    onClick={() => handleOpenEditModal(selectedTrip)}
                    className="p-1 hover:bg-slate-50 rounded text-blue-600 hover:text-blue-800 transition"
                    title="Edit order fields"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTrip(selectedTrip.id)}
                    className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-700 transition"
                    title="Delete record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Parameters scrollbox mapping */}
              <div className="p-5 space-y-4 max-h-[530px] overflow-y-auto text-xs font-sans">
                
                {/* Section 1: Customer Demographics */}
                <div className="space-y-2.5">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-slate-400" />
                    <span>Customer &amp; Consignee Details</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">CUSTOMER CODE</span>
                      <span className="font-mono font-bold text-slate-800">{selectedTrip.customerCode || 'None'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">LOCAL NAME</span>
                      <span className="font-bold text-slate-800">{selectedTrip.localName || 'None'}</span>
                    </div>
                    <div className="col-span-2 bg-emerald-50/70 border border-emerald-200/50 p-2.5 rounded-lg">
                      <span className="text-emerald-900 text-[10px] block font-mono font-extrabold">SHIP TO POINT (FARM)</span>
                      <div className="font-bold text-slate-800 flex items-center gap-1.5 mt-1 text-left w-full">
                        <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="truncate">{selectedTrip.shipTo}</span>
                        {selectedTrip.poi_name && selectedTrip.ship_to_point_lat !== null && selectedTrip.ship_to_point_lon !== null ? (
                          <span className="text-[9px] font-mono font-bold text-emerald-850 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-250 whitespace-nowrap ml-auto shrink-0 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Location OK ({selectedTrip.poi_name})
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 whitespace-nowrap ml-auto shrink-0">
                            Unmapped
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="col-span-2 bg-emerald-50/70 border border-emerald-200/50 p-2.5 rounded-lg">
                      <span className="text-emerald-900 text-[10px] block font-mono font-extrabold">ORIGIN (GEOFENCE)</span>
                      <div className="font-bold text-slate-800 flex items-center gap-1.5 mt-1">
                        <Compass className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span className="truncate">{selectedTrip.origin || 'None Assigned'}</span>
                        {selectedTrip.origin_geofence_id ? (
                          <span className="text-[9px] font-mono font-bold text-emerald-850 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-250 whitespace-nowrap ml-auto shrink-0 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            Geofence OK (ID: {selectedTrip.origin_geofence_id})
                          </span>
                        ) : (
                          <span className="text-[9px] font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 whitespace-nowrap ml-auto shrink-0">
                            Unassigned
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 2: Logistics Schedule Mapping */}
                <div className="space-y-2.5 pt-1">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>Winfeed Telemetry &amp; Schedule</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">DELIVERY DATE</span>
                      <span className="font-bold text-slate-850 flex items-center gap-1 mt-0.5">
                        <Calendar className="w-3.5 h-3.5 text-blue-500" />
                        <span>{selectedTrip.deliveryDate}</span>
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">RECORD CREATED DATE</span>
                      <span className="font-mono text-slate-700">{selectedTrip.recordDate ? selectedTrip.recordDate.split('T')[0] : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">CREATED BY USER</span>
                      <span className="font-medium text-slate-800">{selectedTrip.createdBy || 'Unknown'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">DOCUMENT REFERENCE NO.</span>
                      <span className="font-mono text-slate-800 font-bold">{selectedTrip.documentNo || 'No Document'}</span>
                    </div>
                  </div>
                </div>

                {/* Section 3: Approvals State */}
                <div className="space-y-2.5 pt-1">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-slate-400" />
                    <span>Winfeed Approvals &amp; Credit Check</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">APPROVED RESULT</span>
                      <span className="mt-0.5 inline-block">
                        {selectedTrip.approvedResult === 'Y' && (
                          <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                            Approved (Y)
                          </span>
                        )}
                        {selectedTrip.approvedResult === 'H' && (
                          <span className="bg-amber-105 text-amber-800 border border-amber-200 text-[10px] font-extrabold uppercase bg-amber-55 px-2 py-0.5 rounded-full">
                            On Hold (H)
                          </span>
                        )}
                        {selectedTrip.approvedResult === 'N' && (
                          <span className="bg-rose-100 text-rose-800 border border-rose-200 text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full">
                            Declined (N)
                          </span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">APPROVE DATE #1</span>
                      <span className="font-mono text-slate-700">{selectedTrip.approveDate1 ? selectedTrip.approveDate1.split('T')[0] : 'Not yet approved'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">APPROVE DATE #2</span>
                      <span className="font-mono text-slate-700">{selectedTrip.approveDate2 ? selectedTrip.approveDate2.split('T')[0] : 'Not yet approved'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">REF SALE ORDER NO.</span>
                      <span className="font-mono text-slate-800">{selectedTrip.referenceSaleOrderNo || 'None'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">CANCEL STATE</span>
                      <span className="mt-0.5 inline-block">
                        {selectedTrip.cancelFlag === 'Y' ? (
                          <span className="bg-rose-100 border border-rose-250 text-rose-800 font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono">
                            Cancelled (Y)
                          </span>
                        ) : (
                          <span className="bg-emerald-100 border border-emerald-250 text-emerald-800 font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono">
                            Active (N)
                          </span>
                        )}
                      </span>
                    </div>
                    {selectedTrip.cancelFlag === 'Y' && (
                      <div className="col-span-2 bg-red-50 p-2 rounded border border-red-100">
                        <span className="text-rose-500 font-bold text-[10px] block font-mono">CANCELLATION DATE</span>
                        <span className="font-mono text-xs font-semibold text-rose-800">{selectedTrip.cancelDate ? selectedTrip.cancelDate.split('T')[0] : 'Undefined'}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Section 4: Loading slip & Truck Assignment */}
                <div className="space-y-2.5 pt-1">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-slate-400" />
                    <span>Loading Slips &amp; Vehicles</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">ISSUE SLIP NO.</span>
                      <span className="font-mono font-extrabold text-indigo-750 bg-indigo-50 border border-indigo-100 px-1.5 py-0.2 rounded text-xs select-all">
                        {selectedTrip.issueSlipNo || 'Pending'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">ISSUE SLIP CREATED TIME</span>
                      <span className="font-mono text-slate-700">{selectedTrip.createIssuedSlip ? selectedTrip.createIssuedSlip.split('T')[0] : 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">SLIP CREATED BY</span>
                      <span className="font-medium text-slate-700">{selectedTrip.userCreateIssuedSlip || 'N/A'}</span>
                    </div>
                    <div className="col-span-2 bg-emerald-50/70 border border-emerald-200/50 p-2.5 rounded-lg mt-1">
                      <span className="text-emerald-900 text-[10px] block font-mono font-extrabold">TRUCK ASSIGNED (PLATE)</span>
                      <div className="font-mono font-black text-slate-900 uppercase tracking-wider text-xs mt-1.5 flex items-center gap-2">
                        <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>{selectedTrip.licensePlate || 'Uncoded'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Section 5: Billing invoice tracking */}
                <div className="space-y-2.5 pt-1">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>Invoice Tracking</span>
                  </h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">INVOICE NO.</span>
                      <span className="font-mono font-bold text-slate-800">{selectedTrip.invoiceNo || 'Pending'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block font-mono">USER CREATE INVOICE</span>
                      <span className="font-medium text-slate-700">{selectedTrip.userCreateInvoiceNo || 'Pending'}</span>
                    </div>
                  </div>
                </div>

                {/* Section 6: Status Milestone Timeline */}
                <div className="space-y-2.5 pt-1">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>Status Milestone Timeline</span>
                  </h4>
                  <div className="space-y-2.5 border-l border-slate-200 ml-2 pl-4">
                    {[
                      { label: 'valid', key: 'statusValidDate', color: 'bg-emerald-500' },
                      { label: 'dispatch', key: 'statusDispatchDate', color: 'bg-blue-500' },
                      { label: 'enroute', key: 'statusEnrouteDate', color: 'bg-indigo-500' },
                      { label: 'at_location', key: 'statusAtLocationDate', color: 'bg-violet-500' },
                      { label: 'delivered', key: 'statusDeliveredDate', color: 'bg-teal-500' },
                      { label: 'undeliverable', key: 'statusUndeliverableDate', color: 'bg-rose-500' },
                      { label: 'cancelled', key: 'statusCancelledDate', color: 'bg-slate-500' },
                      { label: 'returned', key: 'statusReturnedDate', color: 'bg-amber-600' },
                      { label: 'turnaround', key: 'statusTurnaroundDate', color: 'bg-pink-500' }
                    ].map((status, idx) => {
                      const val = selectedTrip[status.key as keyof Trip];
                      const isSet = !!val;
                      return (
                        <div key={status.key} className="relative flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className={`absolute -left-[21px] w-2 h-2 rounded-full border border-white ring-2 ${isSet ? 'bg-slate-900 ring-slate-200' : 'bg-slate-200 ring-transparent'}`} />
                            <span className="font-mono font-bold text-slate-600 text-[11px] capitalize">
                              {status.label.replace('_', ' ')}
                            </span>
                          </div>
                          <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${isSet ? 'bg-slate-100 text-slate-800 font-semibold' : 'text-slate-400 italic'}`}>
                            {isSet ? new Date(val!).toLocaleString() : 'Not recorded'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Section 7: Remarks or notes */}
                <div className="pt-2 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed font-sans text-slate-700">
                  <span className="text-slate-400 text-[10px] font-bold block font-mono uppercase tracking-wider pb-1">Special dispatch notes / comments</span>
                  <p className="font-medium italic text-slate-850">↳ {selectedTrip.remark || 'No dispatch notes recorded.'}</p>
                </div>

              </div>
            </div>
          ) : (
            <div className="bg-slate-50/50 border border-slate-200 border-dashed rounded-xl p-12 text-center text-slate-400 flex flex-col items-center justify-center space-y-3 min-h-[440px]">
              <Truck className="w-16 h-16 text-slate-300 animate-pulse" />
              <div>
                <p className="font-bold text-slate-800 text-sm">No Trip Selected</p>
                <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
                  Select a dispatch record from the ledger list to show mapping outputs and verification credentials.
                </p>
              </div>
            </div>
          )}
        </div>

      </div>

      {/* Editor Modal Overlay */}
      {isModalOpen && editingTrip && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-350 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden animate-scale-in">
            
            {/* Modal Title Indicator */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1 text-[10px] text-blue-400 uppercase font-mono tracking-widest font-bold">
                  <Sparkles className="w-3 h-3 text-blue-400" />
                  <span>Interactive SQL Schema Sandbox</span>
                </div>
                <h3 className="text-lg font-black uppercase tracking-tight">
                  {editingTrip.id ? 'Edit Dispatch Parameters' : 'Create New Dispatch Trip'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white transition bg-slate-800 p-1.5 rounded-lg border border-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTrip} className="space-y-4">
              
              {/* Form container */}
              <div className="p-6 max-h-[calc(100vh-280px)] overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-sans">
                
                {/* Demo filler helper banner */}
                <div className="col-span-1 md:col-span-3 bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <Info className="w-4 h-4 text-blue-500 shrink-0" />
                    <span className="text-blue-800 font-medium font-sans text-[11px]">
                      Quickly fill parameters with realistic Philippine feed logistics variables (SMC, Vitarich, Swine farms)?
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleLoadDemoData}
                    className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-[10px] uppercase tracking-wider px-3 py-1.5 rounded"
                  >
                    Load Demo Data
                  </button>
                </div>

                {/* Left Section: Core Order Numbers */}
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono border-b border-slate-200 pb-1">
                    1. References &amp; Codes
                  </h4>
                  
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">ORDER NO. *</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 font-mono font-bold"
                      value={editingTrip.orderNo || ''}
                      onChange={(e) => setEditingTrip({ ...editingTrip, orderNo: e.target.value })}
                      required
                    />
                    {formErrors.orderNo && <span className="text-red-500 text-[10px] block mt-0.5">{formErrors.orderNo}</span>}
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">CUSTOMER CODE *</label>
                    <input
                      type="text"
                      placeholder="e.g. CUST-CPF-8812"
                      className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 font-mono"
                      value={editingTrip.customerCode || ''}
                      onChange={(e) => setEditingTrip({ ...editingTrip, customerCode: e.target.value })}
                      required
                    />
                    {formErrors.customerCode && <span className="text-red-500 text-[10px] block mt-0.5">{formErrors.customerCode}</span>}
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">LOCAL NAME *</label>
                    <input
                      type="text"
                      placeholder="e.g. Agro Builders Ltd"
                      className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100"
                      value={editingTrip.localName || ''}
                      onChange={(e) => setEditingTrip({ ...editingTrip, localName: e.target.value })}
                      required
                    />
                    {formErrors.localName && <span className="text-red-500 text-[10px] block mt-0.5">{formErrors.localName}</span>}
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">DOCUMENT NO.</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 font-mono"
                      value={editingTrip.documentNo || ''}
                      onChange={(e) => setEditingTrip({ ...editingTrip, documentNo: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">REF SALE ORDER NO.</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-100 font-mono"
                      value={editingTrip.referenceSaleOrderNo || ''}
                      onChange={(e) => setEditingTrip({ ...editingTrip, referenceSaleOrderNo: e.target.value })}
                    />
                  </div>
                </div>

                {/* Middle Section: Schedule & Location mapping */}
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono border-b border-slate-200 pb-1">
                    2. Destination &amp; Scheduling
                  </h4>

                  <div className="relative bg-emerald-50/70 border border-emerald-200/50 p-2.5 rounded-lg">
                    <label className="text-emerald-900 text-[10px] block font-mono font-extrabold mb-1.5">SHIP TO POINT (FARM/LOCATION) *</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setShowPoiPicker(!showPoiPicker);
                          setPoiSearchQuery('');
                        }}
                        className={`w-full flex items-center justify-between p-2 border rounded text-xs text-left font-mono font-bold uppercase cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white transition ${
                          formErrors.shipTo ? 'border-red-500 bg-red-50/50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={editingTrip.shipTo ? 'text-slate-900 font-bold font-mono' : 'text-slate-400 normal-case font-sans font-medium'}>
                          {editingTrip.shipTo || 'Select Ship To POI or location...'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>

                      {formErrors.shipTo && (
                        <span className="text-red-500 text-[10px] block mt-0.5">{formErrors.shipTo}</span>
                      )}

                      {/* Dropdown POI search overlay picker */}
                      {showPoiPicker && (
                        <div className="absolute z-25 left-0 right-0 mt-1.5 bg-white border border-slate-300 rounded-lg shadow-xl overflow-hidden p-2.5 space-y-2 max-h-[300px] flex flex-col">
                          <div className="relative shrink-0">
                            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search POIs by name or descriptor..."
                              value={poiSearchQuery}
                              onChange={(e) => setPoiSearchQuery(e.target.value)}
                              className="w-full text-xs pl-8 pr-12 py-1.5 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 font-sans font-normal"
                            />
                            <div className="absolute right-2 top-1.5 flex items-center gap-1">
                              {poiSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setPoiSearchQuery('')}
                                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[180px] min-h-[100px]">
                            {poiSearchQuery.trim() && (
                              <button
                                type="button"
                                onClick={() => {
                                  const customVal = poiSearchQuery.trim();
                                  setEditingTrip({ 
                                    ...editingTrip, 
                                    shipTo: customVal,
                                    poi_name: null,
                                    ship_to_point_lat: null,
                                    ship_to_point_lon: null
                                  });
                                  setShowPoiPicker(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded text-xs font-sans hover:bg-blue-50 text-blue-600 font-semibold flex items-center gap-1.5 border border-dashed border-blue-200 transition"
                              >
                                <span className="bg-blue-100 text-blue-800 text-[9px] font-black uppercase px-1 rounded">Custom</span>
                                <span>Use &quot;{poiSearchQuery.trim()}&quot; as destination</span>
                              </button>
                            )}

                            {loadingPois ? (
                              <div className="text-center py-4 text-slate-400 text-xs flex items-center justify-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Loading POIs database...</span>
                              </div>
                            ) : (
                              (() => {
                                const filtered = allPois.filter(p => {
                                  const term = poiSearchQuery.toLowerCase();
                                  return (
                                    p.name.toLowerCase().includes(term) ||
                                    (p.description && p.description.toLowerCase().includes(term))
                                  );
                                });

                                if (filtered.length === 0) {
                                  return (
                                    <div className="text-center py-4 text-slate-400 text-[11px] font-mono">
                                      No matching POIs found.
                                    </div>
                                  );
                                }

                                return filtered.map(p => {
                                  const isSelected = editingTrip?.shipTo === p.name;
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => {
                                        setEditingTrip({
                                          ...editingTrip,
                                          shipTo: p.name,
                                          poi_name: p.name,
                                          ship_to_point_lat: p.position.latitude,
                                          ship_to_point_lon: p.position.longitude
                                        });
                                        setShowPoiPicker(false);
                                      }}
                                      className={`w-full text-left px-2.5 py-2 rounded text-xs flex flex-col gap-0.5 cursor-pointer transition ${
                                        isSelected 
                                          ? 'bg-blue-600 text-white font-bold' 
                                          : 'hover:bg-slate-50 text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-extrabold uppercase tracking-tight font-mono">{p.name}</span>
                                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                          POI
                                        </span>
                                      </div>
                                      {p.description && (
                                        <span className={`text-[10px] line-clamp-1 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                          {p.description}
                                        </span>
                                      )}
                                    </button>
                                  );
                                });
                              })()
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="relative bg-emerald-50/70 border border-emerald-200/50 p-2.5 rounded-lg">
                    <label className="text-emerald-900 text-[10px] block font-mono font-extrabold mb-1.5">ORIGIN (GEOFENCE)</label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => {
                          setShowGeofencePicker(!showGeofencePicker);
                          setGeofenceSearchQuery('');
                        }}
                        className="w-full flex items-center justify-between p-2 border border-slate-200 hover:border-slate-300 rounded text-xs text-left font-mono font-bold uppercase cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white transition"
                      >
                        <span className={editingTrip.origin ? 'text-slate-900 font-bold font-mono' : 'text-slate-400 normal-case font-sans font-medium'}>
                          {editingTrip.origin || 'Select Origin Geofence...'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>

                      {/* Dropdown Geofence search overlay picker */}
                      {showGeofencePicker && (
                        <div className="absolute z-25 left-0 right-0 mt-1.5 bg-white border border-slate-300 rounded-lg shadow-xl overflow-hidden p-2.5 space-y-2 max-h-[300px] flex flex-col">
                          <div className="relative shrink-0">
                            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search Geofences by name..."
                              value={geofenceSearchQuery}
                              onChange={(e) => setGeofenceSearchQuery(e.target.value)}
                              className="w-full text-xs pl-8 pr-12 py-1.5 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 font-sans font-normal"
                            />
                            <div className="absolute right-2 top-1.5 flex items-center gap-1">
                              {geofenceSearchQuery && (
                                <button
                                  type="button"
                                  onClick={() => setGeofenceSearchQuery('')}
                                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[180px] min-h-[100px]">
                            {geofenceSearchQuery.trim() && (
                              <button
                                type="button"
                                onClick={() => {
                                  const customVal = geofenceSearchQuery.trim();
                                  setEditingTrip({ 
                                    ...editingTrip, 
                                    origin: customVal,
                                    origin_geofence_id: null,
                                    origin_lat: null,
                                    origin_lon: null
                                  });
                                  setShowGeofencePicker(false);
                                }}
                                className="w-full text-left px-2.5 py-1.5 rounded text-xs font-sans hover:bg-blue-50 text-blue-600 font-semibold flex items-center gap-1.5 border border-dashed border-blue-200 transition"
                              >
                                <span className="bg-blue-100 text-blue-800 text-[9px] font-black uppercase px-1 rounded">Custom</span>
                                <span>Use &quot;{geofenceSearchQuery.trim()}&quot; as origin</span>
                              </button>
                            )}

                            {loadingGeofences ? (
                              <div className="text-center py-4 text-slate-400 text-xs flex items-center justify-center gap-1">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                                <span>Loading Geofences database...</span>
                              </div>
                            ) : (
                              (() => {
                                const filtered = allGeofences.filter(g => {
                                  const term = geofenceSearchQuery.toLowerCase();
                                  return (
                                    g.name.toLowerCase().includes(term) ||
                                    (g.description && g.description.toLowerCase().includes(term))
                                  );
                                });

                                if (filtered.length === 0) {
                                  return (
                                    <div className="text-center py-4 text-slate-400 text-[11px] font-mono">
                                      No matching Geofences found.
                                    </div>
                                  );
                                }

                                return filtered.map(g => {
                                  const isSelected = editingTrip?.origin === g.name;
                                  return (
                                    <button
                                      key={g.id}
                                      type="button"
                                      onClick={() => {
                                        const lat = g.polygonShape?.vertices && g.polygonShape.vertices.length > 0 ? g.polygonShape.vertices[0].latitude : null;
                                        const lon = g.polygonShape?.vertices && g.polygonShape.vertices.length > 0 ? g.polygonShape.vertices[0].longitude : null;
                                        setEditingTrip({
                                          ...editingTrip,
                                          origin: g.name,
                                          origin_geofence_id: g.id,
                                          origin_lat: lat,
                                          origin_lon: lon
                                        });
                                        setShowGeofencePicker(false);
                                      }}
                                      className={`w-full text-left px-2.5 py-2 rounded text-xs flex flex-col gap-0.5 cursor-pointer transition ${
                                        isSelected 
                                          ? 'bg-blue-600 text-white font-bold' 
                                          : 'hover:bg-slate-50 text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-extrabold uppercase tracking-tight font-mono">{g.name}</span>
                                        <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${isSelected ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                          GEOFENCE
                                        </span>
                                      </div>
                                      {g.description && (
                                        <span className={`text-[10px] line-clamp-1 ${isSelected ? 'text-blue-100' : 'text-slate-400'}`}>
                                          {g.description}
                                        </span>
                                      )}
                                    </button>
                                  );
                                });
                              })()
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="relative bg-emerald-50/70 border border-emerald-200/50 p-2.5 rounded-lg">
                    <label className="text-emerald-900 text-[10px] block font-mono font-extrabold mb-1.5">TRUCK ASSIGNED PLATE *</label>
                    <div className="relative">
                      {/* Read-only styled trigger input button to select actual vehicles */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowVehiclePicker(!showVehiclePicker);
                          setVehicleSearchQuery('');
                        }}
                        className={`w-full flex items-center justify-between p-2 border rounded text-xs text-left font-mono font-bold uppercase cursor-pointer select-none focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white transition ${
                          formErrors.licensePlate ? 'border-red-500 bg-red-50/50' : 'border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <span className={editingTrip.licensePlate ? 'text-slate-900 font-bold font-mono' : 'text-slate-400 normal-case font-sans font-medium'}>
                          {editingTrip.licensePlate || 'Select assigned vehicle...'}
                        </span>
                        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                      </button>

                      {formErrors.licensePlate && (
                        <span className="text-red-500 text-[10px] block mt-0.5">{formErrors.licensePlate}</span>
                      )}

                      {/* Dropdown vehicle search overlay picker */}
                      {showVehiclePicker && (
                        <div className="absolute z-25 left-0 right-0 mt-1.5 bg-white border border-slate-300 rounded-lg shadow-xl overflow-hidden p-2.5 space-y-2 max-h-[250px] flex flex-col">
                          <div className="relative shrink-0">
                            <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
                            <input
                              type="text"
                              autoFocus
                              placeholder="Search vehicle plate..."
                              value={vehicleSearchQuery}
                              onChange={(e) => setVehicleSearchQuery(e.target.value)}
                              className="w-full text-xs pl-8 pr-6 py-1.5 border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-slate-50 font-sans"
                            />
                            {vehicleSearchQuery && (
                              <button
                                type="button"
                                onClick={() => setVehicleSearchQuery('')}
                                className="absolute right-2 top-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          <div className="flex-1 overflow-y-auto space-y-1 pr-1 max-h-[140px]">
                            {currentVehicles.filter(v => 
                              v.name.toLowerCase().includes(vehicleSearchQuery.toLowerCase())
                            ).length === 0 ? (
                              <div className="p-4 text-center text-slate-400 text-[10px] italic">
                                No matching vehicles found.
                              </div>
                            ) : (
                              currentVehicles
                                .filter(v => v.name.toLowerCase().includes(vehicleSearchQuery.toLowerCase()))
                                .map(v => {
                                  const isSelected = editingTrip.licensePlate?.trim().toUpperCase() === v.name.trim().toUpperCase();
                                  return (
                                    <button
                                      type="button"
                                      key={v.id}
                                      onClick={() => {
                                        setEditingTrip({ ...editingTrip, licensePlate: v.name });
                                        setShowVehiclePicker(false);
                                      }}
                                      className={`w-full text-left px-2.5 py-2 rounded text-xs font-mono font-bold flex items-center justify-between cursor-pointer transition ${
                                        isSelected
                                          ? 'bg-blue-600 text-white'
                                          : 'hover:bg-slate-50 text-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className={`w-1.5 h-1.5 rounded-full ${
                                          v.status === 'active' ? 'bg-emerald-500' :
                                          v.status === 'idle' ? 'bg-amber-400' :
                                          v.status === 'stopped' ? 'bg-indigo-505' :
                                          'bg-slate-400'
                                        }`} />
                                        <span>{v.name}</span>
                                      </div>
                                      {isSelected && <Check className="w-3.5 h-3.5 text-white shrink-0" />}
                                    </button>
                                  );
                                })
                            )}
                          </div>
                          
                          <div className="border-t border-slate-100 pt-1.5 flex items-center justify-between shrink-0 text-[9px] font-mono text-slate-400 px-1">
                            <span>{currentVehicles.length} vehicles available</span>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTrip({ ...editingTrip, licensePlate: '' });
                                setShowVehiclePicker(false);
                              }}
                              className="text-red-500 hover:underline font-bold cursor-pointer"
                            >
                              Clear Selection
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">DELIVERY DATE *</label>
                    <input
                      type="date"
                      className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-600"
                      value={editingTrip.deliveryDate || ''}
                      onChange={(e) => setEditingTrip({ ...editingTrip, deliveryDate: e.target.value })}
                      required
                    />
                    {formErrors.deliveryDate && <span className="text-red-500 text-[10px] block mt-0.5">{formErrors.deliveryDate}</span>}
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">WINFEED RECORD DATE</label>
                    <input
                      type="date"
                      className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none font-mono"
                      value={(editingTrip.recordDate || '').split('T')[0]}
                      onChange={(e) => setEditingTrip({ ...editingTrip, recordDate: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 block mb-1">WINFEED ORDER CREATOR</label>
                    <input
                      type="text"
                      className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none"
                      value={editingTrip.createdBy || ''}
                      onChange={(e) => setEditingTrip({ ...editingTrip, createdBy: e.target.value })}
                    />
                  </div>
                </div>

                {/* Right Section: Logs, Slips & Approvals */}
                <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-100 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono border-b border-slate-200 pb-1">
                    3. Logistics Verification
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">APPROVED RESULT</label>
                      <select
                        value={editingTrip.approvedResult || 'Y'}
                        onChange={(e: any) => setEditingTrip({ ...editingTrip, approvedResult: e.target.value })}
                        className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none font-bold"
                      >
                        <option value="Y">Y (Approved)</option>
                        <option value="N">N (Declined)</option>
                        <option value="H">H (Hold)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">CANCEL FLAG</label>
                      <select
                        value={editingTrip.cancelFlag || 'N'}
                        onChange={(e: any) => setEditingTrip({ ...editingTrip, cancelFlag: e.target.value })}
                        className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none font-bold font-mono"
                      >
                        <option value="Y">Y (Cancelled)</option>
                        <option value="N">N (Active)</option>
                      </select>
                    </div>
                  </div>

                  {editingTrip.cancelFlag === 'Y' && (
                    <div>
                      <label className="text-[10px] font-bold text-rose-500 block mb-1">CANCELLATION DATE</label>
                      <input
                        type="date"
                        className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none font-mono text-rose-700 bg-rose-50 border-rose-200"
                        value={(editingTrip.cancelDate || '').split('T')[0]}
                        onChange={(e) => setEditingTrip({ ...editingTrip, cancelDate: e.target.value })}
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">APPROVE DATE #1</label>
                      <input
                        type="date"
                        className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none font-mono"
                        value={(editingTrip.approveDate1 || '').split('T')[0]}
                        onChange={(e) => setEditingTrip({ ...editingTrip, approveDate1: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">APPROVE DATE #2</label>
                      <input
                        type="date"
                        className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none font-mono"
                        value={(editingTrip.approveDate2 || '').split('T')[0]}
                        onChange={(e) => setEditingTrip({ ...editingTrip, approveDate2: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">ISSUE SLIP NO.</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none font-mono"
                        value={editingTrip.issueSlipNo || ''}
                        onChange={(e) => setEditingTrip({ ...editingTrip, issueSlipNo: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">SLIP CREATOR</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none"
                        value={editingTrip.userCreateIssuedSlip || ''}
                        onChange={(e) => setEditingTrip({ ...editingTrip, userCreateIssuedSlip: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">INVOICE NO.</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none font-mono"
                        value={editingTrip.invoiceNo || ''}
                        onChange={(e) => setEditingTrip({ ...editingTrip, invoiceNo: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-600 block mb-1">INVOICE CREATOR</label>
                      <input
                        type="text"
                        className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none"
                        value={editingTrip.userCreateInvoiceNo || ''}
                        onChange={(e) => setEditingTrip({ ...editingTrip, userCreateInvoiceNo: e.target.value })}
                      />
                    </div>
                  </div>
                </div>

                {/* Section 4: Status & Milestone Timestamps */}
                <div className="col-span-1 md:col-span-3 bg-slate-50 p-4 rounded-xl border border-slate-200/60 space-y-3">
                  <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono border-b border-slate-200 pb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-blue-505 text-indigo-500" />
                    <span>4. Status &amp; Milestone Timestamps (When Status Was Changed)</span>
                  </h4>
                  <p className="text-[10px] text-slate-400 font-sans leading-tight">
                    Specify the date and time of each status change. Click "Now" to set the current time instantly.
                  </p>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { label: 'valid', key: 'statusValidDate', color: 'border-emerald-500' },
                      { label: 'dispatch', key: 'statusDispatchDate', color: 'border-blue-500' },
                      { label: 'enroute', key: 'statusEnrouteDate', color: 'border-indigo-500' },
                      { label: 'at_location', key: 'statusAtLocationDate', color: 'border-violet-500' },
                      { label: 'delivered', key: 'statusDeliveredDate', color: 'border-teal-500' },
                      { label: 'undeliverable', key: 'statusUndeliverableDate', color: 'border-rose-500' },
                      { label: 'cancelled', key: 'statusCancelledDate', color: 'border-slate-500' },
                      { label: 'returned', key: 'statusReturnedDate', color: 'border-amber-600' },
                      { label: 'turnaround', key: 'statusTurnaroundDate', color: 'border-pink-500' }
                    ].map((status) => {
                      const value = (editingTrip as any)[status.key] || '';
                      return (
                        <div key={status.key} className="bg-white p-2.5 rounded-lg border border-slate-200 flex flex-col justify-between space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-600 font-mono capitalize">
                              {status.label.replace('_', ' ')}
                            </span>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  const nowIso = new Date().toISOString();
                                  setEditingTrip({ ...editingTrip, [status.key]: nowIso });
                                }}
                                className="px-1.5 py-0.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-[8px] uppercase tracking-wider rounded transition cursor-pointer"
                              >
                                Now
                              </button>
                              {value && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingTrip({ ...editingTrip, [status.key]: '' });
                                  }}
                                  className="px-1 py-0.5 bg-red-50 hover:bg-red-100 text-red-600 font-extrabold text-[8px] uppercase tracking-wider rounded border border-red-100 transition cursor-pointer"
                                >
                                  Clear
                                </button>
                              )}
                            </div>
                          </div>
                          <input
                            type="datetime-local"
                            className="w-full p-1.5 border border-slate-200 rounded text-[11px] focus:outline-none focus:border-blue-500 font-mono"
                            value={formatToDatetimeLocal(value)}
                            onChange={(e) => {
                              const val = e.target.value;
                              setEditingTrip({
                                ...editingTrip,
                                [status.key]: val ? new Date(val).toISOString() : ''
                              });
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Row: Remarks text info */}
                <div className="col-span-1 md:col-span-3">
                  <label className="text-[10px] font-bold text-slate-600 block mb-1">SPECIAL DISPATCH REMARKS / COMPLIANCE COMMENTS</label>
                  <textarea
                    rows={2}
                    className="w-full p-2 border border-slate-200 rounded text-xs focus:outline-none focus:border-blue-600"
                    placeholder="Provide any remarks, specific route notes, driver health check alerts..."
                    value={editingTrip.remark || ''}
                    onChange={(e) => setEditingTrip({ ...editingTrip, remark: e.target.value })}
                  />
                </div>

              </div>

              {/* Bottom save/cancel buttons */}
              <div className="p-5 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider px-4 py-2.5 rounded-lg border border-slate-200 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider px-5 py-2.5 rounded-lg shadow-md shadow-blue-100 transition flex items-center gap-1.5 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Saving to Data Store...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>{editingTrip.id ? 'Save Changes' : 'Confirm Dispatch'}</span>
                    </>
                  )}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

      {/* Excel Import Modal Overlay */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white border border-slate-350 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[85vh]">
            
            {/* Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight font-sans">
                    Import Trips from Excel
                  </h3>
                  <p className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase font-semibold">
                    Bulk Logistics Loader Sandbox
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsImportModalOpen(false)}
                className="text-slate-400 hover:text-white transition bg-slate-800 p-1.5 rounded-lg border border-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Step Content */}
            <div className="p-6 overflow-y-auto text-xs font-sans flex-1">
              
              {/* STEP 1: UPLOAD */}
              {importStep === 'upload' && (
                <div className="space-y-6">
                  <div className="text-center p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center space-y-3 relative hover:bg-slate-100/50 transition">
                    <input
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleFileChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                    <div className="p-3.5 bg-emerald-50 rounded-full text-emerald-600">
                      <FileUp className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="text-slate-700 font-bold font-sans text-sm">Drag or select a spreadsheet file</p>
                      <p className="text-[11px] text-slate-400 mt-1">Supports Microsoft Excel (.xlsx, .xls) and standard CSV formats</p>
                    </div>
                    <div className="pt-2">
                      <button type="button" className="text-[10px] uppercase font-bold text-blue-600 hover:underline bg-white px-3 py-1.5 border border-slate-200 rounded shadow-xs pointer-events-none">
                        Browse Files
                      </button>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-2 text-[11px] leading-relaxed text-slate-600">
                    <p className="font-bold text-slate-800 uppercase tracking-wider text-[10px] flex items-center gap-1.5">
                      <Info className="w-3.5 h-3.5 text-blue-500" />
                      Spreadsheet Import Guidelines
                    </p>
                    <ul className="list-disc list-inside space-y-1 pl-1">
                      <li><strong>Row 1</strong> is treated as the column header row.</li>
                      <li><strong>Row 2</strong> starts the record dataset columns.</li>
                      <li>Blank rows will be skipped automatically to safeguard logistics integrity.</li>
                      <li>The column labeled <strong>"Vehicle Name"</strong> maps directly to the <strong>License Plate</strong> property.</li>
                      <li>Unrecognized headers allow configuration mapping: choose to <strong>Skip</strong>, <strong>Add</strong> as custom note attributes, or <strong>Assign</strong> to standardized objects.</li>
                    </ul>

                    <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-slate-400">Need a baseline layout to start?</span>
                      <button
                        type="button"
                        onClick={() => {
                          const headers = [
                            "Delivery Date",
                            "Order No.",
                            "Ship To",
                            "Record Date",
                            "Created By",
                            "Approved Result",
                            "Approve Date #1",
                            "Approve Date #2",
                            "Reference Sale Order No.",
                            "Issue Slip No.",
                            "Create Issued Slip",
                            "User Create Issued Slip",
                            "Invoice No.",
                            "User Create Invoice No.",
                            "Customer Code",
                            "Local Name",
                            "License Plate",
                            "Cancel Flag",
                            "Document No.",
                            "Remark",
                            "Cancel Date",
                            "Status: Valid",
                            "Status: Dispatch",
                            "Status: Enroute",
                            "Status: At Location",
                            "Status: Delivered",
                            "Status: Undeliverable",
                            "Status: Cancelled",
                            "Status: Returned",
                            "Status: Turnaround"
                          ];
                          const data = [
                            [
                              "2026-06-25",
                              "SO-901111",
                              "Vitarich Agri Feedmill, Bulacan",
                              "16 04 2026 09:52",
                              "winfeed_integrator",
                              "Y",
                              "2026-06-25",
                              "2026-06-25",
                              "REF-99211",
                              "IS-77412",
                              "2026-06-25",
                              "dispatcher_juan",
                              "INV-551023",
                              "billing_maria",
                              "CUST-VIT-9011",
                              "Vitarich Farms Luzon",
                              "CP CCK 9585",
                              "N",
                              "DOC-2026-8819",
                              "Priority feed load",
                              "",
                              "2026-06-25 09:52",
                              "2026-06-25 10:30",
                              "2026-06-25 11:00",
                              "",
                              "",
                              "",
                              "",
                              "",
                              ""
                            ],
                            [
                              "2026-06-26",
                              "SO-901112",
                              "San Miguel Pure Foods, Laguna Hub",
                              "16 04 2026 11:30",
                              "frontsales_clara",
                              "H",
                              "",
                              "",
                              "",
                              "",
                              "",
                              "",
                              "",
                              "",
                              "CUST-SMC-5022",
                              "SMC Southern AgriCorp",
                              "CP CCK 9586",
                              "N",
                              "DOC-2026-8824",
                              "Urgent dispatch",
                              "",
                              "2026-06-26 11:30",
                              "",
                              "",
                              "",
                              "",
                              "",
                              "",
                              "",
                              ""
                            ]
                          ];
                          const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
                          const wb = XLSX.utils.book_new();
                          XLSX.utils.book_append_sheet(wb, ws, "Trips Template");
                          XLSX.writeFile(wb, "winfeed_trips_import_template.xlsx");
                          onNotify('success', 'Sample template downloaded successfully!');
                        }}
                        className="flex items-center gap-1.5 px-2.5 py-1 bg-white hover:bg-slate-50 text-blue-600 border border-slate-200 rounded text-[10px] font-bold cursor-pointer transition active:scale-[0.98]"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Sample Template
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 2: MAPPING */}
              {importStep === 'mapping' && (
                <div className="space-y-4">
                  <div className="bg-blue-50 p-3.5 border border-blue-200 rounded-lg text-[11px] text-blue-800 leading-relaxed">
                    <div className="font-bold uppercase tracking-wider text-[10px] mb-0.5">Automated Schematics Mapping</div>
                    Found <strong>{importHeaders.length} headers</strong> in your worksheet. Unrecognized headings must be configured below as required: <strong>Skip</strong>, <strong>Add</strong>, or <strong>Assign</strong>.
                  </div>

                  <div className="space-y-3.5 max-h-[350px] overflow-y-auto pr-1">
                    {importHeaders.map((header) => {
                      const mapping = columnMappings[header] || { type: 'skip' };
                      const sampleVal = importRows[0] ? String(importRows[0][importHeaders.indexOf(header)] || '') : 'N/A';

                      return (
                        <div key={header} className="p-3 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                          <div className="md:col-span-4 space-y-1">
                            <span className="font-mono font-bold text-slate-800 text-xs truncate block font-semibold" title={header}>
                              {header}
                            </span>
                            <span className="text-[10px] text-slate-400 flex items-center gap-1 truncate block font-sans">
                              Sample value: <span className="font-mono bg-slate-200/50 px-1 rounded text-slate-600 max-w-[140px] truncate">{sampleVal || '[Empty]'}</span>
                            </span>
                          </div>

                          <div className="md:col-span-8 flex flex-wrap gap-1.5 justify-start md:justify-end">
                            {/* Skip Pill Button */}
                            <button
                              type="button"
                              onClick={() => setColumnMappings({
                                ...columnMappings,
                                [header]: { type: 'skip' }
                              })}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition cursor-pointer border ${
                                mapping.type === 'skip'
                                  ? 'bg-slate-600 text-white border-slate-700 shadow-sm'
                                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              Skip
                            </button>

                            {/* Add Pill Button */}
                            <button
                              type="button"
                              onClick={() => setColumnMappings({
                                ...columnMappings,
                                [header]: { type: 'add' }
                              })}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition cursor-pointer border ${
                                mapping.type === 'add'
                                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-sm'
                                  : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              Add Field
                            </button>

                            {/* Assign Dropdown / Button selection */}
                            <div className="relative">
                              <select
                                value={mapping.type === 'assign' ? (mapping.assignTo || '') : ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val) {
                                    setColumnMappings({
                                      ...columnMappings,
                                      [header]: { type: 'assign', assignTo: val }
                                    });
                                  } else {
                                    setColumnMappings({
                                      ...columnMappings,
                                      [header]: { type: 'skip' }
                                    });
                                  }
                                }}
                                className={`px-2.5 py-1.5 rounded-lg text-[10px] font-extrabold uppercase transition cursor-pointer border pr-6 appearance-none bg-no-repeat bg-[right_8px_center] ${
                                  mapping.type === 'assign'
                                    ? 'bg-blue-600 text-white border-blue-700 shadow-sm'
                                    : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-100'
                                }`}
                                style={{
                                  backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' fill='none' stroke='${mapping.type === 'assign' ? 'white' : 'gray'}' stroke-width='2' viewBox='0 0 24 24'><path d='M6 9l6 6 6-6'/></svg>")`
                                }}
                              >
                                <option value="" className="text-slate-800 bg-white">Assign field...</option>
                                {TRIP_FIELDS.map(f => (
                                  <option key={f.key} value={f.key} className="text-slate-800 bg-white leading-normal">
                                    {f.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="pt-4 border-t border-slate-150 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setImportStep('upload')}
                      className="px-4 py-2 bg-slate-100 text-slate-700 uppercase font-extrabold text-[10px] tracking-wider rounded border border-slate-200 cursor-pointer"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={startImporting}
                      className="px-5 py-2.5 bg-blue-600 text-white uppercase font-extrabold text-[10px] tracking-wider rounded shadow-md shadow-blue-100 flex items-center gap-1.5 cursor-pointer hover:bg-blue-700"
                    >
                      <Check className="w-4 h-4" />
                      <span>Process {importRows.length} Records</span>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: IMPORTING & PROGRESS */}
              {importStep === 'importing' && (
                <div className="space-y-5 py-4">
                  <div className="flex flex-col items-center justify-center space-y-2 text-center">
                    <RefreshCw className="w-7 h-7 text-blue-600 animate-spin" />
                    <p className="text-sm font-black uppercase text-slate-800 font-sans tracking-tight">Bulk Upload Underway</p>
                    <p className="text-slate-400 text-[10px] font-mono">Row {importProgress.current} of {importProgress.total} in transaction log...</p>
                  </div>

                  {/* Progress bar container */}
                  <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-150 rounded-full"
                      style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 text-center mt-3 scale-[0.98]">
                    <div className="p-2.5 bg-slate-50 rounded border border-slate-150">
                      <span className="text-slate-400 block text-[9px] uppercase font-bold font-mono">Total</span>
                      <strong className="text-slate-700 text-base font-black">{importProgress.total}</strong>
                    </div>
                    <div className="p-2.5 bg-emerald-50 rounded border border-emerald-100">
                      <span className="text-emerald-600 block text-[9px] uppercase font-bold font-mono">Successful</span>
                      <strong className="text-emerald-700 text-base font-black">{importProgress.successes}</strong>
                    </div>
                    <div className="p-2.5 bg-red-50 rounded border border-red-100">
                      <span className="text-red-500 block text-[9px] uppercase font-bold font-mono">Failed</span>
                      <strong className="text-red-700 text-base font-black">{importProgress.failures}</strong>
                    </div>
                  </div>

                  <div className="space-y-1 block max-h-[140px] overflow-y-auto p-3 bg-slate-950 text-slate-300 font-mono text-[9px] rounded-lg border border-slate-800 leading-normal select-none">
                    <span className="text-slate-500 block font-bold mb-1 border-b border-slate-805 pb-0.5">Live Terminal Feeds</span>
                    {importProgress.details.slice(-6).map((log, idx) => (
                      <div key={idx} className="truncate">
                        &gt; {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* STEP 4: COMPLETED SUMMARY */}
              {importStep === 'completed' && (
                <div className="space-y-5 text-center py-6">
                  <div className="inline-flex items-center justify-center p-3.5 bg-emerald-100 text-emerald-600 rounded-full">
                    <CheckCircle2 className="w-9 h-9" />
                  </div>
                  <div>
                    <h4 className="text-lg font-black uppercase text-slate-800 tracking-tight leading-none font-sans">Import Operation Finalized</h4>
                    <p className="text-[11px] text-slate-400 mt-1 font-medium">Processed complete range starting Row 2 through column end records.</p>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-w-sm mx-auto space-y-1.5 text-xs text-left shadow-xs">
                    <div className="flex justify-between items-center text-slate-600 border-b border-slate-100 pb-1.5 font-mono">
                      <span>Parsed Raw Sheet Rows:</span>
                      <strong className="text-slate-900 font-bold">{importProgress.total}</strong>
                    </div>
                    <div className="flex justify-between items-center text-emerald-600 border-b border-slate-100 pb-1.5 font-mono">
                      <span className="font-semibold">Successfully Imported:</span>
                      <strong className="text-emerald-800 font-black">{importProgress.successes}</strong>
                    </div>
                    <div className="flex justify-between items-center text-slate-500 font-mono">
                      <span>Rejected Records:</span>
                      <strong className={`font-bold ${importProgress.failures > 0 ? 'text-red-500' : 'text-slate-400'}`}>
                        {importProgress.failures}
                      </strong>
                    </div>
                  </div>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setIsImportModalOpen(false)}
                      className="px-6 py-2.5 bg-slate-900 hover:bg-slate-850 text-white uppercase font-extrabold text-[10px] tracking-wider rounded-lg shadow-sm cursor-pointer transition active:scale-[0.98]"
                    >
                      Dismiss View
                    </button>
                  </div>
                </div>
              )}

            </div>

          </div>
        </div>
      )}

      {/* Trip Status Analytics Modal */}
      {isStatusModalOpen && (
        <div className={`fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 overflow-y-auto animate-fade-in ${isStatusFullscreen ? 'p-0' : 'p-4'}`}>
          <div className={isStatusFullscreen ? "bg-white w-full h-full max-w-none max-h-none border-none flex flex-col shadow-2xl overflow-hidden" : "bg-white border border-slate-300 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden animate-scale-in flex flex-col max-h-[85vh]"}>
            
            {/* Header */}
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-5 h-5 text-emerald-400" />
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight font-sans">
                    Trip Status Analytics
                  </h3>
                  <p className="text-[10px] text-emerald-400 font-mono tracking-wider uppercase font-semibold">
                    Global Status &amp; Performance Distribution
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsStatusFullscreen(!isStatusFullscreen)}
                  className="text-slate-400 hover:text-white transition bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700 cursor-pointer flex items-center gap-1.5 text-[10px] uppercase font-bold tracking-wider"
                  title={isStatusFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
                >
                  {isStatusFullscreen ? (
                    <>
                      <Minimize2 className="w-3.5 h-3.5 text-amber-400" />
                      <span className="hidden sm:inline">Exit Fullscreen</span>
                    </>
                  ) : (
                    <>
                      <Maximize2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span className="hidden sm:inline">Fullscreen</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsStatusModalOpen(false);
                    setIsStatusFullscreen(false);
                  }}
                  className="text-slate-400 hover:text-white transition bg-slate-800 p-1.5 rounded-lg border border-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto text-xs font-sans flex-1 space-y-6">
              
              {/* Total Summary Banner */}
              <div className="bg-slate-50 border border-slate-150 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">
                    Total Trips ({filterStartDate || filterEndDate ? 'Filtered by Date' : 'All'})
                  </p>
                  <div className="flex items-baseline gap-2 mt-1">
                    <p className="text-3xl font-black text-slate-800 tracking-tight leading-none">
                      {statusFilteredTrips.length}
                    </p>
                    {(filterStartDate || filterEndDate) && (
                      <span className="text-slate-400 text-xs font-medium">
                        out of {trips.length} total
                      </span>
                    )}
                  </div>
                  {(filterStartDate || filterEndDate) && (
                    <p className="text-[10px] text-blue-600 font-bold uppercase mt-1.5 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Date range: {filterStartDate || 'Any'} to {filterEndDate || 'Any'}</span>
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Dataset Confidence</p>
                  <p className="text-xs font-semibold text-emerald-600 mt-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100 inline-block">100% Synced (Firebase)</p>
                </div>
              </div>

              {statusFilteredTrips.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <AlertCircle className="w-10 h-10 text-slate-300 mx-auto" />
                  <p className="text-sm font-bold text-slate-600">No trips recorded for the selected date range</p>
                  <p className="text-slate-400 text-[11px]">Adjust your filters or insert/import logistics trips with delivery dates in this range.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                  
                  {/* Left Column: Combined Operational Statuses */}
                  <div className="lg:col-span-5 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono border-b border-slate-250 pb-1.5 mb-2">
                      Combined Operational Statuses
                    </h4>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                      {/* Stack 1: Active & Approved / Active & On Hold */}
                      <div className="space-y-4">
                        {/* Active & Approved */}
                        <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[9px] font-extrabold uppercase rounded-full">
                              Active &amp; Approved
                            </span>
                            <span className="text-xl font-black text-emerald-850 font-mono">
                              {statusFilteredTrips.filter(t => t.cancelFlag !== 'Y' && t.approvedResult === 'Y').length}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-medium text-slate-500">
                              <span>Percentage of total</span>
                              <span className="font-bold">
                                {(statusFilteredTrips.length > 0 ? ((statusFilteredTrips.filter(t => t.cancelFlag !== 'Y' && t.approvedResult === 'Y').length / statusFilteredTrips.length) * 100) : 0).toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${(statusFilteredTrips.length > 0 ? ((statusFilteredTrips.filter(t => t.cancelFlag !== 'Y' && t.approvedResult === 'Y').length / statusFilteredTrips.length) * 100) : 0)}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Active & On Hold (stacked under Active & Approved) */}
                        <div className="bg-amber-50/40 border border-amber-100/70 p-4 rounded-xl space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[9px] font-extrabold uppercase rounded-full">
                              Active &amp; On Hold
                            </span>
                            <span className="text-xl font-black text-amber-850 font-mono">
                              {statusFilteredTrips.filter(t => t.cancelFlag !== 'Y' && t.approvedResult === 'H').length}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-medium text-slate-500">
                              <span>Percentage of total</span>
                              <span className="font-bold">
                                {(statusFilteredTrips.length > 0 ? ((statusFilteredTrips.filter(t => t.cancelFlag !== 'Y' && t.approvedResult === 'H').length / statusFilteredTrips.length) * 100) : 0).toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-amber-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${(statusFilteredTrips.length > 0 ? ((statusFilteredTrips.filter(t => t.cancelFlag !== 'Y' && t.approvedResult === 'H').length / statusFilteredTrips.length) * 100) : 0)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Stack 2: Active & Declined / Cancelled (Voided) */}
                      <div className="space-y-4">
                        {/* Active & Declined */}
                        <div className="bg-rose-50/50 border border-rose-100 p-4 rounded-xl space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[9px] font-extrabold uppercase rounded-full">
                              Active &amp; Declined
                            </span>
                            <span className="text-xl font-black text-rose-850 font-mono">
                              {statusFilteredTrips.filter(t => t.cancelFlag !== 'Y' && (t.approvedResult === 'N' || !t.approvedResult)).length}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-medium text-slate-500">
                              <span>Percentage of total</span>
                              <span className="font-bold">
                                {(statusFilteredTrips.length > 0 ? ((statusFilteredTrips.filter(t => t.cancelFlag !== 'Y' && (t.approvedResult === 'N' || !t.approvedResult)).length / statusFilteredTrips.length) * 100) : 0).toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-rose-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${(statusFilteredTrips.length > 0 ? ((statusFilteredTrips.filter(t => t.cancelFlag !== 'Y' && (t.approvedResult === 'N' || !t.approvedResult)).length / statusFilteredTrips.length) * 100) : 0)}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Cancelled (Voided) (stacked under Active & Declined) */}
                        <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl space-y-3">
                          <div className="flex justify-between items-start">
                            <span className="px-2 py-0.5 bg-slate-200 text-slate-800 text-[9px] font-extrabold uppercase rounded-full">
                              Cancelled (Voided)
                            </span>
                            <span className="text-xl font-black text-slate-800 font-mono">
                              {statusFilteredTrips.filter(t => t.cancelFlag === 'Y').length}
                            </span>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-medium text-slate-500">
                              <span>Percentage of total</span>
                              <span className="font-bold">
                                {(statusFilteredTrips.length > 0 ? ((statusFilteredTrips.filter(t => t.cancelFlag === 'Y').length / statusFilteredTrips.length) * 100) : 0).toFixed(1)}%
                              </span>
                            </div>
                            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                              <div 
                                className="bg-slate-500 h-full rounded-full transition-all duration-500"
                                style={{ width: `${(statusFilteredTrips.length > 0 ? ((statusFilteredTrips.filter(t => t.cancelFlag === 'Y').length / statusFilteredTrips.length) * 100) : 0)}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: 3x3 Trip Statuses */}
                  <div className="lg:col-span-7 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider block font-mono border-b border-slate-250 pb-1.5 mb-2">
                      Trip Status Milestones (3x3 Grid)
                    </h4>

                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { label: 'valid', key: 'statusValidDate', color: 'border-emerald-200 text-emerald-800 bg-emerald-50/50 barBg: bg-emerald-500' },
                        { label: 'dispatch', key: 'statusDispatchDate', color: 'border-blue-200 text-blue-800 bg-blue-50/40 barBg: bg-blue-500' },
                        { label: 'enroute', key: 'statusEnrouteDate', color: 'border-indigo-200 text-indigo-800 bg-indigo-50/40 barBg: bg-indigo-500' },
                        { label: 'at location', key: 'statusAtLocationDate', color: 'border-violet-200 text-violet-800 bg-violet-50/40 barBg: bg-violet-500' },
                        { label: 'delivered', key: 'statusDeliveredDate', color: 'border-teal-200 text-teal-800 bg-teal-50/40 barBg: bg-teal-500' },
                        { label: 'undeliverable', key: 'statusUndeliverableDate', color: 'border-rose-200 text-rose-800 bg-rose-50/40 barBg: bg-rose-500' },
                        { label: 'cancelled', key: 'statusCancelledDate', color: 'border-slate-200 text-slate-800 bg-slate-100 barBg: bg-slate-500' },
                        { label: 'returned', key: 'statusReturnedDate', color: 'border-amber-200 text-amber-800 bg-amber-50/40 barBg: bg-amber-600' },
                        { label: 'turnaround', key: 'statusTurnaroundDate', color: 'border-pink-200 text-pink-800 bg-pink-50/40 barBg: bg-pink-500' }
                      ].map((item) => {
                        const count = statusFilteredTrips.filter(t => !!t[item.key as keyof Trip]).length;
                        const percentage = statusFilteredTrips.length > 0 ? (count / statusFilteredTrips.length) * 100 : 0;
                        const barBgClass = item.color.split('barBg: ')[1] || 'bg-slate-500';
                        const cardStyles = item.color.split(' barBg:')[0];
                        return (
                          <div key={item.key} className={`border rounded-xl p-3 flex flex-col justify-between space-y-2.5 shadow-2xs ${cardStyles}`}>
                            <div>
                              <span className="text-[10px] font-black uppercase tracking-wider block truncate capitalize">
                                {item.label}
                              </span>
                              <div className="flex items-baseline gap-1 mt-1">
                                <span className="text-lg font-black font-mono leading-none">{count}</span>
                                <span className="text-[10px] font-bold text-slate-400 font-mono">trips</span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="flex justify-between text-[9px] font-bold font-mono">
                                <span className="opacity-80">Ratio</span>
                                <span>{percentage.toFixed(1)}%</span>
                              </div>
                              <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                                <div 
                                  className={`${barBgClass} h-full rounded-full transition-all duration-500`}
                                  style={{ width: `${percentage}%` }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-150 flex items-center justify-end shrink-0">
              <button
                type="button"
                onClick={() => {
                  setIsStatusModalOpen(false);
                  setIsStatusFullscreen(false);
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-850 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-lg shadow-sm cursor-pointer transition active:scale-[0.98]"
              >
                Dismiss Analytics
              </button>
            </div>

          </div>
        </div>
      )}

      {/* Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60] animate-fade-in">
          <div className="bg-white border border-slate-300 rounded-xl max-w-sm w-full shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-slate-100 flex items-center gap-3 bg-slate-50">
              <div className="p-2 bg-red-100 text-red-600 rounded-full shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <h4 className="font-extrabold text-slate-900 uppercase tracking-tight text-sm">
                {confirmModal.title}
              </h4>
            </div>
            <div className="p-5">
              <p className="text-xs font-medium text-slate-500 leading-relaxed">
                {confirmModal.description}
              </p>
            </div>
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 border border-slate-250 text-slate-600 hover:bg-slate-100 rounded-lg font-bold uppercase text-[10px] tracking-wide cursor-pointer transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold uppercase text-[10px] tracking-wide shadow-xs hover:shadow-red-500/15 cursor-pointer transition"
              >
                {confirmModal.actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeShipToTrip && (
        <ShipToMapModal
          trip={activeShipToTrip}
          onClose={() => setActiveShipToTrip(null)}
          onNotify={onNotify}
          onTripUpdated={(updatedTrip) => {
            setSelectedTrip(updatedTrip);
            fetchTrips();
          }}
        />
      )}

      {/* Slide-over Pop-out Detail Panel Drawer */}
      {selectedTrip && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop Overlay */}
          <div 
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity duration-300"
            onClick={() => setSelectedTrip(null)}
          />
          
          {/* Drawer Panel Container */}
          <div className="relative w-full max-w-2xl bg-white shadow-2xl flex flex-col h-full border-l border-slate-200 z-10 animate-slide-in">
            {/* Header */}
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest font-mono">Order Verification</span>
                  <span className="bg-blue-100 text-blue-800 text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded font-sans">
                    CPF XML
                  </span>
                </div>
                <h3 className="text-lg font-black text-slate-900 font-mono tracking-tight text-ellipsis overflow-hidden">
                  {selectedTrip.orderNo}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white border border-slate-200 p-1.5 rounded-lg shrink-0">
                  <button
                    onClick={() => handleOpenEditModal(selectedTrip)}
                    className="p-1 hover:bg-slate-50 rounded text-blue-600 hover:text-blue-800 transition cursor-pointer"
                    title="Edit order fields"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteTrip(selectedTrip.id)}
                    className="p-1 hover:bg-red-50 rounded text-red-500 hover:text-red-700 transition cursor-pointer"
                    title="Delete record"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <button
                  onClick={() => setSelectedTrip(null)}
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-400 hover:text-slate-800 rounded-lg transition ml-2 cursor-pointer flex items-center justify-center"
                  title="Close panel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Parameters scrollbox mapping */}
            <div className="p-6 space-y-6 overflow-y-auto text-xs font-sans flex-1">
              
              {/* Section 1: Customer Demographics */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span>Customer Context</span>
                </h4>
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">CUSTOMER CODE</span>
                    <span className="font-mono font-bold text-slate-800">{selectedTrip.customerCode || 'None'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">LOCAL TRADING NAME</span>
                    <span className="font-bold text-slate-800">{selectedTrip.localName || 'None'}</span>
                  </div>
                  <div className="col-span-2 bg-emerald-50/70 border border-emerald-200/50 p-2.5 rounded-lg">
                    <span className="text-emerald-900 text-[9px] font-extrabold block font-mono">SHIP TO POINT (FARM)</span>
                    <div className="font-bold text-slate-800 flex items-center gap-1.5 mt-1 text-left w-full">
                      <span className="truncate">{selectedTrip.shipTo}</span>
                      {selectedTrip.poi_name && selectedTrip.ship_to_point_lat !== null && selectedTrip.ship_to_point_lon !== null ? (
                        <span className="text-[9px] shrink-0 font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                          Location OK ({selectedTrip.poi_name})
                        </span>
                      ) : (
                        <span className="text-[9px] shrink-0 font-bold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-250 animate-pulse">
                          No Mapped POI (Resolve)
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-span-2 bg-emerald-50/70 border border-emerald-200/50 p-2.5 rounded-lg">
                    <span className="text-emerald-900 text-[9px] font-extrabold block font-mono">ORIGIN (GEOFENCE)</span>
                    <div className="font-bold text-slate-800 flex items-center gap-1.5 mt-1">
                      <span className="truncate">{selectedTrip.origin || 'None Assigned'}</span>
                      {selectedTrip.origin_geofence_id ? (
                        <span className="text-[9px] shrink-0 font-bold bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded border border-emerald-200">
                          Geofence OK (ID: {selectedTrip.origin_geofence_id})
                        </span>
                      ) : (
                        <span className="text-[9px] shrink-0 font-bold bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-250 animate-pulse">
                          Unassigned
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 2: Key Operational Dates */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span>Transaction Timeline</span>
                </h4>
                <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">DELIVERY DATE</span>
                    <span className="font-bold text-slate-800">{selectedTrip.deliveryDate}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">RECORD CREATED</span>
                    <span className="font-mono text-slate-700">{selectedTrip.recordDate ? selectedTrip.recordDate.split('T')[0] : 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">CREATED BY USER</span>
                    <span className="font-medium text-slate-800">{selectedTrip.createdBy || 'Unknown'}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Document Reference Parameters */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  <span>Document Reference Parameters</span>
                </h4>
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">DOCUMENT NUMBER</span>
                    <span className="font-mono text-slate-800 font-bold">{selectedTrip.documentNo || 'No Document'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">VERIFICATION RESULT</span>
                    <div className="mt-1">
                      {selectedTrip.approvedResult === 'Y' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-250">
                          Approved (Y)
                        </span>
                      )}
                      {selectedTrip.approvedResult === 'H' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-250">
                          On Hold (H)
                        </span>
                      )}
                      {selectedTrip.approvedResult === 'N' && (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-250">
                          Declined (N)
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">LEVEL 1 APPROVAL DATE</span>
                    <span className="font-mono text-slate-700">{selectedTrip.approveDate1 ? selectedTrip.approveDate1.split('T')[0] : 'Not yet approved'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">LEVEL 2 APPROVAL DATE</span>
                    <span className="font-mono text-slate-700">{selectedTrip.approveDate2 ? selectedTrip.approveDate2.split('T')[0] : 'Not yet approved'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">REFERENCE SALE ORDER NO</span>
                    <span className="font-mono text-slate-800">{selectedTrip.referenceSaleOrderNo || 'None'}</span>
                  </div>
                </div>
              </div>

              {/* Section 4: Cancellation Logistics */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-slate-400" />
                  <span>Cancellation Logistics</span>
                </h4>
                <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex items-center justify-between">
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">CANCELLATION FLAG</span>
                    <div className="mt-1">
                      {selectedTrip.cancelFlag === 'Y' ? (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-rose-100 text-rose-800 border border-rose-250 animate-pulse">
                          Cancelled (Y)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-emerald-100 text-emerald-800 border border-emerald-250">
                          Active (N)
                        </span>
                      )}
                    </div>
                  </div>
                  {selectedTrip.cancelFlag === 'Y' && (
                    <div className="text-right">
                      <span className="text-slate-400 text-[9px] font-bold block font-mono">CANCELLATION DATE</span>
                      <span className="font-mono text-xs font-semibold text-rose-800">{selectedTrip.cancelDate ? selectedTrip.cancelDate.split('T')[0] : 'Undefined'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Section 5: ERP Winfeed Logistics Bindings */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-slate-400" />
                  <span>ERP Winfeed Logistics Bindings</span>
                </h4>
                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">ISSUE SLIP NO</span>
                    <span className="font-mono font-bold text-slate-800">
                      {selectedTrip.issueSlipNo || 'Pending'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">ISSUE SLIP DATE</span>
                    <span className="font-mono text-slate-700">{selectedTrip.createIssuedSlip ? selectedTrip.createIssuedSlip.split('T')[0] : 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">CREATED BY WINFEED USER</span>
                    <span className="font-medium text-slate-700">{selectedTrip.userCreateIssuedSlip || 'N/A'}</span>
                  </div>
                  <div className="col-span-2 bg-emerald-50/70 border border-emerald-200/50 p-2.5 rounded-lg mt-1">
                    <span className="text-emerald-900 text-[9px] font-extrabold block font-mono">TRUCK ASSIGNED (PLATE)</span>
                    <span className="font-mono font-black text-slate-900 uppercase tracking-wider text-xs mt-1.5 flex items-center gap-2">
                      <Truck className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{selectedTrip.licensePlate || 'Uncoded'}</span>
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">INVOICE NUMBER</span>
                    <span className="font-mono font-bold text-slate-800">{selectedTrip.invoiceNo || 'Pending'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-[9px] font-bold block font-mono">INVOICE USER BY WINFEED</span>
                    <span className="font-medium text-slate-700">{selectedTrip.userCreateInvoiceNo || 'Pending'}</span>
                  </div>
                </div>
              </div>

              {/* Section 6: Status Milestone Timeline */}
              <div className="space-y-2.5">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider font-mono border-b border-slate-100 pb-1 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <span>Status Milestone Timeline</span>
                </h4>
                <div className="space-y-2 relative border-l border-slate-200 pl-4 ml-2.5 pt-1">
                  {[
                    { label: 'valid', key: 'statusValidDate', color: 'bg-emerald-500' },
                    { label: 'dispatch', key: 'statusDispatchDate', color: 'bg-blue-500' },
                    { label: 'enroute', key: 'statusEnrouteDate', color: 'bg-indigo-500' },
                    { label: 'at_location', key: 'statusAtLocationDate', color: 'bg-violet-500' },
                    { label: 'delivered', key: 'statusDeliveredDate', color: 'bg-teal-500' },
                    { label: 'undeliverable', key: 'statusUndeliverableDate', color: 'bg-rose-500' },
                    { label: 'cancelled', key: 'statusCancelledDate', color: 'bg-slate-500' },
                    { label: 'returned', key: 'statusReturnedDate', color: 'bg-amber-600' },
                    { label: 'turnaround', key: 'statusTurnaroundDate', color: 'bg-pink-500' }
                  ].map((status, idx) => {
                    const val = selectedTrip[status.key as keyof Trip];
                    const isSet = !!val;
                    return (
                      <div key={status.key} className="relative flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`absolute -left-[21px] w-2 h-2 rounded-full border border-white ring-2 ${isSet ? 'bg-slate-900 ring-slate-200' : 'bg-slate-200 ring-transparent'}`} />
                          <span className="font-mono font-bold text-slate-600 text-[11px] capitalize">
                            {status.label.replace('_', ' ')}
                          </span>
                        </div>
                        <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${isSet ? 'bg-slate-100 text-slate-800 font-semibold' : 'text-slate-400 italic'}`}>
                          {isSet ? new Date(val!).toLocaleString() : 'Not recorded'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 7: Remarks or notes */}
              <div className="pt-2 bg-slate-50 p-3 rounded-lg border border-slate-100 leading-relaxed font-sans text-slate-700">
                <span className="text-slate-400 text-[10px] font-bold block font-mono uppercase tracking-wider pb-1">Special dispatch notes / comments</span>
                <p className="font-medium italic text-slate-850">↳ {selectedTrip.remark || 'No dispatch notes recorded.'}</p>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
