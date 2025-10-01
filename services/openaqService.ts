import type { AQIDataPoint, HourlyForecastData, HistoricalDataPoint, Pollutant } from '../types';
import { Pollutant as PollutantEnum } from '../types';

// 使用 Vercel API 代理
const API_BASE_URL = '/api/openaq';

// 參數ID對照（對應 Python 代碼）
const PARAM_IDS: Record<string, number> = {
  'co': 8,
  'no2': 7,
  'o3': 10,
  'pm10': 1,
  'pm25': 2,
  'so2': 9
};

const TARGET_PARAMS = ['co', 'no2', 'o3', 'pm10', 'pm25', 'so2'];

// 時間對齊容忍度（分鐘）
const TOL_MINUTES_PRIMARY = 5;
const TOL_MINUTES_FALLBACK = 60;

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
  datetimeLast?: {
    utc: string;
    local: string;
  };
}

interface MeasurementData {
  parameter: string;
  value: number;
  units: string;
  ts_utc: string;
  ts_local?: string;
}

// 將 OpenAQ 參數轉換為我們的 Pollutant enum
const mapParameterToPollutant = (parameter: string): Pollutant => {
  const param = parameter.toLowerCase().replace(/[._\s]/g, '');
  switch (param) {
    case 'pm25':
      return PollutantEnum.PM25;
    case 'pm10':
      return PollutantEnum.PM25; // 使用 PM2.5 作為後備
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
    
    case 'pm10':
      if (value <= 54) return Math.round((50 / 54) * value);
      if (value <= 154) return Math.round(((100 - 51) / (154 - 55)) * (value - 55) + 51);
      if (value <= 254) return Math.round(((150 - 101) / (254 - 155)) * (value - 155) + 101);
      if (value <= 354) return Math.round(((200 - 151) / (354 - 255)) * (value - 255) + 151);
      return Math.min(Math.round(((300 - 201) / (424 - 355)) * (value - 355) + 201), 300);
    
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
      const co_ppm = value;
      if (co_ppm <= 4.4) return Math.round((50 / 4.4) * co_ppm);
      if (co_ppm <= 9.4) return Math.round(((100 - 51) / (9.4 - 4.5)) * (co_ppm - 4.5) + 51);
      return Math.min(Math.round(((150 - 101) / (12.4 - 9.5)) * (co_ppm - 9.5) + 101), 200);
    
    default:
      return Math.min(Math.round(value * 2), 300);
  }
};

// API 請求幫助函數
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

// 🎯 核心函數：從 /locations/{id}/latest 獲取站點最新值清單
const getLocationLatestData = async (locationId: number): Promise<MeasurementData[]> => {
  try {
    const data = await makeProxyRequest(`locations/${locationId}/latest`, {
      limit: 1000
    });
    
    if (!data.results || data.results.length === 0) {
      return [];
    }

    const measurements: MeasurementData[] = [];
    
    for (const result of data.results) {
      // 提取參數名
      let parameter = '';
      if (result.parameter?.name) {
        parameter = result.parameter.name.toLowerCase().replace(/[._\s]/g, '');
      } else if (result.parameter) {
        parameter = String(result.parameter).toLowerCase().replace(/[._\s]/g, '');
      }

      if (!parameter || typeof result.value !== 'number') continue;

      // 提取時間（優先順序）
      let ts_utc = '';
      if (result.datetime?.utc) {
        ts_utc = result.datetime.utc;
      } else if (result.period?.datetimeTo?.utc) {
        ts_utc = result.period.datetimeTo.utc;
      } else if (result.period?.datetimeFrom?.utc) {
        ts_utc = result.period.datetimeFrom.utc;
      }

      if (!ts_utc) continue;

      let ts_local = '';
      if (result.datetime?.local) {
        ts_local = result.datetime.local;
      } else if (result.period?.datetimeTo?.local) {
        ts_local = result.period.datetimeTo.local;
      } else if (result.period?.datetimeFrom?.local) {
        ts_local = result.period.datetimeFrom.local;
      }

      measurements.push({
        parameter,
        value: result.value,
        units: result.parameter?.units || result.units || '',
        ts_utc,
        ts_local
      });
    }

    return measurements;
  } catch (error) {
    console.error('Error fetching location latest data:', error);
    return [];
  }
};

