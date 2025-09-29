import React from 'react';
import type { AQILevel } from '../types';

interface AQIIndicatorProps {
  aqi: number;
}

export const getAQILevel = (aqi: number): AQILevel => {
  if (aqi <= 50) return { level: 'Good', range: '0-50', color: 'aqi-green-500', textColor: 'text-aqi-green-800', bgColor: 'bg-aqi-green-100', implications: 'Air quality is satisfactory, and air pollution poses little or no risk.' };
  if (aqi <= 100) return { level: 'Moderate', range: '51-100', color: 'aqi-yellow-500', textColor: 'text-aqi-yellow-800', bgColor: 'bg-aqi-yellow-100', implications: 'Air quality is acceptable. However, there may be a risk for some people, particularly those who are unusually sensitive to air pollution.' };
  if (aqi <= 150) return { level: 'Unhealthy for Sensitive Groups', range: '101-150', color: 'aqi-orange-500', textColor: 'text-aqi-orange-800', bgColor: 'bg-aqi-orange-100', implications: 'Members of sensitive groups may experience health effects. The general public is less likely to be affected.' };
  if (aqi <= 200) return { level: 'Unhealthy', range: '151-200', color: 'aqi-red-500', textColor: 'text-aqi-red-800', bgColor: 'bg-aqi-red-100', implications: 'Some members of the general public may experience health effects; members of sensitive groups may experience more serious health effects.' };
  if (aqi <= 300) return { level: 'Very Unhealthy', range: '201-300', color: 'aqi-purple-500', textColor: 'text-aqi-purple-800', bgColor: 'bg-aqi-purple-100', implications: 'Health alert: The risk of health effects is increased for everyone.' };
  return { level: 'Hazardous', range: '301+', color: 'aqi-maroon-500', textColor: 'text-aqi-maroon-800', bgColor: 'bg-aqi-maroon-100', implications: 'Health warning of emergency conditions: everyone is more likely to be affected.' };
};

const AQIIndicator: React.FC<AQIIndicatorProps> = ({ aqi }) => {
  const aqiLevel = getAQILevel(aqi);
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (Math.min(aqi, 301) / 301) * circumference;

  return (
    <div className={`${aqiLevel.bgColor} p-6 rounded-3xl shadow-lg flex flex-col items-center justify-center text-center`}>
      <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-300">Current AQI</h2>
      <div className="relative w-36 h-36 sm:w-40 sm:h-40 my-4">
        <svg className="w-full h-full" viewBox="0 0 120 120">
          <circle className="text-slate-200 dark:text-slate-700" strokeWidth="12" stroke="currentColor" fill="transparent" r="54" cx="60" cy="60" />
          <circle className={`text-${aqiLevel.color} transition-all duration-1000 ease-in-out`} strokeWidth="12" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" stroke="currentColor" fill="transparent" r="54" cx="60" cy="60" style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%' }}/>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-4xl sm:text-5xl font-bold ${aqiLevel.textColor}`}>{aqi}</span>
        </div>
      </div>
      <span className={`text-lg sm:text-xl font-bold ${aqiLevel.textColor}`}>{aqiLevel.level}</span>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-xs">{aqiLevel.implications}</p>
    </div>
  );
};

export default AQIIndicator;