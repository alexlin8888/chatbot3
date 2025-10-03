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
      return PollutantEnum.PM25; // 注意：這裡保持與之前一致，但可以考慮修改
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
    console.log(`\n🐍 呼叫 Python API 於 (${latitude.toFixed(4)}, ${longitude.toFixed(4)})`);
    
    const response = await fetch(`${PYTHON_API_URL}?lat=${latitude}&lon=${longitude}`);
    
    if (!response.ok) {
      console.error('❌ Python API 錯誤:', response.status);
      return null;
    }

    const data = await response.json();
    
    if (data.error) {
      console.error('❌ Python API 返回錯誤:', data.error);
      return null;
    }

    if (!data.success) {
      console.error('❌ Python API 失敗');
      return null;
    }

    console.log(`✅ Python API 成功:`);
    console.log(`   地點: ${data.location.name}`);
    console.log(`   AQI: ${data.aqi}`);
    console.log(`   主要污染物: ${data.pollutant}`);
    console.log(`   濃度: ${data.concentration}`);
    console.log(`   測量值數量: ${data.measurements.length}`);
    console.log(`   時間戳: ${data.timestamp}`);

    return {
      aqi: data.aqi,
      pollutant: mapParameterToPollutant(data.pollutant),
      concentration: data.concentration,
      timestamp: data.timestamp,
    };
  } catch (error) {
    console.error('❌ 呼叫 Python API 致命錯誤:', error);
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

    console.log(`✅ 生成 ${historicalData.length} 天的歷史數據`);
    return historicalData;
  } catch (error) {
    console.error('生成歷史數據錯誤:', error);
    return [];
  }
};

export const getForecastData = async (
  latitude: number,
  longitude: number
): Promise<HourlyForecastData[]> => {
  try {
    console.log('🔮 調用模型預測 API...');
    
    // 調用新的預測端點
    const response = await fetch(`/api/forecast?hours=12`);
    
    if (!response.ok) {
      console.error('預測 API 錯誤:', response.status);
      throw new Error('預測失敗');
    }

    const data = await response.json();
    
    if (!data.success || !data.predictions) {
      throw new Error('無效的預測數據');
    }

    // 轉換為前端格式
    const forecastData: HourlyForecastData[] = data.predictions.map((pred: any) => ({
      hour: pred.hour,
      aqi: pred.aqi || 0,
      pollutant: PollutantEnum.PM25, // 可以根據 pollutants 中的最高值決定
      concentration: pred.pollutants?.pm25 || 0,
      timestamp: pred.timestamp,
    }));

    console.log(`✅ 成功獲取 ${forecastData.length} 小時預測`);
    return forecastData;

  } catch (error) {
    console.error('預測數據獲取錯誤:', error);
    
    // 降級方案：使用當前 AQI 生成簡單預測
    const latest = await getLatestMeasurements(latitude, longitude);
    if (!latest) return [];

    const forecastData: HourlyForecastData[] = [];
    const now = new Date();

    for (let i = 0; i < 12; i++) {
      const hour = new Date(now.getTime() + i * 60 * 60 * 1000);
      const variation = (Math.random() - 0.5) * 20;
      const predictedAQI = Math.max(10, Math.min(300, latest.aqi + variation));
      
      forecastData.push({
        hour: hour.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        aqi: Math.round(predictedAQI),
        pollutant: latest.pollutant,
        concentration: latest.concentration * (predictedAQI / latest.aqi),
        timestamp: hour.toISOString(),
      });
    }

    console.log('⚠️ 使用降級預測');
    return forecastData;
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
        const name = data.location.name || '未知地點';
        cachedLocationName = name;
        return name;
      }
    }
    
    return `緯度: ${latitude.toFixed(2)}, 經度: ${longitude.toFixed(2)}`;
  } catch (error) {
    console.error('獲取地點名稱錯誤:', error);
    return `緯度: ${latitude.toFixed(2)}, 經度: ${longitude.toFixed(2)}`;
  }
};
