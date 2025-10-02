import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
from http.server import BaseHTTPRequestHandler

API_KEY = "98765df2082f04dc9449e305bc736e93624b66e250fa9dfabcca53b31fc11647"
headers = {"X-API-Key": API_KEY}
BASE = "https://api.openaq.org/v3"

TARGET_PARAMS = ["co", "no2", "o3", "pm10", "pm25", "so2"]
PARAM_IDS = {"co": 8, "no2": 7, "o3": 10, "pm10": 1, "pm25": 2, "so2": 9}

TOL_MINUTES_PRIMARY = 5
TOL_MINUTES_FALLBACK = 60


def calculate_nowcast(hourly_values):
    """
    計算 NowCast（EPA 官方算法）
    
    hourly_values: 最近12小時的濃度列表，從舊到新排序
    返回: NowCast 值
    
    參考: https://forum.airnowtech.org/t/the-nowcast-for-pm2-5-and-pm10/172
    """
    if not hourly_values or len(hourly_values) < 2:
        return hourly_values[-1] if hourly_values else None
    
    # 只使用最近 12 小時
    values = hourly_values[-12:]
    
    # 移除 None 值
    values = [v for v in values if v is not None]
    if len(values) < 2:
        return values[-1] if values else None
    
    # 計算 min 和 max
    max_val = max(values)
    min_val = min(values)
    
    # 計算權重因子 w
    if max_val > 0:
        w = 1.0 - (max_val - min_val) / max_val
        w = max(0.5, w)  # w 最小值為 0.5
    else:
        w = 0.5
    
    # 計算加權平均（從最新往前算）
    weighted_sum = 0.0
    weight_sum = 0.0
    
    for i, value in enumerate(reversed(values)):
        weight = w ** i
        weighted_sum += value * weight
        weight_sum += weight
    
    nowcast = weighted_sum / weight_sum if weight_sum > 0 else values[-1]
    
    print(f"  NowCast計算: 使用 {len(values)} 小時數據")
    print(f"  範圍: {min_val:.1f} - {max_val:.1f}, 權重因子: {w:.3f}")
    print(f"  即時值: {values[-1]:.1f} → NowCast: {nowcast:.1f}")
    
    return nowcast


def calculate_aqi(parameter: str, value: float) -> int:
    """
    根據污染物濃度計算 AQI（使用 2024 年 5 月 EPA 最新標準）
    """
    if value is None:
        return 0
    
    param = parameter.lower()
    
    def calc_aqi(c, c_low, c_high, i_low, i_high):
        return round(((i_high - i_low) / (c_high - c_low)) * (c - c_low) + i_low)
    
    if param == "pm25":
        if value <= 9.0:
            return calc_aqi(value, 0, 9.0, 0, 50)
        elif value <= 35.4:
            return calc_aqi(value, 9.1, 35.4, 51, 100)
        elif value <= 55.4:
            return calc_aqi(value, 35.5, 55.4, 101, 150)
        elif value <= 125.4:
            return calc_aqi(value, 55.5, 125.4, 151, 200)
        elif value <= 225.4:
            return calc_aqi(value, 125.5, 225.4, 201, 300)
        elif value <= 325.4:
            return calc_aqi(value, 225.5, 325.4, 301, 500)
        else:
            return 500
    
    elif param == "pm10":
        if value <= 54:
            return calc_aqi(value, 0, 54, 0, 50)
        elif value <= 154:
            return calc_aqi(value, 55, 154, 51, 100)
        elif value <= 254:
            return calc_aqi(value, 155, 254, 101, 150)
        elif value <= 354:
            return calc_aqi(value, 255, 354, 151, 200)
        elif value <= 424:
            return calc_aqi(value, 355, 424, 201, 300)
        elif value <= 604:
            return calc_aqi(value, 425, 604, 301, 500)
        else:
            return 500
    
    elif param == "o3":
        if value <= 0.054:
            return calc_aqi(value, 0, 0.054, 0, 50)
        elif value <= 0.070:
            return calc_aqi(value, 0.055, 0.070, 51, 100)
        elif value <= 0.085:
            return calc_aqi(value, 0.071, 0.085, 101, 150)
        elif value <= 0.105:
            return calc_aqi(value, 0.086, 0.105, 151, 200)
        elif value <= 0.200:
            return calc_aqi(value, 0.106, 0.200, 201, 300)
        else:
            return 301
    
    elif param == "no2":
        no2_ppb = value * 1000
        if no2_ppb <= 53:
            return calc_aqi(no2_ppb, 0, 53, 0, 50)
        elif no2_ppb <= 100:
            return calc_aqi(no2_ppb, 54, 100, 51, 100)
        elif no2_ppb <= 360:
            return calc_aqi(no2_ppb, 101, 360, 101, 150)
        elif no2_ppb <= 649:
            return calc_aqi(no2_ppb, 361, 649, 151, 200)
        elif no2_ppb <= 1249:
            return calc_aqi(no2_ppb, 650, 1249, 201, 300)
        elif no2_ppb <= 2049:
            return calc_aqi(no2_ppb, 1250, 2049, 301, 500)
        else:
            return 500
    
    elif param == "so2":
        so2_ppb = value * 1000
        if so2_ppb <= 35:
            return calc_aqi(so2_ppb, 0, 35, 0, 50)
        elif so2_ppb <= 75:
            return calc_aqi(so2_ppb, 36, 75, 51, 100)
        elif so2_ppb <= 185:
            return calc_aqi(so2_ppb, 76, 185, 101, 150)
        elif so2_ppb <= 304:
            return calc_aqi(so2_ppb, 186, 304, 151, 200)
        else:
            return 200
    
    elif param == "co":
        if value <= 4.4:
            return calc_aqi(value, 0, 4.4, 0, 50)
        elif value <= 9.4:
            return calc_aqi(value, 4.5, 9.4, 51, 100)
        elif value <= 12.4:
            return calc_aqi(value, 9.5, 12.4, 101, 150)
        elif value <= 15.4:
            return calc_aqi(value, 12.5, 15.4, 151, 200)
        elif value <= 30.4:
            return calc_aqi(value, 15.5, 30.4, 201, 300)
        elif value <= 50.4:
            return calc_aqi(value, 30.5, 50.4, 301, 500)
        else:
            return 500
    
    return min(round(value * 2), 300)


