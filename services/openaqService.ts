import type { AQIDataPoint, HourlyForecastData, HistoricalDataPoint, Pollutant } from '../types';
import { Pollutant as PollutantEnum } from '../types';

// Python API 端點
const PYTHON_API_URL = '/api/airquality';

// 將參數名轉換為 Pollutant enum
const mapParameterToPollutant = (parameter: string): Pollutant => {
  const param = parameter.toUpperCase();
  switch (param) {
    case 'PM25':
    case 'PM2.5':
      return PollutantEnum.PM25;
    case 'PM10':
      return PollutantEnum.PM25;
    case 'O3':
      return PollutantEnum.O3;
    case 'NO2':
      return PollutantEnum.NO2;
    case 'SO2':
      return PollutantEnum.SO2;
    case 'CO':
      return PollutantEnum.CO;
    default:
      return PollutantEnum.PM25;
  }
};

// 主函數：獲取最新測量數據（呼叫 Python API）
export const getLatestMeasurements = async (
  latitude: number,
  longitude: number
): Promise<AQIDataPoint | null> => {
  try {
    console.log(`\n🐍 Calling Python API for (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
    
    const response = await fetch(`${PYTHON_API_URL}?lat=${latitude}&lon=${longitude}`);
    
    if (!response.ok) {
      console.error('❌ Python API error:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.error) {
      console.error('❌ Python API returned error:', data.error);
      return null;
    }

    if (!data.success) {
      console.error('❌ Python API failed');
      return null;
    }

    console.log(`✅ Python API success:`);
    console.log(`   Location: ${data.location.name}`);
    console.log(`   AQI: ${data.aqi}`);
    console.log(`   Dominant: ${data.pollutant}`);
    console.log(`   Measurements: ${data.measurements.length}`);

    return {
      aqi: data.aqi,
      pollutant: mapParameterToPollutant(data.pollutant),
      concentration: data.concentration,
      timestamp: data.timestamp,
    };
  } catch (error) {
    console.error('❌ Fatal error calling Python API:', error);
    return null;
  }
};

// 歷史數據 - 生成模擬數據
export const getHistoricalData = async (
  latitude: number,
  longitude: number
): Promise<HistoricalDataPoint[]> => {
  try {
    const latest = await getLatestMeasurements(latitude, longitude);
    
    if (!latest) {
      return [];
    }

    const historicalData: HistoricalDataPoint[] = [];
    const today = new Date();
    
    // 生成過去 30 天的模擬數據（基於當前 AQI 波動）
    for (let i = 29; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      
      const dateStr = date.toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      // 在實際 AQI 附近波動
      const variation = (Math.random() - 0.5) * 40;
      const aqi = Math.max(10, Math.min(300, latest.aqi + variation));
      
      historicalData.push({
        date: dateStr,
        aqi: Math.round(aqi)
      });
    }

    console.log(`✅ Generated ${historicalData.length} days of historical data`);
    return historicalData;
  } catch (error) {
    console.error('Error generating historical data:', error);
    return [];
  }
};

// 預測數據
export const getForecastData = async (
  latitude: number,
  longitude: number
): Promise<HourlyForecastData[]> => {
  try {
    const latest = await getLatestMeasurements(latitude, longitude);
    
    if (!latest) {
      console.warn('No latest measurements available for forecast');
      return [];
    }

    const forecastData: HourlyForecastData[] = [];
    const now = new Date();

    for (let i = 0; i < 24; i++) {
      const hour = new Date(now.getTime() + i * 60 * 60 * 1000);
      let variation = (Math.random() - 0.5) * 20;
      const hourOfDay = hour.getHours();
      
      // 根據時段調整
      if (hourOfDay >= 6 && hourOfDay <= 10) {
        variation -= 10; // 早上空氣較好
      } else if (hourOfDay >= 14 && hourOfDay <= 18) {
        variation += 15; // 下午交通尖峰
      }
      
      const predictedAQI = Math.max(10, Math.min(300, latest.aqi + variation));
      
      forecastData.push({
        hour: hour.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        aqi: Math.round(predictedAQI),
        pollutant: latest.pollutant,
        concentration: latest.concentration * (predictedAQI / latest.aqi),
        timestamp: hour.toISOString(),
      });
    }

    console.log(`✅ Generated ${forecastData.length} hours of forecast data`);
    return forecastData;
  } catch (error) {
    console.error('Error generating forecast data:', error);
    return [];
  }
};

// 地點名稱 - 從 Python API 結果中獲取
let cachedLocationName: string | null = null;

export const getLocationName = async (latitude: number, longitude: number): Promise<string> => {
  try {
    // 清除快取（當座標改變時）
    cachedLocationName = null;

    const response = await fetch(`${PYTHON_API_URL}?lat=${latitude}&lon=${longitude}`);
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.location) {
        const name = data.location.name || 'Unknown';
        cachedLocationName = name;
        return name;
      }
    }
    
    return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
  } catch (error) {
    console.error('Error getting location name:', error);
    return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
  }
};
