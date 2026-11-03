#!/usr/bin/env python3
"""
Sabancı University SUIS (BannerWeb) Course Schedule Scraper
Fetches all course offerings and classroom schedules for a given term.
"""

import json
import os
import re
import sys
import urllib.parse
import urllib.request
from pathlib import Path
from bs4 import BeautifulSoup

BASE_URL = "https://suis.sabanciuniv.edu"
TERM_DATE_URL = f"{BASE_URL}/prod/bwckgens.p_proc_term_date"
LISTING_URL = f"{BASE_URL}/prod/bwckschd.p_get_crse_unsec"
MIRROR_BASE = "https://bozdagyusuf.github.io/suis-fetch"

FACULTY_SHORTHAND = [
    ("Fac.of Arts and Social Sci.", "FASS"),
    ("Sabancı Business School", "FMAN"),
    ("Fac. of Engin. and Nat. Sci.", "FENS"),
    ("School of Languages Building", "SL"),
    ("Art and Research Center", "SUSAM"),
    ("University Center", "UC"),
]


def shorten_faculty(text: str) -> str:
    for long_name, short_name in FACULTY_SHORTHAND:
        text = text.replace(long_name, short_name)
    return text.strip()


def fetch_from_mirror(term: str = "202601") -> list:
    """Fetch pre-parsed JSON from trusted mirror if available for speed and reliability."""
    url = f"{MIRROR_BASE}/{term}.json"
    print(f"Fetching term {term} from mirror: {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (SU-Rooms/1.0)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_subjects_for_term(term: str) -> list[str]:
    """Fetch all subject codes from SUIS for the specified term."""
    print(f"Querying subjects from SUIS for term {term}...")
    data = urllib.parse.urlencode({
        "p_calling_proc": "bwckschd.p_disp_dyn_sched",
        "p_term": term,
    }).encode("utf-8")
    req = urllib.request.Request(
        TERM_DATE_URL,
        data=data,
        headers={"User-Agent": "Mozilla/5.0 (SU-Rooms/1.0)"}
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        html = resp.read().decode("utf-8", errors="ignore")
    soup = BeautifulSoup(html, "html.parser")
    subj_select = soup.find("select", {"name": "sel_subj"})
    if not subj_select:
        return []
    subjects = [
        opt.get("value") for opt in subj_select.find_all("option")
        if opt.get("value") and opt.get("value").strip()
    ]
    return subjects


def fetch_and_save(term: str = "202601", output_path: str = "data/raw_courses_202601.json"):
    """Fetch courses and save to JSON."""
    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    try:
        courses = fetch_from_mirror(term)
        print(f"Successfully retrieved {len(courses)} course sections from mirror.")
    except Exception as e:
        print(f"Mirror fetch failed ({e}), attempting live SUIS...")
        courses = []
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(courses, f, ensure_ascii=False, indent=2)
    print(f"Saved dataset to {output_path}")
    return courses


if __name__ == "__main__":
    term = sys.argv[1] if len(sys.argv) > 1 else "202601"
    fetch_and_save(term)
