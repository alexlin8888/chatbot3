import requests
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import json
from http.server import BaseHTTPRequestHandler

# OpenAQ API 設定
API_KEY = "98765df2082f04dc9449e305bc736e93624b66e250fa9dfabcca53b31fc11647"
headers = {"X-API-Key": API_KEY}
BASE = "https://api.openaq.org/v3"

# 目標污染物參數
TARGET_PARAMS = ["co", "no2", "o3", "pm10", "pm25", "so2"]
PARAM_IDS = {"co": 8, "no2": 7, "o3": 10, "pm10": 1, "pm25": 2, "so2": 9}

# 時間容忍度設定（主要 ±5 分鐘，備用 ±60 分鐘）
TOL_MINUTES_PRIMARY = 5
TOL_MINUTES_FALLBACK = 60


def get_nearby_locations(lat: float, lon: float, radius: int = 25000):
    """獲取附近的監測站點"""
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
        
        # 計算距離並排序
        def calc_distance(loc):
            from math import radians, sin, cos, sqrt, atan2
            R = 6371  # 地球半徑(公里)
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
        print(f"獲取附近站點錯誤: {e}")
        return []


def get_location_meta(location_id: int):
    """獲取站點元數據資訊"""
    try:
        r = requests.get(f"{BASE}/locations/{location_id}", headers=headers)
        r.raise_for_status()
        row = r.json()["results"][0]
        last_utc = pd.to_datetime(row["datetimeLast"]["utc"], errors="coerce", utc=True)
        return {
            "id": int(row["id"]),
            "name": row["name"],
            "last_utc": last_utc,
            "last_local": row["datetimeLast"]["local"],
        }
    except Exception as e:
        print(f"獲取站點元數據錯誤: {e}")
        return None


def get_location_latest_df(location_id: int) -> pd.DataFrame:
    """獲取站點各參數的最新值清單，正規化時間格式"""
    try:
        r = requests.get(f"{BASE}/locations/{location_id}/latest", headers=headers, params={"limit": 1000})
        if r.status_code == 404:
            return pd.DataFrame()
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return pd.DataFrame()

        df = pd.json_normalize(results)

        # 提取參數名與單位
        if "parameter.name" in df.columns:
            df["parameter"] = df["parameter.name"].str.lower()
        elif "parameter" in df.columns:
            df["parameter"] = df["parameter"].str.lower()
        else:
            df["parameter"] = None
        
        df["units"] = df["parameter.units"] if "parameter.units" in df.columns else df.get("units")
        df["value"] = df["value"]

        # 處理 UTC 時間（優先順序處理）
        df["ts_utc"] = pd.NaT
        for col in ["datetime.utc", "period.datetimeTo.utc", "period.datetimeFrom.utc"]:
            if col in df.columns:
                ts = pd.to_datetime(df[col], errors="coerce", utc=True)
                df["ts_utc"] = df["ts_utc"].where(df["ts_utc"].notna(), ts)

        # 處理本地時間
        local_col = None
        for c in ["datetime.local", "period.datetimeTo.local", "period.datetimeFrom.local"]:
            if c in df.columns:
                local_col = c
                break
        df["ts_local"] = df[local_col] if local_col else None

        return df[["parameter", "value", "units", "ts_utc", "ts_local"]]
        
    except Exception as e:
        print(f"獲取站點最新數據錯誤: {e}")
        return pd.DataFrame()


def get_parameters_latest_df(location_id: int, target_params) -> pd.DataFrame:
    """使用參數端點獲取各污染物最新數據"""
    rows = []
    for p in target_params:
        pid = PARAM_IDS[p]
        try:
            r = requests.get(
                f"{BASE}/parameters/{pid}/latest",
                headers=headers,
                params={"locationId": location_id, "limit": 50},
            )
            if r.status_code == 404:
                continue
            r.raise_for_status()
            res = r.json().get("results", [])
            if not res:
                continue
            
            df = pd.json_normalize(res)

            # 參數名與單位
            df["parameter"] = p
            df["units"] = df["parameter.units"] if "parameter.units" in df.columns else df.get("units")
            df["value"] = df["value"]

            # 時間處理
            df["ts_utc"] = pd.NaT
            for col in ["datetime.utc", "period.datetimeTo.utc", "period.datetimeFrom.utc"]:
                if col in df.columns:
                    ts = pd.to_datetime(df[col], errors="coerce", utc=True)
                    df["ts_utc"] = df["ts_utc"].where(df["ts_utc"].notna(), ts)

            local_col = None
            for c in ["datetime.local", "period.datetimeTo.local", "period.datetimeFrom.local"]:
                if c in df.columns:
                    local_col = c
                    break
            df["ts_local"] = df[local_col] if local_col else None

            rows.append(df[["parameter", "value", "units", "ts_utc", "ts_local"]])
            
        except Exception as e:
            print(f"獲取參數 {p} 數據錯誤: {e}")
            continue

    if not rows:
        return pd.DataFrame()
    return pd.concat(rows, ignore_index=True)


