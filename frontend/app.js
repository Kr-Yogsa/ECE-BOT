const token = localStorage.getItem("token");
const savedUser = JSON.parse(localStorage.getItem("user") || "null");

if (!token) {
    const requestedBotQuery = window.location.search || "";
    window.location.href = `/${requestedBotQuery}`;
}

const chatSessionListElement = document.getElementById("chat-session-list");
const chatMessagesElement = document.getElementById("chat-messages");
const chatForm = document.getElementById("chat-form");
const chatInput = document.getElementById("chat-input");
const logoutButton = document.getElementById("logout-button");
const botSelectButton = document.getElementById("bot-select-button");
const botSelectLabel = document.getElementById("bot-select-label");
const botSelectMenu = document.getElementById("bot-select-menu");
const newChatButton = document.getElementById("new-chat-button");
const suggestionBox = document.getElementById("smart-suggestions");
const emptyStateElement = document.getElementById("chat-empty-state");
const themeToggle = document.getElementById("theme-toggle");
const themeLabel = document.getElementById("theme-label");
const profileMenuButton = document.getElementById("profile-menu-button");
const profileMenuPanel = document.getElementById("profile-menu-panel");
const profileAvatarText = document.getElementById("profile-avatar-text");
const currentUserEmail = document.getElementById("current-user-email");
const currentUserRole = document.getElementById("current-user-role");
const openMachineStatsButton = document.getElementById("open-machine-stats");
const openLiveMachineButton = document.getElementById("open-live-machine");
const machineStatsModal = document.getElementById("machine-stats-modal");
const machineStatsModalBackdrop = document.getElementById("machine-stats-modal-backdrop");
const closeMachineStatsButton = document.getElementById("close-machine-stats");
const liveMachineModal = document.getElementById("live-machine-modal");
const liveMachineModalBackdrop = document.getElementById("live-machine-modal-backdrop");
const closeLiveMachineButton = document.getElementById("close-live-machine");
const machineMetricsSection = document.getElementById("machine-metrics-section");
const machineStatsMachineName = document.getElementById("machine-stats-machine-name");
const machineStatsStatus = document.getElementById("machine-stats-status");
const machineStatsRangeTabs = document.getElementById("machine-stats-range-tabs");
const machineStatsRangeLabel = document.getElementById("machine-stats-range-label");
const machineStatsReadingCount = document.getElementById("machine-stats-reading-count");
const machineStatsLastUpdated = document.getElementById("machine-stats-last-updated");
const machineTrendBars = document.getElementById("machine-trend-bars");
const machineTrendTotal = document.getElementById("machine-trend-total");
const machineMetricTemperature = document.getElementById("machine-metric-temperature");
const machineMetricTemperatureMeta = document.getElementById("machine-metric-temperature-meta");
const machineMetricHumidity = document.getElementById("machine-metric-humidity");
const machineMetricHumidityMeta = document.getElementById("machine-metric-humidity-meta");
const machineMetricVibration = document.getElementById("machine-metric-vibration");
const machineMetricVibrationMeta = document.getElementById("machine-metric-vibration-meta");
const machineLiveSection = document.getElementById("machine-live-section");
const machineLiveTitle = document.getElementById("machine-live-title");
const machineLiveStatus = document.getElementById("machine-live-status");
const machineLiveFrame = document.getElementById("machine-live-frame");
const machineLiveImage = document.getElementById("machine-live-image");
const startLiveMachineButton = document.getElementById("start-live-machine");
const stopLiveMachineButton = document.getElementById("stop-live-machine");
const openOperatorPanelButton = document.getElementById("open-operator-panel");
const operatorModal = document.getElementById("operator-modal");
const operatorModalBackdrop = document.getElementById("operator-modal-backdrop");
const closeOperatorPanelButton = document.getElementById("close-operator-panel");
const operatorCreateForm = document.getElementById("operator-create-form");
const operatorList = document.getElementById("operator-list");
const operatorPanelMessage = document.getElementById("operator-panel-message");
const operatorAdminName = document.getElementById("operator-admin-name");
const operatorAdminEmail = document.getElementById("operator-admin-email");
const operatorTotalCount = document.getElementById("operator-total-count");
const operatorActiveCount = document.getElementById("operator-active-count");
const operatorPendingCount = document.getElementById("operator-pending-count");
const sidebarElement = document.getElementById("chat-sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const sidebarToggleButton = document.getElementById("sidebar-toggle");

let currentSessionId = null;
let currentBotId = "";
let hardwareMap = {};
let lastUserMessage = "";
let requestedBotId = "";
let machineStatsPollHandle = null;
let selectedMachineStatsRange = "last_1_minute";
let isCreatingOperatorRequestPending = false;
const pendingOperatorStatusRequests = new Set();
const SESSION_HEARTBEAT_INTERVAL_MS = 60000;
let sessionHeartbeatHandle = null;

function applyVersionLabel() {
    const versionLabel = window.ECE_BOT_UI_CONFIG?.versionLabel?.trim();
    if (!versionLabel) {
        return;
    }

    document.querySelectorAll("[data-app-version]").forEach((element) => {
        element.textContent = versionLabel;
    });
}

function isAdminUser() {
    return savedUser?.role === "admin";
}

function isOperatorUser() {
    return savedUser?.role === "operator" || savedUser?.role === "admin";
}

function showOperatorMessage(text, isError = true) {
    if (!operatorPanelMessage) {
        return;
    }

    operatorPanelMessage.textContent = text;
    operatorPanelMessage.style.color = isError ? "#f97066" : "#6ce9a6";
}

function setOperatorButtonPendingState(button, isPending, idleLabel, pendingLabel) {
    if (!button) {
        return;
    }

    button.disabled = isPending;
    button.textContent = isPending ? pendingLabel : idleLabel;
}

function setOperatorModalState(isOpen) {
    if (!operatorModal) {
        return;
    }

    operatorModal.classList.toggle("hidden-block", !isOpen);
    operatorModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
    updateModalBodyLock();
}

function setMachineStatsModalState(isOpen) {
    if (!machineStatsModal) {
        return;
    }

    machineStatsModal.classList.toggle("hidden-block", !isOpen);
    machineStatsModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
    updateModalBodyLock();
}

function setLiveMachineModalState(isOpen) {
    if (!liveMachineModal) {
        return;
    }

    liveMachineModal.classList.toggle("hidden-block", !isOpen);
    liveMachineModal.setAttribute("aria-hidden", isOpen ? "false" : "true");
    updateModalBodyLock();
}

function updateModalBodyLock() {
    const hasOpenModal = [operatorModal, machineStatsModal, liveMachineModal].some(
        (modal) => modal && !modal.classList.contains("hidden-block")
    );
    document.body.classList.toggle("operator-modal-open", hasOpenModal);
}

function renderOperatorAdmin(admin) {
    if (operatorAdminName) {
        operatorAdminName.textContent = admin?.name || savedUser?.name || "Admin";
    }

    if (operatorAdminEmail) {
        operatorAdminEmail.textContent = admin?.email || savedUser?.email || "";
    }
}

function renderOperatorStats(operators = []) {
    const total = operators.length;
    const active = operators.filter((item) => item.is_active).length;
    const pending = operators.filter((item) => !item.email_verified).length;

    if (operatorTotalCount) {
        operatorTotalCount.textContent = String(total);
    }

    if (operatorActiveCount) {
        operatorActiveCount.textContent = String(active);
    }

    if (operatorPendingCount) {
        operatorPendingCount.textContent = String(pending);
    }
}

// ADDED
const suggestionMap = {
    melfa: [
        "What is MELFA robot used for?",
        "How do I troubleshoot MELFA errors?",
        "Explain MELFA working process"
    ],
    plc: [
        "What is the purpose of PLC?",
        "How does a PLC work?",
        "Common PLC troubleshooting steps"
    ],
    cnc: [
        "What is the purpose of this CNC machine?",
        "How does a CNC 3018 pro machine work?",
        "Common CNC problems and solutions"
    ]
};

// ADDED
const botLabelMap = {
    melfa: "\uD83E\uDD16 MELFA Assistant",
    plc: "\u2699\uFE0F PLC Expert",
    cnc: "\uD83E\uDD16 CNC Assistant"
};

if (savedUser) {
    const displayText = savedUser.name || savedUser.email || "User";
    const emailText = savedUser.email || "";
    const firstLetter = displayText.trim().charAt(0).toUpperCase() || "U";

    if (profileAvatarText) {
        profileAvatarText.textContent = firstLetter;
    }

    if (currentUserEmail) {
        currentUserEmail.textContent = emailText;
    }

    if (currentUserRole && savedUser.role) {
        currentUserRole.textContent = `Role: ${savedUser.role.charAt(0).toUpperCase()}${savedUser.role.slice(1)}`;
        currentUserRole.classList.remove("hidden-block");
    }
}

resetMachineLiveView();

function renderMachineMetrics() {
    if (!machineMetricsSection) {
        return;
    }

    if (!isOperatorUser()) {
        machineMetricsSection.classList.add("hidden-block");
        return;
    }

    machineMetricsSection.classList.remove("hidden-block");

    if (machineMetricTemperature) {
        machineMetricTemperature.textContent = "--";
    }

    if (machineMetricTemperatureMeta) {
        machineMetricTemperatureMeta.innerHTML = "<span>Avg --</span><span>Min --</span><span>Max --</span>";
    }

    if (machineMetricHumidity) {
        machineMetricHumidity.textContent = "--";
    }

    if (machineMetricHumidityMeta) {
        machineMetricHumidityMeta.innerHTML = "<span>Avg --</span><span>Min --</span><span>Max --</span>";
    }

    if (machineMetricVibration) {
        machineMetricVibration.textContent = "--";
    }

    if (machineMetricVibrationMeta) {
        machineMetricVibrationMeta.innerHTML = "<span>Avg --</span><span>Min --</span><span>Max --</span>";
    }

    if (machineStatsMachineName) {
        machineStatsMachineName.textContent = hardwareMap[currentBotId]?.name || "--";
    }

    if (machineStatsStatus) {
        machineStatsStatus.textContent = "Components are off";
        machineStatsStatus.classList.remove("is-on");
        machineStatsStatus.classList.add("is-off");
    }

    if (machineStatsRangeLabel) {
        machineStatsRangeLabel.textContent = getMachineRangeLabel(selectedMachineStatsRange);
    }

    if (machineStatsReadingCount) {
        machineStatsReadingCount.textContent = "0 readings";
    }

    if (machineStatsLastUpdated) {
        machineStatsLastUpdated.textContent = "No telemetry yet";
    }

    renderMachineTrendChart();
}

function formatMachineMetricValue(value, suffix) {
    if (value === null || value === undefined || value === "") {
        return "--";
    }

    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) {
        return "--";
    }

    return `${numberValue.toFixed(2)} ${suffix}`;
}

