import React, { useState, useEffect, useCallback } from 'react';

// Icon Components
const HeartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 016.364 0L12 7.636l1.318-1.318a4.5 4.5 0 116.364 6.364L12 20.364l-7.682-7.682a4.5 4.5 0 010-6.364z" /></svg>;
const ClockIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const MapPinIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const SparklesIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6.5 17.5l-2-2M17.5 6.5l2 2M18.364 2.636l-2.828 2.828M5.636 18.364l2.828-2.828M12 18a6 6 0 100-12 6 6 0 000 12z" /></svg>;
const LocationIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 11c0 1.657-1.343 3-3 3s-3-1.343-3-3 1.343-3 3-3 3 1.343 3 3z M12 11c0 1.657 1.343 3 3 3s3-1.343 3-3-1.343-3-3-3-3 1.343-3 3z M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" /></svg>;
const ChartIcon = () => <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>;

const LoadingSpinner = ({ size = 'h-5 w-5' }: { size?: string }) => (
  <div className={`animate-spin rounded-full ${size} border-b-2 border-slate-900 dark:border-slate-100`}></div>
);

const Card = ({ title, icon, children, className = '' }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) => (
  <div className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 p-6 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 ${className}`}>
    <div className="flex items-center gap-3 mb-5">
      <div className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white rounded-2xl p-2.5 shadow-lg">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">{title}</h3>
    </div>
    <div className="text-slate-600 dark:text-slate-300">
      {children}
    </div>
  </div>
);

const getAQILevel = (aqi: number) => {
  if (aqi <= 50) return { 
    level: 'Good', 
    color: 'from-green-400 to-emerald-500', 
    textColor: 'text-green-700 dark:text-green-400', 
    bgColor: 'bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20', 
    implications: 'Air quality is satisfactory, and air pollution poses little or no risk.' 
  };
  if (aqi <= 100) return { 
    level: 'Moderate', 
    color: 'from-yellow-400 to-amber-500', 
    textColor: 'text-yellow-700 dark:text-yellow-400', 
    bgColor: 'bg-gradient-to-br from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20', 
    implications: 'Air quality is acceptable. However, there may be a risk for some people.' 
  };
  if (aqi <= 150) return { 
    level: 'Unhealthy for Sensitive Groups', 
    color: 'from-orange-400 to-orange-600', 
    textColor: 'text-orange-700 dark:text-orange-400', 
    bgColor: 'bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-900/30', 
    implications: 'Members of sensitive groups may experience health effects.' 
  };
  if (aqi <= 200) return { 
    level: 'Unhealthy', 
    color: 'from-red-400 to-red-600', 
    textColor: 'text-red-700 dark:text-red-400', 
    bgColor: 'bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/30', 
    implications: 'Some members of the general public may experience health effects.' 
  };
  if (aqi <= 300) return { 
    level: 'Very Unhealthy', 
    color: 'from-purple-400 to-purple-600', 
    textColor: 'text-purple-700 dark:text-purple-400', 
    bgColor: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-900/30', 
    implications: 'Health alert: The risk of health effects is increased for everyone.' 
  };
  return { 
    level: 'Hazardous', 
    color: 'from-rose-600 to-red-800', 
    textColor: 'text-rose-800 dark:text-rose-400', 
    bgColor: 'bg-gradient-to-br from-rose-50 to-red-100 dark:from-rose-900/20 dark:to-red-900/30', 
    implications: 'Health warning: everyone is more likely to be affected.' 
  };
};

const AQIIndicator = ({ aqi }: { aqi: number }) => {
  const aqiLevel = getAQILevel(aqi);
  const circumference = 2 * Math.PI * 70;
  const strokeDashoffset = circumference - (Math.min(aqi, 301) / 301) * circumference;

  return (
    <div className={`${aqiLevel.bgColor} backdrop-blur-xl border border-white/20 dark:border-slate-700/50 p-8 rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300`}>
      <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 text-center mb-6">Current AQI</h2>
      
      <div className="relative w-48 h-48 mx-auto my-6">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 160 160">
          <circle className="text-slate-200/50 dark:text-slate-700/50" strokeWidth="14" stroke="currentColor" fill="transparent" r="70" cx="80" cy="80" />
          <circle className="transition-all duration-1000 ease-out" strokeWidth="14" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" stroke="#6366f1" fill="transparent" r="70" cx="80" cy="80" />
        </svg>
        
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-6xl font-black ${aqiLevel.textColor} mb-1`}>{aqi}</span>
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">AQI</span>
        </div>
      </div>

      <div className="text-center">
        <div className={`inline-block px-6 py-3 rounded-2xl ${aqiLevel.bgColor} border border-slate-200/50 dark:border-slate-600/50 mb-4`}>
          <span className={`text-lg font-bold ${aqiLevel.textColor}`}>{aqiLevel.level}</span>
        </div>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed max-w-xs mx-auto">
          {aqiLevel.implications}
        </p>
      </div>
    </div>
  );
};

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [latitude, setLatitude] = useState(37.7749);
  const [longitude, setLongitude] = useState(-122.4194);
  const [location, setLocation] = useState('San Francisco, US');
  const [isLocating, setIsLocating] = useState(false);
  const [currentAQI, setCurrentAQI] = useState(75);
  const [predictedForecast, setPredictedForecast] = useState<any[]>([]);
  const [isPredicting, setIsPredicting] = useState(false);
  const [predictionError, setPredictionError] = useState<string | null>(null);
  
  const [healthAdvice, setHealthAdvice] = useState<string | null>(null);
  const [smartSchedule, setSmartSchedule] = useState<any[] | null>(null);
  const [isGeneratingInsights, setIsGeneratingInsights] = useState(false);

  useEffect(() => {
    if (theme === 'dark') document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const handleGeolocate = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLatitude(position.coords.latitude);
        setLongitude(position.coords.longitude);
        setLocation(`Lat: ${position.coords.latitude.toFixed(2)}, Lon: ${position.coords.longitude.toFixed(2)}`);
        setIsLocating(false);
      },
      (error) => {
        console.error(error);
        setIsLocating(false);
      }
    );
  };

  const handlePredictForecast = async () => {
    setIsPredicting(true);
    setPredictionError(null);
    
    try {
      const response = await fetch('https://air-quality-predictor-y8se.onrender.com/predict', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          latitude: latitude,
          longitude: longitude
        })
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.predictions && Array.isArray(data.predictions)) {
        setPredictedForecast(data.predictions);
      } else {
        throw new Error('Invalid prediction data format');
      }
    } catch (error: any) {
      console.error('Prediction error:', error);
      setPredictionError(error.message || 'Failed to fetch predictions');
    } finally {
      setIsPredicting(false);
    }
  };

  const handleGenerateInsights = async () => {
    setIsGeneratingInsights(true);
    
    // Simulate AI generation
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    setHealthAdvice("With moderate air quality (AQI: 75), it's advisable to limit prolonged outdoor activities. Keep indoor spaces well-ventilated and consider using air purifiers. If you have respiratory conditions, keep your medication readily available.");
    
    setSmartSchedule([
      {
        time: "6-8 AM",
        activity: "Morning Jog",
        reason: "Best air quality of the day, lower pollution levels",
        health_risk: "Low"
      },
      {
        time: "12-2 PM",
        activity: "Indoor Workout",
        reason: "Peak pollution hours, avoid outdoor exercise",
        health_risk: "Moderate"
      },
      {
        time: "4-6 PM",
        activity: "Light Walk",
        reason: "Air quality improving as traffic decreases",
        health_risk: "Moderate"
      },
      {
        time: "7-9 PM",
        activity: "Relaxing Indoor Activities",
        reason: "Evening pollution from cooking and traffic",
        health_risk: "Moderate"
      }
    ]);
    
    setIsGeneratingInsights(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-indigo-950 font-sans">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-300/20 dark:bg-blue-500/10 rounded-full blur-3xl"></div>
        <div className="absolute top-1/2 -left-40 w-80 h-80 bg-purple-300/20 dark:bg-purple-500/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 right-1/4 w-80 h-80 bg-indigo-300/20 dark:bg-indigo-500/10 rounded-full blur-3xl"></div>
      </div>

      <main className="relative max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {/* Header */}
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
                  disabled={isLocating}
                  className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:gap-3"
                >
                  {isLocating ? (
                    <><LoadingSpinner size="h-4 w-4" /><span>Locating...</span></>
                  ) : (
                    <><LocationIcon /><span>Use my location</span></>
                  )}
                </button>
              </div>
              
              <button
                onClick={toggleTheme}
                className="w-14 h-14 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 rounded-2xl shadow-lg transition-all duration-300 flex items-center justify-center"
              >
                {theme === 'light' ? '🌙' : '☀️'}
              </button>
            </div>
          </div>
        </header>

        {/* AI Buttons */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={handleGenerateInsights}
            disabled={isGeneratingInsights}
            className="group relative overflow-hidden bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-700 hover:via-indigo-700 hover:to-purple-700 disabled:from-slate-400 disabled:via-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5 disabled:transform-none"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            <div className="relative flex items-center justify-center gap-3">
              {isGeneratingInsights ? (
                <><LoadingSpinner size="h-5 w-5" /><span>Generating Insights...</span></>
              ) : (
                <><SparklesIcon /><span>Generate AI Insights</span></>
              )}
            </div>
          </button>

          <button
            onClick={handlePredictForecast}
            disabled={isPredicting}
            className="group relative overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-700 hover:via-purple-700 hover:to-pink-700 disabled:from-slate-400 disabled:via-slate-400 disabled:to-slate-400 disabled:cursor-not-allowed text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5 disabled:transform-none"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
            <div className="relative flex items-center justify-center gap-3">
              {isPredicting ? (
                <><LoadingSpinner size="h-5 w-5" /><span>Predicting...</span></>
              ) : (
                <><ChartIcon /><span>Predict Hourly Forecast</span></>
              )}
            </div>
          </button>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <AQIIndicator aqi={currentAQI} />
            
            <Card title="Health Advice" icon={<HeartIcon />}>
              {healthAdvice ? (
                <p className="leading-relaxed">{healthAdvice}</p>
              ) : (
                <div className="text-center py-6">
                  <div className="w-12 h-12 bg-slate-100 dark:bg-slate-700/50 rounded-xl flex items-center justify-center mx-auto mb-3">
                    <HeartIcon />
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Click 'Generate AI Insights' for personalized advice
                  </p>
                </div>
              )}
            </Card>
          </div>

          {/* Right Column - Prediction Results */}
          <div className="lg:col-span-2 space-y-6">
            <Card title="AI Predicted Hourly Forecast" icon={<ChartIcon />}>
              {predictionError ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-red-100 dark:bg-red-900/20 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                  </div>
                  <p className="text-red-600 dark:text-red-400 font-medium">{predictionError}</p>
                </div>
              ) : predictedForecast.length > 0 ? (
                <div className="space-y-3">
                  {predictedForecast.slice(0, 12).map((prediction, index) => {
                    const aqiLevel = getAQILevel(Math.round(prediction.predicted_aqi));
                    return (
                      <div key={index} className="group p-4 bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-700/30 dark:to-slate-700/50 hover:from-slate-100 hover:to-slate-50 dark:hover:from-slate-700/50 dark:hover:to-slate-700/30 rounded-xl transition-all border border-slate-200/50 dark:border-slate-600/50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <div className={`w-3 h-3 rounded-full flex-shrink-0 shadow-lg ${
                              prediction.predicted_aqi <= 50 ? 'bg-green-500' : 
                              prediction.predicted_aqi <= 100 ? 'bg-yellow-500' : 
                              prediction.predicted_aqi <= 150 ? 'bg-orange-500' : 
                              'bg-red-500'
                            }`}></div>
                            <div className="flex-1">
                              <p className="font-bold text-slate-800 dark:text-slate-100">
                                Hour {prediction.hour}
                              </p>
                              <p className="text-sm text-slate-600 dark:text-slate-400">
                                {aqiLevel.level}
                              </p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className={`text-2xl font-black ${aqiLevel.textColor}`}>
                              {Math.round(prediction.predicted_aqi)}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-500">AQI</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700/50 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <ChartIcon />
                  </div>
                  <p className="text-slate-500 dark:text-slate-400 mb-2">
                    Click the button above to generate AI predictions
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Powered by Machine Learning Model
                  </p>
                </div>
              )}
            </Card>

            <Card title="Smart Life Planner" icon={<ClockIcon />}>
              {smartSchedule ? (
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
                    Click 'Generate AI Insights' for a smart schedule
                  </p>
                </div>
              )}
            </Card>
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-8 text-center">
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-xl border border-white/20 dark:border-slate-700/50 rounded-2xl p-6">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
              Air quality data powered by OpenAQ · AI predictions by Custom ML Model
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              &copy; 2024 AeroGuard. All rights reserved.
            </p>
          </div>
        </footer>
      </main>
    </div>
  );
}
