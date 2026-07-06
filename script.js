/* ==========================================================
   SMARTPARK — CORE LOGIC
   Slot allocation • Gate control • Live billing • Fare engine
   ========================================================== */

// ---------- CONFIG ----------
const LOT_LAYOUT = {
  car:  { label: "Car Section",  count: 6, prefix: "C", direction: "Go straight ahead" },
  bike: { label: "Bike Section", count: 4, prefix: "K", direction: "Take the left lane" },
  ev:   { label: "EV Section (Charging Bay)", count: 2, prefix: "E", direction: "Take the right lane" }
};

const RATES = {
  car:  { base: 30, extra: 20 },
  bike: { base: 10, extra: 5  },
  ev:   { base: 40, extra: 25 }
};

const GRACE_MINUTES = 5;
const GATE_AUTO_CLOSE_MS = 3500;
const SIM_SLOT_POSITIONS = {
  car:  [{ x: 76, y: 18 }, { x: 76, y: 35 }, { x: 76, y: 52 }, { x: 76, y: 69 }, { x: 62, y: 18 }, { x: 62, y: 35 }],
  bike: [{ x: 24, y: 19 }, { x: 24, y: 35 }, { x: 24, y: 51 }, { x: 24, y: 67 }],
  ev:   [{ x: 50, y: 18 }, { x: 50, y: 35 }]
};

// ---------- STATE ----------
let slots = [];
let history = [];
let revenueToday = 0;
let slotElsById = new Map();
let simVehicleEl = null;

// ---------- BUILD SLOTS ----------
function buildSlots() {
  Object.entries(LOT_LAYOUT).forEach(([type, cfg]) => {
    for (let i = 1; i <= cfg.count; i++) {
      slots.push({
        id: `${cfg.prefix}${i}`,
        type,
        status: 'free',
        plate: null,
        entryTime: null
      });
    }
  });
}
buildSlots();

// ---------- DOM REFS ----------
const lotMapEl        = document.getElementById('lotMap');
const occupancyValueEl= document.getElementById('occupancyValue');
const revenueValueEl  = document.getElementById('revenueValue');
const clockValueEl    = document.getElementById('clockValue');

const entryBarrier    = document.getElementById('entryBarrier');
const entryGateStatus = document.getElementById('entryGateStatus');
const exitBarrier     = document.getElementById('exitBarrier');
const exitGateStatus  = document.getElementById('exitGateStatus');

const ledText         = document.getElementById('ledText');

const arrivalForm     = document.getElementById('arrivalForm');
const plateInput      = document.getElementById('plateInput');
const typeInput       = document.getElementById('typeInput');
const arrivalHint      = document.getElementById('arrivalHint');
const randomParkingBtn = document.getElementById('randomParkingBtn');

const exitForm        = document.getElementById('exitForm');
const exitSelect       = document.getElementById('exitSelect');
const exitHint         = document.getElementById('exitHint');

const activeTableBody  = document.querySelector('#activeTable tbody');
const activeEmpty      = document.getElementById('activeEmpty');

const tapeEl            = document.getElementById('tape');
const tapeEmpty         = document.getElementById('tapeEmpty');

const receiptBackdrop  = document.getElementById('receiptBackdrop');
const receiptBody      = document.getElementById('receiptBody');
const receiptClose     = document.getElementById('receiptClose');

// ---------- HELPERS ----------
function normalizePlate(raw) {
  return raw.trim().toUpperCase().replace(/\s+/g, ' ');
}

