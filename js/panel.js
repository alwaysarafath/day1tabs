// ============================================================
// day1tabs Side Panel Logic
// Combines live stats + archive into a single scrollable view
// ============================================================

document.addEventListener('DOMContentLoaded', init);

let currentStatus = null;
let currentArchive = null;
let isTabView = false;

async function init() {
  // When opened as a tab (scheduled close), center the content
  const params = new URLSearchParams(window.location.search);
  if (params.get('source') === 'auto') {
    document.body.classList.add('tab-view');
    isTabView = true;
  }

  const [statusResult, archiveResult] = await Promise.all([
    sendMessage({ action: 'getStatus' }),
    sendMessage({ action: 'getArchive' })
  ]);
  currentStatus = statusResult;
  currentArchive = archiveResult;

  renderNextClose(statusResult);
  setupSettings(statusResult);
  setupDomainDelegation();
  renderArchive(archiveResult, statusResult);
  await showMissingHint(archiveResult);

  // Tab-view customizations (scheduled close only)
  if (isTabView) {
    // Move archive summary to top (after header, before action block)
    const summary = document.getElementById('archiveSummary');
    const actionBlock = document.querySelector('.action-block');
    if (summary && actionBlock) {
      actionBlock.parentNode.insertBefore(summary, actionBlock);
      summary.classList.add('tab-view-summary');
    }

    // Hide "or" and "Close tabs now" button
    const orText = document.querySelector('.action-or');
    const closeBtn = document.getElementById('freshStartBtn');
    if (orText) orText.style.display = 'none';
    if (closeBtn) closeBtn.style.display = 'none';

  }

  setupEventListeners(currentStatus);

  // Footer share button
  const footerShareBtn = document.getElementById('footerShareBtn');
  if (footerShareBtn) {
    footerShareBtn.addEventListener('click', async () => {
      const didntUseCount = currentArchive?.archive?.[0]?.tabs?.filter(t => t.classification !== 'workhorse').length || 0;
      const shareText = `Hi, I am using day1Tabs to clear my clutter daily and it closed ${didntUseCount} tab${didntUseCount !== 1 ? 's' : ''} yesterday that I didn't use automatically. Give it a try!\n\nChrome Web Store: https://chromewebstore.google.com/detail/day1tabs/iaklgpbfkohkghhmjjdfeiekemnnkklp\nWebsite: https://day1tabs.com/`;
      if (navigator.share) {
        try { await navigator.share({ text: shareText }); } catch (e) {}
      } else {
        await navigator.clipboard.writeText(shareText);
        showToast('Copied to clipboard');
      }
    });
  }

  // Footer version from manifest
  const manifest = chrome.runtime.getManifest();
  document.getElementById('footerVersion').textContent = `v${manifest.version}`;
}

function renderNextClose(status) {
  const el = document.getElementById('nextCloseText');

  // Auto-close toggle
  const track = document.getElementById('resetToggleTrack');
  if (status.resetEnabled) {
    track.classList.add('active');
  } else {
    track.classList.remove('active');
  }

  if (!status.resetEnabled) {
    el.textContent = 'Auto-close is paused';
    return;
  }
  const resetTime = new Date(status.nextReset);
  const h = resetTime.getHours();
  const m = resetTime.getMinutes();
  el.textContent = isTabView
    ? `Next auto-close at ${formatTime(h, m)}`
    : `Tabs auto-close at ${formatTime(h, m)}`;
}

// ============================================================
// SETTINGS
// ============================================================

function setupSettings(status) {
  // Populate time dropdowns
  populateTimeDropdowns();
  setTimePickerFromHour24(status.resetHour, status.resetMinute);
  document.getElementById('timeTz').textContent = getTimezoneAbbr();

  // Duplicate settings
  const dupTrack = document.getElementById('dupToggleTrack');
  const dupDelayRow = document.getElementById('dupDelayRow');
  const dupHint = document.getElementById('dupHint');
  const dupDelaySelect = document.getElementById('dupDelaySelect');

  if (status.duplicateAutoClose) {
    dupTrack.classList.add('active');
    dupDelayRow.style.display = 'flex';
    dupHint.style.display = 'block';
  } else {
    dupTrack.classList.remove('active');
    dupDelayRow.style.display = 'none';
    dupHint.style.display = 'none';
  }
  dupDelaySelect.value = status.duplicateAutoCloseMinutes || 10;

  // Never-close domains
  renderNeverCloseDomains(status.sacredDomains);
}

