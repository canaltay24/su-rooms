#!/usr/bin/env python3
"""
Sabancı University Room Occupancy Web App Server
Serves the web application and provides JSON REST API endpoints.
Uses standard Python library (zero third-party dependencies required).
"""

import http.server
import json
import os
import socket
import sys
import urllib.parse
from pathlib import Path

PORT = 8000
PUBLIC_DIR = Path(__file__).parent / "public"
DATA_FILE = Path(__file__).parent / "data" / "rooms_database.json"

# Cache database in memory
_DB = None


def load_db():
    global _DB
    if _DB is None:
        if DATA_FILE.exists():
            with open(DATA_FILE, "r", encoding="utf-8") as f:
                _DB = json.load(f)
        else:
            print("Warning: rooms_database.json not found. Run scripts/build_rooms_db.py first.")
            _DB = {"buildings": {}, "total_rooms": 0}
    return _DB


def get_local_ip():
    """Detect local LAN IP for phone access."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


class SURoomsHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        query = urllib.parse.parse_qs(parsed.query)

        # API: Query room occupancy status
        if path == "/api/rooms":
            self.handle_api_rooms(query)
            return

        # API: Query room weekly schedule
        if path.startswith("/api/room/"):
            room_id = path[len("/api/room/"):].split("/")[0]
            self.handle_api_room_detail(room_id)
            return

        # Fallback to serving static files from public/
        super().do_GET()

    def handle_api_rooms(self, query):
        db = load_db()
        building_id = query.get("building", [None])[0]
        floor = query.get("floor", [None])[0]
        day = query.get("day", ["M"])[0].upper()
        time_str = query.get("time", ["13:40"])[0]
        status_filter = query.get("status", [None])[0]
        if status_filter:
            status_filter = status_filter.upper()

        try:
            h, m = map(int, time_str.split(":"))
            target_min = h * 60 + m
        except Exception:
            target_min = 820

        results = []
        buildings_to_check = [db["buildings"][building_id]] if building_id and building_id in db["buildings"] else list(db["buildings"].values())

        for b in buildings_to_check:
            for r in b["rooms"]:
                if floor and floor != "ALL" and r["floor"] != floor:
                    continue

                sched = r["schedule_by_day"].get(day, [])
                active_ev = None
                next_ev = None
                for ev in sched:
                    if ev["start_min"] <= target_min < ev["end_min"]:
                        active_ev = ev
                        break
                    elif ev["start_min"] > target_min:
                        if next_ev is None or ev["start_min"] < next_ev["start_min"]:
                            next_ev = ev

                is_occupied = active_ev is not None
                is_free_rest_of_day = (active_ev is None and next_ev is None)

                if status_filter == "FREE" and is_occupied:
                    continue
                if status_filter == "OCCUPIED" and not is_occupied:
                    continue
                if status_filter == "REST_OF_DAY" and not is_free_rest_of_day:
                    continue

                results.append({
                    "id": r["id"],
                    "building": r["building"],
                    "room": r["room"],
                    "display_name": r["display_name"],
                    "floor": r["floor"],
                    "is_occupied": is_occupied,
                    "is_free_rest_of_day": is_free_rest_of_day,
                    "active_event": active_ev,
                    "next_event": next_ev,
                })

        self.send_json_response({
            "day": day,
            "time": time_str,
            "minute": target_min,
            "total": len(results),
            "free": sum(1 for r in results if not r["is_occupied"]),
            "free_rest_of_day": sum(1 for r in results if r["is_free_rest_of_day"]),
            "occupied": sum(1 for r in results if r["is_occupied"]),
            "rooms": results
        })

    def handle_api_room_detail(self, room_id):
        db = load_db()
        found_room = None
        for b in db["buildings"].values():
            for r in b["rooms"]:
                if r["id"] == room_id or r["display_name"].replace(" ", "_") == room_id:
                    found_room = r
                    break
            if found_room:
                break

        if not found_room:
            self.send_json_response({"error": "Room not found"}, status=404)
            return

        self.send_json_response(found_room)

    def send_json_response(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def start_tunnel(port):
    """Start cloudflared tunnel if available and return public URL."""
    cf_path = Path(__file__).parent / "cloudflared.exe"
    if not cf_path.exists():
        return None
    import subprocess
    import re
    cmd = [str(cf_path), "tunnel", "--url", f"http://localhost:{port}"]
    proc = subprocess.Popen(cmd, stderr=subprocess.PIPE, stdout=subprocess.PIPE, text=True, bufsize=1)
    url = None
    for line in proc.stderr:
        m = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line)
        if m:
            url = m.group(0)
            break
    return url, proc


def run_server(port=PORT, enable_tunnel=False):
    local_ip = get_local_ip()
    load_db()

    tunnel_url = None
    tunnel_proc = None
    if enable_tunnel or "--tunnel" in sys.argv:
        print("Starting secure Cloudflare tunnel for campus Wi-Fi / phone access...")
        try:
            res = start_tunnel(port)
            if res:
                tunnel_url, tunnel_proc = res
        except Exception as e:
            print("Tunnel error:", e)

    print("=" * 65)
    print("🎓 Sabancı University Room Finder is running!")
    print(f"👉 Local (PC):          http://localhost:{port}")
    if tunnel_url:
        print(f"📱 Phone (Anywhere):    {tunnel_url}")
    else:
        print(f"📱 Phone (Direct LAN):  http://{local_ip}:{port}")
        print("💡 (If on SABANCIUNIV campus Wi-Fi, run with --tunnel to bypass AP isolation)")
    print("=" * 65)
    print("Press Ctrl+C to stop the server.")

    server_address = ("", port)
    httpd = http.server.ThreadingHTTPServer(server_address, SURoomsHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        if tunnel_proc:
            tunnel_proc.terminate()
        httpd.server_close()


if __name__ == "__main__":
    port = PORT
    for arg in sys.argv[1:]:
        if arg.isdigit():
            port = int(arg)
    run_server(port)