def get_nearby_locations(lat: float, lon: float, radius: int = 25000):
    """獲取附近的監測站"""
    try:
        r = requests.get(
            f"{BASE}/locations",
            headers=headers,
            params={
                "coordinates": f"{lat},{lon}",
                "radius": min(radius, 25000),
                "limit": 10
            },
            timeout=10
        )
        r.raise_for_status()
        results = r.json().get("results", [])
        
        def calc_distance(loc):
            from math import radians, sin, cos, sqrt, atan2
            R = 6371
            lat1, lon1 = radians(lat), radians(lon)
            lat2 = radians(loc["coordinates"]["latitude"])
            lon2 = radians(loc["coordinates"]["longitude"])
            dlat = lat2 - lat1
            dlon = lon2 - lon1
            a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
            c = 2 * atan2(sqrt(a), sqrt(1-a))
            return R * c
        
        results.sort(key=calc_distance)
        return results
    except Exception as e:
        print(f"Error fetching locations: {e}")
        return []


def get_sensor_hourly_data(sensor_id: int, hours: int = 12):
    """
    獲取 sensor 過去 N 小時的數據
    返回: 按時間排序的濃度列表（從舊到新）
    """
    try:
        end_time = datetime.utcnow()
        start_time = end_time - timedelta(hours=hours)
        
        r = requests.get(
            f"{BASE}/sensors/{sensor_id}/measurements",
            headers=headers,
            params={
                "date_from": start_time.isoformat() + "Z",
                "date_to": end_time.isoformat() + "Z",
                "limit": 1000
            },
            timeout=15
        )
        
        if r.status_code != 200:
            return []
        
        results = r.json().get("results", [])
        if not results:
            return []
        
        # 提取時間和數值
        data_points = []
        for item in results:
            timestamp_str = None
            if item.get("period", {}).get("datetimeFrom", {}).get("utc"):
                timestamp_str = item["period"]["datetimeFrom"]["utc"]
            elif item.get("datetime", {}).get("utc"):
                timestamp_str = item["datetime"]["utc"]
            
            if timestamp_str and isinstance(item.get("value"), (int, float)):
                try:
                    timestamp = pd.to_datetime(timestamp_str, utc=True)
                    data_points.append({
                        "time": timestamp,
                        "value": float(item["value"])
                    })
                except:
                    continue
        
        if not data_points:
            return []
        
        # 按時間排序
        df = pd.DataFrame(data_points)
        df = df.sort_values("time")
        
        # 按小時分組，取每小時的平均值
        df["hour"] = df["time"].dt.floor("H")
        hourly = df.groupby("hour")["value"].mean().reset_index()
        hourly = hourly.sort_values("hour")
        
        return hourly["value"].tolist()
        
    except Exception as e:
        print(f"Error fetching hourly data: {e}")
        return []


