import dns from "dns";
dns.setDefaultResultOrder("ipv4first");

import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { initializeApp as initializeClientApp } from "firebase/app";
import { 
  initializeFirestore, 
  Firestore, 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  deleteDoc, 
  writeBatch, 
  query, 
  orderBy, 
  limit 
} from "firebase/firestore";
import { AppConfig, FleetVehicle, SyncLogEntry, SchedulerStatus, MockTargetReceivedPayload, Trip } from "./src/types";

// Initialize Firebase SDK with local config
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firestoreDb: Firestore | null = null;

if (fs.existsSync(configPath)) {
  try {
    const configData = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    const firebaseApp = initializeClientApp({
      apiKey: configData.apiKey,
      authDomain: configData.authDomain,
      projectId: configData.projectId,
      storageBucket: configData.storageBucket,
      messagingSenderId: configData.messagingSenderId,
      appId: configData.appId,
    });
    firestoreDb = initializeFirestore(firebaseApp, {}, configData.firestoreDatabaseId);
    console.log(`[Firestore Client] Initialized target database on server: ${configData.firestoreDatabaseId}`);
  } catch (err) {
    console.error("[Firestore Client] Failed to initialize Firebase with local config:", err);
  }
}


console.log("Node Version:", process.version);
console.log(fetch.toString());

const app = express();
const PORT = 3000;

app.use(express.json());

// In-Memory state
const CONFIG_FILE = path.join(process.cwd(), "config.json");
let logs: SyncLogEntry[] = [];
let mockPayloadsReceived: MockTargetReceivedPayload[] = [];
let inboundEvents: any[] = [];
let lastFetchedVehicles: FleetVehicle[] = [];
let lastTargetResponse: { status: number; statusText: string; body: string; timestamp: string } | null = null;
let receivedRecordIds = new Set<string>();

// GpsGate API session and data caches
interface GpsGateCacheEntry {
  data: any;
  timestamp: number;
}
const gpsgateCache = new Map<string, GpsGateCacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache TTL
let cachedSessionToken = "";
let cachedSessionTokenExpiry = 0;

function clearSessionToken() {
  cachedSessionToken = "";
  cachedSessionTokenExpiry = 0;
}

const INITIAL_TRIPS: Trip[] = [
  {
    id: "trip_101",
    deliveryDate: "2026-06-25",
    orderNo: "SO-889312",
    shipTo: "Central Luzon Poultry Farm, Tarlac",
    recordDate: "2026-06-22",
    createdBy: "winfeed_integrator",
    approvedResult: "Y",
    approveDate1: "2026-06-22",
    approveDate2: "2026-06-22",
    referenceSaleOrderNo: "REF-99211",
    issueSlipNo: "IS-77412",
    createIssuedSlip: "2026-06-22",
    userCreateIssuedSlip: "dispatcher_juan",
    invoiceNo: "INV-551023",
    userCreateInvoiceNo: "billing_maria",
    customerCode: "CUST-CPF-8812",
    localName: "Pampanga Poultry Ventures",
    licensePlate: "CP CCK 9585",
    cancelFlag: "N",
    documentNo: "DOC-2026-8819",
    remark: "High priority broiler feed delivery. Maintain temperature parameters.",
    cancelDate: "",
    statusValidDate: "2026-06-22T09:00:00Z",
    statusDispatchDate: "2026-06-22T09:30:00Z",
    statusEnrouteDate: "2026-06-22T10:00:00Z",
    statusAtLocationDate: "",
    statusDeliveredDate: "",
    statusUndeliverableDate: "",
    statusCancelledDate: "",
    statusReturnedDate: "",
    statusTurnaroundDate: ""
  },
  {
    id: "trip_102",
    deliveryDate: "2026-06-26",
    orderNo: "SO-889415",
    shipTo: "Batangas Breeding Station, Lipa City",
    recordDate: "2026-06-22",
    createdBy: "frontsales_clara",
    approvedResult: "H",
    approveDate1: "",
    approveDate2: "",
    referenceSaleOrderNo: "",
    issueSlipNo: "",
    createIssuedSlip: "",
    userCreateIssuedSlip: "",
    invoiceNo: "",
    userCreateInvoiceNo: "",
    customerCode: "CUST-CPF-4501",
    localName: "Batangas AgriCorp",
    licensePlate: "CP CCK 9586",
    cancelFlag: "N",
    documentNo: "DOC-2026-8824",
    remark: "Awaiting credit limit clearance from accounting.",
    cancelDate: "",
    statusValidDate: "2026-06-22T11:00:00Z",
    statusDispatchDate: "",
    statusEnrouteDate: "",
    statusAtLocationDate: "",
    statusDeliveredDate: "",
    statusUndeliverableDate: "",
    statusCancelledDate: "",
    statusReturnedDate: "",
    statusTurnaroundDate: ""
  }
];

let trips: Trip[] = [...INITIAL_TRIPS];

function getGpsgateBaseUrl(configUrl: string): string {
  let url = (configUrl || "").trim();
  if (!url) return "";
  
  // Clean trailing slashes
  url = url.replace(/\/+$/, "");

  // Prepend protocol if missing
  if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }

  // If GpsGate URL doesn't have /comGpsGate but corresponds to server93.com, add it gracefully
  if (!url.includes("/comGpsGate") && (url.includes("server93.com") || url.includes("wru2"))) {
    url = `${url}/comGpsGate`;
  }
  
  return url;
}

// Default configuration (using environment variables if provided)
const DEFAULT_CONFIG: AppConfig = {
  gpsgateUrl: process.env.GPSGATE_URL || "wru2.server93.com",
  gpsgateAppId: process.env.GPSGATE_APP_ID || "208",
  gpsgateUsername: process.env.GPSGATE_USERNAME || "api_fleet_sync",
  gpsgatePassword: process.env.GPSGATE_PASSWORD || "",
  useGpsgateMock: false, // Turn off mock by default or let user see real data instantly
  gpsgateToken: process.env.GPSGATE_TOKEN || "v2:MDAwMDAwNzk3OTphZWExNjdhYjA4OTBjYTc3NmI3MQ==",
  gpsgateGroupId: process.env.GPSGATE_GROUP_ID || "14925",

  targetUrl: process.env.TARGET_URL || "http://localhost:3000/api/mock/target-endpoint",
  targetAuthHeader: process.env.TARGET_AUTH_HEADER || "Authorization",
  targetAuthToken: process.env.TARGET_AUTH_TOKEN || "Bearer sYnc_KeY_2026_SeCrEt",
  targetTimeout: Number(process.env.TARGET_TIMEOUT) || 5000,
  targetAuthType: (process.env.TARGET_AUTH_TYPE as any) || "custom",
  targetUsername: process.env.TARGET_USERNAME || "",
  targetPassword: process.env.TARGET_PASSWORD || "",

  syncIntervalMinutes: Number(process.env.SYNC_INTERVAL_MINUTES) || 60,
  retryAttempts: Number(process.env.RETRY_ATTEMPTS) || 3,
  retryBackoffMs: Number(process.env.RETRY_BACKOFF_MS) || 1000,
};

let currentConfig: AppConfig = { ...DEFAULT_CONFIG };

// Load config if exists
if (fs.existsSync(CONFIG_FILE)) {
  try {
    const rawData = fs.readFileSync(CONFIG_FILE, "utf-8");
    const loaded = JSON.parse(rawData);
    currentConfig = { ...DEFAULT_CONFIG, ...loaded };
  } catch (err) {
    console.error("Error reading config.json, using defaults.", err);
  }
}

// Save config helper
function saveConfigOnDisk(config: AppConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving config.json local back-store", err);
  }

  if (firestoreDb) {
    setDoc(doc(firestoreDb, "config", "settings"), cleanUndefined(config)).catch(err => {
      console.error("[Firestore] Error saving config/settings backup in cloud database:", err);
    });
  }
}

// File-backed persistent state store
const STATE_FILE = path.join(process.cwd(), "state_store.json");

function saveStateStore() {
  try {
    const dataToSave = {
      logs: logs.slice(0, 150),
      mockPayloadsReceived,
      inboundEvents,
      lastFetchedVehicles,
      lastTargetResponse,
      lastSyncTime,
      gpsgateStatus,
      targetStatus,
      receivedRecordIds: Array.from(receivedRecordIds),
      trips
    };
    fs.writeFileSync(STATE_FILE, JSON.stringify(dataToSave, null, 2), "utf-8");
  } catch (err) {
    console.error("Error saving state_store.json fallback backup", err);
  }
}

// --- FIRESTORE SYNCHRONIZATION HELPERS ---

// Load trips from Firestore
async function loadTripsFromFirestoreSafe() {
  if (!firestoreDb) return;
  try {
    const snap = await getDocs(collection(firestoreDb, "trips"));
    const tripsList: Trip[] = [];
    snap.forEach(docSnap => {
      tripsList.push(docSnap.data() as Trip);
    });
    // Sort descending by createdAt or recordDate so newer items appear first
    tripsList.sort((a, b) => {
      const valA = a.createdAt || "";
      const valB = b.createdAt || "";
      return valB.localeCompare(valA);
    });
    if (tripsList.length > 0) {
      trips = tripsList;
    }
    console.log(`[Firestore] Loaded ${tripsList.length} trips into memory fallback.`);
  } catch (err) {
    console.error("[Firestore] Error loading trips from Firestore:", err);
  }
}

// Load logs from Firestore
async function loadLogsFromFirestoreSafe() {
  if (!firestoreDb) return;
  try {
    const q = query(collection(firestoreDb, "logs"), orderBy("timestamp", "desc"), limit(250));
    const snap = await getDocs(q);
    const logsList: SyncLogEntry[] = [];
    snap.forEach(docSnap => {
      logsList.push(docSnap.data() as SyncLogEntry);
    });
    if (logsList.length > 0) {
      logs = logsList;
    }
    console.log(`[Firestore] Loaded ${logsList.length} logs into memory fallback.`);
  } catch (err) {
    console.error("[Firestore] Error loading logs from Firestore:", err);
  }
}

// Load inbound events from Firestore
async function loadInboundEventsFromFirestoreSafe() {
  if (!firestoreDb) return;
  try {
    const q = query(collection(firestoreDb, "inbound_events"), orderBy("timestamp", "desc"), limit(250));
    const snap = await getDocs(q);
    const eventsList: any[] = [];
    snap.forEach(docSnap => {
      eventsList.push(docSnap.data());
    });
    if (eventsList.length > 0) {
      inboundEvents = eventsList;
    }
    console.log(`[Firestore] Loaded ${eventsList.length} inbound events into memory fallback.`);
  } catch (err) {
    console.error("[Firestore] Error loading inbound events from Firestore:", err);
  }
}

// Seed trips if database is empty
async function seedTripsIfEmpty() {
  if (!firestoreDb) return;
  try {
    const q = query(collection(firestoreDb, "trips"), limit(1));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      console.log("[Firestore] Table is empty. Planting initial seed dispatches...");
      const batch = writeBatch(firestoreDb);
      for (const t of INITIAL_TRIPS) {
        const docRef = doc(firestoreDb, "trips", t.id);
        const seededTrip = {
          ...t,
          createdAt: t.createdAt || new Date().toISOString(),
          updatedAt: t.updatedAt || new Date().toISOString()
        };
        batch.set(docRef, seededTrip);
      }
      await batch.commit();
      console.log("[Firestore] Seeding initial trips list succeeded. Total: " + INITIAL_TRIPS.length);
    }
  } catch (err) {
    console.error("[Firestore] Error seeding initial trips:", err);
  }
}

// Sync config document
async function syncConfigWithFirestore() {
  if (!firestoreDb) return;
  try {
    const docRef = doc(firestoreDb, "config", "settings");
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const loaded = docSnap.data();
      currentConfig = { ...DEFAULT_CONFIG, ...loaded } as AppConfig;
      console.log("[Firestore] App configuration successfully pulled from database.");
    } else {
      console.log("[Firestore] Saving current default configurations as settings base...");
      await setDoc(docRef, cleanUndefined(currentConfig));
    }
  } catch (err) {
    console.error("[Firestore] Error syncing config with database:", err);
  }
}

