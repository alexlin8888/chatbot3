import type { AQIDataPoint, HourlyForecastData, HistoricalDataPoint, Pollutant } from '../types';
import { Pollutant as PollutantEnum } from '../types';

const API_BASE_URL = '/api/openaq';

// 參數ID對照（對應 Python 的 PARAM_IDS）
const PARAM_IDS: Record<string, number> = {
  'co': 8,
  'no2': 7,
  'o3': 10,
  'pm10': 1,
  'pm25': 2,
  'so2': 9
};

const TARGET_PARAMS = ['co', 'no2', 'o3', 'pm10', 'pm25', 'so2'];

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
    case 'pm25': return PollutantEnum.PM25;
    case 'o3':
    case 'ozone': return PollutantEnum.O3;
    case 'no2': return PollutantEnum.NO2;
    case 'so2': return PollutantEnum.SO2;
    case 'co': return PollutantEnum.CO;
    case 'pm10': return 'PM₁₀' as Pollutant;
    default: return PollutantEnum.PM25;
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
    
    case 'pm10':
      if (value <= 54) return Math.round((50 / 54) * value);
      if (value <= 154) return Math.round(((100 - 51) / (154 - 55)) * (value - 55) + 51);
      if (value <= 254) return Math.round(((150 - 101) / (254 - 155)) * (value - 155) + 101);
      return Math.min(Math.round(((200 - 151) / (354 - 255)) * (value - 255) + 151), 300);
    
    case 'o3':
    case 'ozone':
      const o3_ppm = value / 1000;
      if (o3_ppm <= 0.054) return Math.round((50 / 0.054) * o3_ppm);
      if (o3_ppm <= 0.070) return Math.round(((100 - 51) / (0.070 - 0.055)) * (o3_ppm - 0.055) + 51);
      return Math.min(Math.round(((150 - 101) / (0.085 - 0.071)) * (o3_ppm - 0.071) + 101), 200);
    
    case 'no2':
      if (value <= 53) return Math.round((50 / 53) * value);
      if (value <= 100) return Math.round(((100 - 51) / (100 - 54)) * (value - 54) + 51);
      return Math.min(Math.round(((150 - 101) / (360 - 101)) * (value - 101) + 101), 200);
    
    case 'so2':
      if (value <= 35) return Math.round((50 / 35) * value);
      if (value <= 75) return Math.round(((100 - 51) / (75 - 36)) * (value - 36) + 51);
      return Math.min(Math.round(((150 - 101) / (185 - 76)) * (value - 76) + 101), 200);
    
    case 'co':
      const co_ppm = value / 1000;
      if (co_ppm <= 4.4) return Math.round((50 / 4.4) * co_ppm);
      if (co_ppm <= 9.4) return Math.round(((100 - 51) / (9.4 - 4.5)) * (co_ppm - 4.5) + 51);
      return Math.min(Math.round(((150 - 101) / (12.4 - 9.5)) * (co_ppm - 9.5) + 101), 200);
    
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

    const response = await fetch(`${API_BASE_URL}?${searchParams.toString()}`);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
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

