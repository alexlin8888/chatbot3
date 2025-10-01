import type { AQIDataPoint, HourlyForecastData, HistoricalDataPoint, Pollutant } from '../types';
import { Pollutant as PollutantEnum } from '../types';

// 使用 Vercel API 代理
const API_BASE_URL = '/api/openaq';

// OpenAQ API response interfaces
interface OpenAQLocation {
  id: number;
  name: string;
  locality?: string;
  timezone?: string;
  country?: {
    id: number;
    code: string;
    name: string;
  };
  coordinates: {
    latitude: number;
    longitude: number;
  };
  sensors?: Array<{
    id: number;
    name: string;
    parameter?: {
      id: number;
      name: string;
      units: string;
      displayName?: string;
    };
  }>;
}

// 將 OpenAQ 參數轉換為我們的 Pollutant enum
const mapParameterToPollutant = (parameter: string): Pollutant => {
  const param = parameter.toLowerCase().replace(/[._\s]/g, '');
  switch (param) {
    case 'pm25':
      return PollutantEnum.PM25;
    case 'o3':
    case 'ozone':
      return PollutantEnum.O3;
    case 'no2':
    case 'nitrogendioxide':
      return PollutantEnum.NO2;
    case 'so2':
    case 'sulfurdioxide':
      return PollutantEnum.SO2;
    case 'co':
    case 'carbonmonoxide':
      return PollutantEnum.CO;
    default:
      return PollutantEnum.PM25;
  }
};

// 根據污染物濃度計算 AQI
const calculateAQI = (parameter: string, value: number): number => {
  const param = parameter.toLowerCase().replace(/[._\s]/g, '');
  
  switch (param) {
    case 'pm25':
      if (value <= 12) return Math.round((50 / 12) * value);
      if (value <= 35.4) return Math.round(((100 - 51) / (35.4 - 12.1)) * (value - 12.1) + 51);
      if (value <= 55.4) return Math.round(((150 - 101) / (55.4 - 35.5)) * (value - 35.5) + 101);
      if (value <= 150.4) return Math.round(((200 - 151) / (150.4 - 55.5)) * (value - 55.5) + 151);
      if (value <= 250.4) return Math.round(((300 - 201) / (250.4 - 150.5)) * (value - 150.5) + 201);
      return Math.round(((500 - 301) / (500.4 - 250.5)) * (value - 250.5) + 301);
    
    case 'o3':
    case 'ozone':
      const o3_ppm = value / 1000;
      if (o3_ppm <= 0.054) return Math.round((50 / 0.054) * o3_ppm);
      if (o3_ppm <= 0.070) return Math.round(((100 - 51) / (0.070 - 0.055)) * (o3_ppm - 0.055) + 51);
      return Math.min(Math.round(((150 - 101) / (0.085 - 0.071)) * (o3_ppm - 0.071) + 101), 200);
    
    default:
      return Math.min(Math.round(value * 2), 300);
  }
};

// API 請求幫助函數
const makeProxyRequest = async (endpoint: string, params: Record<string, string | number>): Promise<any> => {
  try {
    const searchParams = new URLSearchParams();
    searchParams.append('endpoint', endpoint);
    
    Object.entries(params).forEach(([key, value]) => {
      searchParams.append(key, value.toString());
    });

    console.log(`Making request to: ${API_BASE_URL}?${searchParams.toString()}`);

    const response = await fetch(`${API_BASE_URL}?${searchParams.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('Proxy API error:', response.status, errorData);
      throw new Error(`Proxy API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('Proxy response:', { 
      endpoint, 
      resultCount: data.results?.length || 0,
      meta: data.meta 
    });
    
    return data;
  } catch (error) {
    console.error('Proxy request failed:', error);
    throw error;
  }
};

// 計算兩點之間的距離(公里)
const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
};

// 獲取附近的監測站
export const getNearbyLocations = async (
  latitude: number,
  longitude: number,
  radius: number = 25000
): Promise<OpenAQLocation[]> => {
  try {
    const validRadius = Math.min(radius, 25000);
    
    const data = await makeProxyRequest('locations', {
      coordinates: `${latitude},${longitude}`,
      radius: validRadius,
      limit: 10,
    });
    
    if (!data.results || data.results.length === 0) {
      console.warn('No nearby monitoring stations found');
      return [];
    }
    
    const locations = data.results as OpenAQLocation[];
    locations.sort((a, b) => {
      const distA = calculateDistance(latitude, longitude, a.coordinates.latitude, a.coordinates.longitude);
      const distB = calculateDistance(latitude, longitude, b.coordinates.latitude, b.coordinates.longitude);
      return distA - distB;
    });
    
    return locations;
  } catch (error) {
    console.error('Error fetching nearby locations:', error);
    return [];
  }
};

