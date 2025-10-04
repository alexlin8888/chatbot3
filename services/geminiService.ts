import { GoogleGenAI, Type } from "@google/genai";
import type { AQIDataPoint, UserHealthProfile, SmartScheduleSuggestion, HourlyForecastData, HistoricalDataPoint } from '../types';

// 純瀏覽器環境的 API key 獲取
const getGeminiApiKey = (): string => {
  // 1. Vite 環境變數 (主要方式)
  if (import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY;
  }
  
  // 2. AI Studio 環境 (如果有全域變數)
  if (typeof window !== 'undefined') {
    const global = window as any;
    if (global.API_KEY) {
      return global.API_KEY;
    }
    if (global.process?.env?.API_KEY) {
      return global.process.env.API_KEY;
    }
  }
  
  // 3. 後備方案 - 直接使用 API key
  console.warn('Using hardcoded API key - consider setting VITE_GEMINI_API_KEY environment variable');
  return 'AIzaSyDxHi_SBill4vTH0EPZAu9X4bslib4lvjs';
};

const ai = new GoogleGenAI({ apiKey: getGeminiApiKey() });

export const generateHealthAdvice = async (
  currentAQI: AQIDataPoint,
  userProfile: UserHealthProfile
): Promise<string> => {
  const profileConditions = [
    userProfile.hasAllergies && "allergies",
    userProfile.hasAsthma && "asthma",
    userProfile.hasCardiopulmonaryDisease && "cardiopulmonary disease",
  ].filter(Boolean).join(", ");

  const prompt = `
    Based on the current air quality index (AQI) of ${currentAQI.aqi} with the main pollutant being ${currentAQI.pollutant} at a concentration of ${currentAQI.concentration} µg/m³, provide personalized health recommendations for a user with the following conditions: ${profileConditions || 'none'}.
    
    The advice should be:
    - Concise and actionable (2-3 sentences max)
    - Formatted as a single paragraph
    - Include specific recommendations based on the AQI level
    - Consider the user's health conditions
    
    Example: "With the current moderate PM2.5 levels (AQI: 85), it's advisable to limit prolonged outdoor activities. Since you have asthma, keep your inhaler readily available and consider wearing a mask outdoors. Indoor air filtration would be beneficial today."
    
    Do not use markdown formatting.
    `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    
    const responseText = response.text || '';
    if (!responseText.trim()) {
      throw new Error('Empty response from Gemini API');
    }
    
    return responseText;
  } catch (error) {
    console.error("Error generating health advice:", error);
    
    const getBasicAdvice = (aqi: number, conditions: string): string => {
      if (aqi <= 50) {
        return `Air quality is good today (AQI: ${aqi}). Perfect for outdoor activities. ${conditions.includes('asthma') ? 'Your asthma should not be affected by today\'s air quality.' : ''}`;
      } else if (aqi <= 100) {
        return `Air quality is moderate today (AQI: ${aqi}). Generally safe for outdoor activities. ${conditions.includes('asthma') ? 'Monitor your breathing and keep your inhaler handy.' : ''}`;
      } else if (aqi <= 150) {
        return `Air quality is unhealthy for sensitive groups (AQI: ${aqi}). ${conditions.includes('asthma') ? 'Limit outdoor activities and keep your rescue inhaler available.' : 'Sensitive individuals should reduce prolonged outdoor exertion.'}`;
      } else {
        return `Air quality is unhealthy today (AQI: ${aqi}). Everyone should avoid prolonged outdoor activities. ${conditions.includes('asthma') ? 'Stay indoors and have your medication readily available.' : ''}`;
      }
    };
    
    return getBasicAdvice(currentAQI.aqi, profileConditions);
  }
};

