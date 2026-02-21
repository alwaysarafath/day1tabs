// ============================================================
// day1tabs Onboarding Logic
// ============================================================

let sacredDomains = [];

document.addEventListener('DOMContentLoaded', init);

async function init() {
  // Check if already onboarded
  const data = await chrome.storage.local.get('onboardingComplete');
  if (data.onboardingComplete) {
    // Redirect to archive or close
    window.close();
    return;
  }

  setupNavigation();
  setupSacredDomains();
  setupDoneButton();
}

function setupNavigation() {
  // Next/Skip buttons
  document.querySelectorAll('[data-next]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nextStep = btn.dataset.next;
      goToStep(nextStep);
    });
  });
}

function goToStep(stepNum) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  const target = document.getElementById('step' + stepNum);
  if (target) {
    target.classList.add('active');

    // If going to step 3, update summary
    if (stepNum === '3') {
      updateSummary();
    }
  }
}

function setupSacredDomains() {
  // Quick add suggestion chips
  document.querySelectorAll('.suggestion-chip').forEach(chip => {
    chip.addEventListener('click', async () => {
      const domain = chip.dataset.domain;
      if (chip.classList.contains('added')) {
        // Remove
        chip.classList.remove('added');
        await removeSacredDomain(domain);
      } else {
        // Add
        chip.classList.add('added');
        await addSacredDomain(domain);
      }
      renderSacredList();
    });
  });

  // Custom domain input
  const input = document.getElementById('customDomain');
  const addBtn = document.getElementById('addCustomBtn');

  const addCustom = async () => {
    let domain = input.value.trim().toLowerCase();
    domain = domain.replace(/^https?:\/\//, '');
    domain = domain.replace(/^www\./, '');
    domain = domain.replace(/[\/\?#].*$/, '');
    domain = domain.replace(/\.+$/, '');
    if (domain && !sacredDomains.includes(domain)) {
      await addSacredDomain(domain);
      renderSacredList();
      input.value = '';

      // Check if it matches a suggestion chip
      document.querySelectorAll('.suggestion-chip').forEach(chip => {
        if (chip.dataset.domain === domain) {
          chip.classList.add('added');
        }
      });
    }
  };

  addBtn.addEventListener('click', addCustom);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addCustom();
  });
}

async function addSacredDomain(domain) {
  domain = domain.toLowerCase().trim();
  domain = domain.replace(/^https?:\/\//, '');
  domain = domain.replace(/^www\./, '');
  domain = domain.replace(/[\/\?#].*$/, '');
  domain = domain.replace(/\.+$/, '');
  if (!sacredDomains.includes(domain)) {
    sacredDomains.push(domain);
    await chrome.runtime.sendMessage({ action: 'addSacredDomain', domain });
  }
}

async function removeSacredDomain(domain) {
  sacredDomains = sacredDomains.filter(d => d !== domain);
  await chrome.runtime.sendMessage({ action: 'removeSacredDomain', domain });
}

function renderSacredList() {
  const container = document.getElementById('sacredList');
  container.innerHTML = '';

  sacredDomains.forEach(domain => {
    const item = document.createElement('div');
    item.className = 'sacred-item';
    item.innerHTML = `
      <span>${domain}</span>
      <span class="remove" data-domain="${domain}">×</span>
    `;
    container.appendChild(item);
  });

  container.querySelectorAll('.remove').forEach(el => {
    el.addEventListener('click', async () => {
      const domain = el.dataset.domain;
      await removeSacredDomain(domain);
      renderSacredList();

      // Uncheck suggestion chip
      document.querySelectorAll('.suggestion-chip').forEach(chip => {
        if (chip.dataset.domain === domain) {
          chip.classList.remove('added');
        }
      });
    });
  });
}

function updateSummary() {
  const summary = document.getElementById('sacredSummary');
  if (sacredDomains.length === 0) {
    summary.innerHTML = 'No never-close domains set — <em>all tabs will close</em>';
  } else {
    summary.innerHTML = `<strong>${sacredDomains.length}</strong> domain${sacredDomains.length !== 1 ? 's' : ''} will never be closed`;
  }
}

function setupDoneButton() {
  document.getElementById('doneBtn').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({
      action: 'updateSettings',
      onboardingComplete: true
    });
    // Close onboarding tab
    window.close();
  });
}