// Run Firestore initialization
async function initFirestoreIntegration() {
  if (firestoreDb) {
    await seedTripsIfEmpty();
    await syncConfigWithFirestore();
    await loadTripsFromFirestoreSafe();
    await loadLogsFromFirestoreSafe();
    await loadInboundEventsFromFirestoreSafe();
  }
}
initFirestoreIntegration();


function loadStateStore() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      const rawData = fs.readFileSync(STATE_FILE, "utf-8");
      const loaded = JSON.parse(rawData);
      logs = loaded.logs || [];
      mockPayloadsReceived = loaded.mockPayloadsReceived || [];
      inboundEvents = loaded.inboundEvents || [];
      lastFetchedVehicles = loaded.lastFetchedVehicles || [];
      lastTargetResponse = loaded.lastTargetResponse || null;
      lastSyncTime = loaded.lastSyncTime || null;
      gpsgateStatus = loaded.gpsgateStatus || 'untested';
      targetStatus = loaded.targetStatus || 'untested';
      if (Array.isArray(loaded.receivedRecordIds)) {
        receivedRecordIds = new Set(loaded.receivedRecordIds);
      }
      trips = Array.isArray(loaded.trips) && loaded.trips.length > 0 ? loaded.trips : [...INITIAL_TRIPS];
    } catch (err) {
      console.error("Error loading state_store.json", err);
    }
  }
}

// Load existing state on server start
loadStateStore();

// Status indicators
let lastSyncTime: string | null = null;
let nextSyncTime: string | null = null;
let gpsgateStatus: 'connected' | 'error' | 'untested' = 'untested';
let targetStatus: 'connected' | 'error' | 'untested' = 'untested';
let schedulerTimer: NodeJS.Timeout | null = null;

// Re-run loadStateStore to populate the newly declared let-bindings (or preserve loaded variables)
loadStateStore();

// Helper to recursively remove any fields with value `undefined` to prevent Firestore write crashes
function cleanUndefined<T>(obj: T): T {
  if (!obj || typeof obj !== "object") return obj;
  const cleaned = Array.isArray(obj) ? [] : {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === undefined) continue;
    if (val && typeof val === "object" && !(val instanceof Date)) {
      (cleaned as any)[key] = cleanUndefined(val);
    } else {
      (cleaned as any)[key] = val;
    }
  }
  return cleaned as T;
}

// Logger helper
function addLog(
  type: SyncLogEntry["type"],
  status: SyncLogEntry["status"],
  message: string,
  details?: string
) {
  const newLog: SyncLogEntry = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    type,
    status,
    message,
  };

  if (details !== undefined) {
    newLog.details = details;
  }
  
  logs.unshift(newLog);
  if (logs.length > 300) {
    logs = logs.slice(0, 300); // cap to prevent memory leaks
  }
  
  console.log(`[${newLog.timestamp}] [${status.toUpperCase()}] [${type}] ${message}`);
  
  if (firestoreDb) {
    setDoc(doc(firestoreDb, "logs", newLog.id), cleanUndefined(newLog)).catch(err => {
      console.error("[Firestore] Error writing log to cloud database:", err);
    });
  } else {
    saveStateStore();
  }
}

// Generate Mock Fleet Vehicles (simulated real-time tracking)
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
  return VEHICLE_PATHS.map((vp, index) => {
    // Generate organic motion around bases using sine waves
    const deltaLat = Math.sin(seconds / 50 + index) * 0.008;
    const deltaLng = Math.cos(seconds / 60 + index * 1.5) * 0.008;
    const speedVariation = Math.floor(Math.abs(Math.sin(seconds / 15 + index)) * 60) + 10;
    
    // Simulate real vehicle status
    let vehicleStatus: FleetVehicle['status'] = 'active';
    let isIgnitionOn = true;
    let computedSpeed = speedVariation;

    if (index === 2) {
      // Tanker is moving slow
      computedSpeed = Math.floor(speedVariation * 0.3);
      vehicleStatus = 'active';
    } else if (index === 4) {
      // Epsilon is stopped/idle
      computedSpeed = 0;
      isIgnitionOn = true;
      vehicleStatus = 'idle';
    } else if (index === 5) {
      // Zeta is parked/engine-off
      computedSpeed = 0;
      isIgnitionOn = false;
      vehicleStatus = 'stopped';
    } else if (index === 6) {
      // Retired Sweeper Eta is retired and offline
      computedSpeed = 0;
      isIgnitionOn = false;
      vehicleStatus = 'offline';
    }

    const isRetired = index === 6;
    const lastUpdateDate = isRetired 
      ? new Date(Date.now() - 35 * 24 * 60 * 60 * 1000).toISOString()
      : new Date().toISOString();

    const latVal = Number((vp.baseLat + deltaLat).toFixed(6));
    const lngVal = Number((vp.baseLng + deltaLng).toFixed(6));
    const headingVal = Math.floor((vp.heading + (seconds * 2 + index * 10) % 360) % 360);
    const altitudeVal = Math.floor(10 + (Math.sin(seconds / 100) * 5));
    const speedMs = computedSpeed / 3.6;

    const mockGpsgateRecord = {
      trackPoint: {
        position: {
          altitude: altitudeVal,
          longitude: lngVal,
          latitude: latVal
        },
        velocity: {
          groundSpeed: speedMs,
          heading: headingVal
        },
        utc: lastUpdateDate,
        valid: true
      },
      calculatedSpeed: speedMs,
      deviceActivity: isRetired ? lastUpdateDate : new Date(Date.now() - 10000).toISOString(),
      username: `mock_user_100${index + 1}`,
      name: vp.name,
      surname: "",
      description: `Simulated Fleet Node #${index + 1} - Installed: 2025-05-22`,
      email: "",
      devices: [
        {
          id: 6480 + index,
          created: "2025-05-21T23:51:52Z",
          name: "FifoTrack S20",
          hidePosition: false,
          proximity: 0,
          imei: `86755604658855${index}`,
          msisdn: {
            raw: `+63915467708${index}`
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
          ownerID: 7200 + index,
          ownerUsername: "",
          ownerName: "",
          ownerEmail: "",
          devicePassword: "",
          oneWireVariables: []
        }
      ],
      userTemplateID: 0,
      originalApplicationID: 208,
      id: 7200 + index,
      accumulators: []
    };

    return {
      id: `VEH-100${index + 1}`,
      name: vp.name,
      latitude: latVal,
      longitude: lngVal,
      speed: computedSpeed,
      heading: headingVal,
      altitude: altitudeVal,
      lastUpdate: lastUpdateDate,
      deviceActivity: isRetired ? lastUpdateDate : undefined,
      ignition: isIgnitionOn,
      status: vehicleStatus,
      rawPayload: mockGpsgateRecord
    };
  });
}

// Converter Helper functions for Target format
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

function transformToTargetFormat(item: any): any {
  const devices = item.devices || [];
  const deviceObj = devices[0] || {};
  const deviceId = deviceObj.id || item.id || 7277;
  const imei = deviceObj.imei || "867556046588557";
  const licensePlate = item.name || item.username || "CP GAW 4583";
  
  const trackPoint = item.trackPoint || {};
  const pos = trackPoint.position || item.position || {};
  const vel = trackPoint.velocity || {};
  
  const gpsUtc = trackPoint.utc || pos.time || new Date().toISOString();
  const gpsTimeStr = formatToWruTimezone(gpsUtc);
  const recordIdVal = getRecordId(deviceId, gpsUtc);
  
  const lat = typeof pos.latitude === 'number' ? pos.latitude : 16.005825;
  const lng = typeof pos.longitude === 'number' ? pos.longitude : 120.187876;
  
  let speedKmh = 0;
  if (typeof vel.groundSpeed === 'number') {
    speedKmh = Math.round(vel.groundSpeed * 3.6);
  } else if (typeof item.calculatedSpeed === 'number') {
    speedKmh = Math.round(item.calculatedSpeed);
  } else if (typeof pos.speed === 'number') {
    speedKmh = Math.round(pos.speed * 3.6); 
  }
  
  const heading = typeof vel.heading === 'number' ? vel.heading : (typeof pos.heading === 'number' ? pos.heading : 264);
  const isGpsValid = trackPoint.valid !== undefined ? (trackPoint.valid ? 1 : 0) : 1;
  const drivingStatus = speedKmh > 0 ? "1" : "0";
  const vehicleParking = speedKmh <= 0 ? "1" : "0";
  
  const sentTimeStr = formatToWruTimezone(item.deviceActivity || gpsUtc);
  
  return {
    "RECORD_ID": recordIdVal,
    "PROVIDER": "WRU",
    "BOX_ID": String(imei),
    "LICENSE_PLATE": String(licensePlate),
    "PROVINCE": "0",
    "SENT_DATE_TIME": sentTimeStr,
    "GPS_DATE_TIME": gpsTimeStr,
    "LATITUDE": lat,
    "LONGITUDE": lng,
    "SPEED": speedKmh,
    "DIRECTION": heading,
    "GPS_FIX": isGpsValid,
    "TEMP": 0,
    "DRIVING_STATUS": drivingStatus,
    "VEHICLE_IO_STATUS": "0",
    "VEHICLE_PARKING": vehicleParking,
    "OVER_SPEED": "0",
    "PTO_IO_STATUS": "0",
    "GPS_IO_STATUS": "1",
    "GPS_RESET_BOX": "0",
    "MIAGE": 0
  };
}