export const generateSmartSchedule = async (
  hourlyForecast: HourlyForecastData[]
): Promise<SmartScheduleSuggestion[]> => {
  const forecastString = hourlyForecast.slice(0, 12).map(f => `${f.hour}: AQI ${f.aqi} (${f.pollutant})`).join('\n');
  const prompt = `
    Given the following hourly air quality forecast for the next 12 hours:
    ${forecastString}
    
    Generate 4 activity suggestions that optimize health based on air quality. Include:
    - Best times for outdoor exercise (jogging, cycling, etc.)
    - When to do indoor activities (gym, shopping, etc.)
    - Times to avoid outdoor activities
    - General daily planning advice
    
    Format as JSON array with time, activity, reason, and health_risk fields.
    
    Consider:
    - AQI 0-50: Excellent for all outdoor activities (Low risk)
    - AQI 51-100: Good for most activities (Low-Moderate risk)
    - AQI 101-150: Limit prolonged outdoor exercise (Moderate risk)
    - AQI 151+: Avoid outdoor activities (High risk)
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              time: { type: Type.STRING, description: 'The recommended time (e.g., "8 AM - 10 AM")' },
              activity: { type: Type.STRING, description: 'The suggested activity (e.g., "Outdoor Jogging")' },
              reason: { type: Type.STRING, description: 'A brief explanation for the suggestion.' },
              health_risk: { type: Type.STRING, description: 'The estimated health risk level (Low, Moderate, High).' }
            },
            required: ['time', 'activity', 'reason', 'health_risk']
          }
        }
      }
    });

    const responseText = response.text || '';
    if (!responseText.trim()) {
      throw new Error('Empty response from Gemini API');
    }
    
    const jsonText = responseText.trim();
    return JSON.parse(jsonText) as SmartScheduleSuggestion[];
  } catch (error) {
    console.error("Error generating smart schedule:", error);
    
    const generateBasicSchedule = (forecast: HourlyForecastData[]): SmartScheduleSuggestion[] => {
      const suggestions: SmartScheduleSuggestion[] = [];
      
      if (forecast.length === 0) {
        return [
          {
            time: "Morning (8-10 AM)",
            activity: "Light Exercise",
            reason: "Generally better air quality in the morning",
            health_risk: "Low"
          },
          {
            time: "Afternoon (2-4 PM)",
            activity: "Indoor Activities",
            reason: "Air pollution often peaks during afternoon",
            health_risk: "Moderate"
          },
          {
            time: "Evening (6-8 PM)",
            activity: "Indoor Workout",
            reason: "Avoid rush hour pollution",
            health_risk: "Moderate"
          },
          {
            time: "Night (8-10 PM)",
            activity: "Relaxing Walk",
            reason: "Traffic decreases, air quality improves",
            health_risk: "Low"
          }
        ];
      }
      
      const bestAQI = Math.min(...forecast.map(f => f.aqi));
      const bestHour = forecast.find(f => f.aqi === bestAQI);
      
      if (bestAQI <= 100) {
        suggestions.push({
          time: bestHour?.hour || "Morning",
          activity: "Outdoor Exercise",
          reason: `Best air quality of the day (AQI: ${bestAQI})`,
          health_risk: bestAQI <= 50 ? "Low" : "Moderate"
        });
      }
      
      const worstAQI = Math.max(...forecast.map(f => f.aqi));
      const worstHour = forecast.find(f => f.aqi === worstAQI);
      
      suggestions.push({
        time: worstHour?.hour || "Afternoon",
        activity: "Indoor Activities",
        reason: `Highest pollution levels expected (AQI: ${worstAQI})`,
        health_risk: worstAQI > 150 ? "High" : "Moderate"
      });
      
      suggestions.push({
        time: "Early Morning (6-8 AM)",
        activity: "Fresh Air Walk",
        reason: "Generally cleaner air in early morning",
        health_risk: "Low"
      });
      
      suggestions.push({
        time: "Evening (7-9 PM)",
        activity: "Indoor Workout",
        reason: "Avoid evening pollution peaks",
        health_risk: "Moderate"
      });
      
      return suggestions.slice(0, 4);
    };
    
    return generateBasicSchedule(hourlyForecast);
  }
};

export const generateAirStoryForChild = async (
  location: string,
  historicalData: HistoricalDataPoint[]
): Promise<string> => {
  if (!historicalData || historicalData.length === 0) {
    return "The air spirits in your city are taking a little rest today, but they'll be back soon with stories to tell!";
  }
  
  const avgAQI = historicalData.reduce((sum, d) => sum + d.aqi, 0) / historicalData.length;
  const maxAQI = Math.max(...historicalData.map(d => d.aqi));
  const minAQI = Math.min(...historicalData.map(d => d.aqi));
  
  // 記錄數據以便除錯
  console.log('Story generation data:', {
    location,
    avgAQI: avgAQI.toFixed(1),
    maxAQI,
    minAQI,
    dataPoints: historicalData.length
  });
  
  // 根據 AQI 程度決定故事基調
  let airQualityLevel = '';
  let tone = '';
  
  if (avgAQI <= 50) {
    airQualityLevel = 'excellent - the air is clean and healthy';
    tone = 'joyful and celebratory';
  } else if (avgAQI <= 100) {
    airQualityLevel = 'moderate - the air is acceptable but could be better';
    tone = 'gentle but encouraging improvement';
  } else if (avgAQI <= 150) {
    airQualityLevel = 'unhealthy for sensitive groups - the air needs help';
    tone = 'concerned but hopeful, emphasizing the need for action';
  } else if (avgAQI <= 200) {
    airQualityLevel = 'unhealthy - the air is quite polluted';
    tone = 'serious but age-appropriate, emphasizing protection and change';
  } else {
    airQualityLevel = 'very unhealthy - the air quality is poor';
    tone = 'serious and protective, but still encouraging positive action';
  }
  
  const prompt = `
    Create a magical story for children (ages 5-8) about the air in ${location}.
    
    IMPORTANT - Air quality context:
    - Current situation: ${airQualityLevel}
    - Average AQI this month: ${avgAQI.toFixed(0)} (higher numbers mean more pollution)
    - Best day: ${minAQI}
    - Most challenging day: ${maxAQI}
    
    Story requirements:
    - Tone: ${tone}
    - BE HONEST about air quality - don't make it sound better than it is
    - If AQI is above 100, the story MUST acknowledge that the air needs help
    - If AQI is above 150, clearly state that the air sprites are struggling
    - Personify air as friendly characters (sprites, fairies) who can be tired/struggling
    - Keep it age-appropriate but truthful
    - Length: 4-5 sentences
    - End with what children and families can do to help
    
    Example themes based on AQI level:
    - If AQI > 150: "The air sprites are very tired from all the pollution. The cloud puff dragons (cars) are making too much smoke."
    - If AQI 100-150: "The air sprites need our help! There are too many cloud puffs in the sky."
    - If AQI 50-100: "The air sprites are doing okay, but they could use some help from their tree friends."
    - If AQI < 50: "The air sprites are dancing happily in the clean sky!"
    
    Do not use markdown formatting.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    
    const responseText = response.text || '';
    if (!responseText.trim()) {
      throw new Error('Empty story response from Gemini API');
    }
    
    return responseText;
  } catch (error) {
    console.error("Error generating air story:", error);
    
    // 更誠實的後備故事
    const getBasicStory = (locationName: string, avgAqi: number): string => {
      if (avgAqi <= 50) {
        return `In ${locationName}, the air sprites are dancing joyfully in the clean, sparkly sky! The wind fairies and tree friends are working together perfectly to keep the air fresh and pure. When we breathe, we can feel the happy sprites filling our lungs with healthy, clean air. Let's keep helping them by walking, biking, and taking care of our green spaces!`;
      } else if (avgAqi <= 100) {
        return `In ${locationName}, the air sprites are working hard every day. Sometimes the "cloud puff dragons" (cars and factories) make grey clouds that tire out the sprites. The rain fairies help wash the sky clean, and the tree helpers work to make fresh air. We can help the sprites by using less cars, planting more trees, and choosing clean energy!`;
      } else if (avgAqi <= 150) {
        return `The air sprites in ${locationName} need our help! There are too many "cloud puff dragons" making grey smoke, and the poor sprites are getting very tired trying to clean it all. The wind messengers can't blow away all the pollution by themselves. We need to help by walking instead of driving, asking grown-ups to use cleaner energy, and planting lots of tree friends to help the sprites breathe easier!`;
      } else if (avgAqi <= 200) {
        return `Oh no! The air sprites in ${locationName} are struggling because there's so much pollution from cars and factories. The grey clouds are making it hard for the sprites to dance and play. We need to be air quality heroes! Stay inside when the air is bad, ask grown-ups to drive less, plant more trees, and tell everyone we need cleaner air for the sprites and for us!`;
      } else {
        return `The air sprites in ${locationName} are very worried - the pollution is making them too tired to fly! The "cloud puff dragons" have made so many grey clouds that it's hard to see the blue sky. But we can be super helpers! We must stay indoors on bad air days, tell everyone about clean energy, plant lots of trees, and ask our leaders to protect our air. Together, we can help the sprites feel strong again!`;
      }
    };
    
    return getBasicStory(location || 'your city', avgAQI);
  }
};

// 🎯 修改: 使用預先生成的插圖（因 Imagen API 需要計費）
export const generateImageFromStory = async (
  storyText: string,
  avgAQI?: number
): Promise<string | null> => {
  if (!storyText || !storyText.trim()) {
    return null;
  }

  console.log('📸 Loading pre-generated illustration based on AQI:', avgAQI);

  // 根據 AQI 級別選擇對應圖片
  let imageName = 'moderate.png';
  
  if (avgAQI !== undefined) {
    if (avgAQI <= 50) {
      imageName = 'excellent.png';
    } else if (avgAQI <= 100) {
      imageName = 'moderate.png';
    } else if (avgAQI <= 150) {
      imageName = 'sensitive.png';
    } else if (avgAQI <= 200) {
      imageName = 'unhealthy.png';
    } else if (avgAQI <= 300) {
      imageName = 'very-unhealthy.png';
    } else {
      imageName = 'hazardous.png';
    }
  }

  const imagePath = `/aqi-images/${imageName}`;
  console.log(`✅ Selected image: ${imagePath} for AQI: ${avgAQI}`);
  
  return imagePath;
};