// 🎯 從 /parameters/{pid}/latest 補充缺失的參數
const getParametersLatestData = async (
  locationId: number, 
  missingParams: string[]
): Promise<MeasurementData[]> => {
  const measurements: MeasurementData[] = [];

  for (const param of missingParams) {
    const paramId = PARAM_IDS[param];
    if (!paramId) continue;

    try {
      const data = await makeProxyRequest(`parameters/${paramId}/latest`, {
        locationId,
        limit: 50
      });

      if (!data.results || data.results.length === 0) continue;

      for (const result of data.results) {
        let ts_utc = '';
        if (result.datetime?.utc) {
          ts_utc = result.datetime.utc;
        } else if (result.period?.datetimeTo?.utc) {
          ts_utc = result.period.datetimeTo.utc;
        } else if (result.period?.datetimeFrom?.utc) {
          ts_utc = result.period.datetimeFrom.utc;
        }

        if (!ts_utc || typeof result.value !== 'number') continue;

        let ts_local = '';
        if (result.datetime?.local) {
          ts_local = result.datetime.local;
        } else if (result.period?.datetimeTo?.local) {
          ts_local = result.period.datetimeTo.local;
        }

        measurements.push({
          parameter: param,
          value: result.value,
          units: result.parameter?.units || result.units || '',
          ts_utc,
          ts_local
        });
      }
    } catch (error) {
      console.error(`Error fetching ${param} data:`, error);
    }
  }

  return measurements;
};

// 🎯 批次對齊邏輯：找到接近參考時間的一批數據
const pickBatchNear = (
  data: MeasurementData[], 
  refTime: Date, 
  toleranceMinutes: number
): MeasurementData[] => {
  if (data.length === 0) return [];

  const toleranceMs = toleranceMinutes * 60 * 1000;
  const result: MeasurementData[] = [];
  const paramMap = new Map<string, MeasurementData>();

  for (const item of data) {
    try {
      const itemTime = new Date(item.ts_utc);
      const timeDiff = Math.abs(itemTime.getTime() - refTime.getTime());

      if (timeDiff <= toleranceMs) {
        const existing = paramMap.get(item.parameter);
        if (!existing) {
          paramMap.set(item.parameter, item);
        } else {
          // 如果已存在，選擇時間更接近的
          const existingDiff = Math.abs(new Date(existing.ts_utc).getTime() - refTime.getTime());
          if (timeDiff < existingDiff) {
            paramMap.set(item.parameter, item);
          }
        }
      }
    } catch (e) {
      console.error('Error parsing time:', e);
    }
  }

  return Array.from(paramMap.values());
};

