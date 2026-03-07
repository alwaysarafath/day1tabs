// Minimal DOM skeleton matching panel.html element IDs
// Used by panel.test.js under jsdom

module.exports = function injectPanelDom() {
  document.body.innerHTML = `
  <div class="panel">
    <div class="panel-header">
      <div class="auto-close-toggle" id="resetToggle">
        <div class="toggle-track" id="resetToggleTrack">
          <div class="toggle-thumb"></div>
        </div>
      </div>
    </div>

    <div class="action-block">
      <div class="next-close-text" id="nextCloseText"></div>
      <div class="action-or">or</div>
      <button class="close-now-btn" id="freshStartBtn">Close tabs now</button>
    </div>

    <div class="settings-section">
      <div class="settings-header" id="settingsToggle">
        <span>Settings</span>
        <span class="chevron" id="settingsChevron">&#x203A;</span>
      </div>
      <div class="settings-panel" id="settingsPanel" style="display: none;">
        <select id="resetHourDisplay"></select>
        <select id="resetMinute"></select>
        <select id="resetAmPm"><option value="AM">AM</option><option value="PM">PM</option></select>
        <input type="hidden" id="resetHour" value="0">
        <span id="timeTz"></span>

        <div class="neverclose-header" id="nevercloseToggle">
          <span class="neverclose-count" id="nevercloseCount">0 domains</span>
          <span class="chevron" id="nevercloseChevron"></span>
        </div>
        <div class="neverclose-panel" id="neverclosePanel" style="display: none;">
          <div class="neverclose-domains" id="nevercloseDomains"></div>
          <input type="text" id="nevercloseInput">
          <button id="nevercloseAddBtn">+</button>
        </div>

        <div class="mini-toggle" id="dupToggle">
          <div class="toggle-track" id="dupToggleTrack"><div class="toggle-thumb"></div></div>
        </div>
        <div class="dup-hint" id="dupHint" style="display: none;"></div>
        <div id="dupDelayRow" style="display: none;">
          <select id="dupDelaySelect">
            <option value="5">5 min</option>
            <option value="10">10 min</option>
            <option value="30">30 min</option>
          </select>
        </div>
      </div>
    </div>

    <div class="archive-section" id="archiveSection">
      <div class="archive-empty" id="archiveEmpty"></div>
      <div class="archive-content" id="archiveContent" style="display: none;">
        <div class="missing-hint" id="missingHint" style="display: none;">
          <span class="missing-hint-text">Missing something? Add it to never-close → <a class="missing-hint-link" id="missingHintLink">Settings</a></span>
          <button class="missing-hint-dismiss" id="missingHintDismiss">&times;</button>
        </div>
        <div class="archive-summary" id="archiveSummary"></div>

        <div class="tab-group" id="groupUsed">
          <div class="group-header" data-group="used">
            <div class="group-title">
              <span class="group-count" id="usedCount">0</span>
            </div>
            <button class="group-reopen-btn" data-reopen="used">Reopen all</button>
          </div>
          <div class="group-body">
            <div class="tab-list" id="usedList"></div>
          </div>
        </div>

        <div class="tab-group" id="groupDidntUse">
          <div class="group-header" data-group="didntUse">
            <div class="group-title">
              <span class="group-count" id="didntUseCount">0</span>
            </div>
            <button class="group-reopen-btn" data-reopen="didntUse">Reopen all</button>
          </div>
          <div class="group-body">
            <div class="tab-list" id="didntUseList"></div>
          </div>
        </div>

        <div class="reopen-all-wrap" id="reopenAllWrap" style="display: none;">
          <a class="reopen-all-link" id="reopenAllBtn">Reopen everything</a>
        </div>
        <div class="history-hint">Looking for something older? Check history</div>
      </div>
    </div>

    <div class="panel-footer">
      <div class="footer-icons" id="footerIcons">
        <a class="footer-icon-link" href="https://chromewebstore.google.com/detail/day1tabs/iaklgpbfkohkghhmjjdfeiekemnnkklp" target="_blank">Review</a>
        <button class="footer-icon-link" id="footerShareBtn">Share</button>
        <a class="footer-icon-link" href="https://buymeacoffee.com/alwaysarafath" target="_blank">Coffee</a>
      </div>
      <div class="footer-line2">
        <a href="https://day1tabs.com" target="_blank">day1tabs.com</a>
        <span>&middot;</span>
        <a href="https://day1tabs.com/contact" target="_blank">contact</a>
        <span>&middot;</span>
        <span id="footerVersion"></span>
      </div>
    </div>
  </div>
  `;
};
