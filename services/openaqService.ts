import type { AQIDataPoint, HourlyForecastData, HistoricalDataPoint, Pollutant } from '../types';
import { Pollutant as PollutantEnum } from '../types';

const API_BASE_URL = '/api/openaq';

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
}

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

const makeProxyRequest = async (endpoint: string, params: Record<string, string | number> = {}): Promise<any> => {
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

// 🎯 修正：更穩健的時間提取
const extractTimestamp = (measurement: any): Date | null => {
  // 嘗試多個可能的時間字段
  const tryFields = [
    measurement.datetime?.utc,
    measurement.period?.datetimeTo?.utc,
    measurement.period?.datetimeFrom?.utc,
  ];
  
  for (const field of tryFields) {
    if (field) {
      const date = new Date(field);
      if (!isNaN(date.getTime())) {
        return date;
      }
    }
  }
  
  return null;
};

// 🎯 修正：批次對齊邏輯
const pickBatchNear = (
  measurements: any[], 
  referenceTime: Date, 
  toleranceMinutes: number = 5
): any[] => {
  if (!measurements || measurements.length === 0) {
    console.log('pickBatchNear: No measurements provided');
    return [];
  }
  
  const toleranceMs = toleranceMinutes * 60 * 1000;
  const refTime = referenceTime.getTime();
  
  console.log(`pickBatchNear: Looking for data within ±${toleranceMinutes} min of ${referenceTime.toISOString()}`);
  
  // 添加時間戳和時間差到每個測量
  const measurementsWithTime = measurements.map(m => {
    const timestamp = extractTimestamp(m);
    if (!timestamp) {
      console.log('No valid timestamp for measurement:', m.parameter?.name);
      return null;
    }
    
    const timeDiff = Math.abs(timestamp.getTime() - refTime);
    
    console.log(`  - ${m.parameter?.name}: ${timestamp.toISOString()}, diff: ${Math.round(timeDiff/1000/60)} min`);
    
    return {
      ...m,
      _timestamp: timestamp,
      _timeDiff: timeDiff
    };
  }).filter(m => m !== null && m._timeDiff <= toleranceMs);
  
  console.log(`Found ${measurementsWithTime.length} measurements within tolerance`);
  
  if (measurementsWithTime.length === 0) return [];
  
  // 每個參數只保留最接近的一筆
  const paramMap = new Map();
  measurementsWithTime.forEach(m => {
    const paramName = m.parameter?.name?.toLowerCase().replace(/[._\s]/g, '') || '';
    if (!paramName) return;
    
    const existing = paramMap.get(paramName);
    if (!existing || m._timeDiff < existing._timeDiff) {
      paramMap.set(paramName, m);
    }
  });
  
  const result = Array.from(paramMap.values());
  console.log(`After dedup: ${result.length} unique parameters`);
  
  return result;
};

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

    for (const location of locations.slice(0, 3)) {
      try {
        console.log(`Trying location: ${location.name}, ID: ${location.id}`);
        
        const data = await makeProxyRequest(`locations/${location.id}/latest`, {
          limit: 1000
        });
        
        if (!data.results || data.results.length === 0) {
          console.log(`No latest data for location ${location.id}`);
          continue;
        }

        console.log(`Found ${data.results.length} measurements from /locations/${location.id}/latest`);
        
        // 找出批次參考時間
        let maxTimestamp: Date | null = null;
        data.results.forEach((m: any) => {
          const ts = extractTimestamp(m);
          if (ts && (!maxTimestamp || ts > maxTimestamp)) {
            maxTimestamp = ts;
          }
        });
        
        if (!maxTimestamp) {
          console.warn(`No valid timestamps found for location ${location.id}`);
          continue;
        }
        
        console.log(`Batch reference time: ${maxTimestamp.toISOString()}`);
        
        // 批次對齊
        let batchData = pickBatchNear(data.results, maxTimestamp, 5);
        
        if (batchData.length === 0) {
          console.log('No data within 5 minutes, trying 60 minutes tolerance');
          batchData = pickBatchNear(data.results, maxTimestamp, 60);
        }
        
        if (batchData.length === 0) {
          console.warn(`No batch-aligned data found for location ${location.id}`);
          continue;
        }
        
        console.log(`Found ${batchData.length} batch-aligned measurements:`, 
          batchData.map(m => m.parameter?.name).join(', '));
        
        // 優先選擇 PM2.5
        const pm25Data = batchData.find(m => {
          const param = m.parameter?.name?.toLowerCase().replace(/[._\s]/g, '');
          return param === 'pm25';
        });
        
        const targetData = pm25Data || batchData[0];
        
        if (!targetData || typeof targetData.value !== 'number' || !targetData.parameter) {
          console.log(`Invalid data structure for location ${location.id}`);
          continue;
        }

        const timestamp = targetData._timestamp || extractTimestamp(targetData);
        
        console.log('✅ Selected measurement:', {
          location: location.name,
          parameter: targetData.parameter.name,
          value: targetData.value,
          timestamp: timestamp?.toISOString()
        });

        const aqi = calculateAQI(targetData.parameter.name, targetData.value);
        const pollutant = mapParameterToPollutant(targetData.parameter.name);

        return {
          aqi,
          pollutant,
          concentration: targetData.value,
          timestamp: timestamp?.toISOString() || new Date().toISOString(),
        };
      } catch (error) {
        console.error(`Failed to fetch data for location ${location.id}:`, error);
        continue;
      }
    }

    console.warn('No valid data found from any nearby locations');
    return null;
  } catch (error) {
    console.error('Error fetching latest measurements:', error);
    return null;
  }
};

// 🎯 修正：歷史數據使用簡化方法
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
    console.log(`Fetching historical data for location: ${location.name} (${location.id})`);

    // 🎯 改用 /parameters/{id}/measurements 方式
    // PM2.5 的參數 ID 是 2
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    try {
      const data = await makeProxyRequest(`parameters/2/measurements`, {
        locationId: location.id,
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
        const timestamp = extractTimestamp(m);
        if (!timestamp || typeof m.value !== 'number') return;

        const date = timestamp.toLocaleDateString('en-US', { 
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

      const historicalData: HistoricalDataPoint[] = Array.from(dailyData.entries())
        .map(([date, { sum, count }]) => {
          const avgValue = sum / count;
          const aqi = calculateAQI('pm25', avgValue);
          return { date, aqi };
        });

      historicalData.sort((a, b) => {
        const dateA = new Date(a.date + ', 2025');
        const dateB = new Date(b.date + ', 2025');
        return dateA.getTime() - dateB.getTime();
      });

      console.log(`✅ Processed ${historicalData.length} days of historical data`);
      return historicalData;
    } catch (error) {
      console.error('Failed to fetch via parameters endpoint:', error);
      // 返回空數組而不是拋出錯誤
      return [];
    }
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return [];
  }
};

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