function formatMachineMetricPlain(value, suffix) {
    if (value === null || value === undefined || value === "") {
        return "--";
    }

    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) {
        return "--";
    }

    return `${numberValue.toFixed(2)}${suffix}`;
}

function formatMachineStatsTimestamp(value) {
    if (!value) {
        return "No telemetry yet";
    }

    const dateValue = new Date(value);
    if (Number.isNaN(dateValue.getTime())) {
        return "No telemetry yet";
    }

    return `Last update ${dateValue.toLocaleString()}`;
}

function getMachineRangeLabel(rangeKey) {
    const labels = {
        last_1_minute: "Last 1 minute",
        last_1_hour: "Last 1 hour",
        today: "Today",
        yesterday: "Yesterday"
    };

    return labels[rangeKey] || "Last 1 minute";
}

function renderMachineTrendChart(summaries = {}) {
    if (!machineTrendBars) {
        return;
    }

    const ranges = [
        ["last_1_minute", "1 Min"],
        ["last_1_hour", "1H"],
        ["today", "Today"],
        ["yesterday", "Yesterday"]
    ];
    const values = ranges.map(([key]) => Number(summaries?.[key]?.reading_count || 0));
    const maxValue = Math.max(...values, 1);
    const totalValue = values.reduce((sum, value) => sum + value, 0);

    machineTrendBars.innerHTML = "";

    ranges.forEach(([key, label], index) => {
        const value = values[index];
        const barItem = document.createElement("div");
        barItem.className = "machine-trend-bar-item";
        barItem.classList.toggle("is-selected", key === selectedMachineStatsRange);

        const valueElement = document.createElement("span");
        valueElement.className = "machine-trend-value";
        valueElement.textContent = String(value);

        const barTrack = document.createElement("div");
        barTrack.className = "machine-trend-bar-track";

        const barFill = document.createElement("div");
        barFill.className = "machine-trend-bar-fill";
        barFill.style.height = `${Math.max(8, (value / maxValue) * 100)}%`;
        barTrack.appendChild(barFill);

        const labelElement = document.createElement("span");
        labelElement.className = "machine-trend-label";
        labelElement.textContent = label;

        barItem.appendChild(valueElement);
        barItem.appendChild(barTrack);
        barItem.appendChild(labelElement);
        machineTrendBars.appendChild(barItem);
    });

    if (machineTrendTotal) {
        machineTrendTotal.textContent = `${totalValue} ${totalValue === 1 ? "total reading" : "total readings"}`;
    }
}

