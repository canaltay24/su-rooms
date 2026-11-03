/**
 * Sabancı University Room Occupancy & Free Room Finder
 * High-performance client-side application logic.
 */

// Global State
const state = {
  db: null,
  mode: 'now', // 'now' or 'custom'
  selectedBuilding: 'FENS',
  selectedFloor: 'ALL',
  statusFilter: 'ALL', // 'ALL', 'FREE', 'OCCUPIED'
  searchQuery: '',
  customDay: 'F',
  customTime: '13:40',
  currentDay: 'F',
  currentTimeStr: '13:40',
  currentMinute: 820,
  activeModalRoom: null,
};

const DAY_INDICES = ['U', 'M', 'T', 'W', 'R', 'F', 'S']; // Sunday = 0
const DAY_LABELS = {
  M: 'Monday (Pzt)',
  T: 'Tuesday (Salı)',
  W: 'Wednesday (Çar)',
  R: 'Thursday (Per)',
  F: 'Friday (Cuma)',
  S: 'Saturday (Cmt)',
  U: 'Sunday (Paz)'
};

const TIME_PRESETS = [
  '08:40', '09:40', '10:40', '11:40', '12:40',
  '13:40', '14:40', '15:40', '16:40', '17:40', '18:40', '19:40'
];

// Initialize App
async function init() {
  updateCurrentClock();
  setInterval(updateCurrentClock, 30000); // refresh every 30s

  readURLParams();

  try {
    const res = await fetch('rooms_database.json');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    state.db = await res.json();
  } catch (err) {
    console.warn('Direct fetch failed, trying /data/rooms_database.json...', err);
    try {
      const res2 = await fetch('/data/rooms_database.json');
      state.db = await res2.json();
    } catch (err2) {
      console.error('Fatal: Could not load rooms database', err2);
      document.getElementById('rooms-grid').innerHTML = `
        <div class="col-span-full text-center py-12 bg-red-900/20 border border-red-500/30 rounded-xl p-6">
          <p class="text-red-400 font-semibold mb-2">Failed to load classroom schedule database.</p>
          <p class="text-sm text-slate-400">Please make sure the server is running or refresh the page.</p>
        </div>
      `;
      return;
    }
  }

  renderBuildingTabs();
  renderFloorFilters();
  renderQuickTimePresets();
  updateStatusFilterUI();
  renderApp();
  setupEventListeners();
}

// Read URL params for shareable queries
function readURLParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('b')) state.selectedBuilding = params.get('b').toUpperCase();
  if (params.has('f')) state.selectedFloor = params.get('f').toUpperCase();
  if (params.has('d')) {
    state.customDay = params.get('d').toUpperCase();
    state.mode = 'custom';
  }
  if (params.has('t')) {
    state.customTime = params.get('t');
    state.mode = 'custom';
  }
  if (params.has('q')) state.searchQuery = params.get('q');
  if (params.has('status')) state.statusFilter = params.get('status').toUpperCase();

  updateModeUI();
  updateStatusFilterUI();
}

function updateURLParams() {
  const params = new URLSearchParams();
  params.set('b', state.selectedBuilding);
  if (state.selectedFloor !== 'ALL') params.set('f', state.selectedFloor);
  if (state.mode === 'custom') {
    params.set('d', state.customDay);
    params.set('t', state.customTime);
  }
  if (state.statusFilter !== 'ALL') params.set('status', state.statusFilter);
  if (state.searchQuery) params.set('q', state.searchQuery);

  const newURL = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', newURL);
}

// Clock & Time Helper
function updateCurrentClock() {
  const now = new Date();
  const dayIdx = now.getDay();
  state.currentDay = DAY_INDICES[dayIdx];
  const h = now.getHours();
  const m = now.getMinutes();
  state.currentMinute = h * 60 + m;
  state.currentTimeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const clockEl = document.getElementById('live-clock');
  if (clockEl) {
    clockEl.textContent = `${DAY_LABELS[state.currentDay]} ${state.currentTimeStr}`;
  }

  if (state.mode === 'now' && state.db) {
    renderApp();
  }
}

