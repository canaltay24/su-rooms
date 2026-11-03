#!/usr/bin/env python3
"""
Builds the Sabancı University Room & Classroom Schedule Database.
Extracts all rooms, floors, and weekly event timetables from the raw SUIS data.
Outputs data/rooms_database.json and public/rooms_database.json.
"""

import json
import re
from pathlib import Path

BUILDINGS_META = {
    "FENS": {
        "id": "FENS",
        "name": "Faculty of Engineering & Natural Sciences",
        "name_tr": "Mühendislik ve Doğa Bilimleri Fakültesi",
        "short": "Engineering (FENS)",
        "badge_color": "blue",
        "floors": ["L", "G", "1", "2"]
    },
    "FMAN": {
        "id": "FMAN",
        "name": "Sabancı Business School",
        "name_tr": "Yönetim Bilimleri Fakültesi",
        "short": "Management (FMAN)",
        "badge_color": "emerald",
        "floors": ["L", "G"]
    },
    "FASS": {
        "id": "FASS",
        "name": "Faculty of Arts & Social Sciences",
        "name_tr": "Sanat ve Sosyal Bilimler Fakültesi",
        "short": "Social Sciences (FASS)",
        "badge_color": "purple",
        "floors": ["G", "1", "2"]
    },
    "UC": {
        "id": "UC",
        "name": "University Center",
        "name_tr": "Üniversite Merkezi",
        "short": "University Center (UC)",
        "badge_color": "amber",
        "floors": ["G"]
    },
    "SL": {
        "id": "SL",
        "name": "School of Languages",
        "name_tr": "Diller Okulu",
        "short": "Languages (SL)",
        "badge_color": "rose",
        "floors": ["G", "1"]
    },
    "SUSAM": {
        "id": "SUSAM",
        "name": "Sakıp Sabancı Arts & Research Center",
        "name_tr": "Sanat ve Araştırma Merkezi",
        "short": "Arts Center (SUSAM)",
        "badge_color": "indigo",
        "floors": ["G", "1"]
    }
}

KNOWN_EXTRA_ROOMS = [
    # Include known classrooms/labs/study spaces that might have open hours
    ("FENS", "G036", "G"),
    ("FENS", "G049", "G"),
    ("FENS", "G050", "G"),
    ("UC", "G031", "G"),
    ("UC", "G032", "G"),
    ("FMAN", "G014", "G"),
    ("FASS", "G035", "G"),
]

DAY_MAP = {
    "M": {"id": "M", "code": "M", "name": "Monday", "name_tr": "Pazartesi", "index": 0},
    "T": {"id": "T", "code": "T", "name": "Tuesday", "name_tr": "Salı", "index": 1},
    "W": {"id": "W", "code": "W", "name": "Wednesday", "name_tr": "Çarşamba", "index": 2},
    "R": {"id": "R", "code": "R", "name": "Thursday", "name_tr": "Perşembe", "index": 3},
    "F": {"id": "F", "code": "F", "name": "Friday", "name_tr": "Cuma", "index": 4},
    "S": {"id": "S", "code": "S", "name": "Saturday", "name_tr": "Cumartesi", "index": 5},
    "U": {"id": "U", "code": "U", "name": "Sunday", "name_tr": "Pazar", "index": 6},
}


def parse_time_str(time_str: str):
    """Convert '1:40 pm' or '8:40 am' into (total_minutes, 'HH:MM')."""
    if not time_str:
        return None, None
    s = time_str.strip().lower()
    m = re.match(r"^(\d+):(\d+)\s*(am|pm)$", s)
    if not m:
        return None, None
    h = int(m.group(1))
    mi = int(m.group(2))
    mer = m.group(3)
    if mer == "pm" and h != 12:
        h += 12
    elif mer == "am" and h == 12:
        h = 0
    total_min = h * 60 + mi
    time_24 = f"{h:02d}:{mi:02d}"
    return total_min, time_24