function renderMachineRangeTabs() {
    if (!machineStatsRangeTabs) {
        return;
    }

    machineStatsRangeTabs.querySelectorAll(".machine-range-tab").forEach((button) => {
        button.classList.toggle("is-selected", button.dataset.range === selectedMachineStatsRange);
    });
}

function buildMachineMetaText(summary, avgKey, minKey, maxKey, suffix) {
    return `
        <span>Avg ${formatMachineMetricPlain(summary?.[avgKey], suffix)}</span>
        <span>Min ${formatMachineMetricPlain(summary?.[minKey], suffix)}</span>
        <span>Max ${formatMachineMetricPlain(summary?.[maxKey], suffix)}</span>
    `;
}

function renderMachineMetricsFromStats(latestStats, summary) {
    if (machineMetricTemperature) {
        machineMetricTemperature.textContent = formatMachineMetricValue(latestStats?.temperature, "C");
    }

    if (machineMetricTemperatureMeta) {
        machineMetricTemperatureMeta.innerHTML = buildMachineMetaText(
            summary,
            "avg_temperature",
            "min_temperature",
            "max_temperature",
            "C"
        );
    }

    if (machineMetricHumidity) {
        machineMetricHumidity.textContent = formatMachineMetricValue(latestStats?.humidity, "%");
    }

    if (machineMetricHumidityMeta) {
        machineMetricHumidityMeta.innerHTML = buildMachineMetaText(
            summary,
            "avg_humidity",
            "min_humidity",
            "max_humidity",
            "%"
        );
    }

    if (machineMetricVibration) {
        machineMetricVibration.textContent = formatMachineMetricValue(latestStats?.vibration, "g");
    }

    if (machineMetricVibrationMeta) {
        machineMetricVibrationMeta.innerHTML = buildMachineMetaText(
            summary,
            "avg_vibration",
            "min_vibration",
            "max_vibration",
            "g"
        );
    }

    if (machineStatsRangeLabel) {
        machineStatsRangeLabel.textContent = getMachineRangeLabel(selectedMachineStatsRange);
    }

    if (machineStatsReadingCount) {
        const readingCount = Number(summary?.reading_count || 0);
        machineStatsReadingCount.textContent = `${readingCount} ${readingCount === 1 ? "reading" : "readings"}`;
    }

    if (machineStatsLastUpdated) {
        machineStatsLastUpdated.textContent = formatMachineStatsTimestamp(
            latestStats?.recorded_at || summary?.latest_recorded_at
        );
    }
}

function renderMachineStatus(status) {
    if (!machineStatsStatus) {
        return;
    }

    const isOnline = Boolean(status?.is_online);
    machineStatsStatus.textContent = status?.status_text || (isOnline ? "Components are on" : "Components are off");
    machineStatsStatus.classList.toggle("is-on", isOnline);
    machineStatsStatus.classList.toggle("is-off", !isOnline);
}

function renderMachineOfflineState(summary) {
    if (machineMetricTemperature) {
        machineMetricTemperature.textContent = "--";
    }

    if (machineMetricHumidity) {
        machineMetricHumidity.textContent = "--";
    }

    if (machineMetricVibration) {
        machineMetricVibration.textContent = "--";
    }

    if (machineMetricTemperatureMeta) {
        machineMetricTemperatureMeta.innerHTML = buildMachineMetaText(
            summary,
            "avg_temperature",
            "min_temperature",
            "max_temperature",
            "C"
        );
    }

    if (machineMetricHumidityMeta) {
        machineMetricHumidityMeta.innerHTML = buildMachineMetaText(
            summary,
            "avg_humidity",
            "min_humidity",
            "max_humidity",
            "%"
        );
    }

    if (machineMetricVibrationMeta) {
        machineMetricVibrationMeta.innerHTML = buildMachineMetaText(
            summary,
            "avg_vibration",
            "min_vibration",
            "max_vibration",
            "g"
        );
    }

    if (machineStatsRangeLabel) {
        machineStatsRangeLabel.textContent = getMachineRangeLabel(selectedMachineStatsRange);
    }

    if (machineStatsReadingCount) {
        const readingCount = Number(summary?.reading_count || 0);
        machineStatsReadingCount.textContent = `${readingCount} ${readingCount === 1 ? "reading" : "readings"}`;
    }

    if (machineStatsLastUpdated) {
        machineStatsLastUpdated.textContent = "Components are off";
    }
}

function stopMachineStatsPolling() {
    if (machineStatsPollHandle) {
        clearInterval(machineStatsPollHandle);
        machineStatsPollHandle = null;
    }
}

function setMachineLiveStatus(text, isError = false) {
    if (!machineLiveStatus) {
        return;
    }

    machineLiveStatus.textContent = text;
    machineLiveStatus.classList.toggle("is-error", isError);
}

function setMachineLiveLoading(isLoading) {
    if (startLiveMachineButton) {
        startLiveMachineButton.disabled = isLoading;
        startLiveMachineButton.textContent = isLoading ? "Starting..." : "Start Live";
    }
}