function renderNeverCloseDomains(domains) {
  const container = document.getElementById('nevercloseDomains');
  const countEl = document.getElementById('nevercloseCount');

  countEl.textContent = `${domains.length} domain${domains.length !== 1 ? 's' : ''}`;

  const frag = document.createDocumentFragment();
  domains.forEach(domain => {
    const chip = document.createElement('div');
    chip.className = 'neverclose-chip';
    chip.innerHTML = `
      <span>${escapeHtml(domain)}</span>
      <span class="remove" data-domain="${escapeAttr(domain)}">×</span>
    `;
    frag.appendChild(chip);
  });
  container.innerHTML = '';
  container.appendChild(frag);
}

// Set up once — delegated listener for domain chip removal
function setupDomainDelegation() {
  document.getElementById('nevercloseDomains').addEventListener('click', async (e) => {
    const removeBtn = e.target.closest('.remove');
    if (!removeBtn) return;
    const domain = removeBtn.dataset.domain;
    const result = await sendMessage({ action: 'removeSacredDomain', domain });
    renderNeverCloseDomains(result.sacredDomains);
  });
}

// ============================================================
// EVENT LISTENERS
// ============================================================

function setupEventListeners(status) {
  // Auto-close toggle
  document.getElementById('resetToggle').addEventListener('click', async () => {
    const track = document.getElementById('resetToggleTrack');
    const current = track.classList.contains('active');
    await sendMessage({ action: 'updateSettings', resetEnabled: !current });
    currentStatus = await sendMessage({ action: 'getStatus' });
    renderNextClose(currentStatus);
  });

  // Fresh Start Now
  document.getElementById('freshStartBtn').addEventListener('click', () => {
    showConfirmation(
      'Close all tabs now?',
      'Tabs from your never-close domains and pinned tabs will stay open. You can reopen anything you need afterwards.',
      async () => {
        await sendMessage({ action: 'manualReset' });
        // Refresh everything with fresh data (parallel)
        const [status, archiveResult] = await Promise.all([
          sendMessage({ action: 'getStatus' }),
          sendMessage({ action: 'getArchive' })
        ]);
        currentStatus = status;
        currentArchive = archiveResult;
        renderNextClose(currentStatus);
        renderArchive(archiveResult, currentStatus);
      },
      'Close tabs'
    );
  });

  // Settings toggle
  document.getElementById('settingsToggle').addEventListener('click', () => {
    const panel = document.getElementById('settingsPanel');
    const chevron = document.getElementById('settingsChevron');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    chevron.classList.toggle('open', !isOpen);
  });

  // Never-close toggle
  document.getElementById('nevercloseToggle').addEventListener('click', () => {
    const panel = document.getElementById('neverclosePanel');
    const chevron = document.getElementById('nevercloseChevron');
    const isOpen = panel.style.display !== 'none';
    panel.style.display = isOpen ? 'none' : 'block';
    chevron.classList.toggle('open', !isOpen);
  });

  // Add never-close domain
  const ncInput = document.getElementById('nevercloseInput');
  const ncAddBtn = document.getElementById('nevercloseAddBtn');

  const addDomain = async () => {
    const domain = ncInput.value.trim();
    if (domain) {
      const result = await sendMessage({ action: 'addSacredDomain', domain });
      renderNeverCloseDomains(result.sacredDomains);
      ncInput.value = '';
    }
  };

  ncAddBtn.addEventListener('click', addDomain);
  ncInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addDomain();
  });

  // Time picker changes
  const saveTime = async () => {
    const h12 = parseInt(document.getElementById('resetHourDisplay').value);
    const minute = parseInt(document.getElementById('resetMinute').value) || 0;
    const ampm = document.getElementById('resetAmPm').value;

    let hour = h12;
    if (ampm === 'AM' && hour === 12) hour = 0;
    else if (ampm === 'PM' && hour !== 12) hour += 12;

    document.getElementById('resetHour').value = hour;
    await sendMessage({ action: 'updateSettings', resetHour: hour, resetMinute: minute });
    currentStatus = await sendMessage({ action: 'getStatus' });
    renderNextClose(currentStatus);
  };

  document.getElementById('resetHourDisplay').addEventListener('change', saveTime);
  document.getElementById('resetMinute').addEventListener('change', saveTime);
  document.getElementById('resetAmPm').addEventListener('change', saveTime);

  // Duplicate auto-close toggle
  document.getElementById('dupToggle').addEventListener('click', async () => {
    const track = document.getElementById('dupToggleTrack');
    const current = track.classList.contains('active');
    await sendMessage({ action: 'updateSettings', duplicateAutoClose: !current });
    currentStatus = await sendMessage({ action: 'getStatus' });
    setupSettings(currentStatus);
  });

  // Duplicate delay select
  document.getElementById('dupDelaySelect').addEventListener('change', async (e) => {
    await sendMessage({ action: 'updateSettings', duplicateAutoCloseMinutes: parseFloat(e.target.value) });
  });

  // Reopen everything
  document.getElementById('reopenAllBtn').addEventListener('click', async () => {
    const result = await sendMessage({ action: 'undo' });
    if (result.success) {
      showToast(`Reopened ${result.count} tabs`);
      const [status, archiveResult] = await Promise.all([
        sendMessage({ action: 'getStatus' }),
        sendMessage({ action: 'getArchive' })
      ]);
      currentStatus = status;
      currentArchive = archiveResult;
      renderNextClose(currentStatus);
      renderArchive(archiveResult, currentStatus);
    }
  });

  // Group reopen buttons
  document.querySelectorAll('.group-reopen-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const group = btn.dataset.reopen;
      const archive = currentArchive?.archive || [];
      if (archive.length === 0) return;

      const tabs = archive[0].tabs;
      let urls;
      if (group === 'used') {
        urls = tabs.filter(t => t.classification === 'workhorse' && !t.reopened).map(t => t.url);
      } else {
        urls = tabs.filter(t => t.classification !== 'workhorse' && !t.reopened).map(t => t.url);
      }

      if (urls.length === 0) {
        showToast('All tabs already reopened');
        return;
      }

      const result = await sendMessage({ action: 'reopenTabs', urls });
      if (result.success) {
        showToast(`Reopened ${urls.length} tabs`);
        const [status, archiveResult] = await Promise.all([
          sendMessage({ action: 'getStatus' }),
          sendMessage({ action: 'getArchive' })
        ]);
        currentStatus = status;
        currentArchive = archiveResult;
        renderNextClose(currentStatus);
        renderArchive(archiveResult, currentStatus);
      }
    });
  });

  // Group expand/collapse headers
  document.querySelectorAll('.group-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.group-reopen-btn')) return;
      const group = header.closest('.tab-group');
      group.classList.toggle('collapsed');
    });
  });

  // Delegated click handler for never-close + individual tab reopen buttons
  document.querySelectorAll('.tab-list').forEach(list => {
    list.addEventListener('click', async (e) => {
      // Never-close button
      const ncBtn = e.target.closest('.tab-neverclose-btn');
      if (ncBtn) {
        e.stopPropagation();
        const domain = ncBtn.dataset.domain;
        if (domain) {
          const result = await sendMessage({ action: 'addSacredDomain', domain });
          renderNeverCloseDomains(result.sacredDomains);
          ncBtn.textContent = 'Added';
          ncBtn.classList.add('added');
          showToast(`${domain} added to never-close`);
        }
        return;
      }

      const btn = e.target.closest('.tab-reopen-btn');
      if (!btn || btn.classList.contains('reopened')) return;
      e.stopPropagation();

      const url = btn.dataset.url;
      const result = await sendMessage({ action: 'reopenTabs', urls: [url] });
      if (result.success) {
        // Update button in-place — no full re-render needed
        btn.textContent = 'Opened';
        btn.classList.add('reopened');

        // Lightweight data refresh (parallel)
        const [status, archiveResult] = await Promise.all([
          sendMessage({ action: 'getStatus' }),
          sendMessage({ action: 'getArchive' })
        ]);
        currentStatus = status;
        currentArchive = archiveResult;

        // Only update counters, reopen buttons, and footer — skip full DOM rebuild
        updateArchiveChrome(archiveResult, currentStatus);
        renderNextClose(currentStatus);
      }
    });
  });
}

