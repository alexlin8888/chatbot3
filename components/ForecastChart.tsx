import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { HourlyForecastData } from '../types';
import { getAQILevel } from './AQIIndicator';

interface ForecastChartProps {
  data: HourlyForecastData[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const aqiLevel = getAQILevel(data.aqi);
    return (
      <div className="bg-white/95 dark:bg-slate-800/95 backdrop-blur-xl p-4 rounded-2xl shadow-2xl border border-slate-200/50 dark:border-slate-700/50">
        <p className="font-bold text-slate-800 dark:text-slate-100 mb-2">{label}</p>
        <div className="space-y-1">
          <p className={`font-bold ${aqiLevel.textColor}`}>
            AQI: {data.aqi}
          </p>
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {aqiLevel.level}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Main: {data.pollutant}
          </p>
        </div>
      </div>
    );
  }
  return null;
};

const ForecastChart: React.FC<ForecastChartProps> = ({ data }) => {
  const chartData = data.slice(0, 12);

  const colorMap: { [key: string]: string } = {
    'from-green-400 to-emerald-500': '#10b981',
    'from-yellow-400 to-amber-500': '#f59e0b',
    'from-orange-400 to-orange-600': '#f97316',
    'from-red-400 to-red-600': '#ef4444',
    'from-purple-400 to-purple-600': '#a855f7',
    'from-rose-600 to-red-800': '#dc2626',
  };

  return (
    <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 p-6 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl p-2.5 shadow-lg">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">12-Hour Forecast</h3>
        </div>
        <span className="text-sm font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-4 py-2 rounded-xl">
          Next 12 hours
        </span>
      </div>
      
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
          <XAxis 
            dataKey="hour" 
            tick={{ fill: 'currentColor', fontSize: 12 }} 
            className="text-slate-600 dark:text-slate-400"
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            tick={{ fill: 'currentColor', fontSize: 12 }} 
            className="text-slate-600 dark:text-slate-400"
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(100, 116, 139, 0.1)' }}/>
          <Bar dataKey="aqi" radius={[12, 12, 0, 0]}>
            {chartData.map((entry, index) => {
              const aqiLevel = getAQILevel(entry.aqi);
              const color = colorMap[aqiLevel.color] || '#8884d8';
              return <Cell key={`cell-${index}`} fill={color} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ForecastChart;