function resetMachineLiveView() {
    if (machineLiveTitle) {
        machineLiveTitle.textContent = `${hardwareMap[currentBotId]?.name || "Machine"} camera feed`;
    }

    if (machineLiveImage) {
        machineLiveImage.removeAttribute("src");
    }

    if (machineLiveFrame) {
        machineLiveFrame.classList.remove("is-active");
    }

    setMachineLiveLoading(false);
    setMachineLiveStatus("Live stream is stopped.");
}

function stopMachineLiveStream() {
    resetMachineLiveView();
}

function addStreamCacheBuster(streamUrl) {
    const separator = streamUrl.includes("?") ? "&" : "?";
    return `${streamUrl}${separator}t=${Date.now()}`;
}

async function startMachineLiveStream() {
    if (!isOperatorUser() || !currentBotId) {
        setMachineLiveStatus("Select a machine before starting the live stream.", true);
        return;
    }

    setMachineLiveLoading(true);
    setMachineLiveStatus("Connecting to live stream...");

    try {
        const response = await fetch(`/api/machine-live/${encodeURIComponent(currentBotId)}`, {
            headers: getAuthHeaders()
        });
        const data = await readJson(response);

        if (!response.ok) {
            setMachineLiveStatus(data.error || "Unable to load live stream.", true);
            return;
        }

        if (machineLiveTitle) {
            machineLiveTitle.textContent = `${data.machine_name || hardwareMap[currentBotId]?.name || "Machine"} camera feed`;
        }

        if (!data.is_configured || !data.stream_url) {
            setMachineLiveStatus("Live stream URL is not configured for this machine.", true);
            return;
        }

        if (machineLiveImage) {
            machineLiveImage.src = addStreamCacheBuster(data.stream_url);
        }

        if (machineLiveFrame) {
            machineLiveFrame.classList.add("is-active");
        }

        setMachineLiveStatus("Live stream is running.");
    } catch (error) {
        setMachineLiveStatus("Unable to connect to live stream right now.", true);
    } finally {
        setMachineLiveLoading(false);
    }
}

async function loadMachineStats() {
    if (!isOperatorUser() || !currentBotId) {
        renderMachineMetrics();
        return;
    }

    try {
        const response = await fetch(`/api/machine-stats/${encodeURIComponent(currentBotId)}/dashboard`, {
            headers: getAuthHeaders()
        });
        const data = await readJson(response);

        if (machineStatsMachineName) {
            machineStatsMachineName.textContent = data.machine_name || hardwareMap[currentBotId]?.name || "--";
        }

        renderMachineRangeTabs();
        renderMachineStatus(data.status);
        renderMachineTrendChart(data.summaries || {});

        if (!response.ok || !data.has_data) {
            renderMachineMetricsFromStats(
                data.latest || {},
                data.summaries?.[selectedMachineStatsRange] || {}
            );
            return;
        }

        if (!data.status?.is_online) {
            renderMachineOfflineState(
                data.summaries?.[selectedMachineStatsRange] || {}
            );
            return;
        }

        renderMachineMetricsFromStats(
            data.latest || {},
            data.summaries?.[selectedMachineStatsRange] || {}
        );
    } catch (error) {
        renderMachineMetrics();
    }
}

function startMachineStatsPolling() {
    stopMachineStatsPolling();
    loadMachineStats();
    machineStatsPollHandle = setInterval(loadMachineStats, 4000);
}

function readRequestedBotId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("bot")?.trim().toLowerCase() || "";
}

function getAuthHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

function formatDate(dateText) {
    const value = new Date(dateText);
    if (Number.isNaN(value.getTime())) {
        return "";
    }

    return value.toLocaleString();
}

// ADDED
function cleanMessageText(text) {
    let cleaned = text || "";
    cleaned = cleaned.replace(/\r\n/g, "\n");
    return cleaned.trim();
}

// ADDED
function escapeHtml(text) {
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// ADDED
function renderAssistantMessage(text) {
    let html = escapeHtml(cleanMessageText(text || ""));

    html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
    html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");
    html = html.replace(/_(.+?)_/g, "<em>$1</em>");
    html = html.replace(/\n/g, "<br>");

    return html;
}

// ADDED
function getBotLabel(hardwareId = currentBotId) {
    return botLabelMap[hardwareId] || "\uD83E\uDD16 Assistant";
}

function scrollToBottom() {
    requestAnimationFrame(() => {
        chatMessagesElement.scrollTop = chatMessagesElement.scrollHeight;
    });
}

function clearMessages() {
    chatMessagesElement.innerHTML = "";
    updateChatEmptyState();
}

function setChatHeader(title, subtitle) {
    return { title, subtitle };
}

function updateChatEmptyState() {
    const isEmpty = !chatMessagesElement.children.length;
    document.body.classList.toggle("chat-is-empty", isEmpty);

    if (emptyStateElement) {
        emptyStateElement.setAttribute("aria-hidden", isEmpty ? "false" : "true");
    }
}

function setSidebarState(isOpen) {
    document.body.classList.toggle("sidebar-open", isOpen);
}

function setProfileMenuState(isOpen) {
    if (!profileMenuButton || !profileMenuPanel) {
        return;
    }

    profileMenuPanel.classList.toggle("hidden-block", !isOpen);
    profileMenuButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function toggleDesktopSidebar() {
    document.body.classList.toggle("sidebar-collapsed");
}

function setBotMenuState(isOpen) {
    if (!botSelectButton || !botSelectMenu) {
        return;
    }

    botSelectMenu.classList.toggle("hidden-block", !isOpen);
    botSelectButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
}

function updateBotSelectionUi() {
    if (botSelectLabel) {
        botSelectLabel.textContent = hardwareMap[currentBotId]?.name || "Select bot";
    }

    if (!botSelectMenu) {
        return;
    }

    botSelectMenu.querySelectorAll(".bot-select-option").forEach((button) => {
        button.classList.toggle("is-selected", button.dataset.hardwareId === currentBotId);
    });
}

async function readJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return {};
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 45000) {
    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

    try {
        return await fetch(url, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutHandle);
    }
}

function isTransientHttpStatus(statusCode) {
    return [408, 429, 500, 502, 503, 504].includes(statusCode);
}

// ADDED
function applyTheme(themeName) {
    const isLight = themeName === "light";
    document.body.classList.toggle("light-theme", isLight);
    document.body.classList.toggle("dark-theme", !isLight);
    localStorage.setItem("theme", themeName);
    if (themeToggle) {
        themeToggle.checked = isLight;
    }
    if (themeLabel) {
        themeLabel.textContent = isLight ? "Light" : "Dark";
    }
}

// ADDED
function autoResizeTextarea() {
    chatInput.style.height = "auto";
    chatInput.style.height = `${Math.min(chatInput.scrollHeight, 160)}px`;
}

// ADDED
function createActionButton(text, clickHandler) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "message-action-button";
    button.textContent = text;
    button.addEventListener("click", clickHandler);
    return button;
}