def get_location_latest_with_sensors(location_id: int):
    """獲取站點資訊（包含 sensors）"""
    try:
        r = requests.get(
            f"{BASE}/locations/{location_id}",
            headers=headers,
            timeout=10
        )
        r.raise_for_status()
        return r.json().get("results", [None])[0]
    except Exception as e:
        print(f"Error fetching location info: {e}")
        return None


def get_latest_air_quality(lat: float, lon: float):
    """獲取最新空氣品質數據（使用 NowCast）"""
    try:
        print(f"\n=== Fetching air quality with NowCast for ({lat:.4f}, {lon:.4f}) ===")
        
        # 1. 獲取附近站點
        locations = get_nearby_locations(lat, lon)
        if not locations:
            return {"error": "No nearby monitoring stations found"}

        location = locations[0]
        location_id = int(location["id"])
        location_name = location.get("name", "Unknown")

        print(f"Using location: {location_name} (ID: {location_id})")

        # 2. 獲取站點詳細資訊（包含 sensors）
        location_detail = get_location_latest_with_sensors(location_id)
        if not location_detail or not location_detail.get("sensors"):
            return {"error": "No sensors found for this location"}

        sensors = location_detail["sensors"]
        print(f"Found {len(sensors)} sensors")

        # 3. 找到 PM2.5 sensor
        pm25_sensor = None
        for sensor in sensors:
            param_name = sensor.get("parameter", {}).get("name", "").lower()
            if "pm2.5" in param_name or "pm25" in param_name:
                pm25_sensor = sensor
                break
        
        if not pm25_sensor:
            return {"error": "No PM2.5 sensor found"}

        sensor_id = pm25_sensor["id"]
        print(f"Using PM2.5 sensor ID: {sensor_id}")

        # 4. 獲取過去 12 小時的數據
        print(f"Fetching 12-hour data for NowCast...")
        hourly_values = get_sensor_hourly_data(sensor_id, hours=12)
        
        if not hourly_values:
            return {"error": "No historical data available for NowCast"}

        print(f"Got {len(hourly_values)} hours of data")

        # 5. 計算 NowCast
        nowcast_value = calculate_nowcast(hourly_values)
        
        if nowcast_value is None:
            return {"error": "Failed to calculate NowCast"}

        # 6. 用 NowCast 值計算 AQI
        aqi = calculate_aqi("pm25", nowcast_value)
        
        print(f"\n✅ Final NowCast AQI: {aqi}")
        print(f"   NowCast PM2.5: {nowcast_value:.1f} µg/m³")
        print(f"   Instant PM2.5: {hourly_values[-1]:.1f} µg/m³ (for reference)")

        # 7. 獲取其他污染物的即時值（可選）
        measurements = [{
            "parameter": "pm25",
            "value": float(nowcast_value),
            "instant_value": float(hourly_values[-1]),
            "units": "µg/m³",
            "aqi": aqi,
            "method": "NowCast (12-hour weighted average)",
            "timestamp": datetime.utcnow().isoformat() + "Z"
        }]

        return {
            "success": True,
            "location": {
                "id": location_id,
                "name": location_name,
                "latitude": location["coordinates"]["latitude"],
                "longitude": location["coordinates"]["longitude"]
            },
            "aqi": aqi,
            "pollutant": "PM25",
            "concentration": float(nowcast_value),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "measurements": measurements,
            "standard": "EPA 2024 with NowCast",
            "note": "NowCast uses 12-hour weighted average, matching AirNow.gov methodology"
        }

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


# Vercel Serverless Function Handler
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            from urllib.parse import urlparse, parse_qs
            parsed = urlparse(self.path)
            params = parse_qs(parsed.query)
            
            lat = float(params.get('lat', [0])[0])
            lon = float(params.get('lon', [0])[0])
            
            if lat == 0 or lon == 0:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Missing lat/lon parameters"}).encode())
                return
            
            result = get_latest_air_quality(lat, lon)
            
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps(result).encode())
            
        except Exception as e:
            self.send_response(500)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(json.dumps({"error": str(e)}).encode())
    
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