function getActiveDayAndTime() {
  if (state.mode === 'now') {
    return {
      day: state.currentDay,
      minute: state.currentMinute,
      timeStr: state.currentTimeStr,
      isNow: true
    };
  } else {
    const parts = state.customTime.split(':').map(Number);
    const minute = (parts[0] || 0) * 60 + (parts[1] || 0);
    return {
      day: state.customDay,
      minute: minute,
      timeStr: state.customTime,
      isNow: false
    };
  }
}

// Calculate occupancy status of a room
function computeRoomStatus(room, day, minute) {
  const daySchedule = room.schedule_by_day[day] || [];
  let activeEvent = null;
  let nextEvent = null;

  for (const ev of daySchedule) {
    if (ev.start_min <= minute && minute < ev.end_min) {
      activeEvent = ev;
      break;
    } else if (ev.start_min > minute) {
      if (!nextEvent || ev.start_min < nextEvent.start_min) {
        nextEvent = ev;
      }
    }
  }

  if (activeEvent) {
    const remainingMins = activeEvent.end_min - minute;
    return {
      isOccupied: true,
      isFreeRestOfDay: false,
      activeEvent: activeEvent,
      remainingMinutes: remainingMins,
      nextEvent: null,
      statusText: `Occupied for next ${formatDuration(remainingMins)} (until ${activeEvent.end_time})`,
      statusTextTr: `${formatDurationTr(remainingMins)} daha dolu (${activeEvent.end_time} kadar)`
    };
  } else {
    if (nextEvent) {
      const freeUntilMins = nextEvent.start_min - minute;
      return {
        isOccupied: false,
        isFreeRestOfDay: false,
        activeEvent: null,
        remainingMinutes: freeUntilMins,
        nextEvent: nextEvent,
        statusText: `Free for next ${formatDuration(freeUntilMins)} (until ${nextEvent.start_time})`,
        statusTextTr: `${formatDurationTr(freeUntilMins)} boş (${nextEvent.start_time} kadar)`
      };
    } else {
      return {
        isOccupied: false,
        isFreeRestOfDay: true,
        activeEvent: null,
        remainingMinutes: null,
        nextEvent: null,
        statusText: 'Free for the rest of the day',
        statusTextTr: 'Günün geri kalanında boş'
      };
    }
  }
}