// ADDED
function createMessageElement(message, role, options = {}) {
    const row = document.createElement("div");
    row.className = `message-row message-${role}`;

    if (role === "assistant") {
        const label = document.createElement("div");
        label.className = "message-label";
        label.textContent = options.label || getBotLabel(options.hardwareId);
        row.appendChild(label);
    }

    const bubble = document.createElement("div");
    bubble.className = "message-bubble";
    bubble.dataset.rawText = message || "";

    if (role === "assistant") {
        bubble.innerHTML = renderAssistantMessage(message || "");
    } else {
        bubble.textContent = cleanMessageText(message || "");
    }

    row.appendChild(bubble);

    if (options.metaText) {
        const meta = document.createElement("div");
        meta.className = "message-meta";
        meta.textContent = options.metaText;
        row.appendChild(meta);
    }

    if (role === "assistant" && options.showActions) {
        const actions = document.createElement("div");
        actions.className = "message-actions";

        const copyButton = createActionButton("Copy", async () => {
            await navigator.clipboard.writeText(bubble.dataset.rawText || bubble.textContent);
            copyButton.textContent = "Copied";
            setTimeout(() => {
                copyButton.textContent = "Copy";
            }, 1000);
        });

        const regenerateButton = createActionButton("Regenerate", async () => {
            if (!options.userMessage) {
                return;
            }
            await regenerateReply(options.userMessage, row);
        });

        actions.appendChild(copyButton);
        actions.appendChild(regenerateButton);
        row.appendChild(actions);
    }

    chatMessagesElement.appendChild(row);
    updateChatEmptyState();
    scrollToBottom();
    return { row, bubble };
}

// UPDATED
function addMessage(message, role, options = {}) {
    return createMessageElement(message, role, options);
}

// ADDED
function createTypingLoader() {
    const messageElement = createMessageElement("", "assistant", {
        label: getBotLabel(),
        hardwareId: currentBotId
    });

    messageElement.bubble.classList.add("typing-bubble");
    messageElement.bubble.innerHTML = `
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
        <span class="typing-dot"></span>
    `;

    return messageElement;
}

// ADDED
async function streamAssistantMessage(targetBubble, fullText) {
    targetBubble.classList.remove("typing-bubble");
    targetBubble.innerHTML = "";

    const cleanText = cleanMessageText(fullText);
    const words = cleanText.split(" ");
    let currentText = "";

    for (let index = 0; index < words.length; index += 1) {
        currentText += (index === 0 ? "" : " ") + words[index];
        targetBubble.dataset.rawText = currentText;
        targetBubble.innerHTML = renderAssistantMessage(currentText);
        scrollToBottom();
        await new Promise((resolve) => setTimeout(resolve, 35));
    }
}

// ADDED
function renderSuggestions() {
    suggestionBox.innerHTML = "";
    const suggestions = suggestionMap[currentBotId] || [];

    suggestions.forEach((text) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "suggestion-chip";
        button.textContent = text;
        button.addEventListener("click", () => {
            chatInput.value = text;
            autoResizeTextarea();
            chatInput.focus();
        });
        suggestionBox.appendChild(button);
    });

    suggestionBox.style.display = suggestions.length ? "flex" : "none";
}

function formatRoleStatus(operator) {
    const verificationLabel = operator.email_verified ? "Verified" : "Pending signup";
    const activeLabel = operator.is_active ? "Active" : "Inactive";
    return `${verificationLabel} | ${activeLabel}`;
}

function getOperatorStatusBadge(operator) {
    if (!operator.email_verified) {
        return { label: "Pending Signup", className: "status-pending" };
    }

    if (!operator.is_active) {
        return { label: "Inactive", className: "status-inactive" };
    }

    return { label: "Active", className: "status-active" };
}

function renderOperatorList(operators = []) {
    if (!operatorList) {
        return;
    }

    operatorList.innerHTML = "";

    if (!operators.length) {
        const emptyState = document.createElement("p");
        emptyState.className = "page-text";
        emptyState.textContent = "No operators in this list.";
        operatorList.appendChild(emptyState);
        return;
    }

    operators.forEach((operator) => {
        const card = document.createElement("article");
        card.className = "operator-item";
        const status = getOperatorStatusBadge(operator);

        const info = document.createElement("div");
        info.className = "operator-item-info";
        info.innerHTML = `
            <div class="operator-item-topline">
                <strong>${operator.name}</strong>
                <span class="operator-status-badge ${status.className}">${status.label}</span>
            </div>
            <span>${operator.email}</span>
            <small>${formatRoleStatus(operator)}</small>
        `;

        const toggleButton = document.createElement("button");
        toggleButton.type = "button";
        toggleButton.className = operator.is_active ? "ghost-button operator-action-button" : "secondary-button operator-action-button";
        const idleLabel = operator.is_active ? "Remove" : "Activate";
        const pendingLabel = operator.is_active ? "Removing..." : "Activating...";
        const isPending = pendingOperatorStatusRequests.has(operator.id);
        setOperatorButtonPendingState(toggleButton, isPending, idleLabel, pendingLabel);
        toggleButton.addEventListener("click", async () => {
            if (pendingOperatorStatusRequests.has(operator.id)) {
                return;
            }

            if (operator.is_active) {
                const isConfirmed = window.confirm(
                    `Remove operator access for ${operator.name}? Their account will stay active as a normal user.`
                );
                if (!isConfirmed) {
                    return;
                }
            }

            pendingOperatorStatusRequests.add(operator.id);
            setOperatorButtonPendingState(toggleButton, true, idleLabel, pendingLabel);
            showOperatorMessage("");

            try {
                const response = await fetch(`/admin/operators/${operator.id}/status`, {
                    method: "PATCH",
                    headers: getAuthHeaders(),
                    body: JSON.stringify({ is_active: !operator.is_active })
                });
                const data = await readJson(response);

                if (!response.ok) {
                    showOperatorMessage(data.error || "Unable to update operator access.");
                    return;
                }

                showOperatorMessage(data.message || "Operator updated successfully.", false);
                pendingOperatorStatusRequests.delete(operator.id);
                await loadOperators();
            } catch (error) {
                showOperatorMessage("Unable to update operator access right now.");
            } finally {
                pendingOperatorStatusRequests.delete(operator.id);
                setOperatorButtonPendingState(toggleButton, false, idleLabel, pendingLabel);
            }
        });

        const actions = document.createElement("div");
        actions.className = "operator-item-actions";
        actions.appendChild(toggleButton);
        card.appendChild(info);
        card.appendChild(actions);
        operatorList.appendChild(card);
    });
}

