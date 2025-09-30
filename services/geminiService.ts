import { GoogleGenAI, Type } from "@google/genai";
import type { AQIDataPoint, UserHealthProfile, SmartScheduleSuggestion, HourlyForecastData, HistoricalDataPoint } from '../types';

// 環境變數獲取函數 - 處理瀏覽器環境
const getGeminiApiKey = (): string => {
  // 1. AI Studio 環境
  if (typeof window !== 'undefined' && (window as any).process?.env?.API_KEY) {
    return (window as any).process.env.API_KEY;
  }
  
  // 2. Vite 環境變數 (瀏覽器)
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GEMINI_API_KEY) {
    return import.meta.env.VITE_GEMINI_API_KEY as string;
  }
  
  // 3. Node.js 環境 (如果存在)
  if (typeof process !== 'undefined' && process.env?.VITE_GEMINI_API_KEY) {
    return process.env.VITE_GEMINI_API_KEY;
  }
  
  if (typeof process !== 'undefined' && process.env?.API_KEY) {
    return process.env.API_KEY;
  }
  
  // 4. 後備方案
  console.warn('Using fallback Gemini API key');
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
    
    // 確保 response.text 存在且不為 undefined
    const responseText = response.text;
    if (!responseText) {
      throw new Error('No response text received from Gemini API');
    }
    
    return responseText;
  } catch (error) {
    console.error("Error generating health advice:", error);
    
    // 提供基於 AQI 級別的基本建議作為後備
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

    const responseText = response.text;
    if (!responseText) {
      throw new Error('No response received from Gemini API');
    }
    
    const jsonText = responseText.trim();
    return JSON.parse(jsonText) as SmartScheduleSuggestion[];
  } catch (error) {
    console.error("Error generating smart schedule:", error);
    
    // 提供基本的後備排程建議
    const generateBasicSchedule = (forecast: HourlyForecastData[]): SmartScheduleSuggestion[] => {
      const suggestions: SmartScheduleSuggestion[] = [];
      
      // 找出 AQI 最低的時段
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
      
      // 室內活動建議
      const worstAQI = Math.max(...forecast.map(f => f.aqi));
      const worstHour = forecast.find(f => f.aqi === worstAQI);
      
      suggestions.push({
        time: worstHour?.hour || "Afternoon",
        activity: "Indoor Activities",
        reason: `Highest pollution levels expected (AQI: ${worstAQI})`,
        health_risk: worstAQI > 150 ? "High" : "Moderate"
      });
      
      // 添加更多基本建議
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
      
      return suggestions.slice(0, 4); // 確保只返回4個建議
    };
    
    return generateBasicSchedule(hourlyForecast);
  }
};

export const generateAirStoryForChild = async (
  location: string,
  historicalData: HistoricalDataPoint[]
): Promise<string> => {
  if (historicalData.length === 0) {
    return "The air spirits in your city are taking a little rest today, but they'll be back soon with stories to tell!";
  }
  
  const avgAQI = historicalData.reduce((sum, d) => sum + d.aqi, 0) / historicalData.length;
  const maxAQI = Math.max(...historicalData.map(d => d.aqi));
  const minAQI = Math.min(...historicalData.map(d => d.aqi));
  
  const prompt = `
    Create a magical, gentle story for children (ages 5-8) about the air in ${location}.
    
    Air quality context:
    - Average AQI this month: ${avgAQI.toFixed(0)}
    - Best day: ${minAQI}
    - Most challenging day: ${maxAQI}
    
    The story should:
    - Personify the air as friendly characters (wind sprites, air fairies, etc.)
    - Explain air quality changes in simple, magical terms
    - Include positive environmental messages
    - Be 3-4 sentences long
    - Use simple vocabulary
    - End on an encouraging note
    
    Example themes:
    - Cars and factories as "sleepy dragons" that blow clouds
    - Rain as "shower fairies" that clean the air
    - Plants as "air helpers" that make oxygen
    - Wind as messengers carrying fresh air
    
    Do not use markdown formatting.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt
    });
    
    const responseText = response.text;
    if (!responseText) {
      throw new Error('No story response received from Gemini API');
    }
    
    return responseText;
  } catch (error) {
    console.error("Error generating air story:", error);
    
    // 基本的後備故事
    const getBasicStory = (locationName: string, avgAqi: number): string => {
      if (avgAqi <= 50) {
        return `In the magical city of ${locationName}, the air sprites are dancing happily in the clean, sparkly sky! The wind fairies have been working hard with the tree friends to keep the air fresh and pure. Today is a perfect day for the air sprites to play and help everyone breathe easily. Let's help them by walking and riding bikes instead of using cars!`;
      } else if (avgAqi <= 100) {
        return `In ${locationName}, the air sprites are having a gentle adventure! Sometimes they get a little tired from all the busy cars and buildings, but the rain fairies often visit to wash the sky clean. The air sprites are asking everyone to help by planting more trees and using less energy. Together, we can keep the sky bright and clear!`;
      } else {
        return `The air sprites in ${locationName} have been working extra hard lately! Some sleepy dragons (cars and factories) have been puffing out more clouds than usual. But don't worry - the wind messengers are bringing fresh air from the mountains, and the rain fairies are coming to help clean up. We can help the air sprites by staying inside when they're tired and planting more green friends (trees) to help them!`;
      }
    };
    
    return getBasicStory(location, avgAQI);
  }
};

export const generateImageFromStory = async (storyText: string): Promise<string | null> => {
    const prompt = `Create a whimsical, child-friendly illustration based on this story: "${storyText}". 
    
    Style: Soft watercolor, bright and cheerful colors, magical and dreamy atmosphere
    Elements: Include air sprites, friendly characters, clean sky, and nature elements
    Mood: Optimistic, magical, educational for children
    Composition: Wide landscape showing sky and city/nature harmony`;
    
    try {
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: prompt,
            config: {
              numberOfImages: 1,
              outputMimeType: 'image/png',
              aspectRatio: '16:9',
            },
        });

        if (response.generatedImages && response.generatedImages.length > 0) {
            const base64ImageBytes: string = response.generatedImages[0].image.imageBytes;
            return `data:image/png;base64,${base64ImageBytes}`;
        }
        return null;
    } catch (error) {
        console.error("Error generating image from story:", error);
        return null;
    }
};