// 提取時間戳（對應 Python 的時間提取邏輯）
const extractTimestamp = (measurement: any): Date | null => {
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

// 批次對齊（對應 Python 的 pick_batch_near）
const pickBatchNear = (
  measurements: any[], 
  referenceTime: Date, 
  toleranceMinutes: number = 5
): any[] => {
  if (!measurements || measurements.length === 0) return [];
  
  const toleranceMs = toleranceMinutes * 60 * 1000;
  const refTime = referenceTime.getTime();
  
  const measurementsWithTime = measurements
    .map(m => {
      const timestamp = extractTimestamp(m);
      if (!timestamp) return null;
      
      const timeDiff = Math.abs(timestamp.getTime() - refTime);
      
      return {
        ...m,
        _timestamp: timestamp,
        _timeDiff: timeDiff
      };
    })
    .filter(m => m !== null && m._timeDiff <= toleranceMs);
  
  if (measurementsWithTime.length === 0) return [];
  
  // 每個參數只保留最接近的一筆
  const paramMap = new Map();
  measurementsWithTime.forEach(m => {
    const paramName = (m.parameter?.name || '').toLowerCase().replace(/[._\s]/g, '');
    if (!paramName) return;
    
    const existing = paramMap.get(paramName);
    if (!existing || m._timeDiff < existing._timeDiff) {
      paramMap.set(paramName, m);
    }
  });
  
  return Array.from(paramMap.values());
};

// 獲取站點最新值列表（對應 Python 的 get_location_latest_df）
const getLocationLatestData = async (locationId: number): Promise<any[]> => {
  try {
    const data = await makeProxyRequest(`locations/${locationId}/latest`, {
      limit: 1000
    });
    
    return data.results || [];
  } catch (error) {
    console.error(`Failed to fetch location latest data:`, error);
    return [];
  }
};

// 通過參數ID獲取最新值（對應 Python 的 get_parameters_latest_df）
const getParametersLatestData = async (
  locationId: number, 
  missingParams: string[]
): Promise<any[]> => {
  const allResults: any[] = [];
  
  for (const param of missingParams) {
    const paramId = PARAM_IDS[param];
    if (!paramId) continue;
    
    try {
      const data = await makeProxyRequest(`parameters/${paramId}/latest`, {
        locationId: locationId,
        limit: 50
      });
      
      if (data.results && data.results.length > 0) {
        // 標記參數名稱
        data.results.forEach((r: any) => {
          if (r.parameter) {
            r.parameter.name = param;
          }
        });
        allResults.push(...data.results);
      }
    } catch (error) {
      console.error(`Failed to fetch parameter ${param}:`, error);
    }
  }
  
  return allResults;
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

// 改進的最新測量獲取（結合 Python 邏輯）
export const getLatestMeasurements = async (
  latitude: number,
  longitude: number
): Promise<AQIDataPoint | null> => {
  try {
    console.log(`🔍 Fetching data for (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
    
    const locations = await getNearbyLocations(latitude, longitude, 25000);
    
    if (locations.length === 0) {
      console.warn('⚠️ No nearby monitoring stations found');
      return null;
    }

    // 嘗試前3個最近的站點
    for (const location of locations.slice(0, 3)) {
      try {
        console.log(`📍 Trying: ${location.name} (ID: ${location.id})`);
        
        // 1) 獲取站點最新值列表
        const locationLatest = await getLocationLatestData(location.id);
        
        if (locationLatest.length === 0) {
          console.log(`  ⚠️ No data from location latest`);
          continue;
        }
        
        console.log(`  ✅ Found ${locationLatest.length} measurements`);
        
        // 2) 找出批次參考時間（最大時間）
        let maxTimestamp: Date | null = null;
        locationLatest.forEach(m => {
          const ts = extractTimestamp(m);
          if (ts && (!maxTimestamp || ts > maxTimestamp)) {
            maxTimestamp = ts;
          }
        });
        
        if (!maxTimestamp) {
          console.log(`  ⚠️ No valid timestamps found`);
          continue;
        }
        
        console.log(`  🕐 Batch time: ${maxTimestamp.toISOString()}`);
        
        // 3) 批次對齊（先用 ±5 分鐘）
        let batchData = pickBatchNear(locationLatest, maxTimestamp, 5);
        
        if (batchData.length === 0) {
          console.log(`  ⏳ Trying 60 min tolerance...`);
          batchData = pickBatchNear(locationLatest, maxTimestamp, 60);
        }
        
        if (batchData.length === 0) {
          console.log(`  ⚠️ No batch-aligned data`);
          continue;
        }
        
        console.log(`  ✅ Batch contains: ${batchData.map(m => m.parameter?.name).join(', ')}`);
        
        // 4) 檢查是否缺少參數
        const haveParams = new Set(
          batchData.map(m => (m.parameter?.name || '').toLowerCase().replace(/[._\s]/g, ''))
        );
        const missingParams = TARGET_PARAMS.filter(p => !haveParams.has(p));
        
        // 5) 如果有缺失，用 /parameters/{pid}/latest 補充
        if (missingParams.length > 0) {
          console.log(`  🔄 Missing params: ${missingParams.join(', ')}, fetching...`);
          
          const paramData = await getParametersLatestData(location.id, missingParams);
          
          if (paramData.length > 0) {
            const paramBatch = pickBatchNear(paramData, maxTimestamp, 5);
            if (paramBatch.length === 0) {
              const paramBatchFallback = pickBatchNear(paramData, maxTimestamp, 60);
              batchData = [...batchData, ...paramBatchFallback];
            } else {
              batchData = [...batchData, ...paramBatch];
            }
            
            console.log(`  ✅ Added ${paramBatch.length || 0} more params`);
          }
        }
        
        // 6) 優先選擇 PM2.5
        const pm25Data = batchData.find(m => {
          const param = (m.parameter?.name || '').toLowerCase().replace(/[._\s]/g, '');
          return param === 'pm25';
        });
        
        const targetData = pm25Data || batchData[0];
        
        if (!targetData || typeof targetData.value !== 'number' || !targetData.parameter) {
          console.log(`  ⚠️ Invalid data structure`);
          continue;
        }

        const timestamp = targetData._timestamp || extractTimestamp(targetData);
        const paramName = targetData.parameter.name;
        const value = targetData.value;
        
        console.log(`✅ Selected: ${paramName} = ${value} at ${timestamp?.toISOString()}`);

        const aqi = calculateAQI(paramName, value);
        const pollutant = mapParameterToPollutant(paramName);

        return {
          aqi,
          pollutant,
          concentration: value,
          timestamp: timestamp?.toISOString() || new Date().toISOString(),
        };
      } catch (error) {
        console.error(`Failed for location ${location.id}:`, error);
        continue;
      }
    }

    console.warn('❌ No valid data from any nearby locations');
    return null;
  } catch (error) {
    console.error('Error fetching latest measurements:', error);
    return null;
  }
};

export const getHistoricalData = async (
  latitude: number,
  longitude: number
): Promise<HistoricalDataPoint[]> => {
  try {
    const locations = await getNearbyLocations(latitude, longitude, 25000);
    
    if (locations.length === 0) {
      return [];
    }

    const location = locations[0];
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
        return [];
      }

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

      return historicalData;
    } catch (error) {
      console.error('Failed to fetch historical data:', error);
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
