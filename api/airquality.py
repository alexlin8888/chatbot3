import requests
import pandas as pd
import numpy as np
from datetime import datetime
import json
from http.server import BaseHTTPRequestHandler

API_KEY = "98765df2082f04dc9449e305bc736e93624b66e250fa9dfabcca53b31fc11647"
headers = {"X-API-Key": API_KEY}
BASE = "https://api.openaq.org/v3"

TARGET_PARAMS = ["co", "no2", "o3", "pm10", "pm25", "so2"]
PARAM_IDS = {"co": 8, "no2": 7, "o3": 10, "pm10": 1, "pm25": 2, "so2": 9}

TOL_MINUTES_PRIMARY = 5
TOL_MINUTES_FALLBACK = 60


def calculate_aqi(parameter: str, value: float) -> int:
    """
    根據污染物濃度計算 AQI（使用 2024 年 5 月 EPA 最新標準）
    
    參考: https://aqs.epa.gov/aqsweb/documents/codetables/aqi_breakpoints.html
    """
    param = parameter.lower()
    
    # AQI 計算公式
    def calc_aqi(c, c_low, c_high, i_low, i_high):
        return round(((i_high - i_low) / (c_high - c_low)) * (c - c_low) + i_low)
    
    if param == "pm25":
        # PM2.5 (µg/m³) - 2024年5月更新的標準
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
        # PM10 (µg/m³) - 24小時平均
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
        # O3 (ppm) - 8小時平均
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
        # NO2 (ppb) - 1小時平均
        # OpenAQ 以 ppm 為單位，需要轉換為 ppb (1 ppm = 1000 ppb)
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
        # SO2 (ppb) - 1小時平均
        # OpenAQ 以 ppm 為單位，需要轉換為 ppb
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
        # CO (ppm) - 8小時平均
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
    
    # 未知參數的後備計算
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
        
        # 按距離排序
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


def get_location_latest_df(location_id: int):
    """獲取站點的最新值清單"""
    try:
        r = requests.get(
            f"{BASE}/locations/{location_id}/latest",
            headers=headers,
            params={"limit": 1000},
            timeout=10
        )
        if r.status_code == 404:
            return pd.DataFrame()
        r.raise_for_status()
        results = r.json().get("results", [])
        if not results:
            return pd.DataFrame()

        df = pd.json_normalize(results)

        # 參數名與單位
        if "parameter.name" in df.columns:
            df["parameter"] = df["parameter.name"].str.lower()
        elif "parameter" in df.columns:
            df["parameter"] = df["parameter"].str.lower()
        else:
            df["parameter"] = None
        
        df["units"] = df.get("parameter.units", df.get("units"))
        df["value"] = df["value"]

        # UTC 時間
        df["ts_utc"] = pd.NaT
        for col in ["datetime.utc", "period.datetimeTo.utc", "period.datetimeFrom.utc"]:
            if col in df.columns:
                ts = pd.to_datetime(df[col], errors="coerce", utc=True)
                df["ts_utc"] = df["ts_utc"].where(df["ts_utc"].notna(), ts)

        # 地方時間
        local_col = None
        for c in ["datetime.local", "period.datetimeTo.local", "period.datetimeFrom.local"]:
            if c in df.columns:
                local_col = c
                break
        df["ts_local"] = df[local_col] if local_col else None

        return df[["parameter", "value", "units", "ts_utc", "ts_local"]]
    except Exception as e:
        print(f"Error fetching location latest: {e}")
        return pd.DataFrame()


def get_parameters_latest_df(location_id: int, target_params):
    """用 /parameters/{pid}/latest 拿各參數最新值"""
    rows = []
    for p in target_params:
        try:
            pid = PARAM_IDS[p]
            r = requests.get(
                f"{BASE}/parameters/{pid}/latest",
                headers=headers,
                params={"locationId": location_id, "limit": 50},
                timeout=10
            )
            if r.status_code == 404:
                continue
            r.raise_for_status()
            res = r.json().get("results", [])
            if not res:
                continue
            
            df = pd.json_normalize(res)
            df["parameter"] = p
            df["units"] = df.get("parameter.units", df.get("units"))
            df["value"] = df["value"]

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
            print(f"Error fetching parameter {p}: {e}")
            continue

    if not rows:
        return pd.DataFrame()
    return pd.concat(rows, ignore_index=True)


def pick_batch_near(df, t_ref, tol_minutes: int):
    """批次時間對齊"""
    if df.empty or pd.isna(t_ref):
        return pd.DataFrame()

    df = df.copy()

    def _scalarize(v):
        if isinstance(v, (list, tuple, np.ndarray)):
            return v[0] if len(v) else None
        return v

    df["ts_utc"] = df["ts_utc"].map(_scalarize)
    df["ts_utc"] = pd.to_datetime(df["ts_utc"], errors="coerce", utc=True)

    df["dt_diff"] = (df["ts_utc"] - t_ref).abs()

    tol = pd.Timedelta(minutes=tol_minutes)
    df = df[df["dt_diff"] <= tol]
    if df.empty:
        return df

    df = df.sort_values(["parameter", "dt_diff", "ts_utc"], ascending=[True, True, False])
    df = df.drop_duplicates(subset=["parameter"], keep="first")
    return df[["parameter", "value", "units", "ts_utc", "ts_local"]]


