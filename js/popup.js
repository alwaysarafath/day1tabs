// ============================================================
// day1tabs Popup Logic
// ============================================================

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const status = await sendMessage({ action: 'getStatus' });
  renderStatus(status);
  setupEventListeners(status);
}

function renderStatus(status) {
  // Tab count
  const countEl = document.getElementById('tabCount');
  countEl.textContent = status.tabCount;

  const colorClass = status.tabCount <= 10 ? 'green'
    : status.tabCount <= 30 ? 'amber'
    : status.tabCount <= 60 ? 'orange' : 'red';

  countEl.className = 'tab-count ' + colorClass;

  // Subtitle: "tabs open" or "tabs across X windows"
  const label = document.getElementById('tabLabel');
  if (status.windowCount > 1) {
    label.textContent = `tabs across ${status.windowCount} windows`;
  } else {
    label.textContent = 'tabs open';
  }

  // Estimated RAM usage
  const ramEl = document.getElementById('tabRam');
  const ramMB = status.tabCount * 100;
  const ramStr = ramMB >= 1000 ? `~${(ramMB / 1000).toFixed(1)} GB` : `~${ramMB} MB`;
  ramEl.innerHTML = `using <span class="ram-value">${ramStr}</span> estimated RAM`;

  // Count bar
  const bar = document.getElementById('countBar');
  bar.className = 'count-bar ' + colorClass;
  const pct = Math.min(100, (status.tabCount / 100) * 100);
  bar.style.cssText = '';
  requestAnimationFrame(() => {
    bar.style.setProperty('--bar-width', pct + '%');
    bar.setAttribute('style', '');
    const style = document.createElement('style');
    style.textContent = `.count-bar::after { width: ${pct}% !important; }`;
    style.id = 'bar-style';
    const existing = document.getElementById('bar-style');
    if (existing) existing.remove();
    document.head.appendChild(style);
  });

  // Reset toggle
  const track = document.querySelector('.toggle-track');
  if (status.resetEnabled) {
    track.classList.add('active');
  } else {
    track.classList.remove('active');
  }

  // Reset info
  const resetInfo = document.getElementById('resetInfo');
  const resetText = document.getElementById('resetText');
  if (status.resetEnabled) {
    const resetTime = new Date(status.nextReset);
    const h = resetTime.getHours();
    const m = resetTime.getMinutes();
    const timeStr = formatTime(h, m);
    const tz = getTimezoneAbbr();
    resetText.textContent = `Next reset at ${timeStr} ${tz}`;
    resetInfo.classList.remove('disabled');
  } else {
    resetText.textContent = 'Auto-reset is paused';
    resetInfo.classList.add('disabled');
  }

  // Undo banner
  const undoBanner = document.getElementById('undoBanner');
  if (status.undoAvailable) {
    undoBanner.style.display = 'block';
    const undoText = document.getElementById('undoText');
    const remaining = status.undoRemainingCount ?? status.undoTabCount;
    undoText.textContent = `${remaining} tabs closed · ${status.undoExpiresIn}m left`;

    // Timer bar
    const timerPct = (status.undoExpiresIn / 30) * 100;
    const timerStyle = document.createElement('style');
    timerStyle.textContent = `.undo-timer::after { width: ${timerPct}% !important; }`;
    timerStyle.id = 'undo-timer-style';
    const existing = document.getElementById('undo-timer-style');
    if (existing) existing.remove();
    document.head.appendChild(timerStyle);
  } else {
    undoBanner.style.display = 'none';
  }

  // Sacred domains
  renderSacredDomains(status.sacredDomains);

  // Settings — populate dropdowns
  populateTimeDropdowns();
  setTimePickerFromHour24(status.resetHour, status.resetMinute);
  document.getElementById('timeTz').textContent = getTimezoneAbbr();
}

function renderSacredDomains(domains) {
  const container = document.getElementById('sacredDomains');
  const countEl = document.getElementById('sacredCount');

  countEl.textContent = `${domains.length} domain${domains.length !== 1 ? 's' : ''}`;

  container.innerHTML = '';
  domains.forEach(domain => {
    const chip = document.createElement('div');
    chip.className = 'sacred-chip';
    chip.innerHTML = `
      <span>${domain}</span>
      <span class="remove" data-domain="${domain}">×</span>
    `;
    container.appendChild(chip);
  });

  // Attach remove listeners
  container.querySelectorAll('.remove').forEach(el => {
    el.addEventListener('click', async (e) => {
      const domain = e.target.dataset.domain;
      const result = await sendMessage({ action: 'removeSacredDomain', domain });
      renderSacredDomains(result.sacredDomains);
    });
  });
}

