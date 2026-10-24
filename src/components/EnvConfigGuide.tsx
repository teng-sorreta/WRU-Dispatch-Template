import React from 'react';
import { ShieldCheck, Copy, Check } from 'lucide-react';

export default function EnvConfigGuide() {
  const [copied, setCopied] = React.useState(false);

  const envSample = `# =========================================================================
# GPsgate Fleet Sync Utility - Production Environment Variables
# =========================================================================

# The server URL of your GPSGate Instance
GPSGATE_URL="https://gpsgate-enterprise.yourcompany.com"

# The unique GPSGate Application ID assigned to your fleet tracking application
GPSGATE_APP_ID="101"

# API authentication username configured in GpsGate user privileges
GPSGATE_USERNAME="gpsgate_sync_agent"

# Secure API password for GpsGate credentials authenticate
GPSGATE_PASSWORD="production_secure_password_hash"

# Set to false to disable local motion simulation and hook into live servers
USE_GPSGATE_MOCK="false"

# Target receiver server endpoint to forward telemetry JSON packages
TARGET_URL="https://telemetry-sink.destination.io/api/v1/fleet"

# Key field for Authorization headers (e.g. Authorization or X-API-Key)
TARGET_AUTH_HEADER="Authorization"

# Secure token, bearer hash or API secret key
TARGET_AUTH_TOKEN="Bearer live_token_prod_9018485721"

# Synchronizer polling interval in minutes (60 is standard deployment)
SYNC_INTERVAL_MINUTES="60"

# Transmission fail-safe parameters
RETRY_ATTEMPTS="5"
RETRY_BACKOFF_MS="2000"
TARGET_TIMEOUT="8000"`;

  const handleCopy = () => {
    navigator.clipboard.writeText(envSample);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-lg">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            Production Deployment Environment (.env)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Replicate these properties inside your production host environment to securely manage API authentication credentials without code modification.
          </p>
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 active:scale-95 transition rounded-md border border-slate-700"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>Copy Template</span>
            </>
          )}
        </button>
      </div>

      <div className="relative">
        <pre className="text-[11px] leading-relaxed font-mono p-4 bg-slate-950 text-slate-300 rounded-lg overflow-x-auto max-h-[360px] border border-slate-850">
          {envSample}
        </pre>
        <div className="absolute bottom-2 right-2 flex items-center gap-1 text-[10px] text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800 font-mono">
          <span>PORT: 3000</span>
        </div>
      </div>
    </div>
  );
}
