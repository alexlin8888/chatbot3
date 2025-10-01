import type { AQIDataPoint, HourlyForecastData, HistoricalDataPoint, Pollutant } from '../types';
import { Pollutant as PollutantEnum } from '../types';

// 使用 Vercel API 代理
const API_BASE_URL = '/api/openaq';

// 參數名稱映射
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
      // NO2 in ppm, convert to ppb
      const no2_ppb = value * 1000;
      if (no2_ppb <= 53) return Math.round((50 / 53) * no2_ppb);
      if (no2_ppb <= 100) return Math.round(((100 - 51) / (100 - 54)) * (no2_ppb - 54) + 51);
      return Math.min(Math.round(((150 - 101) / (360 - 101)) * (no2_ppb - 101) + 101), 200);
    
    case 'so2':
      // SO2 in ppm, convert to ppb
      const so2_ppb = value * 1000;
      if (so2_ppb <= 35) return Math.round((50 / 35) * so2_ppb);
      if (so2_ppb <= 75) return Math.round(((100 - 51) / (75 - 36)) * (so2_ppb - 36) + 51);
      return Math.min(Math.round(((150 - 101) / (185 - 76)) * (so2_ppb - 76) + 101), 200);
    
    case 'co':
      // CO already in ppm
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

    const url = `${API_BASE_URL}?${searchParams.toString()}`;
    console.log(`🔍 API Request: ${url}`);

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error('❌ Proxy API error:', response.status, errorData);
      throw new Error(`Proxy API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ API Response for ${endpoint}:`, { 
      resultCount: data.results?.length || 0,
      hasResults: !!data.results
    });
    
    return data;
  } catch (error) {
    console.error('❌ Proxy request failed:', error);
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
      console.warn('⚠️ No nearby monitoring stations found');
      return [];
    }
    
    const locations = data.results as OpenAQLocation[];
    locations.sort((a, b) => {
      const distA = calculateDistance(latitude, longitude, a.coordinates.latitude, a.coordinates.longitude);
      const distB = calculateDistance(latitude, longitude, b.coordinates.latitude, b.coordinates.longitude);
      return distA - distB;
    });
    
    console.log(`📍 Found ${locations.length} nearby locations`);
    return locations;
  } catch (error) {
    console.error('Error fetching nearby locations:', error);
    return [];
  }
};

// 🎯 從監測站的 sensors 獲取最新數據
const getDataFromSensors = async (location: OpenAQLocation): Promise<MeasurementData[]> => {
  console.log(`\n🔄 Fetching data from sensors for location: ${location.name} (ID: ${location.id})`);
  
  if (!location.sensors || location.sensors.length === 0) {
    console.log('⚠️ No sensors available for this location');
    return [];
  }

  console.log(`📡 Found ${location.sensors.length} sensors`);
  
  const measurements: MeasurementData[] = [];

  // 過濾出我們需要的參數
  const relevantSensors = location.sensors.filter(sensor => {
    if (!sensor.parameter || !sensor.parameter.name) return false;
    const paramName = sensor.parameter.name.toLowerCase().replace(/[._\s]/g, '');
    return TARGET_PARAMS.includes(paramName);
  });

  console.log(`🎯 ${relevantSensors.length} sensors match our target parameters:`);
  relevantSensors.forEach(s => {
    console.log(`  - Sensor ${s.id}: ${s.parameter?.displayName || s.parameter?.name}`);
  });

  // 為每個相關的 sensor 獲取最新測量值
  for (const sensor of relevantSensors) {
    try {
      const data = await makeProxyRequest(`sensors/${sensor.id}/measurements`, {
        limit: 1  // 只取最新的一筆
      });

      if (!data.results || data.results.length === 0) {
        console.log(`⚠️ No measurements for sensor ${sensor.id} (${sensor.parameter?.displayName})`);
        continue;
      }

      const result = data.results[0];

      // 提取時間
      let ts_utc = '';
      if (result.period?.datetimeFrom?.utc) {
        ts_utc = result.period.datetimeFrom.utc;
      } else if (result.datetime?.utc) {
        ts_utc = result.datetime.utc;
      } else if (result.period?.datetimeTo?.utc) {
        ts_utc = result.period.datetimeTo.utc;
      }

      if (!ts_utc || typeof result.value !== 'number') {
        console.log(`⚠️ Invalid data structure for sensor ${sensor.id}`);
        continue;
      }

      const paramName = sensor.parameter!.name.toLowerCase().replace(/[._\s]/g, '');

      measurements.push({
        parameter: paramName,
        value: result.value,
        units: sensor.parameter!.units,
        ts_utc,
        ts_local: result.period?.datetimeFrom?.local || result.datetime?.local || ''
      });

      console.log(`✅ ${sensor.parameter?.displayName}: ${result.value} ${sensor.parameter?.units} at ${ts_utc}`);
    } catch (error) {
      console.error(`❌ Error fetching sensor ${sensor.id}:`, error);
    }
  }

  console.log(`\n📊 Total measurements collected: ${measurements.length}`);
  return measurements;
};