// 🎯 主函數：獲取最新測量數據（整合 Python 邏輯）
export const getLatestMeasurements = async (
  latitude: number,
  longitude: number
): Promise<AQIDataPoint | null> => {
  try {
    console.log(`Fetching latest measurements for (${latitude}, ${longitude})`);
    
    // 1. 獲取附近站點
    const locations = await getNearbyLocations(latitude, longitude, 25000);
    
    if (locations.length === 0) {
      console.warn('No nearby monitoring stations found');
      return null;
    }

    const location = locations[0];
    console.log(`Using location: ${location.name}, ID: ${location.id}`);
    
    // 2. 獲取站點的最後更新時間
    let refTime = new Date();
    if (location.datetimeLast?.utc) {
      refTime = new Date(location.datetimeLast.utc);
    }

    // 3. 從 /locations/{id}/latest 獲取所有參數的最新值
    let allMeasurements = await getLocationLatestData(location.id);
    
    if (allMeasurements.length === 0) {
      console.warn('No measurements found for location');
      return null;
    }

    // 4. 找出最大時間作為批次時間
    const times = allMeasurements.map(m => new Date(m.ts_utc).getTime());
    const maxTime = Math.max(...times);
    const batchTime = new Date(maxTime);
    
    console.log('Batch reference time:', batchTime.toISOString());

    // 5. 對齊批次：先用 ±5 分鐘找
    let batchData = pickBatchNear(allMeasurements, batchTime, TOL_MINUTES_PRIMARY);
    
    // 如果找不到，放寬到 ±60 分鐘
    if (batchData.length === 0) {
      batchData = pickBatchNear(allMeasurements, batchTime, TOL_MINUTES_FALLBACK);
    }

    // 6. 檢查還缺哪些參數
    const foundParams = new Set(batchData.map(m => m.parameter));
    const missingParams = TARGET_PARAMS.filter(p => !foundParams.has(p));

    // 7. 用 /parameters/{pid}/latest 補充缺失的參數
    if (missingParams.length > 0) {
      console.log('Missing parameters:', missingParams);
      const paramData = await getParametersLatestData(location.id, missingParams);
      
      if (paramData.length > 0) {
        // 對補充的參數也做時間對齊
        const alignedParamData = pickBatchNear(paramData, batchTime, TOL_MINUTES_PRIMARY);
        if (alignedParamData.length === 0) {
          const fallbackData = pickBatchNear(paramData, batchTime, TOL_MINUTES_FALLBACK);
          batchData = [...batchData, ...fallbackData];
        } else {
          batchData = [...batchData, ...alignedParamData];
        }
      }
    }

    if (batchData.length === 0) {
      console.warn('No aligned batch data found');
      return null;
    }

    console.log('Final batch data:', batchData.map(m => `${m.parameter}: ${m.value}`));

    // 8. 計算每個污染物的 AQI，找出最大值
    let maxAQI = 0;
    let dominantPollutant = '';
    let dominantValue = 0;
    let dominantTimestamp = batchData[0].ts_utc;

    for (const measurement of batchData) {
      const aqi = calculateAQI(measurement.parameter, measurement.value);
      if (aqi > maxAQI) {
        maxAQI = aqi;
        dominantPollutant = measurement.parameter;
        dominantValue = measurement.value;
        dominantTimestamp = measurement.ts_utc;
      }
    }

    return {
      aqi: Math.round(maxAQI),
      pollutant: mapParameterToPollutant(dominantPollutant),
      concentration: dominantValue,
      timestamp: dominantTimestamp,
    };
  } catch (error) {
    console.error('Error fetching latest measurements:', error);
    return null;
  }
};

// 🎯 獲取歷史數據
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
    
    // 獲取最新數據以確定主要參數
    const latestData = await getLocationLatestData(location.id);
    if (latestData.length === 0) {
      console.warn('No latest data to determine parameter');
      return [];
    }

    // 優先使用 PM2.5，如果沒有則使用其他參數
    let targetParam = latestData.find(m => m.parameter === 'pm25');
    if (!targetParam) {
      targetParam = latestData.find(m => ['pm10', 'o3', 'no2'].includes(m.parameter));
    }
    if (!targetParam) {
      targetParam = latestData[0];
    }

    const paramId = PARAM_IDS[targetParam.parameter];
    if (!paramId) {
      console.warn('Cannot find parameter ID');
      return [];
    }

    // 計算 30 天前的日期
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const data = await makeProxyRequest(`parameters/${paramId}/measurements`, {
      location_id: location.id,
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

    for (const m of measurements) {
      let timestamp = '';
      if (m.period?.datetimeFrom?.utc) {
        timestamp = m.period.datetimeFrom.utc;
      } else if (m.datetime?.utc) {
        timestamp = m.datetime.utc;
      }
      
      if (!timestamp || typeof m.value !== 'number') continue;

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
    }

    // 計算每日平均 AQI
    const historicalData: HistoricalDataPoint[] = Array.from(dailyData.entries())
      .map(([date, { sum, count }]) => {
        const avgValue = sum / count;
        const aqi = calculateAQI(targetParam!.parameter, avgValue);
        return { date, aqi: Math.round(aqi) };
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