// Sync process implementation
async function startFleetSyncProcess(): Promise<{ success: boolean; count: number; error?: string }> {
  const triggerTime = new Date().toISOString();
  addLog("SYNC_TRIGGER", "info", "Starting fleet sync process...", `Triggered at ${triggerTime}`);
  
  let vehicles: FleetVehicle[] = [];

  try {
    if (currentConfig.useGpsgateMock) {
      addLog("GPSGATE_FETCH", "success", "Mock GpsGate mode enabled. Generating real-time simulated fleet tracking telemetry.");
      vehicles = generateMockFleet();
      lastFetchedVehicles = vehicles;
      gpsgateStatus = 'connected';
    } else {
      const baseUrl = getGpsgateBaseUrl(currentConfig.gpsgateUrl);
      let authHeaderValue = "";
      let positionsUrl = "";

      if (currentConfig.gpsgateToken) {
        authHeaderValue = currentConfig.gpsgateToken;
        positionsUrl = `${baseUrl}/api/v.1/applications/${currentConfig.gpsgateAppId}/users?FromIndex=0&PageSize=1000`;
        if (currentConfig.gpsgateGroupId) {
          positionsUrl += `&GroupId=${currentConfig.gpsgateGroupId}`;
        }
        addLog("GPSGATE_FETCH", "info", `Using direct GpsGate API token. Querying GpsGate REST Position users URL: ${positionsUrl}`);
      } else {
        addLog("GPSGATE_FETCH", "info", `Contacting GpsGate Server at ${baseUrl} and trying to get session login token...`);
        try {
          authHeaderValue = await getSessionToken(baseUrl);
          addLog("GPSGATE_FETCH", "success", "Session ID active or retrieved.", `Token: ${authHeaderValue.substring(0, 8)}...`);
        } catch (err: any) {
          throw new Error(`GpsGate Session Login Failed: ${err.message}`);
        }
        positionsUrl = `${baseUrl}/api/v.1/applications/${currentConfig.gpsgateAppId}/users/positions`;
      }

      // Stage 2: Retrieve Vehicle Positions
      addLog("GPSGATE_FETCH", "info", `Fetching active vehicle track telemetry from GpsGate API...`);
      
      const positionsResponse = await fetch(positionsUrl, {
        method: "GET",
        headers: {
          "Authorization": authHeaderValue,
          "Accept": "application/json"
        },
        signal: AbortSignal.timeout(10000), // 10 sec position query limit
      });

      if (positionsResponse.status === 429) {
        if (lastFetchedVehicles && lastFetchedVehicles.length > 0) {
          addLog("GPSGATE_FETCH", "warning", "GpsGate vehicle position fetch rate limited (429). Falling back to previous known positions.");
          vehicles = lastFetchedVehicles;
          gpsgateStatus = 'connected';
        } else {
          throw new Error(`GpsGate fetch failed: HTTP Status 429 (Rate Limit Exceeded)`);
        }
      } else {
        if (positionsResponse.status === 401 || positionsResponse.status === 403) {
          clearSessionToken();
        }

        if (!positionsResponse.ok) {
          throw new Error(`GpsGate retrieving positions failed: HTTP STATUS ${positionsResponse.status}`);
        }

        const positionsData = await positionsResponse.json() as any[];
        if (!Array.isArray(positionsData)) {
          throw new Error("Unexpected response format from GpsGate positions endpoint. Expected an Array list of vehicles.");
        }

        // Convert data to correct JSON format
        addLog("TRANSFORM", "info", `Parsing and converting GpsGate payload with ${positionsData.length} records into synchronized schema...`);
        
        vehicles = positionsData.map((item: any, idx: number) => {
          const id = item.userId || item.id || `V_${idx}`;
          const name = item.name || item.username || item.description || `Vehicle #${id}`;
          
          let lat = 0;
          let lng = 0;
          let speed = 0;
          let groundSpeedVal = 0;
          let heading = 0;
          let altitude: number | undefined = undefined;
          let lastUpdate = new Date().toISOString();
          let deviceActivityString = item.deviceActivity || "";

          // TrackPoint Parsing
          if (item.trackPoint) {
            const tp = item.trackPoint;
            if (tp.position) {
              lat = typeof tp.position.latitude === 'number' ? tp.position.latitude : 0;
              lng = typeof tp.position.longitude === 'number' ? tp.position.longitude : 0;
              altitude = typeof tp.position.altitude === 'number' ? tp.position.altitude : undefined;
            }
            if (tp.velocity) {
              const rawSpeedMs = typeof tp.velocity.groundSpeed === 'number' ? tp.velocity.groundSpeed : 0;
              speed = Math.round(rawSpeedMs * 3.6);
              groundSpeedVal = speed;
              heading = typeof tp.velocity.heading === 'number' ? tp.velocity.heading : 0;
            }
            lastUpdate = tp.utc || item.deviceActivity || lastUpdate;
          } else {
            // Positions parsing
            const pos = item.position || {};
            lat = typeof pos.latitude === 'number' ? pos.latitude : 0;
            lng = typeof pos.longitude === 'number' ? pos.longitude : 0;
            const rawSpeedMs = typeof pos.speed === 'number' ? pos.speed : 0;
            speed = Math.round(rawSpeedMs * 3.6);
            groundSpeedVal = speed;
            heading = typeof pos.heading === 'number' ? pos.heading : 0;
            altitude = typeof pos.altitude === 'number' ? pos.altitude : undefined;
            lastUpdate = pos.time || lastUpdate;
          }

        // Determine activity status using timestamp recency
        const deviceActivityTime = item.deviceActivity ? new Date(item.deviceActivity).getTime() : (lastUpdate ? new Date(lastUpdate).getTime() : 0);
        const nowTime = Date.now();
        const minutesDiff = (nowTime - deviceActivityTime) / (1000 * 60);

        let ignition = false;
        let ignitionStatus: FleetVehicle['status'] = 'stopped';

        if (minutesDiff < 45) { // Active within last 45 mins
          ignition = true;
          if (speed > 0) {
            ignitionStatus = 'active';
          } else {
            ignitionStatus = 'idle';
          }
        } else {
          ignition = false;
          ignitionStatus = 'stopped';
        }

        return {
          id: String(id),
          name: String(name),
          latitude: lat,
          longitude: lng,
          speed: Math.floor(speed),
          groundSpeed: Math.floor(groundSpeedVal),
          heading: Math.floor(heading),
          altitude,
          lastUpdate,
          deviceActivity: deviceActivityString,
          ignition,
          status: ignitionStatus,
          rawPayload: item
        };
      });
      }

      lastFetchedVehicles = vehicles;
      gpsgateStatus = 'connected';
    }

    // Skip records that are more than 30 days since last device activity
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    const initialCount = vehicles.length;

    vehicles = vehicles.filter(v => {
      const activityTimeStr = v.deviceActivity || v.lastUpdate;
      if (!activityTimeStr) return true; // keep if no date is present

      const activityTime = new Date(activityTimeStr).getTime();
      if (isNaN(activityTime)) return true; // keep if invalid date format

      const ageMs = now - activityTime;
      return ageMs <= thirtyDaysMs;
    });

    const skippedCount = initialCount - vehicles.length;
    if (skippedCount > 0) {
      addLog("TRANSFORM", "info", `Skipped ${skippedCount} inactive vehicle records exceeding 30 days limit.`, `Filtered out of ${initialCount} total retrieved vehicles.`);
    }

    lastFetchedVehicles = vehicles;

    addLog("TRANSFORM", "success", `Transformation complete. Formatted ${vehicles.length} clean fleet tracks into standardized structure.`, JSON.stringify(vehicles.slice(0, 2), null, 2));

    // Post to target server with retry logic
    const postStart = Date.now();
    addLog("TARGET_POST", "info", `Posting converted data payload of ${vehicles.length} vehicles to target server...`, `Target: ${currentConfig.targetUrl}`);
    
    const sendPayload = vehicles.map(v => transformToTargetFormat(v.rawPayload || {
      id: v.id,
      name: v.name,
      trackPoint: {
        position: {
          latitude: v.latitude,
          longitude: v.longitude,
          altitude: v.altitude || 4
        },
        velocity: {
          groundSpeed: v.speed / 3.6,
          heading: v.heading
        },
        utc: v.lastUpdate
      },
      deviceActivity: v.deviceActivity || v.lastUpdate
    }));

    const targetSuccess = await sendToTargetWithRetry(sendPayload, currentConfig);
    
    if (targetSuccess) {
      lastSyncTime = new Date().toISOString();
      targetStatus = 'connected';
      addLog("SYNC_COMPLETE", "success", `Sync operation finished successfully inside ${Date.now() - postStart}ms! ${vehicles.length} vehicles tracked. Next automatic run scheduled.`);
      return { success: true, count: vehicles.length };
    } else {
      targetStatus = 'error';
      throw new Error(`Target telemetry transmission failed after all ${currentConfig.retryAttempts} retry attempts.`);
    }

  } catch (err: any) {
    const errMsg = err.message || "Unknown synchronization error";
    // Check which stage it was
    if (errMsg.includes("GpsGate")) {
      gpsgateStatus = 'error';
    } else if (errMsg.includes("Target")) {
      targetStatus = 'error';
    }
    
    addLog("SYNC_ERROR", "error", `Sync Process Interrupted: ${errMsg}`, err.stack);
    return { success: false, count: 0, error: errMsg };
  }
}

function getTargetHeaders(config: AppConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  };

  const authType = config.targetAuthType || 'custom';

  if (authType === 'bearer') {
    if (config.targetAuthToken) {
      const token = config.targetAuthToken.startsWith('Bearer ') 
        ? config.targetAuthToken 
        : `Bearer ${config.targetAuthToken}`;
      headers["Authorization"] = token;
    }
  } else if (authType === 'basic') {
    if (config.targetUsername || config.targetPassword) {
      const username = config.targetUsername || '';
      const password = config.targetPassword || '';
      const encoded = Buffer.from(`${username}:${password}`).toString('base64');
      headers["Authorization"] = `Basic ${encoded}`;
    }
  } else if (authType === 'custom') {
    if (config.targetAuthHeader && config.targetAuthToken) {
      headers[config.targetAuthHeader] = config.targetAuthToken;
    }
  }

  return headers;
}

function isRetryableError(err: any): boolean {
  if (!err) return false;
  const errMsg = String(err.message || err).toLowerCase();
  const errName = String(err.name || "").toLowerCase();
  
  if (errMsg.includes("timeout") || errMsg.includes("abort") || errName.includes("timeout") || errName.includes("abort")) {
    return true;
  }
  
  if (
    errMsg.includes("enotfound") || 
    errMsg.includes("eai_again") || 
    errMsg.includes("getaddrinfo") || 
    errMsg.includes("dns") ||
    errMsg.includes("reset") || 
    errMsg.includes("refused") || 
    errMsg.includes("econnreset") || 
    errMsg.includes("econnrefused") ||
    errMsg.includes("etimedout") ||
    errMsg.includes("fetch failed")
  ) {
    return true;
  }

  if (err.cause) {
    const causeMsg = String(err.cause.message || err.cause.code || err.cause).toLowerCase();
    if (
      causeMsg.includes("timeout") || 
      causeMsg.includes("abort") ||
      causeMsg.includes("enotfound") || 
      causeMsg.includes("eai_again") || 
      causeMsg.includes("getaddrinfo") || 
      causeMsg.includes("dns") ||
      causeMsg.includes("reset") || 
      causeMsg.includes("refused") || 
      causeMsg.includes("econnreset") || 
      causeMsg.includes("econnrefused") ||
      causeMsg.includes("etimedout")
    ) {
      return true;
    }
  }

  return false;
}

// Robust retry mechanism with exponential backoff
async function sendToTargetWithRetry(payload: any, config: AppConfig): Promise<boolean> {
  let attempt = 1;
  const maxAttempts = config.retryAttempts || 3;
  
  while (attempt <= maxAttempts) {
    let headers: Record<string, string>;
    try {
      headers = getTargetHeaders(config);

      // Generate curl representation (Windows CMD format with caret ^ and escaped inner quotes)
      const headersStr = Object.entries(headers)
        .map(([k, v]) => `-H "${k}: ${v}"`)
        .join(" ^\n");
      const escapedPayload = JSON.stringify(payload).replace(/"/g, '\\"');
      const curlCommand = `curl -X POST "${config.targetUrl}" ^
${headersStr} ^
-d "${escapedPayload}"`;
      
      console.log("CPF CURL", curlCommand);
      console.log("CPF PAYLOAD", JSON.stringify(payload));

      let response: any;
      let responseBody = "";
      const start = Date.now();

      try {
        console.log("===== CPF REQUEST START =====");
        console.log("URL:", config.targetUrl);
        console.log("Method: POST");
        console.log("Headers:", headers);
        console.log("Timeout:", config.targetTimeout || 60000);
        console.log("Payload is Array:", Array.isArray(payload));
        console.log("Payload JSON:", JSON.stringify(payload));

        response = await fetch(config.targetUrl, {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(config.targetTimeout || 60000),
        });

        console.log("HTTP Status:", response.status);
        console.log("Status Text:", response.statusText);

        responseBody = await response.text();

        console.log("Response Body:", responseBody);
        console.log("Elapsed:", Date.now() - start, "ms");

      } catch (err: any) {

        console.error("===== FETCH FAILED =====");

        console.error("Name:", err.name);
        console.error("Message:", err.message);
        console.error("Stack:", err.stack);

        console.error("Cause:", err.cause);

        if (err.cause) {
          console.error("Cause Code:", err.cause.code);
          console.error("Cause Errno:", err.cause.errno);
          console.error("Cause Syscall:", err.cause.syscall);
          console.error("Cause Address:", err.cause.address);
          console.error("Cause Port:", err.cause.port);
        }

        throw err;
      }
      
      lastTargetResponse = {
        status: response.status,
        statusText: response.statusText,
        body: responseBody,
        timestamp: new Date().toISOString()
      };

      // Try to parse body as JSON
      let parsedJson: any = null;
      try {
        parsedJson = JSON.parse(responseBody);
      } catch (jsonErr) {
        // Body is not JSON
      }

      // 6. Treat success when response.success === true
      const isCpfSuccess = parsedJson && parsedJson.success === true;

      if (isCpfSuccess) {
        addLog("TARGET_POST", "success", `Target server confirmed receipt with HTTP ${response.status}.`, responseBody);
        return true;
      } else {
        // If CPF returns a response (status 2xx or other), even if success !== true, we DO NOT retry (it was not a network failure).
        // "Treat success when: response.success === true. Do not retry."
        addLog("TARGET_POST", "error", `Target replied with non-success response (success !== true): ${responseBody}`);
        return false;
      }

    } catch (err: any) {
      const errorMsg = err.message || "Connection timeout or socket error";
      
      // 7. Retry ONLY IF network timeout, DNS failure, connection reset
      if (isRetryableError(err) && attempt < maxAttempts) {
        const nextDelay = config.retryBackoffMs * Math.pow(2, attempt - 1);
        addLog("RETRY_ATTEMPT", "warning", `Transmission attempt #${attempt} failed (network/timeout): ${errorMsg}. Retrying in ${nextDelay}ms...`);
        
        await new Promise((resolve) => setTimeout(resolve, nextDelay));
        attempt++;
      } else {
        lastTargetResponse = {
          status: 0,
          statusText: "Network Fail / Timeout",
          body: errorMsg,
          timestamp: new Date().toISOString()
        };
        addLog("TARGET_POST", "error", `Final transmission attempt #${attempt} failed: ${errorMsg}.`);
        return false;
      }
    }
  }
  
  return false;
}

// Scheduler Controller
function startSchedulerTimer() {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
  }
  
  const intervalMs = currentConfig.syncIntervalMinutes * 60 * 1000;
  
  // Calculate when next run will occur
  nextSyncTime = new Date(Date.now() + intervalMs).toISOString();
  
  // Create robust interval loop
  schedulerTimer = setInterval(async () => {
    await startFleetSyncProcess();
    nextSyncTime = new Date(Date.now() + intervalMs).toISOString();
  }, intervalMs);

  addLog("SYNC_TRIGGER", "success", `Automatic Scheduler initialized. Configured to run every ${currentConfig.syncIntervalMinutes} minutes.`, `Next execution scheduled for: ${nextSyncTime}`);
}