def parse_location(where_raw: str):
    """Parse 'FENS G035' -> (building, room, floor)."""
    if not where_raw or where_raw.strip().upper() in ["TBA", "ONLINE", "VIRTUAL"]:
        return None
    where = where_raw.strip()
    parts = where.split()
    if len(parts) >= 2:
        bld = parts[0].upper()
        rm = " ".join(parts[1:])
    else:
        bld = "OTHER"
        rm = where

    # Standardize known building acronyms
    if bld not in BUILDINGS_META:
        if "FENS" in bld:
            bld = "FENS"
        elif "FMAN" in bld or "SBS" in bld or "SOM" in bld:
            bld = "FMAN"
        elif "FASS" in bld:
            bld = "FASS"
        elif "LANG" in bld or "SL" in bld:
            bld = "SL"
        elif "UC" in bld:
            bld = "UC"
        elif "SUSAM" in bld:
            bld = "SUSAM"
        elif "ALTUNIZADE" in bld:
            bld = "ALTUNIZADE"
        else:
            bld = "OTHER"

    # Identify floor
    rm_first = parts[1] if len(parts) >= 2 else parts[0]
    rm_code_clean = rm_first.split("/")[0].upper()

    if rm_code_clean.startswith("L"):
        floor = "L"
    elif rm_code_clean.startswith("G"):
        floor = "G"
    elif rm_code_clean.startswith("1"):
        floor = "1"
    elif rm_code_clean.startswith("2"):
        floor = "2"
    elif rm_code_clean.startswith("3"):
        floor = "3"
    elif rm_code_clean.startswith("4"):
        floor = "4"
    else:
        floor = "G"

    return bld, rm, floor


