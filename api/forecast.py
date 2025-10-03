# api/forecast.py
import os
import json
import numpy as np
import pandas as pd
import xgboost as xgb
from datetime import timedelta
from http.server import BaseHTTPRequestHandler

# 全局變量來緩存模型
_MODELS_CACHE = {}
_METADATA_CACHE = {}
_MODELS_LOADED = False

MODELS_DIR = 'models'
LAG_HOURS = [1, 2, 3, 6, 12, 24]
ROLLING_WINDOWS = [6, 12, 24]

# AQI 計算斷點
AQI_BREAKPOINTS = {
    "pm25": [(0.0, 12.0, 0, 50), (12.1, 35.4, 51, 100), (35.5, 55.4, 101, 150), (55.5, 150.4, 151, 200)],
    "pm10": [(0, 54, 0, 50), (55, 154, 51, 100), (155, 254, 101, 150), (255, 354, 151, 200)],
    "o3": [(0, 54, 0, 50), (55, 70, 51, 100), (71, 85, 101, 150), (86, 105, 151, 200)],
    "co": [(0.0, 4.4, 0, 50), (4.5, 9.4, 51, 100), (9.5, 12.4, 101, 150), (12.5, 15.4, 151, 200)],
    "no2": [(0, 100, 0, 50), (101, 360, 51, 100), (361, 649, 101, 150), (650, 1249, 151, 200)],
    "so2": [(0, 35, 0, 50), (36, 75, 51, 100), (76, 185, 101, 150), (186, 304, 151, 200)],
}

def calculate_aqi_sub_index(param: str, concentration: float) -> float:
    """計算單一污染物的 AQI 子指數"""
    if pd.isna(concentration) or concentration < 0:
        return np.nan
    
    breakpoints = AQI_BREAKPOINTS.get(param)
    if not breakpoints:
        return np.nan
    
    for C_low, C_high, I_low, I_high in breakpoints:
        if C_low <= concentration <= C_high:
            if C_high == C_low:
                return I_high
            I = ((I_high - I_low) / (C_high - C_low)) * (concentration - C_low) + I_low
            return np.round(I)
    
    # 超出最高範圍
    if concentration > breakpoints[-1][1]:
        I_low, I_high = breakpoints[-1][2], breakpoints[-1][3]
        C_low, C_high = breakpoints[-1][0], breakpoints[-1][1]
        if C_high == C_low:
            return I_high
        I_rate = (I_high - I_low) / (C_high - C_low)
        I = I_high + I_rate * (concentration - C_high)
        return np.round(I)
    
    return np.nan

def calculate_aqi(row: pd.Series, params: list, is_pred=True) -> float:
    """計算最終 AQI（取最大子指數）"""
    sub_indices = []
    for p in params:
        col_name = f'{p}_pred' if is_pred else p
        if col_name in row and pd.notna(row[col_name]):
            sub_index = calculate_aqi_sub_index(p, row[col_name])
            if pd.notna(sub_index):
                sub_indices.append(sub_index)
    
    if not sub_indices:
        return np.nan
    
    return np.max(sub_indices)

def load_models():
    """加載所有模型（僅在首次調用時執行）"""
    global _MODELS_CACHE, _METADATA_CACHE, _MODELS_LOADED
    
    if _MODELS_LOADED:
        return _MODELS_CACHE, _METADATA_CACHE
    
    try:
        # 讀取元數據
        meta_path = os.path.join(MODELS_DIR, 'model_meta.json')
        with open(meta_path, 'r', encoding='utf-8') as f:
            _METADATA_CACHE = json.load(f)
        
        pollutant_params = _METADATA_CACHE.get('pollutant_params', [])
        
        # 加載各污染物模型
        for param in pollutant_params:
            model_path = os.path.join(MODELS_DIR, f'{param}_model.json')
            if os.path.exists(model_path):
                model = xgb.XGBRegressor()
                model.load_model(model_path)
                _MODELS_CACHE[param] = model
        
        _MODELS_LOADED = True
        print(f"✅ 成功加載 {len(_MODELS_CACHE)} 個模型")
        return _MODELS_CACHE, _METADATA_CACHE
        
    except Exception as e:
        print(f"❌ 模型加載失敗: {e}")
        return {}, {}

