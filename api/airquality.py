import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
from http.server import BaseHTTPRequestHandler

API_KEY = "98765df2082f04dc9449e305bc736e93624b66e250fa9dfabcca53b31fc11647"
headers = {"X-API-Key": API_KEY}
BASE = "https://api.openaq.org/v3"

def calculate_aqi(parameter: str, value: float) -> int:
    """根據污染物濃度計算 AQI（使用 2024 年 5 月 EPA 最新標準）"""
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


def calculate_nowcast(hourly_values):
    """計算 NowCast（EPA 官方算法）"""
    if not hourly_values or len(hourly_values) < 2:
        return hourly_values[-1] if hourly_values else None
    
    values = hourly_values[-12:]
    values = [v for v in values if v is not None]
    if len(values) < 2:
        return values[-1] if values else None
    
    max_val = max(values)
    min_val = min(values)
    
    if max_val > 0:
        w = 1.0 - (max_val - min_val) / max_val
        w = max(0.5, w)
    else:
        w = 0.5
    
    weighted_sum = 0.0
    weight_sum = 0.0
    
    for i, value in enumerate(reversed(values)):
        weight = w ** i
        weighted_sum += value * weight
        weight_sum += weight
    
    nowcast = weighted_sum / weight_sum if weight_sum > 0 else values[-1]
    
    return nowcast


def get_latest_air_quality_detailed(lat: float, lon: float):
    """獲取最新空氣品質數據（包含詳細除錯資訊）"""
    try:
        print(f"\n=== Fetching air quality with detailed info for ({lat:.4f}, {lon:.4f}) ===")
        
        # 1. 獲取附近站點
        locations = get_nearby_locations(lat, lon)
        if not locations:
            return {"error": "No nearby monitoring stations found"}

        location = locations[0]
        location_id = int(location["id"])
        location_name = location.get("name", "Unknown")

        print(f"Using location: {location_name} (ID: {location_id})")

        # 2. 獲取站點詳細資訊
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
        
        # 🎯 獲取即時值（從 sensor 的 latest 欄位）
        instant_value = pm25_sensor.get("latest", {}).get("value")
        latest_time = pm25_sensor.get("latest", {}).get("datetime", {}).get("utc")
        
        if instant_value is None:
            return {"error": "No instant value available"}
        
        instant_value = float(instant_value)
        
        print(f"Using PM2.5 sensor ID: {sensor_id}")
        print(f"📈 Instant value: {instant_value:.1f} µg/m³")

        # 4. 獲取過去 12 小時的數據
        print(f"Fetching 12-hour data for NowCast...")
        hourly_values = get_sensor_hourly_data(sensor_id, hours=12)
        
        # 5. 計算統計數據
        if hourly_values and len(hourly_values) > 0:
            avg_value = sum(hourly_values) / len(hourly_values)
            min_value = min(hourly_values)
            max_value = max(hourly_values)
            
            # 計算 NowCast
            nowcast_value = calculate_nowcast(hourly_values)
            
            print(f"📊 12-hour statistics:")
            print(f"   Data points: {len(hourly_values)}")
            print(f"   Average: {avg_value:.1f} µg/m³")
            print(f"   Min: {min_value:.1f} µg/m³")
            print(f"   Max: {max_value:.1f} µg/m³")
            print(f"   NowCast: {nowcast_value:.1f} µg/m³")
        else:
            nowcast_value = instant_value
            avg_value = instant_value
            min_value = instant_value
            max_value = instant_value
            hourly_values = [instant_value]

        # 6. 計算 AQI
        instant_aqi = calculate_aqi("pm25", instant_value)
        nowcast_aqi = calculate_aqi("pm25", nowcast_value)
        avg_aqi = calculate_aqi("pm25", avg_value)
        
        print(f"\n✅ Results:")
        print(f"   Instant: {instant_value:.1f} µg/m³ → AQI {instant_aqi}")
        print(f"   NowCast: {nowcast_value:.1f} µg/m³ → AQI {nowcast_aqi}")
        print(f"   12h Avg: {avg_value:.1f} µg/m³ → AQI {avg_aqi}")

        # 7. 返回詳細結果
        return {
            "success": True,
            "location": {
                "id": location_id,
                "name": location_name,
                "latitude": location["coordinates"]["latitude"],
                "longitude": location["coordinates"]["longitude"]
            },
            # 主要數值（使用 NowCast）
            "aqi": nowcast_aqi,
            "pollutant": "PM25",
            "concentration": float(nowcast_value),
            "timestamp": latest_time or datetime.utcnow().isoformat() + "Z",
            
            # 🎯 詳細數據
            "detailed": {
                "instant": {
                    "value": float(instant_value),
                    "aqi": instant_aqi,
                    "timestamp": latest_time
                },
                "nowcast": {
                    "value": float(nowcast_value),
                    "aqi": nowcast_aqi
                },
                "statistics_12h": {
                    "average": {
                        "value": float(avg_value),
                        "aqi": avg_aqi
                    },
                    "min": float(min_value),
                    "max": float(max_value),
                    "data_points": len(hourly_values),
                    "all_values": [float(v) for v in hourly_values]  # 所有數據點
                },
                "difference": {
                    "instant_vs_nowcast": {
                        "value": float(abs(instant_value - nowcast_value)),
                        "percentage": float(abs(instant_value - nowcast_value) / instant_value * 100),
                        "aqi": abs(instant_aqi - nowcast_aqi)
                    },
                    "instant_vs_average": {
                        "value": float(abs(instant_value - avg_value)),
                        "percentage": float(abs(instant_value - avg_value) / instant_value * 100),
                        "aqi": abs(instant_aqi - avg_aqi)
                    }
                }
            },
            
            # 保持原有格式
            "measurements": [{
                "parameter": "pm25",
                "value": float(nowcast_value),
                "instant_value": float(instant_value),
                "units": "µg/m³",
                "aqi": nowcast_aqi,
                "method": "NowCast (12-hour weighted average)",
                "timestamp": latest_time or datetime.utcnow().isoformat() + "Z"
            }],
            "standard": "EPA 2024 with NowCast",
            "note": "NowCast uses 12-hour weighted average. See 'detailed' field for complete breakdown."
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
            
            result = get_latest_air_quality_detailed(lat, lon)
            
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
