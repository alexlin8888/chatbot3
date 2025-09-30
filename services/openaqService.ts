import type { AQIDataPoint, HourlyForecastData, HistoricalDataPoint, Pollutant } from '../types';
import { Pollutant as PollutantEnum } from '../types';

// 使用 Vercel API 代理而不是直接調用 OpenAQ
const API_BASE_URL = '/api/openaq';

// OpenAQ API response interfaces
interface OpenAQMeasurement {
  locationId: number;
  location: string;
  parameter: string;
  value: number;
  date: {
    utc: string;
    local: string;
  };
  unit: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  country: string;
  city: string;
}

interface OpenAQLocation {
  id: number;
  name: string;
  locality: string;
  timezone: string;
  country: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
}

// 將 OpenAQ 參數轉換為我們的 Pollutant enum
const mapParameterToPollutant = (parameter: string): Pollutant => {
  switch (parameter.toLowerCase()) {
    case 'pm25':
    case 'pm2.5':
      return PollutantEnum.PM25;
    case 'o3':
      return PollutantEnum.O3;
    case 'no2':
      return PollutantEnum.NO2;
    case 'so2':
      return PollutantEnum.SO2;
    case 'co':
      return PollutantEnum.CO;
    default:
      return PollutantEnum.PM25;
  }
};

// 根據污染物濃度計算 AQI
const calculateAQI = (parameter: string, value: number): number => {
  switch (parameter.toLowerCase()) {
    case 'pm25':
    case 'pm2.5':
      if (value <= 12) return Math.round((50 / 12) * value);
      if (value <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (value - 12.1) + 51);
      if (value <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (value - 35.5) + 101);
      if (value <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (value - 55.5) + 151);
      if (value <= 250.4) return Math.round(((300 - 201) / (250.4 - 150.5)) * (value - 150.5) + 201);
      return Math.round(((500 - 301) / (500.4 - 250.5)) * (value - 250.5) + 301);
    case 'o3':
      const o3_ppm = value / 1000;
      if (o3_ppm <= 0.054) return Math.round((50 / 0.054) * o3_ppm);
      if (o3_ppm <= 0.070) return Math.round(((100 - 51) / (0.070 - 0.055)) * (o3_ppm - 0.055) + 51);
      return Math.min(Math.round(((150 - 101) / (0.085 - 0.071)) * (o3_ppm - 0.071) + 101), 200);
    default:
      return Math.min(Math.round(value * 2), 300);
  }
};

// API 請求幫助函數 - 使用我們的代理
const makeProxyRequest = async (endpoint: string, params: Record<string, string | number>): Promise<any> => {
  try {
    const searchParams = new URLSearchParams();
    searchParams.append('endpoint', endpoint);
    
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, value.toString());
    });

    const response = await fetch(`${API_BASE_URL}?${searchParams.toString()}`);

    if (!response.ok) {
      throw new Error(`Proxy API error: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Proxy request failed:', error);
    throw error;
  }
};

// 獲取附近的監測站
export const getNearbyLocations = async (
  latitude: number,
  longitude: number,
  radius: number = 25000
): Promise<OpenAQLocation[]> => {
  try {
    const data = await makeProxyRequest('locations', {
      coordinates: `${latitude},${longitude}`,
      radius: radius,
      limit: 10,
      order_by: 'distance'
    });
    
    return data.results || [];
  } catch (error) {
    console.error('Error fetching nearby locations:', error);
    return [];
  }
};

// 獲取最新的空氣品質數據
export const getLatestMeasurements = async (
  latitude: number,
  longitude: number
): Promise<AQIDataPoint | null> => {
  try {
    const locations = await getNearbyLocations(latitude, longitude);
    
    if (locations.length === 0) {
      console.warn('No nearby monitoring stations found');
      return null;
    }

    const locationId = locations[0].id;
    
    const data = await makeProxyRequest('latest', {
      location_id: locationId,
      limit: 100
    });
    
    const measurements = data.results || [];

    if (measurements.length === 0) {
      console.warn('No measurements found for location');
      return null;
    }

    // 優先尋找 PM2.5 數據
    let selectedMeasurement = measurements.find((m: OpenAQMeasurement) => 
      m.parameter.toLowerCase() === 'pm25' || m.parameter.toLowerCase() === 'pm2.5'
    ) || measurements[0];

    const aqi = calculateAQI(selectedMeasurement.parameter, selectedMeasurement.value);
    const pollutant = mapParameterToPollutant(selectedMeasurement.parameter);

    return {
      aqi,
      pollutant,
      concentration: selectedMeasurement.value,
      timestamp: selectedMeasurement.date.utc,
    };
  } catch (error) {
    console.error('Error fetching latest measurements:', error);
    return null;
  }
};

// 獲取歷史數據
export const getHistoricalData = async (
  latitude: number,
  longitude: number
): Promise<HistoricalDataPoint[]> => {
  try {
    const locations = await getNearbyLocations(latitude, longitude);
    
    if (locations.length === 0) {
      console.warn('No nearby monitoring stations found for historical data');
      return [];
    }

    const locationId = locations[0].id;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const data = await makeProxyRequest('measurements', {
      location_id: locationId,
      parameter: 'pm25',
      date_from: startDate.toISOString(),
      date_to: endDate.toISOString(),
      limit: 1000,
      order_by: 'datetime'
    });
    
    const measurements = data.results || [];

    if (measurements.length === 0) {
      console.warn('No historical measurements found');
      return [];
    }

    // 按日期分組並計算每日平均
    const dailyAverages: { [key: string]: { total: number; count: number } } = {};

    measurements.forEach((measurement: OpenAQMeasurement) => {
      const date = new Date(measurement.date.utc).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });
      
      if (!dailyAverages[date]) {
        dailyAverages[date] = { total: 0, count: 0 };
      }
      
      const aqi = calculateAQI(measurement.parameter, measurement.value);
      dailyAverages[date].total += aqi;
      dailyAverages[date].count += 1;
    });

    // 轉換為歷史數據格式
    const historicalData: HistoricalDataPoint[] = Object.entries(dailyAverages).map(
      ([date, { total, count }]) => ({
        date,
        aqi: Math.round(total / count),
      })
    );

    // 按日期排序
    historicalData.sort((a, b) => {
      const dateA = new Date(a.date + ', 2024');
      const dateB = new Date(b.date + ', 2024');
      return dateA.getTime() - dateB.getTime();
    });

    return historicalData;
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return [];
  }
};

// 獲取預測數據
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

    // 生成未來24小時預測
    for (let i = 0; i < 24; i++) {
      const hour = new Date(now.getTime() + i * 60 * 60 * 1000);
      
      // 模擬日間變化模式
      let variation = (Math.random() - 0.5) * 20;
      const hourOfDay = hour.getHours();
      
      if (hourOfDay >= 6 && hourOfDay <= 10) {
        variation -= 10; // 早晨空氣較好
      } else if (hourOfDay >= 14 && hourOfDay <= 18) {
        variation += 15; // 下午污染較重
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

    return forecastData;
  } catch (error) {
    console.error('Error generating forecast data:', error);
    return [];
  }
};

// 反向地理編碼
export const getLocationName = async (latitude: number, longitude: number): Promise<string> => {
  try {
    const locations = await getNearbyLocations(latitude, longitude);
    
    if (locations.length > 0) {
      const location = locations[0];
      const locality = location.locality || location.name || 'Unknown';
      const country = location.country || 'Unknown';
      return `${locality}, ${country}`;
    }
    
    return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
  } catch (error) {
    console.error('Error getting location name:', error);
    return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
  }
};
