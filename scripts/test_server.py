#!/usr/bin/env python3
"""
Integration test for SURoomsHandler in server.py
"""

import threading
import time
import urllib.request
import json
import http.server
import sys
from pathlib import Path

# Add root directory to sys.path
sys.path.insert(0, str(Path(__file__).parent.parent))
from server import SURoomsHandler

PORT = 8999

def run_test():
    httpd = http.server.ThreadingHTTPServer(("", PORT), SURoomsHandler)
    server_thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    server_thread.start()
    time.sleep(0.5)

    base = f"http://127.0.0.1:{PORT}"
    try:
        # Test 1: Index
        with urllib.request.urlopen(f"{base}/", timeout=5) as resp:
            assert resp.status == 200
            html = resp.read().decode("utf-8")
            assert "SU Room Finder" in html
            print("[PASS] GET / returned 200 and contains SU Room Finder")

        # Test 2: Database JSON
        with urllib.request.urlopen(f"{base}/rooms_database.json", timeout=5) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert "buildings" in data
            print(f"[PASS] GET /rooms_database.json returned 200 with {data['total_rooms']} rooms")

        # Test 3: API Rooms (Friday 13:40 FENS)
        with urllib.request.urlopen(f"{base}/api/rooms?building=FENS&floor=G&day=F&time=13:40", timeout=5) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert data["day"] == "F"
            assert data["time"] == "13:40"
            print(f"[PASS] GET /api/rooms?building=FENS&floor=G&day=F&time=13:40 returned {data['total']} rooms ({data['free']} free, {data['occupied']} occupied, {data['free_rest_of_day']} rest of day)")

        # Test 4: API Rooms with status=REST_OF_DAY
        with urllib.request.urlopen(f"{base}/api/rooms?building=FENS&day=F&time=13:40&status=REST_OF_DAY", timeout=5) as resp:
            assert resp.status == 200
            data = json.loads(resp.read().decode("utf-8"))
            assert all(r["is_free_rest_of_day"] for r in data["rooms"])
            print(f"[PASS] GET /api/rooms?status=REST_OF_DAY returned {len(data['rooms'])} rooms, all verified free rest of day")

        # Test 5: API Room Detail
        with urllib.request.urlopen(f"{base}/api/room/FENS_G035", timeout=5) as resp:
            assert resp.status == 200
            room = json.loads(resp.read().decode("utf-8"))
            assert room["room"] == "G035"
            print(f"[PASS] GET /api/room/FENS_G035 returned room detail with {len(room['schedule_by_day'])} days")

        print("\nAll integration tests passed successfully!")
    finally:
        httpd.shutdown()

if __name__ == "__main__":
    run_test()
