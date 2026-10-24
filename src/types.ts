export interface AppConfig {
  gpsgateUrl: string;
  gpsgateAppId: string;
  gpsgateUsername: string;
  gpsgatePassword?: string;
  useGpsgateMock: boolean;
  gpsgateToken?: string;
  gpsgateGroupId?: string;
  
  targetUrl: string;
  targetAuthHeader: string;
  targetAuthToken: string;
  targetTimeout: number; // millisecond timeout
  targetAuthType?: 'none' | 'bearer' | 'basic' | 'custom';
  targetUsername?: string;
  targetPassword?: string;
  
  syncIntervalMinutes: number; // default 60
  retryAttempts: number; // default 3
  retryBackoffMs: number; // default 1000 (wait time before retrying, scaled exponentially)
}

export interface FleetVehicle {
  id: string | number;
  name: string;
  latitude: number;
  longitude: number;
  speed: number; // km/h
  heading: number; // degrees
  altitude?: number; // meters
  lastUpdate: string; // ISO 8601 string
  ignition: boolean;
  status: 'active' | 'idle' | 'stopped' | 'offline';
  deviceActivity?: string;
  groundSpeed?: number;
  rawPayload?: any;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  type: 'SYNC_TRIGGER' | 'GPSGATE_FETCH' | 'TRANSFORM' | 'TARGET_POST' | 'RETRY_ATTEMPT' | 'SYNC_COMPLETE' | 'SYNC_ERROR';
  status: 'success' | 'warning' | 'error' | 'info';
  message: string;
  details?: string;
}

export interface SchedulerStatus {
  isActive: boolean;
  syncIntervalMinutes: number;
  lastSyncTime: string | null;
  nextSyncTime: string | null;
  gpsgateConnected: 'connected' | 'error' | 'untested';
  targetConnected: 'connected' | 'error' | 'untested';
}

export interface MockTargetReceivedPayload {
  id: string;
  timestamp: string;
  vehiclesCount: number;
  payload: FleetVehicle[];
  headers: Record<string, string>;
}

export interface Trip {
  id: string; // Internal unique tracking ID
  deliveryDate: string | null;
  orderNo: string | null;
  shipTo: string | null;
  recordDate: string | null;
  createdBy: string | null;
  approvedResult: 'Y' | 'N' | 'H' | null;
  approveDate1: string | null;
  approveDate2: string | null;
  referenceSaleOrderNo: string | null;
  issueSlipNo: string | null;
  createIssuedSlip: string | null;
  userCreateIssuedSlip: string | null;
  invoiceNo: string | null;
  userCreateInvoiceNo: string | null;
  customerCode: string | null;
  localName: string | null;
  licensePlate: string | null;
  cancelFlag: 'Y' | 'N' | null;
  documentNo: string | null;
  remark: string | null;
  cancelDate: string | null;
  statusValidDate: string | null;
  statusDispatchDate: string | null;
  statusEnrouteDate: string | null;
  statusAtLocationDate: string | null;
  statusDeliveredDate: string | null;
  statusUndeliverableDate: string | null;
  statusCancelledDate: string | null;
  statusReturnedDate: string | null;
  statusTurnaroundDate: string | null;
  poi_name?: string | null;
  ship_to_point_lat?: number | null;
  ship_to_point_lon?: number | null;
  origin?: string | null;
  origin_geofence_id?: number | null;
  origin_lat?: number | null;
  origin_lon?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface POICategory {
  id: number;
  name: string;
  description: string;
  minZoom?: number;
  maxZoom?: number;
  geocodingTolerance?: number;
  color?: string;
  geocodingAddressOptions?: string;
}

export interface POI {
  id: number;
  name: string;
  description: string;
  categoryId: number;
  position: {
    latitude: number;
    longitude: number;
    altitude?: number;
  };
  customFieldsValue?: Record<string, any>;
}

export interface GeofenceGroup {
  id: number;
  name: string;
  description: string;
  geofenceIds: number[];
  pinned?: boolean;
  colour?: string;
  priority?: number;
  useInGeocoding?: boolean;
}

export interface Geofence {
  id: number;
  name: string;
  description: string;
  shapeType: string;
  polygonShape?: {
    vertices: Array<{
      latitude: number;
      longitude: number;
    }>;
  };
  boundingBox?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface InboundEventMessage {
  id: string;
  timestamp: string;
  method: string;
  headers: Record<string, any>;
  query: Record<string, any>;
  body: any;
}




