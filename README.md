# 🎓 Sabancı University Room Occupancy & Free Room Finder (SU Rooms)

A modern, responsive web application for **Sabancı University** students to instantly see which classrooms are occupied and which rooms are free at any given time, browse by building and floor (**FENS**, **FMAN**, **FASS**, **UC**, **SL**), view active course details, and inspect complete weekly room timetables.

Accessible from both **PCs / Laptops** and **Mobile Phones** (PWA-ready).

---

## 🚀 Quick Start

To launch the web app on your computer:

```bash
# Standard local start:
python server.py

# Or if you are on Sabancı University campus Wi-Fi (bypasses AP isolation for phone access):
python server.py --tunnel
```

- **PC / Laptop:** `http://localhost:8000`
- **Phone (on Campus Wi-Fi or anywhere):** Use the secure `trycloudflare.com` link printed when running with `--tunnel`.

---

## 🌟 Key Features

1. **⚡ Right Now (Canlı Durum)**:
   - Synchronizes automatically with the local clock.
   - Shows room occupancy in real time across the university.
   - **Free Rest of Day Filter**: Dedicated tab to show only classrooms that have no remaining classes scheduled for the rest of the day—ideal for finding undisturbed study spaces.
   - For free rooms: displays countdown indicating how long the room will stay free (e.g. *"Free for next 1h 00m until MATH 201 at 14:40"* or *"Free for the rest of the day 🎉"*).
   - For occupied rooms: displays active course code, title, section, schedule type (Lecture / Recitation / Lab), instructor, time interval, and progress bar.

2. **📅 Time Machine (Zaman Makinesi)**:
   - Check room occupancy for **any day of the week** (Monday to Sunday) and **any time** (e.g., *Friday at 13:40*).
   - Quick one-click time chips matching Sabancı's class hours (`08:40`, `09:40`, `10:40`, `11:40`, `12:40`, `13:40`, `14:40`, `15:40`, `16:40`, `17:40`).

3. **🏢 Building & Floor Organization**:
   - **FENS** (Faculty of Engineering and Natural Sciences / Mühendislik)
     - Floors: `Floor L` (Basement), `Floor G` (Ground), `Floor 1`, `Floor 2`
   - **FMAN** (Sabancı Business School / Yönetim Bilimleri)
     - Floors: `Floor L` (Basement), `Floor G` (Ground)
   - **FASS** (Faculty of Arts and Social Sciences / Sanat ve Sosyal Bilimler)
     - Floors: `Floor G` (Ground), `Floor 1`, `Floor 2`
   - **UC** (University Center / Üniversite Merkezi)
     - Floor: `Floor G` (Ground)
   - **SL** (School of Languages / Diller Okulu) & **SUSAM** (Arts Center)
   - Every building tab displays real-time availability counters (e.g. `24 Free / 31 Rooms`).

4. **🔍 Instant Search & Autocomplete**:
   - Search by room number (e.g., `G036`, `G035`, `L018`, `1001`), course code (e.g., `CS 201`, `MATH 101`), or instructor name.

5. **🗓️ Full Weekly Room Timetable**:
   - Click **"View Full Week Schedule"** on any classroom card to open an interactive weekly timetable modal (Monday through Friday, 08:40 to 20:30) highlighting all classes and empty blocks.

6. **📱 Mobile & PWA Ready**:
   - Responsive design tailored for mobile screens with touch-friendly controls.
   - Supports **"Add to Home Screen"** on iOS Safari and Android Chrome to install as a standalone mobile app icon.

---

## 🔍 Your Example Scenario: FENS G036 on Friday at 13:40

To check if there is an active class in room **G036** in the engineering building (**FENS**) on **Friday at 13:40**:

1. Open the app and click **"Time Machine"**.
2. Select **Friday** and click **13:40** (or enter `13:40`).
3. Click the **FENS** building tab and select **Floor G (Ground)**.
4. You will see:
   - **FENS G036**: Status is **🟢 FREE** (no classes scheduled).
   - Neighboring rooms like **FENS G035**: Status is **🟢 FREE** until 14:40 (when MATH 201 begins).
   - You can also simply type `G036` into the search box to jump directly to it!

---

## 📡 How Sabancı University Data is Pulled

Sabancı University publishes all course schedules publicly through Ellucian BannerWeb on the Student Information System (**SUIS**) at:
`https://suis.sabanciuniv.edu/prod/bwckschd.p_disp_dyn_sched`

### How the Pipeline Works:
1. **Term List & Subjects:** Queries `bwckgens.p_proc_term_date` to retrieve all active subjects (`ACC`, `BIO`, `CS`, `ECON`, `ENS`, `MATH`, `SPS`, etc.).
2. **Dynamic Class Schedule:** Issues a POST request to `bwckschd.p_get_crse_unsec` selecting all subjects.
3. **Parsing:** The response contains every course section, meeting days (`M`, `T`, `W`, `R`, `F`), start/end times (`1:40 pm - 4:30 pm`), room locations (`FENS G035`, `FMAN L018`), and instructors.
4. **Data Normalization:** `scripts/build_rooms_db.py` parses times into 24-hour minutes, groups classrooms by building and floor, and creates `data/rooms_database.json`.

### Re-fetching or Updating for a New Semester:

To update the data whenever registration periods change:

```bash
# 1. Fetch latest raw courses from SUIS (or specify term, e.g. 202601 or 202602)
python scripts/scrape_suis.py 202601

# 2. Build the optimized rooms database
python scripts/build_rooms_db.py
```

---

## 🛠️ Project Structure

```
.
├── data/
│   ├── raw_courses_202601.json      # 1,599 raw course sections extracted from SUIS
│   └── rooms_database.json          # Indexed database (115 rooms across 6 buildings)
├── scripts/
│   ├── scrape_suis.py                # Scraper tool connecting to Sabancı BannerWeb
│   ├── build_rooms_db.py             # Database compiler & time interval indexer
│   ├── test_query.py                 # CLI query test for room verification
│   └── test_server.py                # Server and API integration tests
├── public/
│   ├── index.html                    # Single-Page Web Application UI
│   ├── app.js                        # State, filtering, search, time calculation
│   ├── style.css                     # Sabancı Navy/Gold theme, glassmorphism, animations
│   ├── manifest.json                 # Web App Manifest for mobile installation
│   └── rooms_database.json           # Bundled client database for instant loading
├── server.py                         # Zero-dependency local web & REST API server
└── README.md                         # Documentation
```

---

## 🌐 REST API Endpoints

The built-in server also exposes JSON endpoints if you wish to query programmatically or integrate with other tools:

- **Query Occupancy:**
  ```
  GET /api/rooms?building=FENS&floor=G&day=F&time=13:40
  ```
- **Room Weekly Detail:**
  ```
  GET /api/room/FENS_G035
  ```
