// This directive adds type definitions for Vite's client-side environment variables.
/// <reference types="vite/client" />

export const getOpenAQApiKey = (): string => {
  // In a Vite project, environment variables prefixed with VITE_ are exposed on the import.meta.env object.
  const apiKey = import.meta.env.VITE_OPENAQ_API_KEY;

  if (apiKey) {
    return apiKey;
  }

  // Fallback for development/demo purposes if the environment variable is not set.
  console.warn('VITE_OPENAQ_API_KEY is not set. Using a fallback key for demonstration.');
  return '1aedaa907545aa98f9610596b00a790661281ac64533a10ff1a02eda13866d68';
};
