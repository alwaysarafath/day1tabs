// ============================================================
// day1tabs Archive Page Logic
// ============================================================

let archiveData = null;
let currentDate = null;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Load archive
  const result = await sendMessage({ action: 'getArchive' });
  const archive = result.archive || [];

  // Check undo status
  const status = await sendMessage({ action: 'getStatus' });

  if (archive.length === 0 || !archive[0] || archive[0].tabs.length === 0) {
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('archiveContent').style.display = 'none';
    setupUndoButton(status);
    return;
  }

  archiveData = archive[0]; // Most recent day
  currentDate = archiveData.date;

  document.getElementById('emptyState').style.display = 'none';
  document.getElementById('archiveContent').style.display = 'block';

  // Show last reset date/time
  const resetDate = new Date(archiveData.timestamp);
  document.getElementById('resetTime').textContent = resetDate.toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true
  });

  renderStats(archiveData.stats);
  renderGroups(archiveData.tabs);
  setupQuickActions();
  setupUndoButton(status);
  setupCollapsibleGroups();
}

function renderStats(stats) {
  document.getElementById('statTotal').textContent = stats.total;
  document.getElementById('statWorkhorses').textContent = stats.workhorses;
  document.getElementById('statGlanced').textContent = stats.glanced;
  document.getElementById('statGhosts').textContent = stats.ghosts;

  const reopenedCount = stats.reopened || 0;
  const reopenedWrap = document.getElementById('statReopenedWrap');
  if (reopenedCount > 0) {
    reopenedWrap.style.display = '';
    document.getElementById('statReopened').textContent = reopenedCount;
  } else {
    reopenedWrap.style.display = 'none';
  }
}

function renderGroups(tabs) {
  const workhorses = tabs.filter((t, i) => { t._index = i; return t.classification === 'workhorse'; });
  const glanced = tabs.filter((t, i) => { t._index = i; return t.classification === 'glanced'; });
  const ghosts = tabs.filter((t, i) => { t._index = i; return t.classification === 'ghost'; });

  renderTabList('workhorseList', workhorses, 'workhorse');
  renderTabList('glancedList', glanced, 'glanced');
  renderTabList('ghostList', ghosts, 'ghost');

  document.getElementById('workhorseCount').textContent = workhorses.length;
  document.getElementById('glancedCount').textContent = glanced.length;
  document.getElementById('ghostCount').textContent = ghosts.length;

  // Hide empty groups or show empty message
  toggleGroupVisibility('groupWorkhorses', workhorses.length);
  toggleGroupVisibility('groupGlanced', glanced.length);
  toggleGroupVisibility('groupGhosts', ghosts.length);

  // Group reopen buttons
  document.querySelectorAll('.group-btn[data-action="reopen"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const group = btn.dataset.group;
      const urls = tabs.filter(t => t.classification === group && !t.reopened).map(t => t.url);
      if (urls.length === 0) {
        showToast('All tabs in this group already reopened');
        return;
      }
      await reopenTabs(urls);
      await refreshArchiveData();
      showToast(`Reopened ${urls.length} tab${urls.length !== 1 ? 's' : ''}`);
    });
  });
}