function setupEventListeners(status) {
  // Toggle reset
  document.getElementById('resetToggle').addEventListener('click', async () => {
    const current = document.querySelector('.toggle-track').classList.contains('active');
    await sendMessage({ action: 'updateSettings', resetEnabled: !current });
    const newStatus = await sendMessage({ action: 'getStatus' });
    renderStatus(newStatus);
  });

  // View archive
  document.getElementById('viewArchive').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/archive.html') });
    window.close();
  });

  // Manual reset
  document.getElementById('manualReset').addEventListener('click', () => {
    showConfirmation(
      'Fresh Start?',
      `Close ${status.resettableCount} non-sacred tab${status.resettableCount !== 1 ? 's' : ''} now? You'll have 30 minutes to undo.`,
      async () => {
        await sendMessage({ action: 'manualReset' });
        const newStatus = await sendMessage({ action: 'getStatus' });
        renderStatus(newStatus);
      }
    );
  });

  // Undo
  document.getElementById('undoBtn').addEventListener('click', async () => {
    const result = await sendMessage({ action: 'undo' });
    if (result.success) {
      const newStatus = await sendMessage({ action: 'getStatus' });
      renderStatus(newStatus);
    }
  });

  // Add sacred domain
  const sacredInput = document.getElementById('sacredInput');
  const sacredAddBtn = document.getElementById('sacredAddBtn');

  const addDomain = async () => {
    const domain = sacredInput.value.trim();
    if (domain) {
      const result = await sendMessage({ action: 'addSacredDomain', domain });
      renderSacredDomains(result.sacredDomains);
      sacredInput.value = '';
    }
  };

  sacredAddBtn.addEventListener('click', addDomain);
  sacredInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addDomain();
  });

  // Never Close toggle
  document.getElementById('sacredToggle').addEventListener('click', () => {
    const panel = document.getElementById('sacredPanel');
    const chevron = document.getElementById('sacredChevron');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    chevron.classList.toggle('open', !isOpen);
  });

  // Settings toggle
  document.getElementById('settingsToggle').addEventListener('click', () => {
    const panel = document.getElementById('settingsPanel');
    const chevron = document.getElementById('settingsChevron');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    chevron.classList.toggle('open', !isOpen);
  });

  // Time picker changes
  const saveTime = async () => {
    const h12 = parseInt(document.getElementById('resetHourDisplay').value);
    const minute = parseInt(document.getElementById('resetMinute').value) || 0;
    const ampm = document.getElementById('resetAmPm').value;

    // Convert to 24h
    let hour = h12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    else if (ampm === 'PM' && hour !== 12) hour += 12;

    document.getElementById('resetHour').value = hour;

    await sendMessage({
      action: 'updateSettings',
      resetHour: hour,
      resetMinute: minute
    });
    const newStatus = await sendMessage({ action: 'getStatus' });
    renderStatus(newStatus);
  };

  document.getElementById('resetHourDisplay').addEventListener('change', saveTime);
  document.getElementById('resetMinute').addEventListener('change', saveTime);
  document.getElementById('resetAmPm').addEventListener('change', saveTime);
}

// ---- Confirmation Dialog ---- 
function showConfirmation(title, text, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <h3>${title}</h3>
      <p>${text}</p>
      <div class="confirm-actions">
        <button class="confirm-cancel">Cancel</button>
        <button class="confirm-ok">Do it</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.confirm-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.confirm-ok').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
}

// ---- Helpers ----
function formatTime(h, m) {
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayM = String(m).padStart(2, '0');
  return `${displayH}:${displayM} ${period}`;
}

function getTimezoneAbbr() {
  // Extract timezone abbreviation like "IST", "EST", "PST"
  const parts = Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(new Date());
  const tz = parts.find(p => p.type === 'timeZoneName');
  return tz ? tz.value : '';
}

function populateTimeDropdowns() {
  const hourSel = document.getElementById('resetHourDisplay');
  const minSel = document.getElementById('resetMinute');

  if (hourSel.options.length > 0) return; // already populated

  for (let h = 1; h <= 12; h++) {
    const opt = document.createElement('option');
    opt.value = h;
    opt.textContent = h;
    hourSel.appendChild(opt);
  }

  for (let m = 0; m < 60; m += 5) {
    const opt = document.createElement('option');
    opt.value = m;
    opt.textContent = String(m).padStart(2, '0');
    minSel.appendChild(opt);
  }
}

function setTimePickerFromHour24(hour24, minute) {
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  let h12 = hour24 % 12;
  if (h12 === 0) h12 = 12;

  document.getElementById('resetHourDisplay').value = h12;
  document.getElementById('resetAmPm').value = ampm;
  document.getElementById('resetHour').value = hour24;

  // Snap minute to nearest 5
  const snapped = Math.round(minute / 5) * 5;
  document.getElementById('resetMinute').value = snapped >= 60 ? 55 : snapped;
}

function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}