// Initialize on server start
startSchedulerTimer();
setTimeout(async () => {
  addLog("SYNC_TRIGGER", "info", "Executing initial background fleet sync on startup...");
  try {
    await startFleetSyncProcess();
  } catch (err) {
    console.error("Initial startup fleet sync failed:", err);
  }
}, 1500);

// ==========================================
// API REST ENDPOINTS
// ==========================================

// 1. Diagnostics statuses and counts
app.get("/api/status", (req, res) => {
  const status: SchedulerStatus = {
    isActive: schedulerTimer !== null,
    syncIntervalMinutes: currentConfig.syncIntervalMinutes,
    lastSyncTime,
    nextSyncTime,
    gpsgateConnected: gpsgateStatus,
    targetConnected: targetStatus,
  };
  res.json({
    status,
    logs: logs.slice(0, 150), // Send last 150 log entries
    vehicles: lastFetchedVehicles, // Return actual real-time vehicle positions to client
    mockPayloadsCount: mockPayloadsReceived.length,
    lastTargetResponse
  });
});

// 2. Fetch full config
app.get("/api/config", (req, res) => {
  res.json(currentConfig);
});

// 2.5. Fetch Google Maps API Key
app.get("/api/maps-key", (req, res) => {
  res.json({ key: process.env.GOOGLE_MAPS_PLATFORM_KEY || "" });
});

// 3. Save new config and reboot scheduler
app.post("/api/config", (req, res) => {
  try {
    const incoming: AppConfig = req.body;
    
    // Strict Sanitization
    const sanitizeConfig: AppConfig = {
      gpsgateUrl: incoming.gpsgateUrl || "wru2.server93.com",
      gpsgateAppId: String(incoming.gpsgateAppId || "208"),
      gpsgateUsername: incoming.gpsgateUsername || "api_fleet_sync",
      gpsgatePassword: incoming.gpsgatePassword || "",
      useGpsgateMock: !!incoming.useGpsgateMock,
      gpsgateToken: incoming.gpsgateToken || "",
      gpsgateGroupId: incoming.gpsgateGroupId || "",
      
      targetUrl: incoming.targetUrl || "http://localhost:3000/api/mock/target-endpoint",
      targetAuthHeader: incoming.targetAuthHeader || "Authorization",
      targetAuthToken: incoming.targetAuthToken || "",
      targetTimeout: Number(incoming.targetTimeout) || 5000,
      targetAuthType: incoming.targetAuthType || "custom",
      targetUsername: incoming.targetUsername || "",
      targetPassword: incoming.targetPassword || "",
      
      syncIntervalMinutes: Math.max(1, Number(incoming.syncIntervalMinutes) || 60),
      retryAttempts: Math.max(1, Number(incoming.retryAttempts) || 3),
      retryBackoffMs: Math.max(100, Number(incoming.retryBackoffMs) || 1000),
    };

    currentConfig = sanitizeConfig;
    saveConfigOnDisk(currentConfig);
    
    // Clear GpsGate session and resources caches on config change
    clearSessionToken();
    gpsgateCache.clear();
    
    addLog("SYNC_TRIGGER", "info", "App settings updated. Synchronizer reset and re-applying scheduler timer.");
    
    // Reboot scheduler
    startSchedulerTimer();
    
    res.json({ success: true, message: "Configuration saved successfully.", config: currentConfig });
  } catch (err: any) {
    res.status(400).json({ success: false, message: "Invalid payload format: " + err.message });
  }
});

// 4. Manually force sync right now
app.post("/api/sync/trigger", async (req, res) => {
  const result = await startFleetSyncProcess();
  res.json(result);
});

// 5. Connection Test for GpsGate
app.post("/api/conn-test/gpsgate", async (req, res) => {
  try {
    const testingConfig: AppConfig = req.body;
    
    if (testingConfig.useGpsgateMock) {
      gpsgateStatus = 'connected';
      return res.json({ success: true, message: "Mock GPSGate confirmed active: simulated fleet engine loaded correctly." });
    }

    const baseUrl = getGpsgateBaseUrl(testingConfig.gpsgateUrl);

    if (testingConfig.gpsgateToken) {
      // Direct token test path
      let testUrl = `${baseUrl}/api/v.1/applications/${testingConfig.gpsgateAppId}/users?FromIndex=0&PageSize=1`;
      if (testingConfig.gpsgateGroupId) {
        testUrl += `&GroupId=${testingConfig.gpsgateGroupId}`;
      }
      
      addLog("GPSGATE_FETCH", "info", `Testing direct GpsGate tokenized API authorization...`);
      const response = await fetch(testUrl, {
        method: "GET",
        headers: { 
          "Authorization": testingConfig.gpsgateToken,
          "Accept": "application/json"
        },
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        gpsgateStatus = 'connected';
        return res.json({ success: true, message: `Access granted! Successfully authenticated using direct static token. Response headers checked.` });
      } else {
        gpsgateStatus = 'error';
        const text = await response.text().catch(() => "");
        return res.json({ success: false, message: `Access denied. GpsGate replied HTTP ${response.status}: ${text.substring(0, 120)}` });
      }
    } else {
      // Traditional endpoint login test path
      const testUrl = `${baseUrl}/api/v.1/applications/${testingConfig.gpsgateAppId}/logins`;
      addLog("GPSGATE_FETCH", "info", `Running traditional GpsGate logins credentials validation at ${testUrl}...`);

      const response = await fetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: testingConfig.gpsgateUsername,
          password: testingConfig.gpsgatePassword || ""
        }),
        signal: AbortSignal.timeout(6000),
      });

      if (response.ok) {
        const data = await response.json() as any;
        const sid = data.sessionId || data.token || data.SessionId;
        if (sid) {
          gpsgateStatus = 'connected';
          return res.json({ success: true, message: "Connection verified! Found valid session credentials response." });
        } else {
          gpsgateStatus = 'error';
          return res.json({ success: false, message: "GpsGate authentication resolved but no session ID was found in response payload." });
        }
      } else {
        gpsgateStatus = 'error';
        const text = await response.text().catch(() => "");
        return res.json({ success: false, message: `Access denied. GpsGate replied HTTP ${response.status}: ${text.substring(0, 100)}` });
      }
    }
  } catch (err: any) {
    gpsgateStatus = 'error';
    res.json({ success: false, message: `Connection test exception: ${err.message || "Timeout connecting to host"}` });
  }
});

// 6. Connection Test for Target Server
app.post("/api/conn-test/target", async (req, res) => {
  try {
    const testingConfig: AppConfig = req.body;
    
    addLog("TARGET_POST", "info", `Conducting dummy ping test using exact verified curl to external destination URL: https://app.cpf-phil.com/CPFAPI/app/api/oracle/inbound-gps-data`);
    
    const targetUrl = "https://app.cpf-phil.com/CPFAPI/app/api/oracle/inbound-gps-data";
    const headers = {
      "Content-Type": "application/json",
      "Authorization": "Basic V1JVLUNQRjpyVDVOYkF5MS04XFF4MDhXQy4=",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
    };
    const payload = [{
      "RECORD_ID": "682820260525010912",
      "PROVIDER": "WRU",
      "BOX_ID": "869286031941391",
      "LICENSE_PLATE": "CP CCK 9585",
      "PROVINCE": "0",
      "SENT_DATE_TIME": "2026-05-25T09:09:37+08:00",
      "GPS_DATE_TIME": "2026-05-25T09:09:12+08:00",
      "LATITUDE": 13.900056,
      "LONGITUDE": 121.217691,
      "SPEED": 0,
      "DIRECTION": 57,
      "GPS_FIX": 1,
      "TEMP": 0,
      "DRIVING_STATUS": "0",
      "VEHICLE_IO_STATUS": "0",
      "VEHICLE_PARKING": "1",
      "OVER_SPEED": "0",
      "PTO_IO_STATUS": "0",
      "GPS_IO_STATUS": "1",
      "GPS_RESET_BOX": "0",
      "MIAGE": 0
    }];

    const curlCommand = `curl -X POST "${targetUrl}" ^
-H "Content-Type: application/json" ^
-H "Authorization: Basic V1JVLUNQRjpyVDVOYkF5MS04XFF4MDhXQy4=" ^
-d "[{\\"RECORD_ID\\":\\"682820260525010912\\",\\"PROVIDER\\":\\"WRU\\",\\"BOX_ID\\":\\"869286031941391\\",\\"LICENSE_PLATE\\":\\"CP CCK 9585\\",\\"PROVINCE\\":\\"0\\",\\"SENT_DATE_TIME\\":\\"2026-05-25T09:09:37+08:00\\",\\"GPS_DATE_TIME\\":\\"2026-05-25T09:09:12\\",\\"LATITUDE\\":13.900056,\\"LONGITUDE\\":121.217691,\\"SPEED\\":0,\\"DIRECTION\\":57,\\"GPS_FIX\\":1,\\"TEMP\\":0,\\"DRIVING_STATUS\\":\\"0\\",\\"VEHICLE_IO_STATUS\\":\\"0\\",\\"VEHICLE_PARKING\\":\\"1\\",\\"OVER_SPEED\\":\\"0\\",\\"PTO_IO_STATUS\\":\\"0\\",\\"GPS_IO_STATUS\\":\\"1\\",\\"GPS_RESET_BOX\\":\\"0\\",\\"MIAGE\\":0}]"`;

    console.log("CPF CURL", curlCommand);
    console.log("CPF PAYLOAD", JSON.stringify(payload));

    let response: any;
    let responseBody = "";
    const start = Date.now();

    try {
      console.log("===== CPF REQUEST START =====");
      console.log("URL:", targetUrl);
      console.log("Method: POST");
      console.log("Headers:", headers);
      console.log("Timeout:", testingConfig.targetTimeout || 60000);
      console.log("Payload is Array:", Array.isArray(payload));
      console.log("Payload JSON:", JSON.stringify(payload));

      response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(testingConfig.targetTimeout || 60000),
      });

      console.log("HTTP Status:", response.status);
      console.log("Status Text:", response.statusText);

      responseBody = await response.text();

      console.log("Response Body:", responseBody);
      console.log("Elapsed:", Date.now() - start, "ms");

    } catch (err: any) {

      console.error("===== FETCH FAILED =====");

      console.error("Name:", err.name);
      console.error("Message:", err.message);
      console.error("Stack:", err.stack);

      console.error("Cause:", err.cause);

      if (err.cause) {
        console.error("Cause Code:", err.cause.code);
        console.error("Cause Errno:", err.cause.errno);
        console.error("Cause Syscall:", err.cause.syscall);
        console.error("Cause Address:", err.cause.address);
        console.error("Cause Port:", err.cause.port);
      }

      throw err;
    }

    lastTargetResponse = {
      status: response.status,
      statusText: response.statusText,
      body: responseBody,
      timestamp: new Date().toISOString()
    };
    saveStateStore();

    let isCpfSuccess = false;
    try {
      const parsed = JSON.parse(responseBody);
      if (parsed && parsed.success === true) {
        isCpfSuccess = true;
      }
    } catch (e) {
      // Body is not JSON
    }

    if (response.ok || isCpfSuccess) {
      targetStatus = 'connected';
      res.json({ success: true, message: `Successfully connected! Destination responded with HTTP status code ${response.status}.`, body: responseBody });
    } else {
      targetStatus = 'error';
      res.json({ success: false, message: `Connected but endpoint returned error status HTTP ${response.status} or success was false: ${responseBody.substring(0, 120)}`, body: responseBody });
    }
  } catch (err: any) {
    targetStatus = 'error';
    const errorMsg = err.message || "No response received within timeout windows";
    lastTargetResponse = {
      status: 0,
      statusText: "Network Fail / Timeout",
      body: errorMsg,
      timestamp: new Date().toISOString()
    };
    saveStateStore();
    res.json({ success: false, message: `Endpoint unreachable: ${errorMsg}` });
  }
});

