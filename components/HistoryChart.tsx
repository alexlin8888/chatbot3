import React from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import type { HistoricalDataPoint } from '../types';
import { getAQILevel } from './AQIIndicator';

interface HistoryChartProps {
  data: HistoricalDataPoint[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const aqi = payload[0].value;
      const aqiLevel = getAQILevel(aqi);
      return (
        <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
          <p className="label font-semibold">{`${label}`}</p>
          <p className={`intro ${aqiLevel.textColor}`}>{`Average AQI: ${aqi}`}</p>
        </div>
      );
    }
    return null;
  };

const HistoryChart: React.FC<HistoryChartProps> = ({ data }) => {
  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-lg h-72 sm:h-80">
      <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4">30-Day AQI Trend</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 20, left: -10, bottom: 20 }}>
          <defs>
            <linearGradient id="colorAqi" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fill: 'currentColor' }} className="text-xs text-slate-500 dark:text-slate-400" />
          <YAxis tick={{ fill: 'currentColor' }} className="text-xs text-slate-500 dark:text-slate-400" />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="aqi" stroke="#8884d8" fillOpacity={1} fill="url(#colorAqi)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

export default HistoryChart;