async function loadOperators() {
    if (!isAdminUser()) {
        return;
    }

    const response = await fetch("/admin/operators", {
        headers: getAuthHeaders()
    });

    if (response.status === 401) {
        logout();
        return;
    }

    const data = await readJson(response);
    if (!response.ok) {
        showOperatorMessage(data.error || "Unable to load operators.");
        return;
    }

    renderOperatorAdmin(data.current_admin);
    renderOperatorStats(data.operators || []);
    renderOperatorList(data.operators || []);
}

function renderBotMenuOptions() {
    if (!botSelectMenu) {
        return;
    }

    botSelectMenu.innerHTML = "";

    Object.values(hardwareMap).forEach((item) => {
        const optionButton = document.createElement("button");
        optionButton.type = "button";
        optionButton.className = "bot-select-option";
        optionButton.dataset.hardwareId = item.id;
        optionButton.textContent = item.name;
        optionButton.addEventListener("click", async () => {
            setBotMenuState(false);
            const isSaved = await saveSelectedBot(item.id);

            if (!isSaved) {
                return;
            }

            currentSessionId = null;
            clearMessages();
            await loadChatSessions();
        });
        botSelectMenu.appendChild(optionButton);
    });

    updateBotSelectionUi();
}

async function loadBots() {
    const response = await fetch("/hardware-list", {
        headers: { "Authorization": `Bearer ${token}` }
    });

    if (response.status === 401) {
        logout();
        return;
    }

    const data = await readJson(response);
    hardwareMap = {};

    data.hardware.forEach((item) => {
        hardwareMap[item.id] = item;
    });

    currentBotId = data.selected_bot || (data.hardware[0] ? data.hardware[0].id : "");
    renderBotMenuOptions();
    if (currentBotId) {
        updateBotSelectionUi();
        renderSuggestions();
    }
}

async function applyRequestedBotSelection() {
    requestedBotId = readRequestedBotId();

    if (!requestedBotId || !hardwareMap[requestedBotId]) {
        return;
    }

    const isSaved = await saveSelectedBot(requestedBotId);
    if (!isSaved) {
        return;
    }

    currentSessionId = null;
    clearMessages();
    updateBotSelectionUi();
    window.history.replaceState({}, "", "/chat-page");
}

async function saveSelectedBot(hardwareId) {
    const response = await fetch("/select-bot", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ hardware_id: hardwareId })
    });

    if (response.status === 401) {
        logout();
        return false;
    }

    const data = await readJson(response);
    if (!response.ok) {
        addMessage(data.error || "Failed to change bot.", "assistant", {
            label: getBotLabel(hardwareId)
        });
        return false;
    }

    currentBotId = hardwareId;
    updateBotSelectionUi();
    renderSuggestions();
    stopMachineLiveStream();

    if (machineStatsModal && !machineStatsModal.classList.contains("hidden-block")) {
        startMachineStatsPolling();
    }

    return true;
}

function renderSessionList(sessions) {
    chatSessionListElement.innerHTML = "";

    if (!sessions.length) {
        const emptyState = document.createElement("p");
        emptyState.className = "page-text";
        emptyState.textContent = "No chats yet.";
        chatSessionListElement.appendChild(emptyState);
        return;
    }

    sessions.forEach((session) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "chat-session-item";
        if (Number(currentSessionId) === Number(session.id)) {
            button.classList.add("active");
        }

        const botName = hardwareMap[session.hardware_id] ? hardwareMap[session.hardware_id].name : session.hardware_id;
        button.innerHTML = `
            <strong>${session.title}</strong>
            <span>${botName}</span>
            <small>${formatDate(session.updated_at)}</small>
        `;

        button.addEventListener("click", async () => {
            currentSessionId = session.id;
            currentBotId = session.hardware_id;
            updateBotSelectionUi();
            await saveSelectedBot(currentBotId);
            await loadCurrentSession();
            await loadChatSessions();
            setSidebarState(false);
        });

        chatSessionListElement.appendChild(button);
    });
}

async function loadChatSessions() {
    const response = await fetch("/chat/sessions", {
        headers: { "Authorization": `Bearer ${token}` }
    });

    if (response.status === 401) {
        logout();
        return;
    }

    const data = await readJson(response);
    renderSessionList(data.sessions || []);
}

// ADDED
function renderHistoryMessages(messages, hardwareId) {
    clearMessages();

    if (!messages.length) {
        return;
    }

    let latestUserMessage = "";

    messages.forEach((item) => {
        if (item.role === "user") {
            latestUserMessage = item.message;
            addMessage(item.message, "user");
        } else {
            addMessage(item.message, "assistant", {
                showActions: true,
                userMessage: latestUserMessage,
                label: getBotLabel(hardwareId),
                hardwareId: hardwareId
            });
        }
    });
}

