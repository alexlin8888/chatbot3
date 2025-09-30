import type { AQIDataPoint, HourlyForecastData, HistoricalDataPoint, Pollutant } from '../types';
import { Pollutant as PollutantEnum } from '../types';
import { getOpenAQApiKey } from '../config/environment';

const OPENAQ_BASE_URL = 'https://api.openaq.org/v3';

// OpenAQ API Response Interface
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
  isAnalysis: boolean;
  entity: string;
  sensorType: string;
}

interface OpenAQLocation {
    id: number;
    city: string;
    name: string;
    country: string;
    locality: string | null;
}


// Pollutant mapping: Convert OpenAQ parameters to our enum
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

// AQI Calculation (PM2.5 focus)
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
    default:
      // Simplified AQI for other pollutants as a fallback
      return Math.min(Math.round(value * 2), 300);
  }
};

// API Request Helper
const makeOpenAQRequest = async (url: string): Promise<any> => {
  const apiKey = getOpenAQApiKey();
  
  try {
    const response = await fetch(url, {
      headers: {
        'X-API-Key': apiKey,
        'accept': 'application/json'
      },
    });

    if (!response.ok) {
      throw new Error(`OpenAQ API error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('OpenAQ API request failed:', error);
    throw error;
  }
};

// 1. Get Nearby Locations
export const getNearbyLocations = async (
  latitude: number,
  longitude: number,
  radius: number = 25000
): Promise<OpenAQLocation[]> => {
  try {
    const url = `${OPENAQ_BASE_URL}/locations?coordinates=${latitude},${longitude}&radius=${radius}&limit=10&order_by=distance`;
    const data = await makeOpenAQRequest(url);
    return data.results || [];
  } catch (error) {
    console.error('Error fetching nearby locations:', error);
    return [];
  }
};

// 2. Get Latest Measurements
export const getLatestMeasurements = async (
  latitude: number,
  longitude: number
): Promise<AQIDataPoint | null> => {
  try {
    const locations = await getNearbyLocations(latitude, longitude);
    
    if (locations.length === 0) {
      return null;
    }

    const locationId = locations[0].id;
    const url = `${OPENAQ_BASE_URL}/latest?location_id=${locationId}&limit=100`;
    const data = await makeOpenAQRequest(url);
    const measurements: OpenAQMeasurement[] = data.results || [];

    if (measurements.length === 0) {
      return null;
    }

    // Prioritize PM2.5 data
    let selectedMeasurement = measurements.find((m) => 
      m.parameter.toLowerCase() === 'pm25'
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

// 3. Get Historical Data (Past 30 Days)
export const getHistoricalData = async (
  latitude: number,
  longitude: number
): Promise<HistoricalDataPoint[]> => {
  try {
    const locations = await getNearbyLocations(latitude, longitude);
    
    if (locations.length === 0) return [];

    const locationId = locations[0].id;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);

    const url = `${OPENAQ_BASE_URL}/measurements?location_id=${locationId}&parameter=pm25&date_from=${startDate.toISOString()}&date_to=${endDate.toISOString()}&limit=1000`;
    
    const data = await makeOpenAQRequest(url);
    const measurements: OpenAQMeasurement[] = data.results || [];

    // Group by date and calculate daily average
    const dailyAverages: { [key: string]: { total: number; count: number } } = {};

    measurements.forEach((measurement) => {
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

    const historicalData: HistoricalDataPoint[] = Object.entries(dailyAverages).map(
      ([date, { total, count }]) => ({
        date,
        aqi: Math.round(total / count),
      })
    );

    // Sort the data chronologically
    return historicalData.sort((a, b) => {
      const dateA = new Date(a.date + `, ${new Date().getFullYear()}`);
      const dateB = new Date(b.date + `, ${new Date().getFullYear()}`);
      return dateA.getTime() - dateB.getTime();
    });
  } catch (error) {
    console.error('Error fetching historical data:', error);
    return [];
  }
};

// 4. Generate Forecast Data (based on current trends)
export const getForecastData = async (
  latitude: number,
  longitude: number
): Promise<HourlyForecastData[]> => {
  try {
    const latest = await getLatestMeasurements(latitude, longitude);
    
    if (!latest) return [];

    const forecastData: HourlyForecastData[] = [];
    const now = new Date();

    // Generate 24-hour forecast
    for (let i = 0; i < 24; i++) {
      const hour = new Date(now.getTime() + i * 60 * 60 * 1000);
      
      // Simulate diurnal variation pattern
      let variation = (Math.random() - 0.5) * 20; // Base random fluctuation
      const hourOfDay = hour.getHours();
      
      if (hourOfDay >= 6 && hourOfDay <= 10) variation -= 10; // Better in the morning
      else if (hourOfDay >= 14 && hourOfDay <= 18) variation += 15; // Worse in the afternoon
      
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


// 5. Reverse Geocode to get location name
export const getLocationName = async (latitude: number, longitude: number): Promise<string> => {
    try {
      const locations = await getNearbyLocations(latitude, longitude, 50000); // Wider search for name
      
      if (locations.length > 0) {
        const location = locations[0];
        const city = location.city || location.locality || location.name;
        // The API returns country codes, which is fine.
        return `${city}, ${location.country}`;
      }
      
      return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
    } catch (error) {
      console.error('Error getting location name:', error);
      return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
    }
  };