function fmtTime(d) {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function fmtDuration(ms) {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h > 0 ? h + 'h ' : ''}${m}m ${s}s`;
}

function findFreeSlot(type) {
  const candidates = slots.filter(s => s.type === type && s.status === 'free');
  if (!candidates.length) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

function findActiveByPlate(plate) {
  return slots.find(s => s.status === 'occupied' && s.plate === plate);
}

function makeRandomPlate() {
  const letters = ['BA', 'DL', 'MH', 'KA', 'TN', 'UP'];
  const prefix = letters[Math.floor(Math.random() * letters.length)];
  const num = 1000 + Math.floor(Math.random() * 9000);
  return `${prefix} ${num}`;
}

// ---------- FARE ENGINE ----------
function calculateFare(type, entryTime, exitTime) {
  const rate = RATES[type];
  const ms = exitTime - entryTime;
  const minutes = ms / 60000;

  if (minutes <= GRACE_MINUTES) {
    return { minutes, hoursBilled: 0, base: 0, extraHours: 0, extraCharge: 0, total: 0, grace: true };
  }

  const hoursBilled = Math.max(1, Math.ceil(minutes / 60));
  const extraHours = hoursBilled - 1;
  const extraCharge = extraHours * rate.extra;
  const total = rate.base + extraCharge;

  return { minutes, hoursBilled, base: rate.base, extraHours, extraCharge, total, grace: false };
}

// ---------- GATE CONTROL ----------
function operateGate(barrierEl, statusEl) {
  barrierEl.classList.add('open');
  statusEl.textContent = 'OPEN';
  statusEl.classList.add('open');
  clearTimeout(barrierEl._closeTimer);
  barrierEl._closeTimer = setTimeout(() => {
    barrierEl.classList.remove('open');
    statusEl.textContent = 'CLOSED';
    statusEl.classList.remove('open');
  }, GATE_AUTO_CLOSE_MS);
}

function denyGate(statusEl) {
  statusEl.textContent = 'LOCKED — FULL';
  statusEl.classList.remove('open');
  setTimeout(() => { statusEl.textContent = 'CLOSED'; }, GATE_AUTO_CLOSE_MS);
}

// ---------- LED DISPLAY ----------
function showOnBoard(msg) {
  ledText.textContent = msg;
}

// ---------- RENDER: LOT MAP ----------
function createParkingStage() {
  lotMapEl.innerHTML = '';
  slotElsById.clear();

  const stage = document.createElement('div');
  stage.className = 'sim-stage';
  stage.innerHTML = `
    <div class="sim-road"></div>
    <div class="sim-gate sim-entry">Entry</div>
    <div class="sim-gate sim-exit">Exit</div>
    <div class="sim-zone-label car">Car</div>
    <div class="sim-zone-label bike">Bike</div>
    <div class="sim-zone-label ev">EV</div>
  `;

  simVehicleEl = document.createElement('div');
  simVehicleEl.id = 'simVehicle';
  simVehicleEl.className = 'sim-car';
  stage.appendChild(simVehicleEl);

  const typeIndex = { car: 0, bike: 0, ev: 0 };
  slots.forEach(slot => {
    const pos = SIM_SLOT_POSITIONS[slot.type][typeIndex[slot.type]++] || { x: 50, y: 50 };
    const el = document.createElement('div');
    el.className = 'parking-slot';
    el.dataset.slotId = slot.id;
    el.style.left = `${pos.x}%`;
    el.style.top = `${pos.y}%`;
    stage.appendChild(el);
    slotElsById.set(slot.id, el);
  });

  lotMapEl.appendChild(stage);
  updateLotMap();
}

function updateLotMap() {
  if (!lotMapEl.querySelector('.sim-stage')) {
    createParkingStage();
    return;
  }

  simVehicleEl = document.getElementById('simVehicle');
  slots.forEach(slot => {
    const el = slotElsById.get(slot.id);
    if (!el) return;

    el.className = `parking-slot ${slot.status === 'free' ? 'free' : 'occ'}`;
    el.innerHTML = `
      <span class="slot-id">${slot.id}</span>
      <span class="slot-plate">${slot.status === 'occupied' ? slot.plate : 'Free'}</span>
      ${slot.status === 'occupied' ? '<span class="parked-car"></span>' : ''}
    `;
  });
}

function renderLotMap() {
  if (!lotMapEl.querySelector('.sim-stage')) {
    createParkingStage();
  } else {
    updateLotMap();
  }
}

function animateVehicleToSlot(slot, mode) {
  if (!simVehicleEl) return;
  const stage = lotMapEl.querySelector('.sim-stage');
  if (!stage) return;

  const pos = SIM_SLOT_POSITIONS[slot.type][slots.filter(s => s.type === slot.type).findIndex(s => s.id === slot.id)] || { x: 50, y: 50 };
  const start = mode === 'entry'
    ? { x: 6, y: 50 }
    : { x: pos.x, y: pos.y };
  const end = mode === 'entry'
    ? { x: pos.x, y: pos.y }
    : { x: 94, y: 50 };

  simVehicleEl.classList.add('active');
  simVehicleEl.style.opacity = '1';
  simVehicleEl.style.left = `${start.x}%`;
  simVehicleEl.style.top = `${start.y}%`;

  const startTime = performance.now();
  const duration = mode === 'entry' ? 1400 : 1200;

  const frame = now => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const x = start.x + (end.x - start.x) * eased;
    const y = start.y + (end.y - start.y) * eased;
    simVehicleEl.style.left = `${x}%`;
    simVehicleEl.style.top = `${y}%`;

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      simVehicleEl.style.left = `${end.x}%`;
      simVehicleEl.style.top = `${end.y}%`;
      simVehicleEl.classList.remove('active');
      simVehicleEl.style.opacity = '0';
    }
  };

  requestAnimationFrame(frame);
}

// ---------- RENDER: STATS ----------
function renderStats() {
  const occupied = slots.filter(s => s.status === 'occupied').length;
  occupancyValueEl.textContent = `${occupied} / ${slots.length}`;
  revenueValueEl.textContent = `₹${revenueToday}`;
}

// ---------- RENDER: ACTIVE VEHICLES TABLE + EXIT DROPDOWN ----------
function renderActiveTable() {
  const occupied = slots.filter(s => s.status === 'occupied');
  activeTableBody.innerHTML = '';
  activeEmpty.style.display = occupied.length ? 'none' : 'block';

  occupied.forEach(s => {
    const tr = document.createElement('tr');
    tr.dataset.plate = s.plate;
    tr.innerHTML = `
      <td>${s.plate}</td>
      <td>${s.type.toUpperCase()}</td>
      <td>${s.id}</td>
      <td>${fmtTime(s.entryTime)}</td>
      <td class="dur">${fmtDuration(Date.now() - s.entryTime)}</td>
    `;
    activeTableBody.appendChild(tr);
  });

  const prevValue = exitSelect.value;
  exitSelect.innerHTML = occupied.length
    ? occupied.map(s => `<option value="${s.plate}">${s.plate} — ${s.type.toUpperCase()} — Slot ${s.id}</option>`).join('')
    : `<option value="">— No vehicles parked —</option>`;
  if (occupied.some(s => s.plate === prevValue)) exitSelect.value = prevValue;
}

// ---------- RENDER: TRANSACTION LOG ----------
function renderHistory() {
  tapeEmpty.style.display = history.length ? 'none' : 'block';
  tapeEl.innerHTML = '';
  history.slice().reverse().forEach(tx => {
    const div = document.createElement('div');
    div.className = 'tape-item';
    div.innerHTML = `
      <span><span class="t-plate">${tx.plate}</span> <span class="t-meta">· ${tx.type.toUpperCase()} · Slot ${tx.slot} · ${fmtDuration(tx.durationMs)}</span></span>
      <span class="t-fare">₹${tx.total}</span>
    `;
    tapeEl.appendChild(div);
  });
  if (!history.length) tapeEl.appendChild(tapeEmpty);
}

// ---------- LIVE TICK ----------
function tick() {
  clockValueEl.textContent = new Date().toLocaleTimeString();
  document.querySelectorAll('#activeTable tbody tr').forEach(tr => {
    const plate = tr.dataset.plate;
    const slot = findActiveByPlate(plate);
    if (slot) tr.querySelector('.dur').textContent = fmtDuration(Date.now() - slot.entryTime);
  });
}
setInterval(tick, 1000);
tick();

// ---------- CORE ACTION: ARRIVAL ----------
function handleArrival(plate, type) {
  if (!plate) return { ok: false, msg: 'Enter a valid number plate.' };

  if (findActiveByPlate(plate)) {
    return { ok: false, msg: `${plate} is already parked inside.` };
  }

  const slot = findFreeSlot(type);
  if (!slot) {
    denyGate(entryGateStatus);
    showOnBoard(`SORRY — ${LOT_LAYOUT[type].label.toUpperCase()} FULL`);
    return { ok: false, msg: `No free ${type.toUpperCase()} slot available. Entry gate stays locked.` };
  }

  slot.status = 'occupied';
  slot.plate = plate;
  slot.entryTime = new Date();

  operateGate(entryBarrier, entryGateStatus);
  showOnBoard(`${plate} → SLOT ${slot.id} · ${LOT_LAYOUT[type].direction.toUpperCase()}`);

  renderAll();
  animateVehicleToSlot(slot, 'entry');
  return { ok: true, msg: `Gate opened. ${plate} allocated to slot ${slot.id}.` };
}

// ---------- CORE ACTION: EXIT ----------
function handleExit(plate) {
  const slot = findActiveByPlate(plate);
  if (!slot) return { ok: false, msg: 'Vehicle not found inside the lot.' };

  const exitTime = new Date();
  const fare = calculateFare(slot.type, slot.entryTime, exitTime);

  const record = {
    plate, type: slot.type, slot: slot.id,
    entryTime: slot.entryTime, exitTime,
    durationMs: exitTime - slot.entryTime,
    ...fare, total: fare.total
  };
  history.push(record);
  revenueToday += fare.total;

  slot.status = 'free';
  slot.plate = null;
  slot.entryTime = null;

  operateGate(exitBarrier, exitGateStatus);
  showOnBoard(`${plate} EXITED · SLOT ${record.slot} FREED`);

  renderAll();
  animateVehicleToSlot(slot, 'exit');
  showReceipt(record);
  return { ok: true, msg: `${plate} exited. Fare charged ₹${fare.total}.` };
}

// ---------- RECEIPT MODAL ----------
function showReceipt(tx) {
  const rows = [];
  rows.push(`<div class="receipt-row"><span>Plate</span><span>${tx.plate}</span></div>`);
  rows.push(`<div class="receipt-row"><span>Vehicle Type</span><span>${tx.type.toUpperCase()}</span></div>`);
  rows.push(`<div class="receipt-row"><span>Slot</span><span>${tx.slot}</span></div>`);
  rows.push(`<div class="receipt-row"><span>Entry</span><span>${fmtTime(tx.entryTime)}</span></div>`);
  rows.push(`<div class="receipt-row"><span>Exit</span><span>${fmtTime(tx.exitTime)}</span></div>`);
  rows.push(`<div class="receipt-row"><span>Duration</span><span>${fmtDuration(tx.durationMs)}</span></div>`);

  if (tx.grace) {
    rows.push(`<div class="receipt-row"><span>Grace period (≤${GRACE_MINUTES}m)</span><span>₹0</span></div>`);
  } else {
    rows.push(`<div class="receipt-row"><span>Base (1st hour)</span><span>₹${tx.base}</span></div>`);
    rows.push(`<div class="receipt-row"><span>Extra (${tx.extraHours}h × ₹${RATES[tx.type].extra})</span><span>₹${tx.extraCharge}</span></div>`);
  }
  rows.push(`<div class="receipt-row total"><span>Total Fare</span><span>₹${tx.total}</span></div>`);

  receiptBody.innerHTML = rows.join('');
  receiptBackdrop.classList.add('show');
}
receiptClose.addEventListener('click', () => receiptBackdrop.classList.remove('show'));
receiptBackdrop.addEventListener('click', e => { if (e.target === receiptBackdrop) receiptBackdrop.classList.remove('show'); });

// ---------- MASTER RENDER ----------
function renderAll() {
  renderLotMap();
  renderStats();
  renderActiveTable();
  renderHistory();
}
renderAll();

// ---------- FORM WIRING ----------
arrivalForm.addEventListener('submit', e => {
  e.preventDefault();
  const plate = normalizePlate(plateInput.value);
  const type = typeInput.value;
  const result = handleArrival(plate, type);
  arrivalHint.textContent = result.msg;
  arrivalHint.className = `hint ${result.ok ? 'ok' : 'error'}`;
  if (result.ok) { plateInput.value = ''; plateInput.focus(); }
});

randomParkingBtn.addEventListener('click', () => {
  const types = ['car', 'bike', 'ev'];
  const type = types[Math.floor(Math.random() * types.length)];
  const result = handleArrival(makeRandomPlate(), type);
  arrivalHint.textContent = result.msg;
  arrivalHint.className = `hint ${result.ok ? 'ok' : 'error'}`;
});

exitForm.addEventListener('submit', e => {
  e.preventDefault();
  const plate = exitSelect.value;
  if (!plate) {
    exitHint.textContent = 'Select a parked vehicle first.';
    exitHint.className = 'hint error';
    return;
  }
  const result = handleExit(plate);
  exitHint.textContent = result.msg;
  exitHint.className = `hint ${result.ok ? 'ok' : 'error'}`;
});

// ---------- TAB SWITCHING ----------
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`${btn.dataset.tab}Panel`).classList.add('active');
  });
});