// ============================================================
// ARCHIVE
// ============================================================

function renderArchive(archiveResult, status) {
  const archive = archiveResult.archive || [];

  if (archive.length === 0 || !archive[0] || archive[0].tabs.length === 0) {
    document.getElementById('archiveEmpty').style.display = 'block';
    document.getElementById('archiveContent').style.display = 'none';
    return;
  }

  document.getElementById('archiveEmpty').style.display = 'none';
  document.getElementById('archiveContent').style.display = 'block';

  const archiveData = archive[0];

  // Single summary line: "X tabs closed · just now" or "X tabs closed · today, 12:00 AM"
  const total = archiveData.stats.total;
  const summaryEl = document.getElementById('archiveSummary');
  const timeStr = formatResetTime(archiveData.timestamp);
  summaryEl.textContent = `${total} tab${total !== 1 ? 's' : ''} closed \u00b7 ${timeStr}`;

  // Split into two categories
  const used = archiveData.tabs.filter(t => t.classification === 'workhorse');
  const didntUse = archiveData.tabs.filter(t => t.classification !== 'workhorse');

  document.getElementById('usedCount').textContent = used.length;
  document.getElementById('didntUseCount').textContent = didntUse.length;

  renderTabList('usedList', used);
  renderTabList('didntUseList', didntUse);

  // Hide reopen buttons when nothing left to reopen
  updateGroupReopenBtn('used', used);
  updateGroupReopenBtn('didntUse', didntUse);

  const allTabs = archiveData.tabs;
  const anyToReopen = allTabs.some(t => !t.reopened);
  document.getElementById('reopenAllWrap').style.display = anyToReopen ? 'block' : 'none';
}