// Sandbox Custom Payload Transmit Executor
app.post("/api/sandbox/transmit", async (req, res) => {
  try {
    const { config, payload } = req.body;
    if (!config || !config.targetUrl) {
      return res.status(400).json({ success: false, message: "Target URL configuration is missing." });
    }

    addLog("TARGET_POST", "info", `Conducting sandbox transmit test to destination URL: ${config.targetUrl}`);

    const headers = getTargetHeaders(config);
    const postStart = Date.now();

    // Generate curl representation (Windows CMD format with caret ^ and escaped inner quotes)
    const headersStr = Object.entries(headers)
      .map(([k, v]) => `-H "${k}: ${v}"`)
      .join(" ^\n");
    const escapedPayload = JSON.stringify(payload).replace(/"/g, '\\"');
    const curlCommand = `curl -X POST "${config.targetUrl}" ^
${headersStr} ^
-d "${escapedPayload}"`;
    
    console.log("CPF CURL", curlCommand);
    console.log("CPF PAYLOAD", JSON.stringify(payload));

    let response: any;
    let responseBody = "";
    const start = Date.now();

    try {
      console.log("===== CPF REQUEST START =====");
      console.log("URL:", config.targetUrl);
      console.log("Method: POST");
      console.log("Headers:", headers);
      console.log("Timeout:", config.targetTimeout || 60000);
      console.log("Payload is Array:", Array.isArray(payload));
      console.log("Payload JSON:", JSON.stringify(payload));

      response = await fetch(config.targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(config.targetTimeout || 60000),
      });

      console.log("HTTP Status:", response.status);
      console.log("Status Text:", response.statusText);

      responseBody = await response.text();

      console.log("Response Body:", responseBody);
      console.log("Elapsed:", Date.now() - start, "ms");

    } catch (err: any) {

      console.error("===== FETCH FAILED =====");

      console.error("Name:", err.name);
      console.error("Message:", err.message);
      console.error("Stack:", err.stack);

      console.error("Cause:", err.cause);

      if (err.cause) {
        console.error("Cause Code:", err.cause.code);
        console.error("Cause Errno:", err.cause.errno);
        console.error("Cause Syscall:", err.cause.syscall);
        console.error("Cause Address:", err.cause.address);
        console.error("Cause Port:", err.cause.port);
      }

      throw err;
    }
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    const latencyMs = Date.now() - postStart;

    if (response.ok) {
      targetStatus = "connected";
      lastTargetResponse = {
        status: response.status,
        statusText: response.statusText,
        body: responseBody || "Success (No response body)",
        timestamp: new Date().toISOString()
      };
      addLog("TARGET_POST", "success", `Target server confirmed receipt with HTTP ${response.status}.`, responseBody || "Success (No response body)");
      res.json({
        success: true,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        latencyMs
      });
    } else {
      targetStatus = "error";
      lastTargetResponse = {
        status: response.status,
        statusText: response.statusText,
        body: responseBody,
        timestamp: new Date().toISOString()
      };
      addLog("TARGET_POST", "error", `Target HTTP error code ${response.status}`, responseBody);
      res.json({
        success: false,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        body: responseBody,
        latencyMs
      });
    }
  } catch (err: any) {
    targetStatus = "error";
    const errorMsg = err.message || "Timeout or socket connection failed";
    lastTargetResponse = {
      status: 0,
      statusText: "Network Fail / Timeout",
      body: errorMsg,
      timestamp: new Date().toISOString()
    };
    addLog("TARGET_POST", "error", `Transmission failed: ${errorMsg}`);
    res.json({
      success: false,
      message: errorMsg
    });
  }
});

// ==========================================
// TRIPS CONTROLLER ENDPOINTS
// ==========================================

// GET /api/trips
app.get("/api/trips", async (req, res) => {
  if (firestoreDb) {
    try {
      const snap = await getDocs(collection(firestoreDb, "trips"));
      const tripsList: Trip[] = [];
      snap.forEach(docSnap => {
        tripsList.push(docSnap.data() as Trip);
      });
      // Sort descending by createdAt or recordDate so newer items appear first
      tripsList.sort((a, b) => {
        const valA = a.createdAt || "";
        const valB = b.createdAt || "";
        return valB.localeCompare(valA);
      });
      return res.json(tripsList);
    } catch (err: any) {
      console.error("[Firestore] Error fetching trips:", err);
    }
  }
  res.json(trips);
});