function renderTabList(containerId, tabs, classification) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';

  if (tabs.length === 0) {
    container.innerHTML = '<div class="empty-group-msg">No tabs in this category</div>';
    return;
  }

  tabs.forEach((tab) => {
    const isReopened = !!tab.reopened;
    const item = document.createElement('div');
    item.className = `tab-item ${classification}${isReopened ? ' reopened' : ''}`;
    item.dataset.index = tab._index;

    const focusStr = formatFocusTime(tab.focusTime);
    const activationStr = tab.activations === 1 ? '1 visit' : `${tab.activations} visits`;

    const domain = extractDomain(tab.url);
    const faviconHtml = tab.favIconUrl
      ? `<img class="tab-favicon" src="${escapeHtml(tab.favIconUrl)}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
      : '';
    const placeholderHtml = `<div class="tab-favicon-placeholder" ${tab.favIconUrl ? 'style="display:none"' : ''}>${domain.charAt(0).toUpperCase()}</div>`;

    const reopenBtn = isReopened
      ? `<button class="tab-action-btn reopened-btn" disabled>Opened</button>`
      : `<button class="tab-action-btn reopen" data-url="${escapeAttr(tab.url)}" title="Reopen this tab">Open</button>`;

    const reopenedBadge = isReopened ? `<span class="tab-reopened-badge">Reopened</span>` : '';

    item.innerHTML = `
      ${faviconHtml}
      ${placeholderHtml}
      <div class="tab-info">
        <div class="tab-title">${escapeHtml(tab.title)}</div>
        <div class="tab-url">${escapeHtml(domain)}</div>
      </div>
      ${reopenedBadge}
      <div class="tab-meta">
        <span class="tab-stat">${activationStr}</span>
        <span class="tab-stat">${focusStr}</span>
      </div>
      <div class="tab-actions-wrap">
        <div class="tab-actions">
          ${reopenBtn}
          <button class="tab-action-btn reclassify-trigger" data-index="${tab._index}" title="Move to different group">Move</button>
        </div>
      </div>
    `;

    container.appendChild(item);
  });

  // Attach event listeners
  container.querySelectorAll('.reopen').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await reopenTabs([btn.dataset.url]);
      await refreshArchiveData();
      showToast('Tab reopened');
    });
  });

  container.querySelectorAll('.reclassify-trigger').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showReclassifyMenu(btn, parseInt(btn.dataset.index));
    });
  });
}

function showReclassifyMenu(trigger, tabIndex) {
  // Remove any existing menu
  document.querySelectorAll('.reclassify-menu').forEach(m => m.remove());

  const wrap = trigger.closest('.tab-actions-wrap');
  const currentClass = archiveData.tabs[tabIndex].classification;

  const menu = document.createElement('div');
  menu.className = 'reclassify-menu';

  const options = ['workhorse', 'glanced', 'ghost'].filter(c => c !== currentClass);

  options.forEach(opt => {
    const btn = document.createElement('button');
    btn.className = 'reclassify-option';
    btn.innerHTML = `<span class="dot ${opt}"></span><span>${capitalize(opt)}</span>`;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await reclassifyTab(tabIndex, opt);
      menu.remove();
    });
    menu.appendChild(btn);
  });

  wrap.appendChild(menu);

  // Close on outside click
  const closeHandler = (e) => {
    if (!menu.contains(e.target)) {
      menu.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 0);
}

async function reclassifyTab(tabIndex, newClassification) {
  await sendMessage({
    action: 'reclassifyTab',
    date: currentDate,
    tabIndex: tabIndex,
    newClassification: newClassification
  });

  // Refresh archive data
  const result = await sendMessage({ action: 'getArchive' });
  archiveData = result.archive[0];
  renderStats(archiveData.stats);
  renderGroups(archiveData.tabs);
  showToast(`Moved to ${capitalize(newClassification)}`);
}

function setupQuickActions() {
  document.getElementById('reopenWorkhorses').addEventListener('click', async () => {
    const urls = archiveData.tabs.filter(t => t.classification === 'workhorse' && !t.reopened).map(t => t.url);
    if (urls.length === 0) {
      showToast('No workhorse tabs to reopen');
      return;
    }
    await reopenTabs(urls);
    await refreshArchiveData();
    showToast(`Reopened ${urls.length} workhorse tab${urls.length !== 1 ? 's' : ''}`);
  });

  document.getElementById('reopenAll').addEventListener('click', async () => {
    const urls = archiveData.tabs.filter(t => !t.reopened).map(t => t.url);
    if (urls.length === 0) {
      showToast('All tabs already reopened');
      return;
    }
    await reopenTabs(urls);
    await refreshArchiveData();
    showToast(`Reopened ${urls.length} tab${urls.length !== 1 ? 's' : ''}`);
  });
}

function setupUndoButton(status) {
  const undoBtn = document.getElementById('undoAllBtn');

  if (status.undoAvailable) {
    undoBtn.style.display = 'flex';
    document.getElementById('undoCountdown').textContent = `${status.undoExpiresIn}m left`;

    undoBtn.addEventListener('click', async () => {
      const result = await sendMessage({ action: 'undo' });
      if (result.success) {
        undoBtn.style.display = 'none';
        await refreshArchiveData();
        showToast(`Restored ${result.count} tabs`);
      } else {
        showToast('Undo window has expired');
        undoBtn.style.display = 'none';
      }
    });

    // Update countdown
    setInterval(async () => {
      const s = await sendMessage({ action: 'getStatus' });
      if (s.undoAvailable) {
        document.getElementById('undoCountdown').textContent = `${s.undoExpiresIn}m left`;
      } else {
        undoBtn.style.display = 'none';
      }
    }, 60000);
  }
}

function toggleGroupVisibility(groupId, count) {
  const group = document.getElementById(groupId);
  if (count === 0) {
    group.classList.add('empty');
  } else {
    group.classList.remove('empty');
  }
}

function setupCollapsibleGroups() {
  document.querySelectorAll('.group-header[data-toggle]').forEach(header => {
    header.addEventListener('click', (e) => {
      // Don't toggle when clicking the "Reopen all" button
      if (e.target.closest('.group-btn')) return;

      const groupId = header.dataset.toggle;
      const group = document.getElementById(groupId);
      group.classList.toggle('expanded');
    });
  });
}

// ---- Helpers ----

async function refreshArchiveData() {
  const result = await sendMessage({ action: 'getArchive' });
  const archive = result.archive || [];
  if (archive.length > 0 && archive[0].tabs.length > 0) {
    archiveData = archive[0];
    renderStats(archiveData.stats);
    renderGroups(archiveData.tabs);
  }
}

async function reopenTabs(urls) {
  await sendMessage({ action: 'reopenTabs', urls });
}

function formatFocusTime(ms) {
  if (!ms || ms < 1000) return '<1s';
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  return `${hours}h ${remainingMins}m`;
}

function extractDomain(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url;
  }
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function escapeAttr(str) {
  return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function showToast(message) {
  // Remove existing
  document.querySelectorAll('.toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 2500);
}

function sendMessage(msg) {
  return chrome.runtime.sendMessage(msg);
}