// Lightweight update: refresh counters, reopen buttons without rebuilding tab DOM
function updateArchiveChrome(archiveResult, status) {
  const archive = archiveResult.archive || [];
  if (archive.length === 0 || !archive[0]) return;

  const archiveData = archive[0];
  const used = archiveData.tabs.filter(t => t.classification === 'workhorse');
  const didntUse = archiveData.tabs.filter(t => t.classification !== 'workhorse');

  updateGroupReopenBtn('used', used);
  updateGroupReopenBtn('didntUse', didntUse);

  const allTabs = archiveData.tabs;
  const anyToReopen = allTabs.some(t => !t.reopened);
  document.getElementById('reopenAllWrap').style.display = anyToReopen ? 'block' : 'none';
}

function formatResetTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;

  const resetDate = new Date(timestamp);

  return resetDate.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });
}

function updateGroupReopenBtn(group, tabs) {
  const btn = document.querySelector(`.group-reopen-btn[data-reopen="${group}"]`);
  if (!btn) return;

  const unopened = tabs.filter(t => !t.reopened);

  if (tabs.length === 0 || unopened.length === 0) {
    btn.style.display = 'none';
  } else {
    btn.style.display = '';
  }
}

function renderTabList(containerId, tabs) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (tabs.length === 0) {
    container.innerHTML = '<div class="tab-list-empty">No tabs</div>';
    return;
  }

  // Use DocumentFragment to batch DOM insertions
  const frag = document.createDocumentFragment();

  tabs.forEach((tab) => {
    const item = document.createElement('div');
    item.className = 'tab-item';

    const domain = extractDomain(tab.url);
    const firstLetter = (tab.title || domain || '?')[0];

    const faviconHtml = tab.favIconUrl
      ? `<img src="${escapeAttr(tab.favIconUrl)}" alt="" loading="lazy">`
      : '';

    const reopenedClass = tab.reopened ? ' reopened' : '';
    const reopenLabel = tab.reopened ? 'Opened' : 'Open';

    // Usage details
    const visits = tab.activations !== undefined ? tab.activations : 0;
    const timeStr = tab.focusTime !== undefined ? formatDuration(tab.focusTime) : '< 10s';
    const visitText = `Visited ${visits} time${visits !== 1 ? 's' : ''}`;

    item.innerHTML = `
      <div class="tab-favicon">
        ${faviconHtml}
        <span class="placeholder" style="${tab.favIconUrl ? 'display:none' : 'display:flex'}">${escapeHtml(firstLetter)}</span>
      </div>
      <div class="tab-info">
        <div class="tab-title">${escapeHtml(tab.title || 'Untitled')}</div>
        <div class="tab-domain">${escapeHtml(domain)}</div>
        <div class="tab-usage-detail">${escapeHtml(visitText)} &middot; ${escapeHtml(timeStr)}</div>
      </div>
      <button class="tab-neverclose-btn" data-domain="${escapeAttr(domain)}" title="Never close ${escapeAttr(domain)}">Never close</button>
      <button class="tab-reopen-btn${reopenedClass}" data-url="${escapeAttr(tab.url)}">${reopenLabel}</button>
    `;

    frag.appendChild(item);
  });

  container.appendChild(frag);

  // Attach favicon error handlers via JS instead of inline onerror (CSP-safe)
  container.querySelectorAll('.tab-favicon img').forEach(img => {
    img.addEventListener('error', () => {
      img.style.display = 'none';
      const placeholder = img.parentElement.querySelector('.placeholder');
      if (placeholder) placeholder.style.display = 'flex';
    });
  });
}