// 🎯 獲取最新的空氣品質數據 - 使用 /sensors/{id}/measurements 端點
export const getLatestMeasurements = async (
  latitude: number,
  longitude: number
): Promise<AQIDataPoint | null> => {
  try {
    console.log(`Fetching latest measurements for (${latitude}, ${longitude})`);
    
    const locations = await getNearbyLocations(latitude, longitude, 25000);
    
    if (locations.length === 0) {
      console.warn('No nearby monitoring stations found');
      return null;
    }

    const location = locations[0];
    console.log(`Using location: ${location.name}, ID: ${location.id}`);
    
    // 檢查是否有 sensors
    if (!location.sensors || location.sensors.length === 0) {
      console.warn('No sensors found for this location');
      return null;
    }

    // 尋找 PM2.5 sensor
    const pm25Sensor = location.sensors.find(s => {
      if (!s.parameter || !s.parameter.name) return false;
      const param = s.parameter.name.toLowerCase().replace(/[._\s]/g, '');
      return param === 'pm25';
    });

    // 如果沒有 PM2.5,使用第一個有效的 sensor
    const targetSensor = pm25Sensor || location.sensors.find(s => s.parameter && s.parameter.name);

    if (!targetSensor || !targetSensor.parameter) {
      console.warn('No valid sensor found');
      return null;
    }

    console.log('Using sensor:', targetSensor.id, targetSensor.parameter.displayName);

    // 🎯 關鍵: 使用 /sensors/{id}/measurements 端點取得最新數據
    const data = await makeProxyRequest(`sensors/${targetSensor.id}/measurements`, {
      limit: 1  // 只取最新的一筆
    });
    
    const measurements = data.results || [];

    if (measurements.length === 0) {
      console.warn('No measurements found for sensor');
      return null;
    }

    const measurement = measurements[0];
    
    // 從 period.datetimeFrom 取得時間
    const timestamp = measurement.period?.datetimeFrom?.utc || 
                     measurement.datetime?.utc || 
                     new Date().toISOString();

    console.log('Latest measurement:', {
      parameter: targetSensor.parameter.name,
      value: measurement.value,
      timestamp: timestamp
    });

    const aqi = calculateAQI(targetSensor.parameter.name, measurement.value);
    const pollutant = mapParameterToPollutant(targetSensor.parameter.name);

    return {
      aqi,
      pollutant,
      concentration: measurement.value,
      timestamp,
    };
  } catch (error) {
    console.error('Error fetching latest measurements:', error);
    return null;
  }
};

// 🎯 獲取歷史數據 - 使用 /sensors/{id}/measurements 端點
export const getHistoricalData = async (
  latitude: number,
  longitude: number
): Promise<HistoricalDataPoint[]> => {
  try {
    const locations = await getNearbyLocations(latitude, longitude, 25000);
    
    if (locations.length === 0) {
      console.warn('No nearby monitoring stations found for historical data');
      return [];
    }

    const location = locations[0];
    
    // 找到 PM2.5 sensor
    const pm25Sensor = location.sensors?.find(s => {
      if (!s.parameter || !s.parameter.name) return false;
      return s.parameter.name.toLowerCase().replace(/[._\s]/g, '') === 'pm25';
    });
    
    if (!pm25Sensor || !pm25Sensor.parameter) {
      console.warn('No PM2.5 sensor found for location');
      return [];
    }

    const parameterName = pm25Sensor.parameter.name;

    // 計算 30 天前的日期
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    // 🎯 使用 /sensors/{id}/measurements 端點
    const data = await makeProxyRequest(`sensors/${pm25Sensor.id}/measurements`, {
      limit: 1000,
      date_from: startDate.toISOString(),
      date_to: endDate.toISOString()
    });
    
    const measurements = data.results || [];

    if (measurements.length === 0) {
      console.warn('No historical measurements found');
      return [];
    }

    console.log(`Found ${measurements.length} historical measurements`);

    // 按日期分組並計算每日平均
    const dailyData = new Map<string, { sum: number; count: number }>();

    measurements.forEach((m: any) => {
      // 從 period.datetimeFrom 取得時間
      const timestamp = m.period?.datetimeFrom?.utc || m.datetime?.utc;
      if (!timestamp || typeof m.value !== 'number') return;

      const date = new Date(timestamp).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric' 
      });

      if (!dailyData.has(date)) {
        dailyData.set(date, { sum: 0, count: 0 });
      }

      const current = dailyData.get(date)!;
      current.sum += m.value;
      current.count += 1;
    });

    // 計算每日平均 AQI
    const historicalData: HistoricalDataPoint[] = Array.from(dailyData.entries())
      .map(([date, { sum, count }]) => {
        const avgValue = sum / count;
        const aqi = calculateAQI(parameterName, avgValue);
        return { date, aqi };
      });

    // 按日期排序
    historicalData.sort((a, b) => {
      const dateA = new Date(a.date + ', 2025');
      const dateB = new Date(b.date + ', 2025');
      return dateA.getTime() - dateB.getTime();
    });

    console.log(`Processed ${historicalData.length} days of historical data`);
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

    for (let i = 0; i < 24; i++) {
      const hour = new Date(now.getTime() + i * 60 * 60 * 1000);
      let variation = (Math.random() - 0.5) * 20;
      const hourOfDay = hour.getHours();
      
      if (hourOfDay >= 6 && hourOfDay <= 10) {
        variation -= 10;
      } else if (hourOfDay >= 14 && hourOfDay <= 18) {
        variation += 15;
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
    const locations = await getNearbyLocations(latitude, longitude, 25000);
    
    if (locations.length > 0) {
      const location = locations[0];
      const locality = location.locality || location.name || 'Unknown';
      const countryName = location.country?.name || 'Unknown';
      return `${locality}, ${countryName}`;
    }
    
    return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
  } catch (error) {
    console.error('Error getting location name:', error);
    return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
  }
};