function formatDuration(minutes) {
  if (minutes <= 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function formatDurationTr(minutes) {
  if (minutes <= 0) return '0 dk';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h} sa ${m} dk`;
  if (h > 0) return `${h} sa`;
  return `${m} dk`;
}

// Building Navigation Tabs
function renderBuildingTabs() {
  const container = document.getElementById('building-tabs');
  if (!container || !state.db) return;

  const buildings = Object.values(state.db.buildings);
  const { day, minute } = getActiveDayAndTime();

  container.innerHTML = buildings.map(b => {
    const isSelected = b.id === state.selectedBuilding;
    // Calculate counts
    let freeCount = 0;
    let restOfDayCount = 0;
    b.rooms.forEach(r => {
      const s = computeRoomStatus(r, day, minute);
      if (!s.isOccupied) freeCount++;
      if (s.isFreeRestOfDay) restOfDayCount++;
    });

    const isRestOfDayFilter = state.statusFilter === 'REST_OF_DAY';
    const displayCount = isRestOfDayFilter ? restOfDayCount : freeCount;
    const badgeLabel = isRestOfDayFilter ? 'Rest of Day' : 'Free';
    const badgeStyle = displayCount > 0 
      ? (isRestOfDayFilter ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30')
      : 'bg-red-500/20 text-red-300';

    return `
      <button 
        onclick="selectBuilding('${b.id}')"
        class="flex-shrink-0 px-4 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2.5 transition-all ${
          isSelected 
            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50 shadow-lg shadow-amber-500/10' 
            : 'glass-panel text-slate-300 hover:text-white hover:bg-slate-800/80 border border-slate-700/50'
        }"
      >
        <span class="font-bold tracking-wide">${b.id}</span>
        <span class="hidden sm:inline text-xs text-slate-300 font-normal">(${b.short.split(' ')[0]})</span>
        <span class="text-xs px-2 py-0.5 rounded-full ${badgeStyle}">
          ${displayCount}/${b.rooms.length} ${badgeLabel}
        </span>
      </button>
    `;
  }).join('');
}

function selectBuilding(buildingId) {
  state.selectedBuilding = buildingId;
  state.selectedFloor = 'ALL';
  renderBuildingTabs();
  renderFloorFilters();
  renderApp();
  updateURLParams();
}

// Floor Filters
function renderFloorFilters() {
  const container = document.getElementById('floor-filters');
  if (!container || !state.db) return;

  const currentBuilding = state.db.buildings[state.selectedBuilding];
  if (!currentBuilding) return;

  const floors = ['ALL', ...currentBuilding.floors];
  const { day, minute } = getActiveDayAndTime();

  container.innerHTML = floors.map(floor => {
    const isSelected = state.selectedFloor === floor;
    let label = floor === 'ALL' ? 'All Floors' : (
      floor === 'L' ? 'Floor L (Basement)' :
      floor === 'G' ? 'Floor G (Ground)' : `Floor ${floor}`
    );

    // Floor room count
    const floorRooms = floor === 'ALL' 
      ? currentBuilding.rooms 
      : currentBuilding.rooms.filter(r => r.floor === floor);
    
    let freeCount = 0;
    let restOfDayCount = 0;
    floorRooms.forEach(r => {
      const s = computeRoomStatus(r, day, minute);
      if (!s.isOccupied) freeCount++;
      if (s.isFreeRestOfDay) restOfDayCount++;
    });

    const isRestOfDayFilter = state.statusFilter === 'REST_OF_DAY';
    const displayCount = isRestOfDayFilter ? restOfDayCount : freeCount;

    return `
      <button 
        onclick="selectFloor('${floor}')"
        class="px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
          isSelected 
            ? 'bg-blue-600 text-white shadow-md' 
            : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 border border-slate-700/40'
        }"
      >
        <span>${label}</span>
        <span class="text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-blue-800/80 text-blue-100' : 'bg-slate-900 text-slate-400'}">
          ${displayCount}/${floorRooms.length}
        </span>
      </button>
    `;
  }).join('');
}

function selectFloor(floor) {
  state.selectedFloor = floor;
  renderFloorFilters();
  renderApp();
  updateURLParams();
}

// Quick Time Presets
function renderQuickTimePresets() {
  const container = document.getElementById('time-presets');
  if (!container) return;

  container.innerHTML = TIME_PRESETS.map(t => {
    const isSelected = state.mode === 'custom' && state.customTime === t;
    return `
      <button 
        onclick="setCustomTime('${t}')"
        class="px-2.5 py-1 rounded-md text-xs font-mono transition-all ${
          isSelected
            ? 'bg-amber-500 text-slate-950 font-bold shadow'
            : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700 border border-slate-700/50'
        }"
      >
        ${t}
      </button>
    `;
  }).join('');
}

function setCustomTime(timeStr) {
  state.mode = 'custom';
  state.customTime = timeStr;
  const timeInput = document.getElementById('custom-time-input');
  if (timeInput) timeInput.value = timeStr;
  updateModeUI();
  renderQuickTimePresets();
  renderBuildingTabs();
  renderFloorFilters();
  renderApp();
  updateURLParams();
}

// Mode UI Switcher
function setMode(mode) {
  state.mode = mode;
  updateModeUI();
  renderBuildingTabs();
  renderFloorFilters();
  renderQuickTimePresets();
  renderApp();
  updateURLParams();
}

function updateModeUI() {
  const btnNow = document.getElementById('btn-mode-now');
  const btnCustom = document.getElementById('btn-mode-custom');
  const customControls = document.getElementById('custom-time-controls');

  if (state.mode === 'now') {
    btnNow.className = 'px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 bg-emerald-500 text-slate-950 shadow-md transition-all';
    btnCustom.className = 'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-all';
    customControls.classList.add('hidden');
  } else {
    btnNow.className = 'px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-all';
    btnCustom.className = 'px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 bg-amber-500 text-slate-950 shadow-md transition-all';
    customControls.classList.remove('hidden');

    const daySelect = document.getElementById('custom-day-select');
    if (daySelect) daySelect.value = state.customDay;
    const timeInput = document.getElementById('custom-time-input');
    if (timeInput) timeInput.value = state.customTime;
  }
}

// Main Render Function
function renderApp() {
  if (!state.db) return;

  const currentBuilding = state.db.buildings[state.selectedBuilding];
  if (!currentBuilding) return;

  const { day, minute, timeStr, isNow } = getActiveDayAndTime();

  // Update context title
  const contextEl = document.getElementById('query-context');
  if (contextEl) {
    contextEl.innerHTML = `
      <div class="flex items-center flex-wrap gap-2 text-sm">
        <span class="text-slate-400">Showing:</span>
        <span class="font-bold text-white flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
          <span class="w-2 h-2 rounded-full ${isNow ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}"></span>
          ${DAY_LABELS[day]} at ${timeStr}
          ${isNow ? '<span class="text-xs text-emerald-400 font-normal">(Live)</span>' : '<span class="text-xs text-amber-400 font-normal">(Custom)</span>'}
        </span>
        <span class="text-slate-500">•</span>
        <span class="text-slate-300 font-semibold">${currentBuilding.name}</span>
      </div>
    `;
  }

  // Filter rooms
  let rooms = currentBuilding.rooms;

  // Filter by Floor
  if (state.selectedFloor !== 'ALL') {
    rooms = rooms.filter(r => r.floor === state.selectedFloor);
  }

  // Search Query across room name, display name, course, instructor
  if (state.searchQuery.trim()) {
    const q = state.searchQuery.trim().toLowerCase();
    rooms = rooms.filter(r => {
      if (r.room.toLowerCase().includes(q)) return true;
      if (r.display_name.toLowerCase().includes(q)) return true;
      // Search in today's active or scheduled classes
      const daySched = r.schedule_by_day[day] || [];
      return daySched.some(ev => 
        ev.course_code.toLowerCase().includes(q) ||
        ev.course_name.toLowerCase().includes(q) ||
        (ev.instructors && ev.instructors.some(ins => ins.toLowerCase().includes(q)))
      );
    });
  }

  // Calculate status for each room
  const enrichedRooms = rooms.map(room => {
    const status = computeRoomStatus(room, day, minute);
    return {
      ...room,
      status: status
    };
  });

  // Filter by Status
  let filteredRooms = enrichedRooms;
  if (state.statusFilter === 'FREE') {
    filteredRooms = enrichedRooms.filter(r => !r.status.isOccupied);
  } else if (state.statusFilter === 'OCCUPIED') {
    filteredRooms = enrichedRooms.filter(r => r.status.isOccupied);
  } else if (state.statusFilter === 'REST_OF_DAY') {
    filteredRooms = enrichedRooms.filter(r => r.status.isFreeRestOfDay);
  }

  // Render Stats Card
  const totalFree = enrichedRooms.filter(r => !r.status.isOccupied).length;
  const totalRestOfDay = enrichedRooms.filter(r => r.status.isFreeRestOfDay).length;
  const totalOccupied = enrichedRooms.filter(r => r.status.isOccupied).length;
  const totalCount = enrichedRooms.length;
  const freePct = totalCount > 0 ? Math.round((totalFree / totalCount) * 100) : 0;

  const statsEl = document.getElementById('building-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <div class="glass-panel rounded-2xl p-4 sm:p-5 mb-6 flex flex-col md:flex-row gap-4 items-center justify-between border-l-4 border-l-amber-500">
        <div>
          <div class="flex items-center gap-2 mb-1">
            <h2 class="text-lg font-bold text-white">${currentBuilding.name}</h2>
            <span class="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono">${currentBuilding.id}</span>
          </div>
          <p class="text-xs text-slate-400">${currentBuilding.name_tr}</p>
        </div>

        <div class="flex items-center gap-4 sm:gap-6 w-full md:w-auto justify-between md:justify-end flex-wrap sm:flex-nowrap">
          <div class="text-center cursor-pointer hover:opacity-80 transition-opacity" onclick="setStatusFilter('FREE')" title="Filter by Free Now">
            <span class="text-xs text-slate-400 block mb-0.5">Free Now</span>
            <span class="text-2xl font-extrabold text-emerald-400 font-mono">${totalFree}</span>
          </div>
          <div class="h-8 w-px bg-slate-700/60 hidden sm:block"></div>
          <div class="text-center cursor-pointer hover:opacity-80 transition-opacity" onclick="setStatusFilter('REST_OF_DAY')" title="Filter by Free for Rest of the Day">
            <span class="text-xs text-teal-400 block mb-0.5 font-semibold">Rest of Day</span>
            <span class="text-2xl font-extrabold text-teal-300 font-mono">${totalRestOfDay}</span>
          </div>
          <div class="h-8 w-px bg-slate-700/60 hidden sm:block"></div>
          <div class="text-center cursor-pointer hover:opacity-80 transition-opacity" onclick="setStatusFilter('OCCUPIED')" title="Filter by Occupied">
            <span class="text-xs text-slate-400 block mb-0.5">Occupied</span>
            <span class="text-2xl font-extrabold text-red-400 font-mono">${totalOccupied}</span>
          </div>
          <div class="h-8 w-px bg-slate-700/60 hidden sm:block"></div>
          <div class="text-center">
            <span class="text-xs text-slate-400 block mb-0.5">Availability</span>
            <span class="text-2xl font-extrabold text-amber-400 font-mono">${freePct}%</span>
          </div>
        </div>
      </div>
    `;
  }

  // Render Grid
  const gridEl = document.getElementById('rooms-grid');
  if (!gridEl) return;

  if (filteredRooms.length === 0) {
    let emptyTitle = "No rooms matching current criteria";
    let emptyDesc = "Try clearing the search query or changing the floor / status filter.";
    if (state.statusFilter === 'REST_OF_DAY') {
      emptyTitle = "No rooms free for the rest of the day";
      emptyDesc = "All rooms currently have classes scheduled later today. Try clicking 'Free Only' or selecting another floor.";
    }
    gridEl.innerHTML = `
      <div class="col-span-full text-center py-16 glass-card rounded-2xl p-8 border-dashed border-slate-700/80">
        <div class="w-12 h-12 mx-auto mb-3 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-400">
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        </div>
        <h3 class="text-base font-semibold text-slate-200 mb-1">${emptyTitle}</h3>
        <p class="text-sm text-slate-400 mb-4">${emptyDesc}</p>
        <button onclick="resetFilters()" class="px-4 py-2 bg-slate-800 text-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors">
          Reset Filters
        </button>
      </div>
    `;
    return;
  }

  gridEl.innerHTML = filteredRooms.map(r => renderRoomCard(r, day, minute)).join('');
}