// POST /api/trips
app.post("/api/trips", async (req, res) => {
  try {
    const incoming: Partial<Trip> = req.body;
    let tripToSave: Trip;

    if (incoming.id) {
      // Edit mode
      if (firestoreDb) {
        const docRef = doc(firestoreDb, "trips", incoming.id);
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) {
          return res.status(404).json({ success: false, message: `Trip with ID ${incoming.id} not found.` });
        }
        tripToSave = {
          ...docSnap.data(),
          ...incoming,
          updatedAt: new Date().toISOString()
        } as Trip;
      } else {
        const idx = trips.findIndex(t => t.id === incoming.id);
        if (idx === -1) {
          return res.status(404).json({ success: false, message: `Trip with ID ${incoming.id} not found.` });
        }
        tripToSave = {
          ...trips[idx],
          ...incoming,
          updatedAt: new Date().toISOString()
        } as Trip;
      }
    } else {
      // Create mode
      const newId = `trip_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
      tripToSave = {
        deliveryDate: incoming.deliveryDate === undefined ? "" : incoming.deliveryDate,
        orderNo: incoming.orderNo === undefined ? "" : incoming.orderNo,
        shipTo: incoming.shipTo === undefined ? "" : incoming.shipTo,
        recordDate: incoming.recordDate === undefined ? "" : incoming.recordDate,
        createdBy: incoming.createdBy === undefined ? "" : incoming.createdBy,
        approvedResult: incoming.approvedResult === undefined ? "Y" : incoming.approvedResult,
        approveDate1: incoming.approveDate1 === undefined ? "" : incoming.approveDate1,
        approveDate2: incoming.approveDate2 === undefined ? "" : incoming.approveDate2,
        referenceSaleOrderNo: incoming.referenceSaleOrderNo === undefined ? "" : incoming.referenceSaleOrderNo,
        issueSlipNo: incoming.issueSlipNo === undefined ? "" : incoming.issueSlipNo,
        createIssuedSlip: incoming.createIssuedSlip === undefined ? "" : incoming.createIssuedSlip,
        userCreateIssuedSlip: incoming.userCreateIssuedSlip === undefined ? "" : incoming.userCreateIssuedSlip,
        invoiceNo: incoming.invoiceNo === undefined ? "" : incoming.invoiceNo,
        userCreateInvoiceNo: incoming.userCreateInvoiceNo === undefined ? "" : incoming.userCreateInvoiceNo,
        customerCode: incoming.customerCode === undefined ? "" : incoming.customerCode,
        localName: incoming.localName === undefined ? "" : incoming.localName,
        licensePlate: incoming.licensePlate === undefined ? "" : incoming.licensePlate,
        cancelFlag: incoming.cancelFlag === undefined ? "N" : incoming.cancelFlag,
        documentNo: incoming.documentNo === undefined ? "" : incoming.documentNo,
        remark: incoming.remark === undefined ? "" : incoming.remark,
        cancelDate: incoming.cancelDate === undefined ? "" : incoming.cancelDate,
        statusValidDate: incoming.statusValidDate === undefined ? "" : incoming.statusValidDate,
        statusDispatchDate: incoming.statusDispatchDate === undefined ? "" : incoming.statusDispatchDate,
        statusEnrouteDate: incoming.statusEnrouteDate === undefined ? "" : incoming.statusEnrouteDate,
        statusAtLocationDate: incoming.statusAtLocationDate === undefined ? "" : incoming.statusAtLocationDate,
        statusDeliveredDate: incoming.statusDeliveredDate === undefined ? "" : incoming.statusDeliveredDate,
        statusUndeliverableDate: incoming.statusUndeliverableDate === undefined ? "" : incoming.statusUndeliverableDate,
        statusCancelledDate: incoming.statusCancelledDate === undefined ? "" : incoming.statusCancelledDate,
        statusReturnedDate: incoming.statusReturnedDate === undefined ? "" : incoming.statusReturnedDate,
        statusTurnaroundDate: incoming.statusTurnaroundDate === undefined ? "" : incoming.statusTurnaroundDate,
        poi_name: incoming.poi_name === undefined ? null : incoming.poi_name,
        ship_to_point_lat: incoming.ship_to_point_lat === undefined ? null : incoming.ship_to_point_lat,
        ship_to_point_lon: incoming.ship_to_point_lon === undefined ? null : incoming.ship_to_point_lon,
        origin: incoming.origin === undefined ? null : incoming.origin,
        origin_geofence_id: incoming.origin_geofence_id === undefined ? null : incoming.origin_geofence_id,
        origin_lat: incoming.origin_lat === undefined ? null : incoming.origin_lat,
        origin_lon: incoming.origin_lon === undefined ? null : incoming.origin_lon,
        id: newId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    // Auto set status to 'valid' if POI and Origin Geofence are valid and status is null
    const hasValidPoi = !!(tripToSave.poi_name && tripToSave.ship_to_point_lat != null && tripToSave.ship_to_point_lon != null);
    const hasValidOrigin = !!tripToSave.origin_geofence_id;
    const hasNoStatus = [
      tripToSave.statusValidDate,
      tripToSave.statusDispatchDate,
      tripToSave.statusEnrouteDate,
      tripToSave.statusAtLocationDate,
      tripToSave.statusDeliveredDate,
      tripToSave.statusUndeliverableDate,
      tripToSave.statusCancelledDate,
      tripToSave.statusReturnedDate,
      tripToSave.statusTurnaroundDate
    ].every(val => val === null || val === undefined || val === "");

    if (hasValidPoi && hasValidOrigin && hasNoStatus) {
      tripToSave.statusValidDate = new Date().toISOString();
    }

    // Save final tripToSave to storage
    if (incoming.id) {
      if (firestoreDb) {
        const docRef = doc(firestoreDb, "trips", incoming.id);
        await setDoc(docRef, cleanUndefined(tripToSave));
      } else {
        const idx = trips.findIndex(t => t.id === incoming.id);
        trips[idx] = tripToSave;
        saveStateStore();
      }
    } else {
      if (firestoreDb) {
        await setDoc(doc(firestoreDb, "trips", tripToSave.id), cleanUndefined(tripToSave));
      } else {
        trips.unshift(tripToSave);
        saveStateStore();
      }
    }
    
    if (firestoreDb) {
      await loadTripsFromFirestoreSafe();
    }
    res.json({ success: true, trip: tripToSave });
  } catch (err: any) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE /api/trips/:id
app.delete("/api/trips/:id", async (req, res) => {
  const { id } = req.params;
  if (firestoreDb) {
    try {
      await deleteDoc(doc(firestoreDb, "trips", id));
      await loadTripsFromFirestoreSafe();
      return res.json({ success: true, message: "Trip deleted successfully." });
    } catch (err: any) {
      console.error("[Firestore] Error deleting trip:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
  
  const idx = trips.findIndex(t => t.id === id);
  if (idx === -1) {
    return res.status(404).json({ success: false, message: `Trip with ID ${id} not found.` });
  }
  trips.splice(idx, 1);
  saveStateStore();
  res.json({ success: true, message: "Trip deleted successfully." });
});

// POST /api/trips/bulk-delete
app.post("/api/trips/bulk-delete", async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) {
    return res.status(400).json({ success: false, message: "Missing or invalid 'ids' list in request body." });
  }
  
  if (firestoreDb) {
    try {
      const batch = writeBatch(firestoreDb);
      for (const id of ids) {
        batch.delete(doc(firestoreDb, "trips", id));
      }
      await batch.commit();
      await loadTripsFromFirestoreSafe();
      return res.json({ success: true, message: `Successfully deleted ${ids.length} trips.` });
    } catch (err: any) {
      console.error("[Firestore] Error performing bulk delete:", err);
      return res.status(500).json({ success: false, message: err.message });
    }
  }
  
  trips = trips.filter(t => !ids.includes(t.id));
  saveStateStore();
  res.json({ success: true, message: `Successfully deleted ${ids.length} trips.` });
});

// 7. Clear system interaction log
app.post("/api/logs/clear", async (req, res) => {
  logs = [];
  if (firestoreDb) {
    try {
      const snap = await getDocs(collection(firestoreDb, "logs"));
      const batch = writeBatch(firestoreDb);
      snap.forEach(docSnap => {
        batch.delete(docSnap.ref);
      });
      await batch.commit();
    } catch (err) {
      console.error("[Firestore] Error clearing logs:", err);
    }
  } else {
    saveStateStore();
  }
  addLog("SYNC_TRIGGER", "success", "Log trace registry successfully cleared down.");
  res.json({ success: true });
});

// ==========================================
// POIS CONTROLLER ENDPOINTS
// ==========================================

const MOCK_POI_CATEGORIES = [
  {
    "name": "CP Broiler Farm",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#a665a7",
    "geocodingAddressOptions": "None",
    "id": 272
  },
  {
    "name": "Feedmill",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#42b77a",
    "geocodingAddressOptions": "None",
    "id": 273
  },
  {
    "name": "Slaughterhouse",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#ef6e7e",
    "geocodingAddressOptions": "None",
    "id": 274
  },
  {
    "name": "Dressing Plant",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#fff372",
    "geocodingAddressOptions": "None",
    "id": 275
  },
  {
    "name": "Hatchery",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#912c8e",
    "geocodingAddressOptions": "None",
    "id": 276
  },
  {
    "name": "Cold Storage",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#2abab3",
    "geocodingAddressOptions": "None",
    "id": 277
  },
  {
    "name": "Shrimp Hatchery",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#478dc8",
    "geocodingAddressOptions": "None",
    "id": 278
  },
  {
    "name": "Shrimp Farm",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#478dc8",
    "geocodingAddressOptions": "None",
    "id": 279
  },
  {
    "name": "Warehouse",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#eb212e",
    "geocodingAddressOptions": "None",
    "id": 280
  },
  {
    "name": "CP Distributor",
    "description": "CP Distributor",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "orange",
    "geocodingAddressOptions": "None",
    "id": 288
  },
  {
    "name": "Customer Cattle Farm",
    "description": "",
    "minZoom": 1,
    "maxZoom": 7,
    "geocodingTolerance": 100,
    "color": "#a2611a",
    "geocodingAddressOptions": "None",
    "id": 289
  }
];

const MOCK_POIS_BY_CATEGORY: Record<number, any[]> = {
  288: [
    {
      "id": 16937,
      "customFieldsValue": {},
      "position": {
        "altitude": 0,
        "longitude": 120.356882,
        "latitude": 16.369958
      },
      "name": "CE YU AGRIVENTURES OPC",
      "description": "San Eugenio, Aringay, La Union",
      "categoryId": 288
    },
    {
      "id": 17007,
      "customFieldsValue": {},
      "position": {
        "altitude": 0,
        "longitude": 120.574312,
        "latitude": 15.736631
      },
      "name": "RAINAH FARM MERCHANDISE",
      "description": "MacArthur Hwy, Moncada, Tarlac",
      "categoryId": 288
    },
    {
      "id": 17038,
      "customFieldsValue": {},
      "position": {
        "altitude": 0,
        "longitude": 121.443492,
        "latitude": 17.424131
      },
      "name": "PLARIDEL PRODUCTS & SERVICES INC - TABUK",
      "description": "Tabuk, Kalinga",
      "categoryId": 288
    },
    {
      "id": 17039,
      "customFieldsValue": {},
      "position": {
        "altitude": 0,
        "longitude": 121.11462,
        "latitude": 16.799847
      },
      "name": "PLARIDEL PRODUCTS & SERVICES INC - LAGAWE",
      "description": "Lagawe, Ifugao",
      "categoryId": 288
    },
    {
      "id": 17045,
      "customFieldsValue": {},
      "position": {
        "altitude": 0,
        "longitude": 120.61849,
        "latitude": 17.596603
      },
      "name": "PLARIDEL PRODUCTS & SERVICES INC - BANGUED",
      "description": "Bangued, Abra",
      "categoryId": 288
    },
    {
      "id": 17046,
      "customFieldsValue": {},
      "position": {
        "altitude": 0,
        "longitude": 120.595183,
        "latitude": 17.557581
      },
      "name": "PLARIDEL PRODUCTS & SERVICES INC - PIDIGAN",
      "description": "Pidigan, Abra",
      "categoryId": 288
    },
    {
      "id": 17051,
      "customFieldsValue": {},
      "position": {
        "altitude": 0,
        "longitude": 120.576636,
        "latitude": 16.45022
      },
      "name": "YHAM-MIE AGRI-VET SUPPLY",
      "description": "Farmers Center, Puguis, La Trinidad, Benguet",
      "categoryId": 288
    },
    {
      "id": 17052,
      "customFieldsValue": {},
      "position": {
        "altitude": 0,
        "longitude": 121.364098,
        "latitude": 14.033157
      },
      "name": "ART FRESH CHICKEN CORP - INDO & MEMANG",
      "description": "San Pablo City, Laguna",
      "categoryId": 288
    }
  ],
  272: [
    {
      "id": 27201,
      "customFieldsValue": {},
      "position": { "altitude": 10, "longitude": 120.9842, "latitude": 14.5995 },
      "name": "CP Broiler Farm - Bulacan Sector A",
      "description": "San Jose Del Monte, Bulacan",
      "categoryId": 272
    },
    {
      "id": 27202,
      "customFieldsValue": {},
      "position": { "altitude": 12, "longitude": 121.0500, "latitude": 14.3000 },
      "name": "CP Broiler Farm - Laguna Lakeside B",
      "description": "Calamba, Laguna",
      "categoryId": 272
    }
  ],
  273: [
    {
      "id": 27301,
      "customFieldsValue": {},
      "position": { "altitude": 5, "longitude": 120.8500, "latitude": 14.8000 },
      "name": "Central Feedmill A - Malolos",
      "description": "Malolos City, Bulacan",
      "categoryId": 273
    },
    {
      "id": 27302,
      "customFieldsValue": {},
      "position": { "altitude": 8, "longitude": 120.6000, "latitude": 15.5000 },
      "name": "Northern Feedmill B - Tarlac",
      "description": "Concepcion, Tarlac",
      "categoryId": 273
    }
  ],
  274: [
    {
      "id": 27401,
      "customFieldsValue": {},
      "position": { "altitude": 15, "longitude": 121.1500, "latitude": 14.5000 },
      "name": "Manila Slaughterhouse Hub",
      "description": "Taytay, Rizal",
      "categoryId": 274
    }
  ],
  280: [
    {
      "id": 28001,
      "customFieldsValue": {},
      "position": { "altitude": 4, "longitude": 120.9700, "latitude": 14.6200 },
      "name": "Main Logistics Hub - Tondo Port",
      "description": "Port Area, Manila",
      "categoryId": 280
    },
    {
      "id": 28002,
      "customFieldsValue": {},
      "position": { "altitude": 20, "longitude": 121.0500, "latitude": 13.7500 },
      "name": "South Warehouse - Batangas Port",
      "description": "Batangas City, Batangas",
      "categoryId": 280
    }
  ]
};

function getMockPOIs(categoryId: number, categoryName: string): any[] {
  if (MOCK_POIS_BY_CATEGORY[categoryId]) {
    return MOCK_POIS_BY_CATEGORY[categoryId];
  }
  const generated = [];
  const baseLat = 14.5 + (categoryId % 5) * 0.4;
  const baseLng = 120.5 + (categoryId % 3) * 0.4;
  for (let i = 1; i <= 4; i++) {
    generated.push({
      id: categoryId * 100 + i,
      customFieldsValue: {},
      position: {
        altitude: 0,
        longitude: baseLng + (i * 0.12),
        latitude: baseLat + (i * 0.08)
      },
      name: `Demo ${categoryName} Facility ${String.fromCharCode(64 + i)}`,
      description: `Simulated location for category ${categoryName} (Sector ${i})`,
      categoryId: categoryId
    });
  }
  return generated;
}

const MOCK_GEOFENCE_GROUPS = [
  {
    "name": "Go Inside",
    "description": "Alarm when enter geofence",
    "geofenceIds": [ 1719, 1720, 2563, 2784, 2785 ],
    "pinned": true,
    "colour": "#C86400",
    "priority": 0,
    "useInGeocoding": true,
    "id": 3540
  },
  {
    "name": "Charoen",
    "description": "",
    "geofenceIds": [ 1709, 1721, 1722, 1724, 1764 ],
    "pinned": true,
    "colour": "#C4C4C4",
    "priority": 1,
    "useInGeocoding": true,
    "id": 4867
  }
];

const MOCK_GEOFENCES = [
  {
    "shapeType": "Polygon",
    "name": "BBF1",
    "description": "Calayaan, Gerona, Tarlac",
    "polygonShape": {
      "vertices": [
        { "longitude": 120.53469848632812, "latitude": 15.581819534301758 },
        { "longitude": 120.53685760498047, "latitude": 15.581819534301758 },
        { "longitude": 120.53662872314453, "latitude": 15.577619552612305 },
        { "longitude": 120.53353881835938, "latitude": 15.5768404006958 },
        { "longitude": 120.53308868408203, "latitude": 15.577520370483398 },
        { "longitude": 120.53327941894531, "latitude": 15.579050064086914 },
        { "longitude": 120.53443908691406, "latitude": 15.579170227050781 },
        { "longitude": 120.53469848632812, "latitude": 15.581819534301758 }
      ]
    },
    "boundingBox": {
      "minX": 120.53308868408203,
      "maxX": 120.53685760498047,
      "minY": 15.5768404006958,
      "maxY": 15.581819534301758
    },
    "id": 1709
  },
  {
    "shapeType": "Polygon",
    "name": "Integration - San Ildefonso",
    "description": "San Ildefonso farm sector",
    "polygonShape": {
      "vertices": [
        { "longitude": 120.93860626220703, "latitude": 15.082929611206055 },
        { "longitude": 120.9385986328125, "latitude": 15.082969665527344 },
        { "longitude": 120.93875122070312, "latitude": 15.083040237426758 },
        { "longitude": 120.93888854980469, "latitude": 15.082779884338379 },
        { "longitude": 120.9386978149414, "latitude": 15.082710266113281 },
        { "longitude": 120.93860626220703, "latitude": 15.082929611206055 }
      ]
    },
    "boundingBox": {
      "minX": 120.9385986328125,
      "maxX": 120.93888854980469,
      "minY": 15.082710266113281,
      "maxY": 15.083040237426758
    },
    "id": 1719
  },
  {
    "shapeType": "Polygon",
    "name": "Head Office - San Fernando",
    "description": "HQ office sector",
    "polygonShape": {
      "vertices": [
        { "longitude": 120.67167663574219, "latitude": 15.043769836425781 },
        { "longitude": 120.67194366455078, "latitude": 15.043829917907715 },
        { "longitude": 120.6719970703125, "latitude": 15.04362964630127 },
        { "longitude": 120.67173767089844, "latitude": 15.043569564819336 },
        { "longitude": 120.67167663574219, "latitude": 15.043769836425781 }
      ]
    },
    "boundingBox": {
      "minX": 120.67167663574219,
      "maxX": 120.6719970703125,
      "minY": 15.043569564819336,
      "maxY": 15.043829917907715
    },
    "id": 1720
  },
  {
    "shapeType": "Polygon",
    "name": "Concepcion 1",
    "description": "Zone 1 Concepcion",
    "polygonShape": {
      "vertices": [
        { "longitude": 120.66169738769531, "latitude": 15.364299774169922 },
        { "longitude": 120.66455078125, "latitude": 15.366239547729492 },
        { "longitude": 120.67115783691406, "latitude": 15.363900184631348 },
        { "longitude": 120.66787719726562, "latitude": 15.361550331115723 },
        { "longitude": 120.66780853271484, "latitude": 15.36262035369873 },
        { "longitude": 120.66568756103516, "latitude": 15.361530303955078 },
        { "longitude": 120.66425323486328, "latitude": 15.363840103149414 },
        { "longitude": 120.6622085571289, "latitude": 15.363639831542969 },
        { "longitude": 120.66204071044922, "latitude": 15.363900184631348 },
        { "longitude": 120.66169738769531, "latitude": 15.364299774169922 }
      ]
    },
    "boundingBox": {
      "minX": 120.66169738769531,
      "maxX": 120.67115783691406,
      "minY": 15.361530303955078,
      "maxY": 15.366239547729492
    },
    "id": 1721
  },
  {
    "shapeType": "Polygon",
    "name": "Concepcion 2",
    "description": "Zone 2 Concepcion",
    "polygonShape": {
      "vertices": [
        { "longitude": 120.66033172607422, "latitude": 15.362990379333496 },
        { "longitude": 120.66075897216797, "latitude": 15.360859870910645 },
        { "longitude": 120.6612319946289, "latitude": 15.35888957977295 },
        { "longitude": 120.65911102294922, "latitude": 15.358380317687988 },
        { "longitude": 120.65532684326172, "latitude": 15.362139701843262 },
        { "longitude": 120.65605926513672, "latitude": 15.364959716796875 },
        { "longitude": 120.66033172607422, "latitude": 15.362990379333496 }
      ]
    },
    "boundingBox": {
      "minX": 120.65532684326172,
      "maxX": 120.6612319946289,
      "minY": 15.358380317687988,
      "maxY": 15.364959716796875
    },
    "id": 1722
  },
  {
    "shapeType": "Polygon",
    "name": "Hatchery - Jaen",
    "description": "Jaen Hatchery Facility",
    "polygonShape": {
      "vertices": [
        { "longitude": 120.84143829345703, "latitude": 15.444319725036621 },
        { "longitude": 120.84089660644531, "latitude": 15.443920135498047 },
        { "longitude": 120.8404769897461, "latitude": 15.443479537963867 },
        { "longitude": 120.8409423828125, "latitude": 15.443289756774902 },
        { "longitude": 120.842041015625, "latitude": 15.44299030303955 },
        { "longitude": 120.8427505493164, "latitude": 15.443989753723145 },
        { "longitude": 120.84204864501953, "latitude": 15.44417953491211 },
        { "longitude": 120.84143829345703, "latitude": 15.444319725036621 }
      ]
    },
    "boundingBox": {
      "minX": 120.8404769897461,
      "maxX": 120.8427505493164,
      "minY": 15.44299030303955,
      "maxY": 15.444319725036621
    },
    "id": 1724
  },
  {
    "shapeType": "Polygon",
    "name": "Sta Lucia Farm",
    "description": "Sta Lucia Poultry",
    "polygonShape": {
      "vertices": [
        { "longitude": 120.47348022460938, "latitude": 15.364259719848633 },
        { "longitude": 120.47254943847656, "latitude": 15.365790367126465 },
        { "longitude": 120.47271728515625, "latitude": 15.367670059204102 },
        { "longitude": 120.47339630126953, "latitude": 15.369290351867676 },
        { "longitude": 120.47396087646484, "latitude": 15.369999885559082 },
        { "longitude": 120.47474670410156, "latitude": 15.369199752807617 },
        { "longitude": 120.47766876220703, "latitude": 15.36460018157959 },
        { "longitude": 120.47437286376953, "latitude": 15.362930297851562 },
        { "longitude": 120.47348022460938, "latitude": 15.364259719848633 }
      ]
    },
    "boundingBox": {
      "minX": 120.47254943847656,
      "maxX": 120.47766876220703,
      "minY": 15.362930297851562,
      "maxY": 15.369999885559082
    },
    "id": 1764
  },
  {
    "shapeType": "Polygon",
    "name": "Mayantoc Farm",
    "description": "Mayantoc Farm Area",
    "polygonShape": {
      "vertices": [
        { "longitude": 120.40593719482422, "latitude": 15.602160453796387 },
        { "longitude": 120.40277099609375, "latitude": 15.610639572143555 },
        { "longitude": 120.40432739257812, "latitude": 15.610560417175293 },
        { "longitude": 120.40975189208984, "latitude": 15.603309631347656 },
        { "longitude": 120.40780639648438, "latitude": 15.602680206298828 },
        { "longitude": 120.40593719482422, "latitude": 15.602160453796387 }
      ]
    },
    "boundingBox": {
      "minX": 120.40277099609375,
      "maxX": 120.40975189208984,
      "minY": 15.602160453796387,
      "maxY": 15.610639572143555
    },
    "id": 2563
  }
];


async function getSessionToken(baseUrl: string): Promise<string> {
  if (currentConfig.gpsgateToken) {
    return currentConfig.gpsgateToken;
  }

  const now = Date.now();
  if (cachedSessionToken && now < cachedSessionTokenExpiry) {
    return cachedSessionToken;
  }

  const sessionUrl = `${baseUrl}/api/v.1/applications/${currentConfig.gpsgateAppId}/logins`;
  const sessionResponse = await fetch(sessionUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: currentConfig.gpsgateUsername,
      password: currentConfig.gpsgatePassword || "",
    }),
    signal: AbortSignal.timeout(6000),
  });

  if (!sessionResponse.ok) {
    const errText = await sessionResponse.text().catch(() => "Unknown response");
    throw new Error(`GpsGate Authentication Failed: HTTP STATUS ${sessionResponse.status} - ${errText}`);
  }

  const sessionData = await sessionResponse.json() as any;
  const sessionId = sessionData.sessionId || sessionData.token || sessionData.SessionId;
  if (!sessionId) {
    throw new Error("Could not find SessionID or login token in GpsGate Authentication response.");
  }

  cachedSessionToken = sessionId;
  // Cache the session token for 15 minutes
  cachedSessionTokenExpiry = now + 15 * 60 * 1000;
  return cachedSessionToken;
}

let rateLimitBackoffUntil = 0;
let lastRequestTime = 0;
const MIN_REQUEST_SPACING_MS = 250; // space requests at least 250ms apart

async function throttleRequest() {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_REQUEST_SPACING_MS) {
    const delay = MIN_REQUEST_SPACING_MS - elapsed;
    lastRequestTime = now + delay;
    await new Promise(resolve => setTimeout(resolve, delay));
  } else {
    lastRequestTime = now;
  }
}

async function fetchGpsgateAPI(urlPath: string): Promise<any> {
  const cacheKey = `${currentConfig.gpsgateUrl}_${currentConfig.gpsgateAppId}_${urlPath}`;
  const cached = gpsgateCache.get(cacheKey);
  const now = Date.now();

  // If rate limiting backoff is currently active, bypass GpsGate live queries
  if (now < rateLimitBackoffUntil) {
    if (cached) {
      return cached.data;
    }
    throw new Error("GpsGate API rate-limit cooldown backoff is currently active");
  }

  // If we have a fresh cache entry, return it immediately to prevent spamming GpsGate API
  if (cached && (now - cached.timestamp < CACHE_TTL_MS)) {
    console.log(`[GpsGate Cache Hit] Returning fresh cached data for ${urlPath}`);
    return cached.data;
  }

  // Ensure requests are spaced out to minimize the risk of hitting GpsGate's rate limiter
  await throttleRequest();

  const baseUrl = getGpsgateBaseUrl(currentConfig.gpsgateUrl);
  let authHeaderValue = "";
  try {
    authHeaderValue = await getSessionToken(baseUrl);
  } catch (err: any) {
    if (cached) {
      console.warn(`[GpsGate Auth Fail - Fallback] Using stale cached data for ${urlPath} due to login error: ${err.message}`);
      return cached.data;
    }
    throw err;
  }

  try {
    const response = await fetch(`${baseUrl}${urlPath}`, {
      method: "GET",
      headers: {
        "Authorization": authHeaderValue,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(10000),
    });

    if (response.status === 429) {
      // Trigger a 1-minute cooldown backoff window to stop querying GpsGate live
      rateLimitBackoffUntil = Date.now() + 60 * 1000;
      addLog("GPSGATE_FETCH", "info", `Rate limit (429) received for ${urlPath}. Cooldown active for 60s. Fallback storage enabled.`);

      if (cached) {
        console.warn(`[GpsGate 429 - Fallback] Returning stale cache for ${urlPath} due to 429 rate limiting`);
        return cached.data;
      }
      throw new Error(`GpsGate fetch failed: HTTP Status 429 (Too Many Requests / Rate Limited)`);
    }

    if (response.status === 401 || response.status === 403) {
      clearSessionToken();
    }

    if (!response.ok) {
      throw new Error(`GpsGate fetch failed: HTTP Status ${response.status}`);
    }

    const result = await response.json();
    gpsgateCache.set(cacheKey, {
      data: result,
      timestamp: now
    });
    return result;
  } catch (err: any) {
    if (cached) {
      console.warn(`[GpsGate Fetch Fail - Fallback] Using stale cached data for ${urlPath} due to network error: ${err.message}`);
      return cached.data;
    }
    throw err;
  }
}

function logFetchError(apiName: string, err: any, backupMsg: string) {
  const isRateLimit = err.message.includes("429") || err.message.includes("cooldown") || err.message.includes("rate-limit");
  const level = isRateLimit ? "info" : "warning";
  const message = isRateLimit
    ? `[GpsGate Cooldown Protection] GpsGate live queries are currently throttled/rate-limited. Serving backup ${apiName} dynamically.`
    : `Could not retrieve ${apiName} from GpsGate live: ${err.message}. ${backupMsg}`;
  addLog("GPSGATE_FETCH", level, message);
}

app.get("/api/poi-categories", async (req, res) => {
  addLog("GPSGATE_FETCH", "info", "Fetching POI Categories from GpsGate API...");
  if (currentConfig.useGpsgateMock) {
    addLog("GPSGATE_FETCH", "success", "Fetched POI Categories from simulation storage.");
    return res.json({ success: true, source: "mock", data: MOCK_POI_CATEGORIES });
  }

  try {
    const data = await fetchGpsgateAPI(`/api/v.1/applications/${currentConfig.gpsgateAppId}/poicategories?FromIndex=0&PageSize=1000`);
    addLog("GPSGATE_FETCH", "success", `Successfully retrieved ${data?.length || 0} POI Categories from GpsGate live.`);
    return res.json({ success: true, source: "live", data });
  } catch (err: any) {
    logFetchError("POI Categories", err, "Using backup categories.");
    return res.json({ success: true, source: "fallback_mock", data: MOCK_POI_CATEGORIES });
  }
});

app.get("/api/poi-categories/:categoryId/pois", async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const categoryName = String(req.query.name || "POI Category");
  addLog("GPSGATE_FETCH", "info", `Fetching POIs for category ID ${categoryId} (${categoryName}) from GpsGate API...`);

  if (currentConfig.useGpsgateMock) {
    const mockPois = getMockPOIs(categoryId, categoryName);
    addLog("GPSGATE_FETCH", "success", `Fetched ${mockPois.length} POIs for category ${categoryName} from simulation storage.`);
    return res.json({ success: true, source: "mock", data: mockPois });
  }

  try {
    const data = await fetchGpsgateAPI(`/api/v.1/applications/${currentConfig.gpsgateAppId}/poicategories/${categoryId}/pois?FromIndex=0&PageSize=1000`);
    addLog("GPSGATE_FETCH", "success", `Successfully retrieved ${data?.length || 0} POIs for category ${categoryName} from GpsGate live.`);
    return res.json({ success: true, source: "live", data });
  } catch (err: any) {
    const mockPois = getMockPOIs(categoryId, categoryName);
    logFetchError(`POIs for Category ${categoryId} (${categoryName})`, err, "Using backup POIs.");
    return res.json({ success: true, source: "fallback_mock", data: mockPois });
  }
});

app.get("/api/geofence-groups", async (req, res) => {
  addLog("GPSGATE_FETCH", "info", "Fetching Geofence Groups from GpsGate API...");
  if (currentConfig.useGpsgateMock) {
    addLog("GPSGATE_FETCH", "success", "Fetched Geofence Groups from simulation storage.");
    return res.json({ success: true, source: "mock", data: MOCK_GEOFENCE_GROUPS });
  }

  try {
    const data = await fetchGpsgateAPI(`/api/v.1/applications/${currentConfig.gpsgateAppId}/geofencegroups?FromIndex=0&PageSize=1000`);
    addLog("GPSGATE_FETCH", "success", `Successfully retrieved ${data?.length || 0} Geofence Groups from GpsGate live.`);
    return res.json({ success: true, source: "live", data });
  } catch (err: any) {
    logFetchError("Geofence Groups", err, "Using backup geofence groups.");
    return res.json({ success: true, source: "fallback_mock", data: MOCK_GEOFENCE_GROUPS });
  }
});

app.get("/api/geofences", async (req, res) => {
  addLog("GPSGATE_FETCH", "info", "Fetching all Geofences from GpsGate API...");
  if (currentConfig.useGpsgateMock) {
    addLog("GPSGATE_FETCH", "success", "Fetched Geofences from simulation storage.");
    return res.json({ success: true, source: "mock", data: MOCK_GEOFENCES });
  }

  try {
    const data = await fetchGpsgateAPI(`/api/v.1/applications/${currentConfig.gpsgateAppId}/geofences?FromIndex=0&PageSize=1000`);
    addLog("GPSGATE_FETCH", "success", `Successfully retrieved ${data?.length || 0} Geofences from GpsGate live.`);
    return res.json({ success: true, source: "live", data });
  } catch (err: any) {
    logFetchError("all Geofences", err, "Using backup geofences.");
    return res.json({ success: true, source: "fallback_mock", data: MOCK_GEOFENCES });
  }
});

app.get("/api/geofence-groups/:groupId/geofences", async (req, res) => {
  const groupId = Number(req.params.groupId);
  addLog("GPSGATE_FETCH", "info", `Fetching Geofences for Group ID ${groupId} from GpsGate API...`);

  if (currentConfig.useGpsgateMock) {
    const group = MOCK_GEOFENCE_GROUPS.find(g => g.id === groupId);
    const ids = group ? group.geofenceIds : [];
    const matched = MOCK_GEOFENCES.filter(g => ids.includes(g.id));
    addLog("GPSGATE_FETCH", "success", `Fetched ${matched.length} Geofences for Group ID ${groupId} from simulation storage.`);
    return res.json({ success: true, source: "mock", data: matched });
  }

  try {
    const groupData = await fetchGpsgateAPI(`/api/v.1/applications/${currentConfig.gpsgateAppId}/geofencegroups?FromIndex=0&PageSize=1000`);
    const group = Array.isArray(groupData) ? groupData.find((g: any) => g.id === groupId) : null;
    const ids = group ? group.geofenceIds : [];

    const allGeofences = await fetchGpsgateAPI(`/api/v.1/applications/${currentConfig.gpsgateAppId}/geofences?FromIndex=0&PageSize=1000`);
    const matched = Array.isArray(allGeofences) ? allGeofences.filter((g: any) => ids.includes(g.id)) : [];

    addLog("GPSGATE_FETCH", "success", `Successfully retrieved ${matched.length} Geofences for Group ID ${groupId} from GpsGate live.`);
    return res.json({ success: true, source: "live", data: matched });
  } catch (err: any) {
    const group = MOCK_GEOFENCE_GROUPS.find(g => g.id === groupId);
    const ids = group ? group.geofenceIds : [];
    const matched = MOCK_GEOFENCES.filter(g => ids.includes(g.id));
    logFetchError(`Geofences for Group ${groupId}`, err, "Using backup.");
    return res.json({ success: true, source: "fallback_mock", data: matched });
  }
});


// ==========================================
// INBOUND EVENTS ENDPOINTS (GpsGate Inbound Integration)
// ==========================================

async function handleInboundEvent(req: any, res: any) {
  // Allow cross-origin requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const eventTimestamp = new Date().toISOString();
    
    // GpsGate HTTP Expression sends all data as URL query parameters.
    // We treat the query string as the entire event payload and capture all parameters dynamically.
    const queryParams: Record<string, any> = {};
    for (const [key, val] of Object.entries(req.query || {})) {
      queryParams[key] = val;
    }

    // Log the complete incoming request for debugging
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;

    const eventPayload = {
      id: eventId,
      timestamp: eventTimestamp,
      method: req.method,
      url: fullUrl,
      headers: req.headers || {},
      query: queryParams,
      body: null // Explicitly null as GpsGate HTTP Expression does not use a request body
    };

    // Evaluate expression value dynamically if speed/limit parameters are passed
    let evaluationResult = true;
    let speed: number | undefined;
    let limit: number | undefined;

    for (const [key, val] of Object.entries(queryParams)) {
      const lowerKey = key.toLowerCase();
      // Dynamically locate any parameter representing speed or speed limit
      if (lowerKey.includes("speed") && !lowerKey.includes("limit")) {
        const parsedSpeed = parseFloat(String(val));
        if (!isNaN(parsedSpeed)) speed = parsedSpeed;
      }
      if (lowerKey.includes("limit") || lowerKey.includes("speedlimit")) {
        const parsedLimit = parseFloat(String(val));
        if (!isNaN(parsedLimit)) limit = parsedLimit;
      }
    }

    if (speed !== undefined && limit !== undefined) {
      evaluationResult = speed > limit;
    }

    // Build the GpsGate HTTP Expression compliant response payload
    const gpsgateResponse = {
      Result: evaluationResult,
      result: evaluationResult,
      Variables: [
        { Name: "processed", Value: "true" },
        { Name: "eventId", Value: eventId },
        { Name: "timestamp", Value: eventTimestamp }
      ],
      variables: {
        processed: "true",
        eventId: eventId,
        timestamp: eventTimestamp
      }
    };

    // Return HTTP 200 immediately after successfully reading the request
    res.status(200).json(gpsgateResponse);

    // Any database operations, state updating, or heavy logging occur asynchronously after response
    Promise.resolve().then(async () => {
      inboundEvents.unshift(eventPayload);
      if (inboundEvents.length > 250) {
        inboundEvents = inboundEvents.slice(0, 250);
      }

      if (firestoreDb) {
        try {
          await setDoc(doc(firestoreDb, "inbound_events", eventId), cleanUndefined(eventPayload));
        } catch (dbErr) {
          console.error("Error saving inbound event in background:", dbErr);
        }
      } else {
        saveStateStore();
      }
    });

  } catch (err: any) {
    console.error("Error receiving inbound event:", err);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

app.options("/api/inbound-events", (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.status(200).end();
});

app.post("/api/inbound-events", express.urlencoded({ extended: true }), express.text({ type: "*/*" }), async (req, res) => {
  await handleInboundEvent(req, res);
});

app.get("/api/inbound-events", async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  // If there are query parameters, it is an HTTP Expression trigger from GpsGate containing data in the URL
  if (Object.keys(req.query).length > 0) {
    return await handleInboundEvent(req, res);
  }
  // Otherwise, it is our UI fetching the received logs history list
  if (firestoreDb) {
    try {
      const q = query(collection(firestoreDb, "inbound_events"), orderBy("timestamp", "desc"), limit(250));
      const snap = await getDocs(q);
      const eventsList: any[] = [];
      snap.forEach(docSnap => {
        eventsList.push(docSnap.data());
      });
      inboundEvents = eventsList; // Keep local memory cache in sync
      return res.json(eventsList);
    } catch (err) {
      console.error("Error reading inbound events from Firestore:", err);
    }
  }
  res.json(inboundEvents);
});

app.post("/api/inbound-events/clear", async (req, res) => {
  try {
    inboundEvents = [];
    if (firestoreDb) {
      const snap = await getDocs(collection(firestoreDb, "inbound_events"));
      const batch = writeBatch(firestoreDb);
      snap.forEach(d => {
        batch.delete(doc(firestoreDb, "inbound_events", d.id));
      });
      await batch.commit();
    }
    saveStateStore();
    res.json({ success: true, message: "All inbound events have been deleted." });
  } catch (err: any) {
    console.error("Error clearing inbound events:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// 8. Load mock server received data payloads for inspector sandbox
app.get("/api/mock/target-endpoint/payloads", (req, res) => {
  res.json(mockPayloadsReceived);
});

// 9. Clear mock records
app.post("/api/mock/target-endpoint/clear", (req, res) => {
  mockPayloadsReceived = [];
  receivedRecordIds.clear();
  saveStateStore();
  res.json({ success: true });
});

// 10. Built-in endpoint acting as a local receiver target
app.post("/api/mock/target-endpoint", (req, res) => {
  try {
    const headers: Record<string, string> = {};
    for (const key of Object.keys(req.headers)) {
      headers[key] = String(req.headers[key]);
    }

    const rawRecords = Array.isArray(req.body) 
      ? req.body 
      : (req.body && Array.isArray(req.body.vehicles) ? req.body.vehicles : []);

    const recordIds: string[] = rawRecords
      .map((r: any) => r && (r.RECORD_ID || r.recordId || r.id))
      .filter((id) => id !== undefined && id !== null && id !== "");

    if (recordIds.length === 0) {
      // Dynamic fallback for non-empty but unmapped structures
      const randomId = `6481${new Date().toISOString().replace(/\D/g, '').substring(2, 16)}`;
      recordIds.push(randomId);
    }

    const duplicateRecordIds: string[] = [];
    const savedRecordIds: string[] = [];

    for (const rid of recordIds) {
      const ridStr = String(rid);
      if (receivedRecordIds.has(ridStr)) {
        duplicateRecordIds.push(ridStr);
      } else {
        receivedRecordIds.add(ridStr);
        savedRecordIds.push(ridStr);
      }
    }

    const payload: MockTargetReceivedPayload = {
      id: `pyl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      vehiclesCount: recordIds.length,
      payload: req.body,
      headers
    };

    mockPayloadsReceived.unshift(payload);
    
    if (mockPayloadsReceived.length > 50) {
      mockPayloadsReceived = mockPayloadsReceived.slice(0, 50); // prevent leaks
    }

    console.log(`[Built-in Target] Received target POST transmission with ${recordIds.length} vehicle keys.`);
    saveStateStore();

    if (savedRecordIds.length === 0 && duplicateRecordIds.length > 0) {
      // Return beautiful exact conflict schema
      return res.status(200).json({
        success: false,
        message: "Record already exists",
        errors: {
          totalReceived: recordIds.length,
          recordIds: duplicateRecordIds
        },
        timestamp: new Date().toISOString()
      });
    }

    // Return beautiful exact success schema
    res.status(200).json({
      success: true,
      message: "Inbound GPS data saved successfully",
      data: {
        totalReceived: recordIds.length,
        rowsAffected: savedRecordIds.length,
        duplicateCount: duplicateRecordIds.length,
        duplicateRecordIds: duplicateRecordIds,
        recordIds: savedRecordIds
      },
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    res.status(400).json({ error: "Invalid layout structure" });
  }
});

// ==========================================
// FULL-STACK VITE AND STATIC ROUTING HANDLERS
// ==========================================

async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    // Vite middleware for fast feedback & dev updates
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Serve production bundle
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SERVER ACTIVE] Fleet Connector running on http://localhost:${PORT}`);
  });
}

setupServer();