def get_latest_air_quality(lat: float, lon: float):
    """獲取最新空氣品質數據"""
    try:
        print(f"\n=== Fetching air quality for ({lat:.4f}, {lon:.4f}) ===")
        
        # 1. 獲取附近站點
        locations = get_nearby_locations(lat, lon)
        if not locations:
            return {"error": "No nearby monitoring stations found"}

        location = locations[0]
        location_id = int(location["id"])
        location_name = location.get("name", "Unknown")

        print(f"Using location: {location_name} (ID: {location_id})")

        # 2. 獲取站點最新值清單
        df_loc_latest = get_location_latest_df(location_id)
        if df_loc_latest.empty:
            return {"error": "No data from location latest endpoint"}

        # 3. 找批次時間
        t_star = df_loc_latest["ts_utc"].max()
        if pd.isna(t_star):
            return {"error": "No valid timestamp"}

        print(f"Batch time: {t_star}")

        # 4. 在 location latest 中找接近批次時間的數據
        df_at_batch = pick_batch_near(df_loc_latest, t_star, TOL_MINUTES_PRIMARY)
        if df_at_batch.empty:
            df_at_batch = pick_batch_near(df_loc_latest, t_star, TOL_MINUTES_FALLBACK)

        have = set(df_at_batch["parameter"].str.lower().tolist()) if not df_at_batch.empty else set()

        # 5. 補齊缺失的參數
        missing = [p for p in TARGET_PARAMS if p not in have]
        if missing:
            print(f"Missing parameters: {missing}")
            df_param_latest = get_parameters_latest_df(location_id, missing)
            df_param_batch = pick_batch_near(df_param_latest, t_star, TOL_MINUTES_PRIMARY)
            if df_param_batch.empty:
                df_param_batch = pick_batch_near(df_param_latest, t_star, TOL_MINUTES_FALLBACK)
        else:
            df_param_batch = pd.DataFrame()

        # 6. 合併
        frames = []
        if not df_at_batch.empty:
            frames.append(df_at_batch)
        if not df_param_batch.empty:
            frames.append(df_param_batch)

        if not frames:
            return {"error": "No aligned batch data"}

        df_all = pd.concat(frames, ignore_index=True)
        df_all["parameter"] = df_all["parameter"].str.lower()
        df_all = df_all[df_all["parameter"].isin(TARGET_PARAMS)]
        
        # 去重
        df_all["dt_diff"] = (df_all["ts_utc"] - t_star).abs()
        df_all = df_all.sort_values(["parameter", "dt_diff", "ts_utc"], ascending=[True, True, False])
        df_all = df_all.drop_duplicates(subset=["parameter"], keep="first")
        df_all = df_all.drop(columns=["dt_diff"])

        # 7. 計算 AQI（使用 2024 EPA 標準）
        max_aqi = 0
        dominant_pollutant = ""
        dominant_value = 0
        dominant_timestamp = ""

        measurements = []
        for _, row in df_all.iterrows():
            param = row["parameter"]
            value = row["value"]
            aqi = calculate_aqi(param, value)
            
            measurements.append({
                "parameter": param,
                "value": float(value),
                "units": row["units"],
                "aqi": aqi,
                "timestamp": row["ts_utc"].isoformat() if pd.notna(row["ts_utc"]) else None
            })

            print(f"{param}: AQI {aqi} (from {value} {row['units']}) [EPA 2024]")

            if aqi > max_aqi:
                max_aqi = aqi
                dominant_pollutant = param
                dominant_value = float(value)
                dominant_timestamp = row["ts_utc"].isoformat() if pd.notna(row["ts_utc"]) else None

        print(f"Final AQI: {max_aqi}, Dominant: {dominant_pollutant}")
        print(f"Using EPA 2024 Standard (PM2.5 Good: 0-9.0 µg/m³)")

        # 8. 返回結果
        return {
            "success": True,
            "location": {
                "id": location_id,
                "name": location_name,
                "latitude": location["coordinates"]["latitude"],
                "longitude": location["coordinates"]["longitude"]
            },
            "aqi": max_aqi,
            "pollutant": dominant_pollutant.upper(),
            "concentration": dominant_value,
            "timestamp": dominant_timestamp,
            "measurements": measurements,
            "standard": "EPA 2024"
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
            # 解析查詢參數
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
            
            # 獲取空氣品質數據
            result = get_latest_air_quality(lat, lon)
            
            # 返回結果
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