function renderRoomCard(room, day, minute) {
  const { isOccupied, isFreeRestOfDay, activeEvent, nextEvent, statusText } = room.status;

  let borderClass = 'border-emerald-500/30 hover:border-emerald-500/60';
  let badgeBadge = '';

  if (isOccupied) {
    borderClass = 'border-red-500/30 hover:border-red-500/60';
    badgeBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-red-500/20 text-red-300 border border-red-500/40 badge-pulse-red">
         <span class="w-2 h-2 rounded-full bg-red-400"></span> OCCUPIED
       </span>`;
  } else if (isFreeRestOfDay) {
    borderClass = 'border-emerald-500/40 hover:border-emerald-400 shadow-sm shadow-emerald-500/10';
    badgeBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 badge-pulse-green">
         <span class="w-2 h-2 rounded-full bg-emerald-400"></span> FREE
       </span>`;
  } else {
    badgeBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 badge-pulse-green">
         <span class="w-2 h-2 rounded-full bg-emerald-400"></span> FREE
       </span>`;
  }

  let detailsHTML = '';

  if (isOccupied && activeEvent) {
    const instructors = (activeEvent.instructors && activeEvent.instructors.length) 
      ? activeEvent.instructors.join(', ') 
      : 'Instructor TBA';

    // Duration progress
    const totalDuration = activeEvent.end_min - activeEvent.start_min;
    const elapsed = minute - activeEvent.start_min;
    const progressPct = Math.min(100, Math.max(0, Math.round((elapsed / totalDuration) * 100)));

    detailsHTML = `
      <div class="mt-3.5 pt-3.5 border-t border-slate-700/50 space-y-2.5">
        <div>
          <div class="flex items-center justify-between text-xs mb-1">
            <span class="font-bold text-amber-300 text-sm tracking-wide font-mono">${activeEvent.course_code}</span>
            <span class="text-slate-400 font-mono text-[11px]">${activeEvent.start_time} – ${activeEvent.end_time}</span>
          </div>
          <p class="text-xs text-slate-200 font-medium truncate" title="${activeEvent.course_name}">${activeEvent.course_name}</p>
        </div>

        <div class="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
          <div class="bg-red-500 h-1.5 rounded-full" style="width: ${progressPct}%"></div>
        </div>

        <div class="flex items-center justify-between text-[11px] text-slate-400">
          <span class="truncate max-w-[170px]" title="${instructors}">👤 ${instructors}</span>
          <span class="bg-slate-800/80 px-2 py-0.5 rounded text-slate-300 font-mono">Sec: ${activeEvent.section}</span>
        </div>
      </div>
    `;
  } else if (isFreeRestOfDay) {
    // FREE FOR REST OF DAY room card (matches FMAN G014 style)
    detailsHTML = `
      <div class="mt-3.5 pt-3.5 border-t border-slate-700/50">
        <div class="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3">
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div>
              <p class="text-xs font-semibold text-emerald-300">Free for the rest of the day</p>
              <p class="text-[11px] text-emerald-400/80 mt-0.5">No more classes scheduled today 🎉</p>
            </div>
          </div>
        </div>
      </div>
    `;
  } else {
    // FREE temporarily room card
    detailsHTML = `
      <div class="mt-3.5 pt-3.5 border-t border-slate-700/50">
        <div class="bg-emerald-950/20 border border-emerald-500/20 rounded-xl p-3">
          <div class="flex items-start gap-2">
            <svg class="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            <div>
              <p class="text-xs font-semibold text-emerald-300">${statusText}</p>
              ${nextEvent ? `
                <p class="text-[11px] text-slate-400 mt-1">
                  Next: <span class="font-mono text-slate-300 font-medium">${nextEvent.course_code}</span> at <span class="font-mono text-amber-300">${nextEvent.start_time}</span>
                </p>
              ` : `
                <p class="text-[11px] text-emerald-400/80 mt-0.5">No more classes scheduled today 🎉</p>
              `}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="glass-card rounded-2xl p-4 sm:p-5 flex flex-col justify-between ${borderClass} transition-all">
      <div>
        <div class="flex items-start justify-between gap-2 mb-2">
          <div>
            <div class="flex items-center gap-2">
              <h3 class="text-base sm:text-lg font-bold text-white font-mono tracking-tight">${room.display_name}</h3>
              ${room.capacity ? `<span class="text-[10px] bg-slate-800/90 text-slate-300 px-1.5 py-0.5 rounded border border-slate-700 font-mono">Cap: ${room.capacity}</span>` : ''}
            </div>
            <p class="text-xs text-slate-400">${room.floor_label}</p>
          </div>
          ${badgeBadge}
        </div>

        ${detailsHTML}
      </div>

      <div class="mt-4 pt-3 flex items-center justify-between border-t border-slate-800">
        <button 
          onclick="openRoomModal('${room.id}')"
          class="w-full text-xs font-semibold py-2 px-3 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white transition-all flex items-center justify-center gap-1.5 border border-slate-700/60"
        >
          <svg class="w-3.5 h-3.5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"></path></svg>
          View Full Week Schedule
        </button>
      </div>
    </div>
  `;
}

// Room Timetable Modal
function openRoomModal(roomId) {
  if (!state.db) return;

  let foundRoom = null;
  for (const b of Object.values(state.db.buildings)) {
    const r = b.rooms.find(x => x.id === roomId);
    if (r) {
      foundRoom = r;
      break;
    }
  }

  if (!foundRoom) return;
  state.activeModalRoom = foundRoom;

  const modal = document.getElementById('room-modal');
  const titleEl = document.getElementById('modal-room-title');
  const subtitleEl = document.getElementById('modal-room-subtitle');
  const bodyEl = document.getElementById('modal-timetable-body');

  titleEl.textContent = foundRoom.display_name;
  subtitleEl.textContent = `${foundRoom.building} • ${foundRoom.floor_label} • ${foundRoom.capacity ? `Capacity: ${foundRoom.capacity} seats` : 'Sabancı University'}`;

  // Build weekly timetable
  const days = ['M', 'T', 'W', 'R', 'F'];
  const dayNames = ['Mon (Pzt)', 'Tue (Salı)', 'Wed (Çar)', 'Thu (Per)', 'Fri (Cuma)'];
  const { day: activeDay, minute: activeMin } = getActiveDayAndTime();

  let html = `
    <div class="overflow-x-auto no-scrollbar">
      <div class="min-w-[650px] border border-slate-800 rounded-xl overflow-hidden bg-slate-950/40">
        <!-- Header Row -->
        <div class="grid grid-cols-6 bg-slate-900 border-b border-slate-800 text-xs font-semibold text-slate-300">
          <div class="p-2.5 text-center text-slate-500 border-r border-slate-800">Time</div>
          ${days.map((d, i) => `
            <div class="p-2.5 text-center border-r border-slate-800 last:border-r-0 ${d === activeDay ? 'bg-amber-500/10 text-amber-300 font-bold' : ''}">
              ${dayNames[i]}
            </div>
          `).join('')}
        </div>

        <!-- Schedule Grid -->
        <div class="divide-y divide-slate-800/60 font-mono text-xs">
          ${TIME_PRESETS.map(slot => {
            const parts = slot.split(':').map(Number);
            const slotMin = parts[0] * 60 + parts[1];

            return `
              <div class="grid grid-cols-6 min-h-[52px]">
                <div class="p-2 text-center text-slate-400 bg-slate-900/60 border-r border-slate-800 text-[11px] flex items-center justify-center font-bold">
                  ${slot}
                </div>

                ${days.map(d => {
                  const dayEvents = foundRoom.schedule_by_day[d] || [];
                  const event = dayEvents.find(ev => ev.start_min <= slotMin && slotMin < ev.end_min);
                  const isCurrentSlot = d === activeDay && slotMin <= activeMin && activeMin < slotMin + 60;

                  if (event) {
                    return `
                      <div class="p-1.5 border-r border-slate-800/60 last:border-r-0 bg-red-950/30 text-red-200 flex flex-col justify-center ${isCurrentSlot ? 'ring-2 ring-red-400 inset-0' : ''}">
                        <div class="font-bold text-[11px] text-amber-300 truncate" title="${event.course_code}">${event.course_code}</div>
                        <div class="text-[10px] text-slate-300 truncate font-sans" title="${event.course_name}">${event.course_name}</div>
                        <div class="text-[9px] text-slate-400 font-mono mt-0.5">${event.start_time}-${event.end_time}</div>
                      </div>
                    `;
                  } else {
                    return `
                      <div class="p-1.5 border-r border-slate-800/40 last:border-r-0 text-slate-600 flex items-center justify-center text-[10px] ${isCurrentSlot ? 'bg-amber-500/10 text-amber-400 font-semibold' : 'hover:bg-slate-900/30'}">
                        ${isCurrentSlot ? '• Now Free •' : '—'}
                      </div>
                    `;
                  }
                }).join('')}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  bodyEl.innerHTML = html;
  modal.classList.remove('hidden');
}

function closeRoomModal() {
  const modal = document.getElementById('room-modal');
  if (modal) modal.classList.add('hidden');
}

// Status Filter Helper
function setStatusFilter(filter) {
  state.statusFilter = filter;
  updateStatusFilterUI();
  renderBuildingTabs();
  renderFloorFilters();
  renderApp();
  updateURLParams();
}

function updateStatusFilterUI() {
  const filterBtns = document.querySelectorAll('[data-status-filter]');
  filterBtns.forEach(btn => {
    const f = btn.getAttribute('data-status-filter');
    if (f === state.statusFilter) {
      if (f === 'FREE') {
        btn.className = 'px-3 py-1 rounded-md text-white font-bold bg-emerald-700/80 border border-emerald-500/40 shadow-sm transition-colors flex items-center gap-1.5 whitespace-nowrap';
      } else if (f === 'REST_OF_DAY') {
        btn.className = 'px-3 py-1 rounded-md text-white font-bold bg-teal-700/80 border border-teal-500/40 shadow-sm transition-colors flex items-center gap-1.5 whitespace-nowrap';
      } else if (f === 'OCCUPIED') {
        btn.className = 'px-3 py-1 rounded-md text-white font-bold bg-red-800/80 border border-red-500/40 shadow-sm transition-colors flex items-center gap-1.5 whitespace-nowrap';
      } else {
        btn.className = 'px-3 py-1 rounded-md text-white font-bold bg-slate-700 border border-slate-600 shadow-sm transition-colors flex items-center gap-1.5 whitespace-nowrap';
      }
    } else {
      btn.className = 'px-3 py-1 rounded-md text-slate-400 hover:text-white border border-transparent transition-colors flex items-center gap-1.5 whitespace-nowrap';
    }
  });
}

// Reset filters
function resetFilters() {
  state.selectedFloor = 'ALL';
  state.statusFilter = 'ALL';
  state.searchQuery = '';
  const searchInput = document.getElementById('search-input');
  if (searchInput) searchInput.value = '';
  updateStatusFilterUI();
  renderFloorFilters();
  renderBuildingTabs();
  renderApp();
  updateURLParams();
}

// Event Listeners
function setupEventListeners() {
  // Search
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.value = state.searchQuery;
    searchInput.addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      renderApp();
      updateURLParams();
    });
  }

  // Clear search
  const clearSearchBtn = document.getElementById('clear-search-btn');
  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      state.searchQuery = '';
      renderApp();
      updateURLParams();
    });
  }

  // Status Filter tabs
  const filterBtns = document.querySelectorAll('[data-status-filter]');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-status-filter');
      setStatusFilter(filter);
    });
  });

  // Custom Day select
  const daySelect = document.getElementById('custom-day-select');
  if (daySelect) {
    daySelect.addEventListener('change', (e) => {
      state.customDay = e.target.value;
      state.mode = 'custom';
      updateModeUI();
      renderBuildingTabs();
      renderFloorFilters();
      renderApp();
      updateURLParams();
    });
  }

  // Custom Time input
  const timeInput = document.getElementById('custom-time-input');
  if (timeInput) {
    timeInput.addEventListener('change', (e) => {
      state.customTime = e.target.value;
      state.mode = 'custom';
      updateModeUI();
      renderQuickTimePresets();
      renderBuildingTabs();
      renderFloorFilters();
      renderApp();
      updateURLParams();
    });
  }

  // Modal close when clicking backdrop or ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeRoomModal();
  });

  const modal = document.getElementById('room-modal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeRoomModal();
    });
  }
}

// Start app
window.addEventListener('DOMContentLoaded', init);
