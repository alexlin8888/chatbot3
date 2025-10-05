Using Render to run - WebSite: https://air-quality-predictor-y8se.onrender.com

The two Python files form a complete system for air quality prediction: one for training the prediction models and one for running the live web application.

app.py

The app.py script functions as the production-ready Flask web application for 24-hour Air Quality Index (AQI) prediction. 
It is configured to use the OpenAQ V3 API to fetch the latest air quality readings for a target location (defaulting to Kaohsiung, Taiwan). 
The core logic involves loading pre-trained XGBoost regression models for various pollutants (PM2.5, PM10, O3, NO2, SO2, CO), generating forecasts, 
  calculating the maximum AQI based on standard breakpoints, and rendering the results on a webpage. 
It includes robust error handling, location initialization, and a fallback mechanism to display the latest observed AQI if the prediction fails.

train_and_save.py

The train_and_save.py script is a local data pipeline and training utility designed to build robust XGBoost models for pollutant forecasting. 
It fetches up to 90 days of historical air quality data from OpenAQ and integrates meteorological data using the meteostat library 
  for comprehensive feature engineering (creating lagged values and rolling means). 
Critically, it uses a global list of 8 diverse locations (including Kaohsiung, New York, Delhi, and Tokyo) to ensure the models are trained 
  on a wide range of environmental conditions. 
The script then trains and saves separate XGBoost models for each pollutant for later use by the main app.py web application.