// 🎯 批次對齊邏輯
const pickBatchNear = (
  data: MeasurementData[], 
  refTime: Date, 
  toleranceMinutes: number
): MeasurementData[] => {
  if (data.length === 0) return [];

  const toleranceMs = toleranceMinutes * 60 * 1000;
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

// 🎯 主函數：獲取最新測量數據
export const getLatestMeasurements = async (
  latitude: number,
  longitude: number
): Promise<AQIDataPoint | null> => {
  try {
    console.log(`\n🌍 ===== Fetching Air Quality for (${latitude.toFixed(4)}, ${longitude.toFixed(4)}) =====`);
    
    // 1. 獲取附近站點（包含 sensors 資訊）
    const locations = await getNearbyLocations(latitude, longitude, 25000);
    
    if (locations.length === 0) {
      console.warn('❌ No nearby monitoring stations found');
      return null;
    }

    // 2. 嘗試從最近的幾個站點獲取數據
    let allMeasurements: MeasurementData[] = [];
    
    for (let i = 0; i < Math.min(3, locations.length); i++) {
      const location = locations[i];
      const distance = calculateDistance(latitude, longitude, location.coordinates.latitude, location.coordinates.longitude);
      
      console.log(`\n📍 Trying location #${i+1}: ${location.name}`);
      console.log(`   Distance: ${distance.toFixed(1)} km`);
      console.log(`   ID: ${location.id}`);
      console.log(`   Last update: ${location.datetimeLast?.utc || 'Unknown'}`);
      
      const measurements = await getDataFromSensors(location);
      
      if (measurements.length > 0) {
        allMeasurements = measurements;
        console.log(`✅ Successfully got ${measurements.length} measurements from this location`);
        break;
      } else {
        console.log(`⚠️ No valid measurements from this location, trying next...`);
      }
    }
    
    if (allMeasurements.length === 0) {
      console.warn('❌ No measurements found from any nearby location');
      return null;
    }

    // 3. 找出最大時間作為批次時間
    const times = allMeasurements.map(m => new Date(m.ts_utc).getTime());
    const maxTime = Math.max(...times);
    const batchTime = new Date(maxTime);
    
    console.log(`\n⏰ Batch reference time: ${batchTime.toISOString()}`);

    // 4. 對齊批次
    let batchData = pickBatchNear(allMeasurements, batchTime, TOL_MINUTES_PRIMARY);
    
    if (batchData.length === 0) {
      console.log(`⚠️ No data within ±${TOL_MINUTES_PRIMARY} minutes, trying ±${TOL_MINUTES_FALLBACK} minutes...`);
      batchData = pickBatchNear(allMeasurements, batchTime, TOL_MINUTES_FALLBACK);
    }

    if (batchData.length === 0) {
      console.warn('❌ No aligned batch data found');
      return null;
    }

    console.log(`\n✅ Aligned batch data (${batchData.length} parameters):`);
    batchData.forEach(m => {
      const timeDiff = Math.abs(new Date(m.ts_utc).getTime() - batchTime.getTime()) / 1000 / 60;
      console.log(`  - ${m.parameter}: ${m.value} ${m.units} (${timeDiff.toFixed(1)} min diff)`);
    });

    // 5. 計算每個污染物的 AQI，找出最大值
    let maxAQI = 0;
    let dominantPollutant = '';
    let dominantValue = 0;
    let dominantTimestamp = batchData[0].ts_utc;

    console.log(`\n🧮 Calculating AQI for each pollutant:`);
    for (const measurement of batchData) {
      const aqi = calculateAQI(measurement.parameter, measurement.value);
      console.log(`  - ${measurement.parameter}: AQI ${aqi} (from ${measurement.value} ${measurement.units})`);
      
      if (aqi > maxAQI) {
        maxAQI = aqi;
        dominantPollutant = measurement.parameter;
        dominantValue = measurement.value;
        dominantTimestamp = measurement.ts_utc;
      }
    }

    console.log(`\n🏆 Final AQI: ${Math.round(maxAQI)}`);
    console.log(`🏆 Dominant pollutant: ${dominantPollutant}`);
    console.log(`===== Air Quality Fetch Complete =====\n`);

    return {
      aqi: Math.round(maxAQI),
      pollutant: mapParameterToPollutant(dominantPollutant),
      concentration: dominantValue,
      timestamp: dominantTimestamp,
    };
  } catch (error) {
    console.error('❌ Fatal error fetching latest measurements:', error);
    return null;
  }
};

// 🎯 獲取歷史數據
export const getHistoricalData = async (
  latitude: number,
  longitude: number
): Promise<HistoricalDataPoint[]> => {
  try {
    console.log(`\n📈 Fetching historical data...`);
    
    const locations = await getNearbyLocations(latitude, longitude, 25000);
    
    if (locations.length === 0) {
      console.warn('No nearby monitoring stations found for historical data');
      return [];
    }

    const location = locations[0];
    
    // 找到 PM2.5 sensor
    const pm25Sensor = location.sensors?.find(s => {
      if (!s.parameter || !s.parameter.name) return false;
      const paramName = s.parameter.name.toLowerCase().replace(/[._\s]/g, '');
      return paramName === 'pm25';
    });

    if (!pm25Sensor) {
      console.warn('No PM2.5 sensor found for historical data');
      return [];
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    try {
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
          const aqi = calculateAQI('pm25', avgValue);
          return { date, aqi: Math.round(aqi) };
        });

      // 按日期排序
      historicalData.sort((a, b) => {
        const dateA = new Date(a.date + ', 2025');
        const dateB = new Date(b.date + ', 2025');
        return dateA.getTime() - dateB.getTime();
      });

      console.log(`✅ Processed ${historicalData.length} days of historical data`);
      return historicalData;
    } catch (error) {
      console.error('Error fetching historical measurements:', error);
      return [];
    }
  } catch (error) {
    console.error('Error in getHistoricalData:', error);
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