def predict_future_multi(models, last_data, feature_cols, pollutant_params, hours=24):
    """遞歸預測未來 N 小時"""
    predictions = []
    
    # 確保 datetime 有時區
    last_data['datetime'] = pd.to_datetime(last_data['datetime'])
    if last_data['datetime'].dt.tz is None:
        last_data['datetime'] = last_data['datetime'].dt.tz_localize('UTC')
    
    last_datetime_aware = last_data['datetime'].iloc[0]
    
    # 初始化特徵字典
    current_data_dict = {
        col: last_data.get(col, np.nan).iloc[0] 
        if col in last_data.columns and not last_data[col].empty 
        else np.nan 
        for col in feature_cols
    }
    
    # 天氣特徵
    weather_features = ['temperature', 'humidity', 'pressure']
    has_weather = any(col in feature_cols for col in weather_features)
    
    for h in range(hours):
        future_time = last_datetime_aware + timedelta(hours=h + 1)
        pred_features = current_data_dict.copy()
        
        # 更新時間特徵
        pred_features['hour'] = future_time.hour
        pred_features['day_of_week'] = future_time.dayofweek
        pred_features['month'] = future_time.month
        pred_features['day_of_year'] = future_time.timetuple().tm_yday
        pred_features['is_weekend'] = int(future_time.dayofweek in [5, 6])
        pred_features['hour_sin'] = np.sin(2 * np.pi * future_time.hour / 24)
        pred_features['hour_cos'] = np.cos(2 * np.pi * future_time.hour / 24)
        pred_features['day_sin'] = np.sin(2 * np.pi * pred_features['day_of_year'] / 365)
        pred_features['day_cos'] = np.cos(2 * np.pi * pred_features['day_of_year'] / 365)
        
        # 模擬天氣變化（簡單隨機遊走）
        if has_weather:
            np.random.seed(future_time.hour + future_time.day + 42)
            for w_col in weather_features:
                if w_col in feature_cols:
                    base_value = current_data_dict.get(w_col)
                    if base_value is not None and pd.notna(base_value):
                        new_value = base_value + np.random.normal(0, 0.5)
                        pred_features[w_col] = new_value
                        current_data_dict[w_col] = new_value
                    else:
                        pred_features[w_col] = np.nan
        
        current_prediction_row = {'datetime': future_time}
        new_pollutant_values = {}
        
        # 預測所有污染物
        for param in pollutant_params:
            model = models[param]
            pred_input_list = [pred_features.get(col, np.nan) for col in feature_cols]
            pred_input = np.array(pred_input_list, dtype=np.float64).reshape(1, -1)
            
            pred = model.predict(pred_input)[0]
            pred = max(0, pred)
            
            current_prediction_row[f'{param}_pred'] = pred
            new_pollutant_values[param] = pred
        
        # 計算預測 AQI
        predicted_aqi = calculate_aqi(pd.Series(current_prediction_row), pollutant_params, is_pred=True)
        current_prediction_row['aqi_pred'] = predicted_aqi
        new_pollutant_values['aqi'] = predicted_aqi
        
        predictions.append(current_prediction_row)
        
        # 更新滯後特徵（用於下一小時預測）
        for param in pollutant_params + ['aqi']:
            for i in range(len(LAG_HOURS) - 1, 0, -1):
                lag_current = LAG_HOURS[i]
                lag_prev = LAG_HOURS[i-1]
                lag_current_col = f'{param}_lag_{lag_current}h'
                lag_prev_col = f'{param}_lag_{lag_prev}h'
                
                if lag_current_col in current_data_dict and lag_prev_col in current_data_dict:
                    current_data_dict[lag_current_col] = current_data_dict[lag_prev_col]
            
            if f'{param}_lag_1h' in current_data_dict and param in new_pollutant_values:
                current_data_dict[f'{param}_lag_1h'] = new_pollutant_values[param]
    
    return pd.DataFrame(predictions)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """處理預測請求"""
        try:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            
            # 獲取參數
            hours = int(params.get('hours', ['12'])[0])
            hours = min(max(hours, 1), 24)  # 限制在 1-24 小時
            
            # 加載模型
            models, metadata = load_models()
            
            if not models or not metadata:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": "模型未加載或元數據缺失"
                }).encode())
                return
            
            # 獲取最後觀測數據
            last_observation_json = metadata.get('last_observation_json')
            if not last_observation_json:
                self.send_response(500)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({
                    "error": "缺少最後觀測數據"
                }).encode())
                return
            
            last_observation = pd.read_json(last_observation_json, orient='records')
            feature_columns = metadata.get('feature_columns', [])
            pollutant_params = metadata.get('pollutant_params', [])
            
            # 執行預測
            predictions = predict_future_multi(
                models,
                last_observation,
                feature_columns,
                pollutant_params,
                hours=hours
            )
            
            # 格式化輸出
            result = []
            for _, row in predictions.iterrows():
                result.append({
                    "hour": row['datetime'].strftime('%I %p'),
                    "aqi": int(row['aqi_pred']) if pd.notna(row['aqi_pred']) else None,
                    "timestamp": row['datetime'].isoformat(),
                    "pollutants": {
                        param: float(row[f'{param}_pred']) 
                        for param in pollutant_params 
                        if f'{param}_pred' in row
                    }
                })
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "success": True,
                "predictions": result,
                "hours": hours
            }).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({
                "error": str(e)
            }).encode())
    
    def do_OPTIONS(self):
        """處理 CORS 預檢請求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
