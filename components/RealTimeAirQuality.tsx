import React from "react";
import Card from "./Card";
import LoadingSpinner from "./LoadingSpinner";
import type { RealTimeAirQuality as RealTimeAirQualityType } from "../services/openaqService";
import type { FlaskAirQuality } from "../services/openaqService";

interface Props {
  data: RealTimeAirQualityType | FlaskAirQuality | null;
  loading: boolean;
  error: string | null;
}

const ActivityIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const getValueColor = (label: string, value: number | string | undefined) => {
  if (typeof value !== "number") return "text-slate-400";
  switch (label) {
    case "PM2.5": return value <= 12 ? "text-green-600" : value <= 35 ? "text-yellow-600" : "text-red-600";
    case "PM10":  return value <= 54 ? "text-green-600" : value <= 154 ? "text-yellow-600" : "text-red-600";
    case "O₃":    return value <= 0.054 ? "text-green-600" : value <= 0.07 ? "text-yellow-600" : "text-red-600";
    case "NO₂":   return value <= 0.053 ? "text-green-600" : value <= 0.1 ? "text-yellow-600" : "text-red-600";
    case "SO₂":   return value <= 0.035 ? "text-green-600" : value <= 0.075 ? "text-yellow-600" : "text-red-600";
    case "CO":    return value <= 9 ? "text-green-600" : value <= 35 ? "text-yellow-600" : "text-red-600";
    default: return "text-slate-600";
  }
};

const RealTimeAirQuality: React.FC<Props> = ({ data, loading, error }) => {
  if (loading) {
    return (
      <Card title="即時空氣品質" icon={<ActivityIcon />}>
        <div className="flex justify-center items-center h-20">
          <LoadingSpinner />
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="即時空氣品質" icon={<ActivityIcon />}>
        <p className="text-red-500 text-center py-4">{error}</p>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card title="即時空氣品質" icon={<ActivityIcon />}>
        <p className="text-center text-slate-500 dark:text-slate-400 py-4">
          尚無即時空氣品質資料
        </p>
      </Card>
    );
  }

  // 🔹 判斷是 Flask API 還是 OpenAQ API
  const isFlask = (d: any): d is FlaskAirQuality => "station" in d;

  let stationName = "未知測站";
  let distance: number | undefined = undefined;
  let lastUpdated = new Date().toISOString();
  let measurements: { [key: string]: number | string | undefined } = {};

  if (isFlask(data)) {
    // Flask API 格式
    stationName = data.station ?? "未知測站";
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
    // OpenAQ 格式
    stationName = data.location?.name ?? "未知測站";
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
    <Card title="即時空氣品質" icon={<ActivityIcon />}>
      <div className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        <p><strong>測站:</strong> {stationName}</p>
        {distance !== undefined && <p><strong>距離:</strong> {(distance * 0.001).toFixed(1)} km</p>}
        <p><strong>更新時間:</strong> {new Date(lastUpdated).toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {Object.entries(measurements).map(([label, value]) => (
          <div key={label} className="p-4 bg-slate-50 dark:bg-slate-700/50 rounded-lg flex flex-col items-center">
            <div className="text-sm text-slate-500 dark:text-slate-400">{label}</div>
            <div className={`text-xl font-bold ${getValueColor(label, value)}`}>
              {typeof value === "number" ? value : "--"}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default RealTimeAirQuality;
