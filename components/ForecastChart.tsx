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
      <div className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-md border border-slate-200 dark:border-slate-700">
        <p className="label font-semibold">{`${label}`}</p>
        <p className={`intro ${aqiLevel.textColor}`}>{`AQI: ${data.aqi} (${aqiLevel.level})`}</p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{`Main Pollutant: ${data.pollutant}`}</p>
      </div>
    );
  }
  return null;
};

const ForecastChart: React.FC<ForecastChartProps> = ({ data }) => {
  const chartData = data.slice(0, 12); // Show next 12 hours

  return (
    <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-lg h-72 sm:h-80">
      <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4">Hourly Forecast</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 5, right: 20, left: -10, bottom: 20 }}>
          <XAxis dataKey="hour" tick={{ fill: 'currentColor' }} className="text-xs text-slate-500 dark:text-slate-400" />
          <YAxis tick={{ fill: 'currentColor' }} className="text-xs text-slate-500 dark:text-slate-400" />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(200, 200, 200, 0.1)' }}/>
          <Bar dataKey="aqi">
            {chartData.map((entry, index) => {
              const aqiLevel = getAQILevel(entry.aqi);
              const colorMap: { [key: string]: string } = {
                'aqi-green-500': '#48BB78',
                'aqi-yellow-500': '#ECC94B',
                'aqi-orange-500': '#ED8936',
                'aqi-red-500': '#F56565',
                'aqi-purple-500': '#9F7AEA',
                'aqi-maroon-500': '#A52A2A',
              };
              return <Cell key={`cell-${index}`} fill={colorMap[aqiLevel.color]} />;
            })}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default ForecastChart;