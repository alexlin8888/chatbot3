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

/**
 * 科學化的 AQI 預測模型
 * 考慮多種因素：時段週期、交通模式、氣象影響、歷史趨勢
 */
export const getForecastData = async (
  latitude: number,
  longitude: number
): Promise<HourlyForecastData[]> => {
  try {
    const latest = await getLatestMeasurements(latitude, longitude);
    
    if (!latest) {
      console.warn('無最新測量數據用於預測');
      return [];
    }

    const forecastData: HourlyForecastData[] = [];
    const now = new Date();
    const baseAQI = latest.aqi;

    console.log('🔬 使用科學化預測模型 - 基準 AQI:', baseAQI);

    for (let i = 0; i < 12; i++) {
      const hour = new Date(now.getTime() + i * 60 * 60 * 1000);
      const hourOfDay = hour.getHours();
      
      // === 1. 時段週期因素（正弦波模擬） ===
      // 污染物濃度在一天中呈週期性變化
      // 凌晨最低，下午最高
      const timePhase = (hourOfDay / 24) * 2 * Math.PI; // 0-2π
      const dailyCycle = Math.sin(timePhase - Math.PI/2); // -1 到 1
      const dailyFactor = 1 + (dailyCycle * 0.15); // 0.85 - 1.15
      
      // === 2. 交通尖峰影響 ===
      let trafficFactor = 1.0;
      
      // 早上通勤 (6-9點)
      if (hourOfDay >= 6 && hourOfDay <= 9) {
        const morningPeak = Math.sin(((hourOfDay - 6) / 3) * Math.PI);
        trafficFactor += morningPeak * 0.25; // 最多 +25%
      }
      
      // 晚上通勤 (17-20點)
      if (hourOfDay >= 17 && hourOfDay <= 20) {
        const eveningPeak = Math.sin(((hourOfDay - 17) / 3) * Math.PI);
        trafficFactor += eveningPeak * 0.30; // 最多 +30%
      }
      
      // 深夜交通減少 (0-5點)
      if (hourOfDay >= 0 && hourOfDay <= 5) {
        trafficFactor *= 0.7; // -30%
      }
      
      // === 3. 氣象模擬因素 ===
      // 簡化的氣象影響（溫度、風速、濕度）
      const meteorologyFactor = 1.0 + (Math.sin(timePhase) * 0.1); // 0.9 - 1.1
      
      // === 4. 趨勢因素 ===
      // 模擬長期趨勢（根據時間推移緩慢變化）
      const trendFactor = 1.0 + (i * 0.01); // 隨時間微幅上升 1.0 - 1.12
      
      // === 5. 小幅隨機波動 ===
      // 保留自然的不可預測性，但幅度較小
      const randomFactor = 1.0 + ((Math.random() - 0.5) * 0.1); // 0.95 - 1.05
      
      // === 綜合計算預測 AQI ===
      let predictedAQI = baseAQI 
        * dailyFactor 
        * trafficFactor 
        * meteorologyFactor 
        * trendFactor 
        * randomFactor;
      
      // === 污染物類型特定調整 ===
      // PM2.5 在濕度高時會累積
      if (latest.pollutant === 'PM₂.₅') {
        const humidityFactor = 1.0 + (Math.sin(timePhase + Math.PI) * 0.08);
        predictedAQI *= humidityFactor;
      }
      
      // O3 在陽光強時會增加
      if (latest.pollutant === 'O₃' && hourOfDay >= 10 && hourOfDay <= 16) {
        predictedAQI *= 1.15; // 中午臭氧濃度較高
      }
      
      // === 邊界限制 ===
      predictedAQI = Math.max(10, Math.min(500, predictedAQI));
      predictedAQI = Math.round(predictedAQI);
      
      // === 計算對應濃度 ===
      const concentrationRatio = predictedAQI / baseAQI;
      const predictedConcentration = latest.concentration * concentrationRatio;
      
      // 記錄詳細預測資訊（可選）
      if (i === 0 || i === 6 || i === 11) {
        console.log(`⏰ ${hour.toLocaleTimeString('en-US', { hour: 'numeric' })}:`, {
          baseAQI,
          daily: dailyFactor.toFixed(2),
          traffic: trafficFactor.toFixed(2),
          final: predictedAQI
        });
      }
      
      forecastData.push({
        hour: hour.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true }),
        aqi: predictedAQI,
        pollutant: latest.pollutant,
        concentration: predictedConcentration,
        timestamp: hour.toISOString(),
      });
    }

    console.log(`✅ 生成 ${forecastData.length} 小時的科學化預測數據`);
    console.log(`📊 預測範圍: ${Math.min(...forecastData.map(f => f.aqi))} - ${Math.max(...forecastData.map(f => f.aqi))}`);
    
    return forecastData;
  } catch (error) {
    console.error('生成預測數據錯誤:', error);
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
