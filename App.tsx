import React, { useState, useEffect, useCallback } from 'react';
import type { AQIDataPoint, UserHealthProfile, HourlyForecastData, HistoricalDataPoint, SmartScheduleSuggestion } from './types';
import AQIIndicator from './components/AQIIndicator';
import ForecastChart from './components/ForecastChart';
import HistoryChart from './components/HistoryChart';
import Card from './components/Card';
import LoadingSpinner from './components/LoadingSpinner';
import ThemeToggle from './components/ThemeToggle';
import { generateHealthAdvice, generateSmartSchedule, generateAirStoryForChild, generateImageFromStory } from './services/geminiService';
import { getLatestMeasurements, getHistoricalData, getForecastData, getLocationName } from './services/openaqService';
import RealTimeAirQuality from './components/RealTimeAirQuality';

// Icon Components with improved styling
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" /></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const BookOpenIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6.5 17.5l-2-2M17.5 6.5l2 2M18.364 2.636l-2.828 2.828M5.636 18.364l2.828-2.828M12 18a6 6 0 100-12 6 6 0 000 12z" /></svg>;
const LocationIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z M12 11c0 1.657 1.343 3 3 3s3-1.343 3-3-1.343-3-3-3-3 1.343-3 3z M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" /></svg>;

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const savedTheme = window.localStorage.getItem('theme');
    if (savedTheme) return savedTheme as 'light' | 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  const [latitude, setLatitude] = useState(37.7749);
  const [longitude, setLongitude] = useState(-122.4194);
  const [location, setLocation] = useState('San Francisco, US');
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [userProfile] = useState<UserHealthProfile>({ name: 'Alex', hasAllergies: false, hasAsthma: true, hasCardiopulmonaryDisease: false });

  const [realTimeData, setRealTimeData] = useState<any>(null);
  const [realTimeLoading, setRealTimeLoading] = useState(false);
  const [realTimeError, setRealTimeError] = useState<string | null>(null);

  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecastData[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [currentAQI, setCurrentAQI] = useState<AQIDataPoint | null>(null);
  
  const [healthAdvice, setHealthAdvice] = useState<string | null>(null);
  const [smartSchedule, setSmartSchedule] = useState<SmartScheduleSuggestion[] | null>(null);
  const [airStory, setAirStory] = useState<string | null>(null);
  const [airStoryImage, setAirStoryImage] = useState<string | null>(null);
  
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [loading, setLoading] = useState({ advice: false, schedule: false, story: false, storyImage: false });

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const fetchRealTimeAQI = async (lat: number, lon: number) => {
    setRealTimeLoading(true);
    setRealTimeError(null);
    try {
      const res = await fetch(`https://realtime-aqi-2381.onrender.com/get_aqi?lat=${lat}&lon=${lon}`);
      if (!res.ok) throw new Error("Flask API failed");
      const json = await res.json();
      setRealTimeData(json);
    } catch (err: any) {
      setRealTimeError(err.message);
    } finally {
      setRealTimeLoading(false);
    }
  };

  useEffect(() => {
    fetchRealTimeAQI(latitude, longitude);
  }, []);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setLatitude(latitude);
        setLongitude(longitude);
        setLocation(`Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`);
        setIsLocating(false);
        fetchRealTimeAQI(latitude, longitude);
      },
      (error) => {
        setGeoError(`Unable to retrieve your location: ${error.message}`);
        setIsLocating(false);
      }
    );
  };
  
  useEffect(() => {
    const fetchAirQualityData = async () => {
      setIsDataLoading(true);
      setGeoError(null);
      setHealthAdvice(null);
      setSmartSchedule(null);
      setAirStory(null);
      setAirStoryImage(null);

      try {
        const [locationName, latest, historical, forecast] = await Promise.all([
          getLocationName(latitude, longitude),
          getLatestMeasurements(latitude, longitude),
          getHistoricalData(latitude, longitude),
          getForecastData(latitude, longitude),
        ]);

        setLocation(locationName);
        setCurrentAQI(latest);
        setHistoricalData(historical);
        setHourlyForecast(forecast);
        
        if (!latest) {
          setGeoError("Could not retrieve air quality data. The nearest station may be offline or too far away.");
        }
      } catch (error) {
        console.error("Failed to fetch air quality data:", error);
        setGeoError("An error occurred while fetching air quality data.");
      } finally {
        setIsDataLoading(false);
      }
    };
    fetchAirQualityData();
  }, [latitude, longitude]);

  const fetchGeminiData = useCallback(async () => {
    if (!currentAQI || hourlyForecast.length === 0 || historicalData.length === 0) return;

    setLoading({ advice: true, schedule: true, story: true, storyImage: true });
    setHealthAdvice(null);
    setSmartSchedule(null);
    setAirStory(null);
    setAirStoryImage(null);
    
    const [advice, schedule] = await Promise.all([
      generateHealthAdvice(currentAQI, userProfile),
      generateSmartSchedule(hourlyForecast)
    ]);

    setHealthAdvice(advice);
    setLoading(prev => ({ ...prev, advice: false }));
    
    setSmartSchedule(schedule);
    setLoading(prev => ({ ...prev, schedule: false }));

    const story = await generateAirStoryForChild(location, historicalData);
    setAirStory(story);
    setLoading(prev => ({ ...prev, story: false }));

    if (story) {
        const imageUrl = await generateImageFromStory(story);
        setAirStoryImage(imageUrl);
    }
    setLoading(prev => ({ ...prev, storyImage: false }));
  }, [currentAQI, userProfile, hourlyForecast, location, historicalData]);
  
  const isAnythingLoading = Object.values(loading).some(v => v);

  if (isDataLoading && !currentAQI) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 flex flex-col justify-center items-center p-4">
        <div className="text-center">
          <div className="mb-6">
            <div className="w-20 h-20 mx-auto bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl transform rotate-12">
              <svg className="w-10 h-10 text-white -rotate-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
            </div>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400 mb-4">
            AeroGuard
          </h1>
          <LoadingSpinner size="h-12 w-12" />
          <p className="mt-6 text-slate-600 dark:text-slate-300 text-lg">Fetching air quality data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 font-sans">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300/20 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-purple-300/20 dark:bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-indigo-300/20 dark:bg-indigo-500/10 rounded-full blur-3xl"></div>
      </div>

      <main className="relative max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <header className="mb-8">
          <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl rounded-3xl shadow-xl border border-white/20 dark:border-slate-700/50 p-6">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                    </svg>
                  </div>
                  <h1 className="text-3xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 dark:from-blue-400 dark:via-indigo-400 dark:to-purple-400">
                    AeroGuard
                  </h1>
                </div>
                
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 mb-2">
                  <MapPinIcon />
                  <p className="font-semibold">{location}</p>
                </div>
                
                <button 
                  onClick={handleGeolocate} 
                  disabled={isLocating || isDataLoading}
                  className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:gap-3"
                >
                  {isLocating ? (
                    <><LoadingSpinner size="h-4 w-4" /><span>Locating...</span></>
                  ) : (
                    <><LocationIcon /><span>Use my location</span></>
                  )}
                </button>
                
                {geoError && (
                  <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                    <p className="text-sm text-red-600 dark:text-red-400">{geoError}</p>
                  </div>
                )}
              </div>
              
              <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
            </div>
          </div>
        </header>

        <div className="mb-8">
          <button
            onClick={fetchGeminiData}
            disabled={isAnythingLoading || !currentAQI}
            className="w-full group relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 disabled:from-slate-400 disabled:via-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5 disabled:transform-none"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            <div className="relative flex items-center justify-center gap-3">
              {isAnythingLoading ? (
                <><LoadingSpinner size="h-5 w-5" /><span>Generating AI Insights...</span></>
              ) : (
                <><SparklesIcon /><span>Generate AI Insights</span></>
              )}
            </div>
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-6">
            {currentAQI ? (
              <AQIIndicator aqi={currentAQI.aqi} />
            ) : (
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 p-8 rounded-3xl shadow-xl flex flex-col items-center justify-center text-center min-h-[344px]">
                <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mb-4">
                  <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">No AQI Data</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                  Could not fetch current air quality data. Please try another location.
                </p>
              </div>
            )}
            
            <div className="flex-1">
              <RealTimeAirQuality data={realTimeData} loading={realTimeLoading} error={realTimeError} />
            </div>
            
            <Card title="Health Advice" icon={<HeartIcon />} className="flex-shrink-0">
              {loading.advice ? (
                <div className="flex justify-center items-center h-20"><LoadingSpinner /></div>
              ) : healthAdvice ? (
                <p className="leading-relaxed">{healthAdvice}</p>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700/50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <HeartIcon />
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {!currentAQI ? "Current air quality data is unavailable." : "Click 'Generate AI Insights' for personalized advice."}
                  </p>
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
            {hourlyForecast.length > 0 ? (
              <ForecastChart data={hourlyForecast} />
            ) : (
              <div className="bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 p-6 rounded-3xl shadow-xl h-80 flex justify-center items-center">
                <p className="text-slate-500 dark:text-slate-400">Forecast data unavailable.</p>
              </div>
            )}
            
            <Card title="Smart Life Planner" icon={<ClockIcon />}>
              {loading.schedule ? (
                <div className="flex justify-center items-center h-32"><LoadingSpinner /></div>
              ) : smartSchedule ? (
                <div className="space-y-3">
                  {smartSchedule.map((item, index) => (
                    <div key={index} className="group p-4 bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-700/30 dark:to-slate-700/50 hover:from-slate-100 hover:to-slate-50 dark:hover:from-slate-700/50 dark:hover:to-slate-700/30 rounded-xl transition-all border border-slate-200/50 dark:border-slate-600/50">
                      <div className="flex items-start gap-3">
                        <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 shadow-lg ${
                          item.health_risk === 'Low' ? 'bg-green-500' : 
                          item.health_risk === 'Moderate' ? 'bg-yellow-500' : 
                          'bg-red-500'
                        }`}></div>
                        <div className="flex-1">
                          <p className="font-bold text-slate-800 dark:text-slate-100 mb-1">
                            <span className="text-indigo-600 dark:text-indigo-400">{item.time}</span>
                            <span className="mx-2">·</span>
                            <span>{item.activity}</span>
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{item.reason}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700/50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <ClockIcon />
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {!currentAQI ? "Forecast data is unavailable." : "Click 'Generate AI Insights' for a smart schedule."}
                  </p>
                </div>
              )}
            </Card>
          </div>
          
          <div className="lg:col-span-3">
  <a 
    href="https://air-quality-predictor-y8se.onrender.com" 
    target="_blank" 
    rel="noopener noreferrer"
    className="block w-full group relative overflow-hidden bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 hover:from-emerald-700 hover:via-teal-700 hover:to-cyan-700 text-white font-bold py-6 px-8 rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5"
  >
    <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
    <div className="relative flex items-center justify-center gap-3">
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
      <span className="text-xl">Advanced Air Quality Predictions</span>
      <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
      </svg>
    </div>
    <p className="relative text-center text-sm mt-2 opacity-90">
      Explore detailed forecasting powered by machine learning
    </p>
  </a>
</div>

          <div className="lg:col-span-3">
            <Card title="Air Story Mode" icon={<BookOpenIcon />}>
              <p className="italic text-indigo-600 dark:text-indigo-400 mb-6 font-medium">
                An illustrated story for children about your city's air
              </p>
              
              {loading.storyImage ? (
                <div className="flex justify-center items-center h-64 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-700/30 dark:to-slate-700/50 rounded-2xl">
                  <LoadingSpinner />
                </div>
              ) : airStoryImage ? (
                <img src={airStoryImage} alt="Air story illustration" className="rounded-2xl mb-6 w-full object-cover aspect-video shadow-lg" />
              ) : (
                !airStory && !loading.story && 
                <div className="flex justify-center items-center h-64 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-700/30 dark:to-slate-700/50 rounded-2xl mb-6">
                  <div className="text-center">
                    <div className="w-16 h-16 bg-white dark:bg-slate-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg">
                      <BookOpenIcon />
                    </div>
                    <p className="text-slate-500 dark:text-slate-400">The illustration will appear here</p>
                  </div>
                </div>
              )}
              
              {loading.story ? (
                <div className="flex justify-center items-center h-20"><LoadingSpinner /></div>
              ) : airStory ? (
                <div className="p-6 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-700/30 dark:to-slate-700/50 rounded-2xl">
                  <p className="leading-relaxed text-lg">{airStory}</p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {!currentAQI ? "Historical data is unavailable." : "Click 'Generate AI Insights' for a magical story."}
                  </p>
                </div>
              )}
            </Card>
          </div>
          
          <footer className="lg:col-span-3 mt-8 text-center">
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 rounded-2xl p-6">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                Air quality data powered by <a href="https://openaq.org" target="_blank" rel="noopener noreferrer" className="text-indigo-600 dark:text-indigo-400 hover:underline font-medium">OpenAQ</a> · AI insights by Google Gemini
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                &copy; 2024 AeroGuard. All rights reserved.
              </p>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