def build_database(raw_courses_path="data/raw_courses_202601.json"):
    with open(raw_courses_path, "r", encoding="utf-8") as f:
        courses = json.load(f)

    # Dictionary: room_id -> room_dict
    rooms = {}

    def get_or_create_room(bld, rm, floor):
        room_id = f"{bld}_{rm.replace('/', '_').replace(' ', '_')}"
        if room_id not in rooms:
            rooms[room_id] = {
                "id": room_id,
                "building": bld,
                "room": rm,
                "display_name": f"{bld} {rm}",
                "floor": floor,
                "floor_label": f"Floor {floor}" if floor in ["1", "2", "3"] else ("Ground Floor (G)" if floor == "G" else "Lower Ground / Basement (L)"),
                "schedule_by_day": {day: [] for day in DAY_MAP.keys()},
                "capacity": None
            }
        return rooms[room_id]

    # Pre-populate known extra rooms
    for bld, rm, floor in KNOWN_EXTRA_ROOMS:
        get_or_create_room(bld, rm, floor)

    # Process all course sections
    for course in courses:
        subject = course.get("subject", "")
        code = course.get("code", "")
        course_code = f"{subject} {code}".strip()
        course_name = course.get("name", "")
        section = course.get("section", "")
        crn = course.get("crn")
        instructors = []
        schedule_type = course.get("scheduleType") or "Class"

        # Check capacity
        capacity = None
        for av in course.get("availability", []):
            if av.get("title") == "Seats" and av.get("capacity"):
                capacity = av.get("capacity")

        for sched in course.get("schedule", []):
            where = sched.get("where")
            if not where:
                continue

            parsed_loc = parse_location(where)
            if not parsed_loc:
                continue

            bld, rm, floor = parsed_loc
            # Check instructors
            sched_instructors = sched.get("instructors") or []
            curr_instructors = sched_instructors if sched_instructors else instructors

            time_info = sched.get("time")
            if not time_info or not time_info.get("from") or not time_info.get("to"):
                continue

            start_min, start_24 = parse_time_str(time_info["from"])
            end_min, end_24 = parse_time_str(time_info["to"])
            if start_min is None or end_min is None:
                continue

            days = sched.get("days") or ""
            # If room is a split room (e.g. FENS G049/G050), attach to main room and split aliases
            targets = [get_or_create_room(bld, rm, floor)]
            if "/" in rm:
                split_parts = rm.split("/")
                for sp in split_parts:
                    sub_parsed = parse_location(f"{bld} {sp}")
                    if sub_parsed:
                        targets.append(get_or_create_room(sub_parsed[0], sub_parsed[1], sub_parsed[2]))

            for room_obj in targets:
                if capacity and (room_obj["capacity"] is None or capacity > room_obj["capacity"]):
                    room_obj["capacity"] = capacity

                for char in days:
                    if char in DAY_MAP:
                        event = {
                            "course_code": course_code,
                            "course_name": course_name,
                            "section": section,
                            "crn": crn,
                            "start_min": start_min,
                            "end_min": end_min,
                            "start_time": start_24,
                            "end_time": end_24,
                            "type": schedule_type,
                            "instructors": curr_instructors
                        }
                        # Avoid duplicates
                        existing = room_obj["schedule_by_day"][char]
                        is_dup = any(
                            e["course_code"] == event["course_code"] and
                            e["section"] == event["section"] and
                            e["start_min"] == event["start_min"] and
                            e["end_min"] == event["end_min"]
                            for e in existing
                        )
                        if not is_dup:
                            existing.append(event)

    # Sort each room's daily schedules chronologically
    for r in rooms.values():
        for d in r["schedule_by_day"]:
            r["schedule_by_day"][d].sort(key=lambda x: x["start_min"])

    # Organize rooms by building
    buildings_data = {}
    for b_id, b_meta in BUILDINGS_META.items():
        buildings_data[b_id] = {
            **b_meta,
            "rooms": []
        }

    other_rooms = []
    for r in rooms.values():
        bld = r["building"]
        if bld in buildings_data:
            buildings_data[bld]["rooms"].append(r)
        elif bld != "ALTUNIZADE":  # Ignore off-campus remote executive center unless needed
            other_rooms.append(r)

    if other_rooms:
        buildings_data["OTHER"] = {
            "id": "OTHER",
            "name": "Other Campus Locations",
            "name_tr": "Diğer Kampüs Alanları",
            "short": "Other",
            "badge_color": "slate",
            "floors": ["G"],
            "rooms": other_rooms
        }

    # Sort rooms within each building: Floor order L -> G -> 1 -> 2 -> 3, then room number
    floor_order = {"L": 0, "G": 1, "1": 2, "2": 3, "3": 4, "4": 5}
    for b_id, b_data in buildings_data.items():
        b_data["rooms"].sort(key=lambda x: (floor_order.get(x["floor"], 9), x["room"]))

    payload = {
        "term": "Fall 2026-2027",
        "academic_year": "2026-2027",
        "buildings": buildings_data,
        "total_rooms": sum(len(b["rooms"]) for b in buildings_data.values()),
        "time_slots": [
            {"label": "08:40", "min": 520},
            {"label": "09:40", "min": 580},
            {"label": "10:40", "min": 640},
            {"label": "11:40", "min": 700},
            {"label": "12:40", "min": 760},
            {"label": "13:40", "min": 820},
            {"label": "14:40", "min": 880},
            {"label": "15:40", "min": 940},
            {"label": "16:40", "min": 1000},
            {"label": "17:40", "min": 1060},
            {"label": "18:40", "min": 1120},
            {"label": "19:40", "min": 1180},
        ],
        "days": list(DAY_MAP.values())
    }

    # Save to data/ and public/
    Path("data").mkdir(parents=True, exist_ok=True)
    Path("public").mkdir(parents=True, exist_ok=True)

    with open("data/rooms_database.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    with open("public/rooms_database.json", "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    print(f"Successfully generated database with {payload['total_rooms']} rooms across {len(buildings_data)} buildings:")
    for b_id, b_data in buildings_data.items():
        print(f" - {b_id} ({b_data['name']}): {len(b_data['rooms'])} rooms")

    return payload


if __name__ == "__main__":
    build_database()