// ============================================================
// CONFIRMATION DIALOG
// ============================================================

function showConfirmation(title, text, onConfirm, confirmLabel) {
  const overlay = document.createElement('div');
  overlay.className = 'confirm-overlay';
  overlay.innerHTML = `
    <div class="confirm-dialog">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
      <div class="confirm-actions">
        <button class="confirm-cancel">Cancel</button>
        <button class="confirm-ok">${escapeHtml(confirmLabel || 'Confirm')}</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('.confirm-cancel').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.confirm-ok').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

// ============================================================
// TOAST
// ============================================================

function showToast(message) {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2200);
}

// ============================================================
// HELPERS
// ============================================================

function formatTime(h, m) {
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h === 0 ? 12 : h > 12 ? h - 12 : h;
  const displayM = String(m).padStart(2, '0');
  return `${displayH}:${displayM} ${period}`;
}

function getTimezoneAbbr() {
  const parts = Intl.DateTimeFormat('en', { timeZoneName: 'short' }).formatToParts(new Date());
  const tz = parts.find(p => p.type === 'timeZoneName');
  return tz ? tz.value : '';
}

function populateTimeDropdowns() {
  const hourSel = document.getElementById('resetHourDisplay');
  const minSel = document.getElementById('resetMinute');

  if (hourSel.options.length > 0) return;

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

  const snapped = Math.round(minute / 5) * 5;
  document.getElementById('resetMinute').value = snapped >= 60 ? 55 : snapped;
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}

// ============================================================
// "MISSING SOMETHING?" HINT
// ============================================================

async function showMissingHint(archiveResult) {
  const hintEl = document.getElementById('missingHint');
  if (!hintEl) return;

  // Only show after auto-close, not manual
  const data = await chrome.storage.local.get(['lastResetSource', 'hintDismissCount']);
  if (data.lastResetSource !== 'auto') return;

  const count = data.hintDismissCount || 0;
  if (count >= 5) return;

  hintEl.style.display = 'flex';

  // "Settings" link opens the settings panel
  const link = document.getElementById('missingHintLink');
  if (link) {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const settingsPanel = document.getElementById('settingsPanel');
      const chevron = document.getElementById('settingsChevron');
      if (settingsPanel) settingsPanel.style.display = 'block';
      if (chevron) chevron.classList.add('open');
      // Scroll to neverclose section
      const neverclose = document.getElementById('nevercloseToggle');
      if (neverclose) neverclose.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  // Dismiss button
  const dismissBtn = document.getElementById('missingHintDismiss');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', async () => {
      hintEl.style.display = 'none';
      await chrome.storage.local.set({ hintDismissCount: count + 1 });
    });
  }
}

// ============================================================
// DURATION FORMATTING
// ============================================================

function formatDuration(ms) {
  if (ms < 10000) return '< 10s';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return remMin > 0 ? `${hr}h ${remMin}m` : `${hr}h`;
}

// ---- Conditional exports for testing (Chrome ignores this) ----
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    renderArchive,
    renderNextClose,
    renderNeverCloseDomains,
    updateGroupReopenBtn,
    renderTabList,
    formatTime,
    formatDuration,
    showMissingHint,
    escapeHtml,
    escapeAttr,
    extractDomain,
    updateArchiveChrome,
    formatResetTime
  };
}