async function loadCurrentSession() {
    if (!currentSessionId) {
        clearMessages();
        return;
    }

    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response;

        try {
            response = await fetchWithTimeout(`/chat/session/${currentSessionId}`, {
                headers: { "Authorization": `Bearer ${token}` }
            }, 20000);
        } catch (error) {
            if (attempt < maxAttempts) {
                await sleep(400 * attempt);
                continue;
            }

            if (!chatMessagesElement.children.length) {
                addMessage("Unable to load this chat right now. Please try again.", "assistant", {
                    label: getBotLabel(currentBotId),
                    hardwareId: currentBotId
                });
            }
            return;
        }

        if (response.status === 401) {
            logout();
            return;
        }

        const data = await readJson(response);
        if (response.ok) {
            currentBotId = data.session.hardware_id;
            updateBotSelectionUi();
            renderSuggestions();
            renderHistoryMessages(data.messages, currentBotId);
            return;
        }

        if (isTransientHttpStatus(response.status) && attempt < maxAttempts) {
            await sleep(400 * attempt);
            continue;
        }

        if (!chatMessagesElement.children.length) {
            addMessage(data.error || "Failed to load chat.", "assistant", {
                label: getBotLabel(currentBotId),
                hardwareId: currentBotId
            });
        }
        return;
    }
}

// ADDED
async function requestReply(message, sessionId) {
    const maxAttempts = 3;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        let response;

        try {
            response = await fetchWithTimeout("/chat", {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    message: message,
                    session_id: sessionId
                })
            });
        } catch (error) {
            if (attempt < maxAttempts) {
                await sleep(500 * attempt);
                continue;
            }
            return { error: "Chat request timed out. Please try again." };
        }

        if (response.status === 401) {
            logout();
            return null;
        }

        const data = await readJson(response);
        if (response.ok) {
            return data;
        }

        if (isTransientHttpStatus(response.status) && attempt < maxAttempts) {
            await sleep(500 * attempt);
            continue;
        }

        return { error: data.error || "Chat request failed. Please try again." };
    }

    return { error: "Chat request failed. Please try again." };
}

// ADDED
async function regenerateReply(message, existingAssistantRow) {
    const loader = createTypingLoader();

    const data = await requestReply(message, currentSessionId);

    if (!data) {
        loader.row.remove();
        return;
    }

    if (data.error) {
        loader.row.remove();
        addMessage(data.error, "assistant", {
            label: getBotLabel(currentBotId),
            hardwareId: currentBotId
        });
        return;
    }

    currentSessionId = data.session_id;
    currentBotId = data.hardware_id;

    if (existingAssistantRow) {
        existingAssistantRow.remove();
    }

    loader.row.remove();
    const assistantMessage = addMessage("", "assistant", {
        showActions: true,
        userMessage: message,
        label: getBotLabel(currentBotId),
        hardwareId: currentBotId
    });

    await streamAssistantMessage(assistantMessage.bubble, data.reply);
    await loadChatSessions();
}

// UPDATED
async function sendMessage(message) {
    lastUserMessage = message;
    addMessage(message, "user");

    const loader = createTypingLoader();
    const data = await requestReply(message, currentSessionId);

    if (!data) {
        loader.row.remove();
        return;
    }

    if (data.error) {
        loader.row.remove();
        addMessage(data.error, "assistant", {
            label: getBotLabel(currentBotId),
            hardwareId: currentBotId
        });
        return;
    }

    const isNewChat = !currentSessionId;
    currentSessionId = data.session_id;
    currentBotId = data.hardware_id;

    loader.row.remove();

    const assistantMessage = addMessage("", "assistant", {
        showActions: true,
        userMessage: message,
        label: getBotLabel(currentBotId),
        hardwareId: currentBotId
    });

    await streamAssistantMessage(assistantMessage.bubble, data.reply);
    await loadChatSessions();

    if (isNewChat) {
        renderSuggestions();
    }
}

function logout() {
    if (sessionHeartbeatHandle) {
        window.clearInterval(sessionHeartbeatHandle);
        sessionHeartbeatHandle = null;
    }
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
}

async function validateCurrentSession() {
    try {
        const response = await fetch("/auth/session", {
            headers: { "Authorization": `Bearer ${token}` }
        });

        if (response.status === 401 || response.status === 403) {
            logout();
            return false;
        }

        if (!response.ok) {
            return false;
        }

        const data = await readJson(response);
        const latestUser = data.user || null;
        if (!latestUser) {
            logout();
            return false;
        }

        const latestRole = latestUser.role || "";
        const savedRole = savedUser?.role || "";
        const roleChanged = savedRole && savedRole !== latestRole;
        const lostOperatorAccess = isOperatorUser() && latestRole !== "operator" && latestRole !== "admin";

        if (!latestUser.is_active || roleChanged || lostOperatorAccess) {
            logout();
            return false;
        }

        localStorage.setItem("user", JSON.stringify(latestUser));
        return true;
    } catch (error) {
        return false;
    }
}

function startSessionHeartbeat() {
    if (sessionHeartbeatHandle) {
        window.clearInterval(sessionHeartbeatHandle);
    }

    sessionHeartbeatHandle = window.setInterval(() => {
        validateCurrentSession();
    }, SESSION_HEARTBEAT_INTERVAL_MS);
}

if (openOperatorPanelButton && operatorModal) {
    if (isAdminUser()) {
        openOperatorPanelButton.classList.remove("hidden-block");
    }

    openOperatorPanelButton.addEventListener("click", async () => {
        setOperatorModalState(true);
        setProfileMenuState(false);
        showOperatorMessage("");
        await loadOperators();
    });
}

if (openMachineStatsButton && machineStatsModal && isOperatorUser()) {
    openMachineStatsButton.classList.remove("hidden-block");
    openMachineStatsButton.addEventListener("click", () => {
        setMachineStatsModalState(true);
        setProfileMenuState(false);
        renderMachineRangeTabs();
        renderMachineMetrics();
        startMachineStatsPolling();
    });
}

if (openLiveMachineButton && liveMachineModal && isOperatorUser()) {
    openLiveMachineButton.classList.remove("hidden-block");
    openLiveMachineButton.addEventListener("click", () => {
        setLiveMachineModalState(true);
        setProfileMenuState(false);
        resetMachineLiveView();
        startMachineLiveStream();
    });
}

