import React from 'react';
import type { AQILevel } from '../types';

interface AQIIndicatorProps {
  aqi: number;
}

export const getAQILevel = (aqi: number): AQILevel => {
  if (aqi <= 50) return { 
    level: 'Good', 
    range: '0-50', 
    color: 'from-green-400 to-emerald-500', 
    textColor: 'text-green-700 dark:text-green-400', 
    bgColor: 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20', 
    implications: 'Air quality is satisfactory, and air pollution poses little or no risk.' 
  };
  if (aqi <= 100) return { 
    level: 'Moderate', 
    range: '51-100', 
    color: 'from-yellow-400 to-amber-500', 
    textColor: 'text-yellow-700 dark:text-yellow-400', 
    bgColor: 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20', 
    implications: 'Air quality is acceptable. However, there may be a risk for some people.' 
  };
  if (aqi <= 150) return { 
    level: 'Unhealthy for Sensitive Groups', 
    range: '101-150', 
    color: 'from-orange-400 to-orange-600', 
    textColor: 'text-orange-700 dark:text-orange-400', 
    bgColor: 'bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-900/30', 
    implications: 'Members of sensitive groups may experience health effects.' 
  };
  if (aqi <= 200) return { 
    level: 'Unhealthy', 
    range: '151-200', 
    color: 'from-red-400 to-red-600', 
    textColor: 'text-red-700 dark:text-red-400', 
    bgColor: 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/30', 
    implications: 'Some members of the general public may experience health effects.' 
  };
  if (aqi <= 300) return { 
    level: 'Very Unhealthy', 
    range: '201-300', 
    color: 'from-purple-400 to-purple-600', 
    textColor: 'text-purple-700 dark:text-purple-400', 
    bgColor: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/30', 
    implications: 'Health alert: The risk of health effects is increased for everyone.' 
  };
  return { 
    level: 'Hazardous', 
    range: '301+', 
    color: 'from-rose-600 to-red-800', 
    textColor: 'text-rose-800 dark:text-rose-400', 
    bgColor: 'bg-gradient-to-br from-rose-50 to-red-100 dark:from-rose-900/20 dark:to-red-900/30', 
    implications: 'Health warning: everyone is more likely to be affected.' 
  };
};

const AQIIndicator: React.FC<AQIIndicatorProps> = ({ aqi }) => {
  const aqiLevel = getAQILevel(aqi);
  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (Math.min(aqi, 301) / 301) * circumference;

  // 從顏色字符串中提取實際的顏色值
  const getGradientColors = (colorString: string) => {
    const colorMap: { [key: string]: string } = {
      'green-400': '#4ade80',
      'emerald-500': '#10b981',
      'yellow-400': '#facc15',
      'amber-500': '#f59e0b',
      'orange-400': '#fb923c',
      'orange-600': '#ea580c',
      'red-400': '#f87171',
      'red-600': '#dc2626',
      'purple-400': '#c084fc',
      'purple-600': '#9333ea',
      'rose-600': '#e11d48',
      'red-800': '#991b1b',
    };

    const parts = colorString.split(' ');
    const fromColor = parts[0]?.replace('from-', '') || 'green-400';
    const toColor = parts[1]?.replace('to-', '') || 'emerald-500';
    
    return {
      start: colorMap[fromColor] || '#10b981',
      end: colorMap[toColor] || '#10b981'
    };
  };

  const gradientColors = getGradientColors(aqiLevel.color);

  return (
    <div className={`${aqiLevel.bgColor} backdrop-blur-xl border border-white/20 dark:border-slate-700/50 p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300`}>
      <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 text-center mb-6">Current AQI</h2>
      
      {/* Circular Progress */}
      <div className="relative w-48 h-48 mx-auto my-6">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
          <defs>
            <linearGradient id={`gradient-${aqi}`} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={gradientColors.start} />
              <stop offset="100%" stopColor={gradientColors.end} />
            </linearGradient>
          </defs>
          
          {/* Background circle */}
          <circle 
            className="text-slate-200/50 dark:text-slate-700/50" 
            strokeWidth="14" 
            stroke="currentColor" 
            fill="transparent" 
            r="70" 
            cx="80" 
            cy="80" 
          />
          
          {/* Progress circle */}
          <circle 
            className="transition-all duration-1000 ease-out"
            strokeWidth="14" 
            strokeDasharray={circumference} 
            strokeDashoffset={strokeDashoffset} 
            strokeLinecap="round" 
            stroke={`url(#gradient-${aqi})`}
            fill="transparent" 
            r="70" 
            cx="80" 
            cy="80" 
          />
        </svg>
        
        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-6xl font-black ${aqiLevel.textColor} mb-1`}>{aqi}</span>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">AQI</span>
        </div>
      </div>

      {/* Status */}
      <div className="text-center">
        <div className={`inline-block px-6 py-3 rounded-2xl ${aqiLevel.bgColor} border border-slate-200/50 dark:border-slate-600/50 mb-4`}>
          <span className={`text-lg font-bold ${aqiLevel.textColor}`}>{aqiLevel.level}</span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
          {aqiLevel.implications}
        </p>
      </div>
    </div>
  );
};

export default AQIIndicator;
