import React from "react";
import Card from "./Card";
import LoadingSpinner from "./LoadingSpinner";

interface Props {
  data: any;
  loading: boolean;
  error: string | null;
}

const ActivityIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const getValueColor = (label: string, value: number | string | undefined) => {
  if (typeof value !== "number") return "text-slate-400 dark:text-slate-500";
  switch (label) {
    case "PM2.5": 
      return value <= 12 ? "text-green-600 dark:text-green-400" : 
             value <= 35 ? "text-yellow-600 dark:text-yellow-400" : 
             "text-red-600 dark:text-red-400";
    case "PM10":  
      return value <= 54 ? "text-green-600 dark:text-green-400" : 
             value <= 154 ? "text-yellow-600 dark:text-yellow-400" : 
             "text-red-600 dark:text-red-400";
    case "O₃":    
      return value <= 0.054 ? "text-green-600 dark:text-green-400" : 
             value <= 0.07 ? "text-yellow-600 dark:text-yellow-400" : 
             "text-red-600 dark:text-red-400";
    case "NO₂":   
      return value <= 0.053 ? "text-green-600 dark:text-green-400" : 
             value <= 0.1 ? "text-yellow-600 dark:text-yellow-400" : 
             "text-red-600 dark:text-red-400";
    case "SO₂":   
      return value <= 0.035 ? "text-green-600 dark:text-green-400" : 
             value <= 0.075 ? "text-yellow-600 dark:text-yellow-400" : 
             "text-red-600 dark:text-red-400";
    case "CO":    
      return value <= 9 ? "text-green-600 dark:text-green-400" : 
             value <= 35 ? "text-yellow-600 dark:text-yellow-400" : 
             "text-red-600 dark:text-red-400";
    default: return "text-slate-600 dark:text-slate-400";
  }
};

const getStatusIndicator = (label: string, value: number | string | undefined) => {
  if (typeof value !== "number") return null;
  const color = getValueColor(label, value);
  
  if (color.includes('green')) {
    return <div className="w-2 h-2 rounded-full bg-green-500 shadow-lg shadow-green-500/50"></div>;
  } else if (color.includes('yellow')) {
    return <div className="w-2 h-2 rounded-full bg-yellow-500 shadow-lg shadow-yellow-500/50"></div>;
  } else if (color.includes('red')) {
    return <div className="w-2 h-2 rounded-full bg-red-500 shadow-lg shadow-red-500/50 animate-pulse"></div>;
  }
  return null;
};

const RealTimeAirQuality: React.FC<Props> = ({ data, loading, error }) => {
  if (loading) {
    return (
      <Card title="Real-time Air Quality" icon={<ActivityIcon />}>
        <div className="flex justify-center items-center h-32">
          <LoadingSpinner />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Real-time Air Quality" icon={<ActivityIcon />}>
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <p className="text-red-600 dark:text-red-400 font-medium">{error}</p>
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="Real-time Air Quality" icon={<ActivityIcon />}>
        <div className="text-center py-6">
          <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/50 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ActivityIcon />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No real-time data available
          </p>
        </div>
      </Card>
    );
  }

  const isFlask = (d: any): d is any => "station" in d;

  let stationName = "Unknown Station";
  let distance: number | undefined = undefined;
  let lastUpdated = new Date().toISOString();
  let measurements: { [key: string]: number | string | undefined } = {};

  if (isFlask(data)) {
    stationName = data.station ?? "Unknown Station";
    distance = data.distance;
    lastUpdated = data.last_local ?? new Date().toISOString();
    measurements = {
      "PM2.5": data.pm25,
      "PM10": data.pm10,
      "O₃": data.o3,
      "NO₂": data.no2,
      "SO₂": data.so2,
      "CO": data.co,
    };
  } else {
    stationName = data.location?.name ?? "Unknown Station";
    distance = data.location?.distance;
    lastUpdated = data.lastUpdated;
    measurements = {
      "PM2.5": data.measurements.pm25,
      "PM10": data.measurements.pm10,
      "O₃": data.measurements.o3,
      "NO₂": data.measurements.no2,
      "SO₂": data.measurements.so2,
      "CO": data.measurements.co,
    };
  }

  return (
    <Card title="Real-time Air Quality" icon={<ActivityIcon />}>
      <div className="mb-5 p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-700/30 dark:to-slate-700/50 rounded-2xl border border-slate-200/50 dark:border-slate-600/50">
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">Station</span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">{stationName}</span>
          </div>
          {distance !== undefined && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400">Distance</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100">{(distance * 0.001).toFixed(1)} km</span>
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className="text-slate-500 dark:text-slate-400">Updated</span>
            <span className="font-semibold text-slate-800 dark:text-slate-100">{new Date(lastUpdated).toLocaleTimeString()}</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {Object.entries(measurements).map(([label, value]) => (
          <div key={label} className="group relative p-4 bg-gradient-to-br from-slate-50 to-slate-100/50 dark:from-slate-700/30 dark:to-slate-700/50 hover:from-slate-100 hover:to-slate-50 dark:hover:from-slate-700/50 dark:hover:to-slate-700/30 rounded-2xl border border-slate-200/50 dark:border-slate-600/50 transition-all duration-300 hover:shadow-lg">
            <div className="flex items-start justify-between mb-2">
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400">{label}</div>
              {getStatusIndicator(label, value)}
            </div>
            <div className={`text-2xl font-black ${getValueColor(label, value)} transition-colors`}>
              {typeof value === "number" ? value.toFixed(2) : "--"}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-500 mt-1">
              {label === "PM2.5" || label === "PM10" ? "µg/m³" : "ppm"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default RealTimeAirQuality;
