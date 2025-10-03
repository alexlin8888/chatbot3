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


// --- Icon Components ---
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" /></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const BookOpenIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6.5 17.5l-2-2M17.5 6.5l2 2M18.364 2.636l-2.828 2.828M5.636 18.364l2.828-2.828M12 18a6 6 0 100-12 6 6 0 000 12z" /></svg>;

export default function App() {
  // --- State Initialization ---
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window === 'undefined') return 'light';
    const savedTheme = window.localStorage.getItem('theme');
    if (savedTheme) return savedTheme as 'light' | 'dark';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  // Default to San Francisco
  const [latitude, setLatitude] = useState(37.7749);
  const [longitude, setLongitude] = useState(-122.4194);
  
  const [location, setLocation] = useState('San Francisco, US');
  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const [userProfile] = useState<UserHealthProfile>({ name: 'Alex', hasAllergies: false, hasAsthma: true, hasCardiopulmonaryDisease: false });

  const [realTimeData, setRealTimeData] = useState<RealTimeAirQualityType | FlaskAirQuality | null>(null);
  const [realTimeLoading, setRealTimeLoading] = useState(false);
  const [realTimeError, setRealTimeError] = useState<string | null>(null);


  
  // Data states
  const [hourlyForecast, setHourlyForecast] = useState<HourlyForecastData[]>([]);
  const [historicalData, setHistoricalData] = useState<HistoricalDataPoint[]>([]);
  const [currentAQI, setCurrentAQI] = useState<AQIDataPoint | null>(null);
  
  // AI-generated content states
  const [healthAdvice, setHealthAdvice] = useState<string | null>(null);
  const [smartSchedule, setSmartSchedule] = useState<SmartScheduleSuggestion[] | null>(null);
  const [airStory, setAirStory] = useState<string | null>(null);
  const [airStoryImage, setAirStoryImage] = useState<string | null>(null);
  
  // Loading states
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [loading, setLoading] = useState({ advice: false, schedule: false, story: false, storyImage: false });

  // --- Theme Management ---
  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  // --- Fetch Real-time AQI ---
  useEffect(() => {
    const fetchRealTimeAQI = async () => {
      setRealTimeLoading(true);
      try {
        const res = await fetch(`https://realtime-aqi-2381.onrender.com/get_aqi?lat=22.62&lon=120.27`);
        if (!res.ok) throw new Error("Flask API failed");
        const json = await res.json();
        setRealTimeData(json);
      } catch (err: any) {
        setRealTimeError(err.message);
      } finally {
        setRealTimeLoading(false);
      }
    };
    fetchRealTimeAQI();
  }, []);


  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  // --- Geolocation Handler ---
  const handleGeolocate = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by your browser.');
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setIsLocating(false);
      },
      (error) => {
        setGeoError(`Unable to retrieve your location: ${error.message}`);
        setIsLocating(false);
      }
    );
  };
  
  // --- Air Quality Data Fetching ---
  useEffect(() => {
    const fetchAirQualityData = async () => {
      setIsDataLoading(true);
      setGeoError(null);
      // Clear previous AI data when location changes
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

  // --- Gemini API Calls ---
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

  // --- Render ---
  if (isDataLoading && !currentAQI) {
    return (
      <div className="min-h-screen bg-slate-100 dark:bg-slate-900 flex flex-col justify-center items-center p-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-white mb-4">AeroGuard</h1>
        <LoadingSpinner size="h-12 w-12" />
        <p className="mt-4 text-slate-600 dark:text-slate-300 text-center">Fetching local air quality data...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-900 font-sans p-4 sm:p-6 lg:p-8 text-slate-800 dark:text-slate-200">
      <main className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-800 dark:text-white">AeroGuard</h1>
            <div className="flex items-center text-slate-500 dark:text-slate-400 mt-1 flex-wrap gap-x-4">
              <div className="flex items-center">
                <MapPinIcon />
                <p className="ml-2">{location}</p>
              </div>
              <button 
                onClick={handleGeolocate} 
                disabled={isLocating || isDataLoading}
                className="flex items-center text-sm text-sky-600 dark:text-sky-400 hover:text-sky-800 dark:hover:text-sky-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                aria-label="Use my current location"
              >
                {isLocating ? (
                  <> <LoadingSpinner size="h-4 w-4" /> <span className="ml-2">Locating...</span> </>
                ) : ( 'Use my current location' )}
              </button>
            </div>
            {geoError && <p className="text-sm text-red-500 mt-2" role="alert">{geoError}</p>}
          </div>
          <ThemeToggle theme={theme} toggleTheme={toggleTheme} />
        </header>

        {/* Generate Button */}
        <div className="mb-6">
            <button
                onClick={fetchGeminiData}
                disabled={isAnythingLoading || !currentAQI}
                className="w-full sm:w-auto flex items-center justify-center gap-x-2 bg-sky-600 hover:bg-sky-700 disabled:bg-sky-400/80 disabled:cursor-wait text-white font-bold py-3 px-6 rounded-full transition-colors duration-200 shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-100 dark:focus:ring-offset-slate-900 focus:ring-sky-500 mx-auto"
            >
                {isAnythingLoading ? (
                    <> <LoadingSpinner size="h-5 w-5" /> <span>Generating...</span> </>
                ) : (
                    <> <SparklesIcon /> <span>Generate AI Insights</span> </>
                )}
            </button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-6">
             {currentAQI ? (
                <AQIIndicator aqi={currentAQI.aqi} />
            ) : (
                 <div className="bg-slate-200 dark:bg-slate-800 p-6 rounded-3xl shadow-lg flex flex-col items-center justify-center text-center min-h-[344px]">
                    <h2 className="text-lg font-semibold text-slate-600 dark:text-slate-300">No AQI Data</h2>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-xs">
                        Could not fetch current air quality data. Please try another location.
                    </p>
                </div>
            )}
            <RealTimeAirQuality data={realTimeData} loading={realTimeLoading} error={realTimeError} />
             <Card title="Personalized Health Advice" icon={<HeartIcon />}>
              {loading.advice ? <div className="flex justify-center items-center h-20"><LoadingSpinner /></div> : healthAdvice ? <p>{healthAdvice}</p> : <p className="text-center text-slate-500 dark:text-slate-400 py-4">{!currentAQI ? "Current air quality data is unavailable." : "Click 'Generate AI Insights' to get personalized health advice."}</p>}
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-6">
             {hourlyForecast.length > 0 ? <ForecastChart data={hourlyForecast} /> : <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-lg h-72 sm:h-80 flex justify-center items-center"><p className="text-slate-500">Forecast data unavailable.</p></div>}
            <Card title="Smart Life Planner" icon={<ClockIcon />}>
              {loading.schedule ? <div className="flex justify-center items-center h-32"><LoadingSpinner /></div> : smartSchedule ? (
                <ul className="space-y-3">
                  {smartSchedule.map((item, index) => (
                    <li key={index} className="flex items-start p-3 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                      <div className={`w-2 h-2 rounded-full mt-1.5 mr-3 flex-shrink-0 ${item.health_risk === 'Low' ? 'bg-green-500' : item.health_risk === 'Moderate' ? 'bg-yellow-500' : 'bg-red-500'}`}></div>
                      <div>
                        <p className="font-semibold">{item.time}: <span className="font-medium">{item.activity}</span></p>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{item.reason}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-center text-slate-500 dark:text-slate-400 py-4">{!currentAQI ? "Forecast data is unavailable." : "Click 'Generate AI Insights' for a smart schedule."}</p>}
            </Card>
          </div>
          
          <div className="md:col-span-2 lg:col-span-3">
             {historicalData.length > 0 ? <HistoryChart data={historicalData} /> : <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-lg h-72 sm:h-80 flex justify-center items-center"><p className="text-slate-500">Historical data unavailable.</p></div>}
          </div>

          <div className="md:col-span-2 lg:col-span-3">
            <Card title="Air Story Mode (for Children)" icon={<BookOpenIcon />}>
                <p className="italic text-slate-500 dark:text-slate-400 mb-4">An illustrated story for children about your city's air.</p>
                {loading.storyImage ? (
                    <div className="flex justify-center items-center h-48 bg-slate-100 dark:bg-slate-700/50 rounded-lg"><LoadingSpinner /></div>
                ) : airStoryImage ? (
                    <img src={airStoryImage} alt="An illustration of the air story" className="rounded-lg mb-4 w-full object-cover aspect-video" />
                ) : ( !airStory && !loading.story && 
                   <div className="flex justify-center items-center h-48 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
                        <p className="text-slate-500 text-center">The illustration will appear here after the story is generated.</p>
                   </div>
                )}
                {loading.story ? <div className="flex justify-center items-center h-20"><LoadingSpinner /></div> : airStory ? <p>{airStory}</p> : <p className="text-center text-slate-500 dark:text-slate-400 py-4">{!currentAQI ? "Historical data is unavailable." : "Click 'Generate AI Insights' for a story about your city's air."}</p>}
            </Card>
          </div>
          
          <footer className="md:col-span-2 lg:col-span-3 mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
            <p>Air quality data powered by <a href="https://openaq.org" target="_blank" rel="noopener noreferrer" className="underline">OpenAQ</a>. AI insights by Google Gemini.</p>
            <p>&copy; 2024 AeroGuard. All rights reserved.</p>
          </footer>
        </div>
      </main>
    </div>
  );
}
