export enum Pollutant {
  PM25 = "PM₂.₅",
  O3 = "O₃",
  NO2 = "NO₂",
  SO2 = "SO₂",
  CO = "CO",
}

export interface AQIDataPoint {
  aqi: number;
  pollutant: Pollutant;
  concentration: number;
  timestamp: string;
}

export interface HourlyForecastData extends AQIDataPoint {
  hour: string;
}

export interface HistoricalDataPoint {
  date: string;
  aqi: number;
}

export interface UserHealthProfile {
  name: string;
  hasAllergies: boolean;
  hasAsthma: boolean;
  hasCardiopulmonaryDisease: boolean;
}

export interface SmartScheduleSuggestion {
  time: string;
  activity: string;
  reason: string;
  health_risk: "Low" | "Moderate" | "High";
}

export interface AQILevel {
  level: string;
  range: string;
  color: string;
  textColor: string;
  bgColor: string;
  implications: string;
}