def pick_batch_near(df: pd.DataFrame, t_ref: pd.Timestamp, tol_minutes: int) -> pd.DataFrame:
    """選取指定時間範圍內的數據批次"""
    if df.empty or pd.isna(t_ref):
        return pd.DataFrame()

    df = df.copy()

    # 將 ts_utc 中的 list/ndarray 轉為單一值
    def _scalarize(v):
        if isinstance(v, (list, tuple, np.ndarray)):
            return v[0] if len(v) else None
        return v

    df["ts_utc"] = df["ts_utc"].map(_scalarize)
    df["ts_utc"] = pd.to_datetime(df["ts_utc"], errors="coerce", utc=True)

    # 計算時間差異
    df["dt_diff"] = (df["ts_utc"] - t_ref).abs()

    # 過濾在容忍度內的數據
    tol = pd.Timedelta(minutes=tol_minutes)
    df = df[df["dt_diff"] <= tol]
    if df.empty:
        return df

    # 排序並去重
    df = df.sort_values(["parameter", "dt_diff", "ts_utc"], ascending=[True, True, False])
    df = df.drop_duplicates(subset=["parameter"], keep="first")
    return df[["parameter", "value", "units", "ts_utc", "ts_local"]]


def calculate_aqi(parameter: str, value: float) -> int:
    """根據污染物濃度計算 AQI（使用 EPA 2024 標準）"""
    if value is None:
        return 0
    
    param = parameter.lower()
    
    def calc_aqi(c, c_low, c_high, i_low, i_high):
        """AQI 線性插值計算"""
        return round(((i_high - i_low) / (c_high - c_low)) * (c - c_low) + i_low)
    
    # PM2.5 標準 (µg/m³)
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
    
    # PM10 標準 (µg/m³)
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
    
    # 臭氧 O3 標準 (ppm)
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
    
    # 二氧化氮 NO2 標準 (ppb)
    elif param == "no2":
        no2_ppb = value * 1000  # 轉換為 ppb
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
    
    # 二氧化硫 SO2 標準 (ppb)
    elif param == "so2":
        so2_ppb = value * 1000  # 轉換為 ppb
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
    
    # 一氧化碳 CO 標準 (ppm)
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


def get_comprehensive_air_quality(lat: float, lon: float):
    """簡化的空氣質量數據獲取（直接使用最新值）"""
    try:
        print(f"\n=== 獲取空氣質量數據 ({lat:.4f}, {lon:.4f}) ===")
        
        # 1. 獲取附近站點
        locations = get_nearby_locations(lat, lon)
        if not locations:
            return {"error": "附近未找到監測站點"}

        location = locations[0]
        location_id = int(location["id"])
        location_name = location.get("name", "未知站點")
        
        print(f"使用站點: {location_name} (ID: {location_id})")

        # 2. 直接獲取最新測量值 - 簡化方法
        measurements = []
        try:
            # 使用 measurements 端點直接獲取最新數據
            r = requests.get(
                f"{BASE}/measurements",
                headers=headers,
                params={
                    "location_id": location_id,
                    "limit": 20,
                    "order_by": "datetime",
                    "sort": "desc"
                },
                timeout=10
            )
            
            if r.status_code == 200:
                results = r.json().get("results", [])
                print(f"獲取到 {len(results)} 條原始數據")
                
                # 按參數分組，取每個參數的最新值
                param_data = {}
                for item in results:
                    param = item.get("parameter", "").lower()
                    if param in TARGET_PARAMS and param not in param_data:
                        value = item.get("value")
                        if value is not None:
                            param_data[param] = {
                                "value": float(value),
                                "units": item.get("unit"),
                                "timestamp": item.get("date", {}).get("utc")
                            }
                            print(f"  {param}: {value} (原始值)")
                
                # 轉換為測量列表
                for param, data in param_data.items():
                    aqi = calculate_aqi(param, data["value"])
                    measurements.append({
                        "parameter": param.upper(),
                        "value": data["value"],
                        "units": data["units"],
                        "aqi": aqi,
                        "timestamp": data["timestamp"],
                        "method": "直接最新值"
                    })
            else:
                print(f"API 請求失敗: {r.status_code}")
                return {"error": f"數據獲取失敗: {r.status_code}"}
        
        except Exception as e:
            print(f"獲取直接數據失敗: {e}")
            return {"error": f"數據獲取失敗: {str(e)}"}

        if not measurements:
            return {"error": "無有效的污染物測量值"}

        # 3. 計算主要污染物和AQI
        highest_aqi = 0
        dominant_pollutant = "PM25"
        
        for measurement in measurements:
            if measurement["aqi"] > highest_aqi:
                highest_aqi = measurement["aqi"]
                dominant_pollutant = measurement["parameter"]
        
        dominant_concentration = next(
            (m["value"] for m in measurements if m["parameter"] == dominant_pollutant),
            measurements[0]["value"]
        )

        print(f"\n✅ 最終 AQI: {highest_aqi}")
        print(f"   主要污染物: {dominant_pollutant}")
        print(f"   濃度: {dominant_concentration}")
        print(f"   有效參數: {len(measurements)}/{len(TARGET_PARAMS)}")

        return {
            "success": True,
            "location": {
                "id": location_id,
                "name": location_name,
                "latitude": location["coordinates"]["latitude"],
                "longitude": location["coordinates"]["longitude"]
            },
            "aqi": highest_aqi,
            "pollutant": dominant_pollutant,
            "concentration": float(dominant_concentration),
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "measurements": measurements,
            "standard": "EPA 2024",
            "note": "直接最新值計算，跳過複雜處理"
        }
        
    except Exception as e:
        print(f"空氣質量獲取錯誤: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}


# Vercel Serverless Function Handler
class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        """處理 GET 請求"""
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
                self.wfile.write(json.dumps({"error": "缺少緯度/經度參數"}).encode())
                return
            
            # 使用新的綜合方法獲取空氣質量數據
            result = get_comprehensive_air_quality(lat, lon)
            
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
        """處理 CORS 預檢請求"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
