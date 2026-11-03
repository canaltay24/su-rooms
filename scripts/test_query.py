#!/usr/bin/env python3
"""
Test queries for Sabancı University Room Occupancy Database.
"""

import json
from pathlib import Path


def query_rooms(building_id="FENS", day="F", time_str="13:40", rest_of_day_only=False):
    with open("data/rooms_database.json", "r", encoding="utf-8") as f:
        db = json.load(f)

    h, m = map(int, time_str.split(":"))
    target_min = h * 60 + m

    building = db["buildings"].get(building_id)
    if not building:
        print(f"Building {building_id} not found.")
        return

    filter_label = " [FREE REST OF DAY ONLY]" if rest_of_day_only else ""
    print(f"=== Occupancy for {building['name']} ({building_id}) on Day: {day} at {time_str}{filter_label} ===")
    occupied_count = 0
    free_count = 0
    rest_of_day_count = 0

    for room in building["rooms"]:
        sched = room["schedule_by_day"].get(day, [])
        active_event = None
        next_event = None

        for ev in sched:
            if ev["start_min"] <= target_min < ev["end_min"]:
                active_event = ev
                break
            elif ev["start_min"] > target_min:
                if next_event is None or ev["start_min"] < next_event["start_min"]:
                    next_event = ev

        is_free_rest_of_day = (active_event is None and next_event is None)

        if is_free_rest_of_day:
            rest_of_day_count += 1

        if rest_of_day_only and not is_free_rest_of_day:
            continue

        if active_event:
            occupied_count += 1
            instr = ", ".join(active_event.get("instructors", [])) or "Instructor TBA"
            print(f"[OCCUPIED] {room['display_name']} ({room['floor_label']})")
            print(f"           Course: {active_event['course_code']} ({active_event['course_name']}) Section {active_event['section']}")
            print(f"           Time:   {active_event['start_time']} - {active_event['end_time']} | Instructor: {instr}")
        else:
            free_count += 1
            if next_event:
                print(f"[FREE]     {room['display_name']} ({room['floor_label']}) - Free until {next_event['start_time']} ({next_event['course_code']})")
            else:
                print(f"[REST DAY] {room['display_name']} ({room['floor_label']}) - Free for rest of day (no more classes)")

    print(f"\nSummary: {free_count} Free ({rest_of_day_count} rest of day), {occupied_count} Occupied (Total: {len(building['rooms'])})")


if __name__ == "__main__":
    query_rooms("FMAN", "T", "11:57", rest_of_day_only=False)
    print("\n" + "=" * 60 + "\n")
    query_rooms("FMAN", "T", "11:57", rest_of_day_only=True)