if (startLiveMachineButton) {
    startLiveMachineButton.addEventListener("click", startMachineLiveStream);
}

if (stopLiveMachineButton) {
    stopLiveMachineButton.addEventListener("click", stopMachineLiveStream);
}

if (machineLiveImage) {
    machineLiveImage.addEventListener("error", () => {
        setMachineLiveStatus("Live stream could not be loaded. Check the Raspberry Pi stream URL.", true);
        machineLiveFrame?.classList.remove("is-active");
    });
}

if (machineStatsRangeTabs) {
    machineStatsRangeTabs.addEventListener("click", (event) => {
        const rangeButton = event.target.closest(".machine-range-tab");
        if (!rangeButton) {
            return;
        }

        selectedMachineStatsRange = rangeButton.dataset.range || "last_1_hour";
        renderMachineRangeTabs();
        machineTrendBars?.querySelectorAll(".machine-trend-bar-item").forEach((item, index) => {
            const rangeKeys = ["last_1_minute", "last_1_hour", "today", "yesterday"];
            item.classList.toggle("is-selected", rangeKeys[index] === selectedMachineStatsRange);
        });
        loadMachineStats();
    });
}

if (closeOperatorPanelButton && operatorModal) {
    closeOperatorPanelButton.addEventListener("click", () => {
        setOperatorModalState(false);
        showOperatorMessage("");
    });
}

if (operatorModalBackdrop) {
    operatorModalBackdrop.addEventListener("click", () => {
        setOperatorModalState(false);
        showOperatorMessage("");
    });
}

if (closeMachineStatsButton && machineStatsModal) {
    closeMachineStatsButton.addEventListener("click", () => {
        setMachineStatsModalState(false);
        stopMachineStatsPolling();
    });
}

if (machineStatsModalBackdrop) {
    machineStatsModalBackdrop.addEventListener("click", () => {
        setMachineStatsModalState(false);
        stopMachineStatsPolling();
    });
}

if (closeLiveMachineButton && liveMachineModal) {
    closeLiveMachineButton.addEventListener("click", () => {
        setLiveMachineModalState(false);
        stopMachineLiveStream();
    });
}

if (liveMachineModalBackdrop) {
    liveMachineModalBackdrop.addEventListener("click", () => {
        setLiveMachineModalState(false);
        stopMachineLiveStream();
    });
}

if (operatorCreateForm) {
    operatorCreateForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (isCreatingOperatorRequestPending) {
            return;
        }

        const payload = {
            email: document.getElementById("operator-email").value.trim()
        };

        const submitButton = operatorCreateForm.querySelector('button[type="submit"]');
        const emailInput = document.getElementById("operator-email");

        if (!payload.email) {
            showOperatorMessage("Operator email is required.");
            return;
        }

        isCreatingOperatorRequestPending = true;
        setOperatorButtonPendingState(submitButton, true, "Create Operator", "Creating...");
        if (emailInput) {
            emailInput.disabled = true;
        }
        showOperatorMessage("");

        try {
            const response = await fetch("/admin/operators", {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify(payload)
            });
            const data = await readJson(response);

            if (!response.ok) {
                showOperatorMessage(data.error || "Unable to create operator.");
                return;
            }

            showOperatorMessage(data.message || "Operator created successfully.", false);
            operatorCreateForm.reset();
            await loadOperators();
        } catch (error) {
            showOperatorMessage("Unable to create operator right now.");
        } finally {
            isCreatingOperatorRequestPending = false;
            setOperatorButtonPendingState(submitButton, false, "Create Operator", "Creating...");
            if (emailInput) {
                emailInput.disabled = false;
            }
        }
    });
}

// ADDED
themeToggle.addEventListener("change", () => {
    applyTheme(themeToggle.checked ? "light" : "dark");
});

sidebarToggleButton.addEventListener("click", () => {
    if (window.innerWidth <= 900) {
        const isOpen = document.body.classList.contains("sidebar-open");
        setSidebarState(!isOpen);
        return;
    }

    toggleDesktopSidebar();
});

sidebarOverlay.addEventListener("click", () => {
    setSidebarState(false);
});

if (profileMenuButton && profileMenuPanel) {
    profileMenuButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = !profileMenuPanel.classList.contains("hidden-block");
        setProfileMenuState(!isOpen);
    });

    profileMenuPanel.addEventListener("click", (event) => {
        event.stopPropagation();
    });

    document.addEventListener("click", () => {
        setProfileMenuState(false);
        setBotMenuState(false);
    });
}

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        setOperatorModalState(false);
        setMachineStatsModalState(false);
        setLiveMachineModalState(false);
        stopMachineStatsPolling();
        stopMachineLiveStream();
        showOperatorMessage("");
    }
});

if (botSelectButton && botSelectMenu) {
    botSelectButton.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = !botSelectMenu.classList.contains("hidden-block");
        setBotMenuState(!isOpen);
        setProfileMenuState(false);
    });

    botSelectMenu.addEventListener("click", (event) => {
        event.stopPropagation();
    });
}

// UPDATED
chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = chatInput.value.trim();
    if (!message) {
        return;
    }

    chatInput.value = "";
    autoResizeTextarea();
    await sendMessage(message);
});

// ADDED
chatInput.addEventListener("input", autoResizeTextarea);

// ADDED
chatInput.addEventListener("keydown", async (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        chatForm.requestSubmit();
    }
});

newChatButton.addEventListener("click", () => {
    currentSessionId = null;
    clearMessages();
    loadChatSessions();
    setSidebarState(false);
});

logoutButton.addEventListener("click", logout);

async function initializePage() {
    applyVersionLabel();
    applyTheme(localStorage.getItem("theme") || "dark");
    renderMachineMetrics();
    autoResizeTextarea();
    updateChatEmptyState();
    startSessionHeartbeat();
    if (isAdminUser()) {
        await loadOperators();
    }
    await loadBots();
    await applyRequestedBotSelection();
    await loadChatSessions();
    await loadCurrentSession();
}

initializePage();
