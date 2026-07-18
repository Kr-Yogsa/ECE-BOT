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
const machineMetricTemperature = document.getElementById("machine-metric-temperature");
const machineMetricTemperatureMeta = document.getElementById("machine-metric-temperature-meta");
const machineMetricHumidity = document.getElementById("machine-metric-humidity");
const machineMetricHumidityMeta = document.getElementById("machine-metric-humidity-meta");
const machineMetricVibration = document.getElementById("machine-metric-vibration");
const machineMetricVibrationMeta = document.getElementById("machine-metric-vibration-meta");
const machineTelemetryChart = document.getElementById("machine-telemetry-chart");
const machineTelemetryTooltip = document.getElementById("machine-telemetry-tooltip");
const machineMetricCardTemperature = document.getElementById("machine-metric-card-temperature");
const machineMetricCardHumidity = document.getElementById("machine-metric-card-humidity");
const machineMetricCardVibration = document.getElementById("machine-metric-card-vibration");
const machineMetricCardProximity = document.getElementById("machine-metric-card-proximity");
const machineMetricProximity = document.getElementById("machine-metric-proximity");
const machineMetricProximityMeta = document.getElementById("machine-metric-proximity-meta");
const machineTrendTitle = document.getElementById("machine-trend-title");
const machineTrendCard = document.getElementById("machine-trend-card");
const machineTelemetryLegend = document.getElementById("machine-telemetry-legend");
const machineCustomRangeControls = document.getElementById("machine-custom-range-controls");
const machineCustomDateFrom = document.getElementById("machine-custom-date-from");
const machineCustomRangeApply = document.getElementById("machine-custom-range-apply");
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

function isPlcMachine() {
    return currentBotId === "plc";
}
let hardwareMap = {};
let lastUserMessage = "";
let requestedBotId = "";
let machineStatsPollHandle = null;
let selectedMachineStatsRange = "live";
let machineStatsHistoryCache = [];
let machineStatsDashboardCache = null;
let isCreatingOperatorRequestPending = false;
let hasResetMotorOnLoad = false;
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
        "Explain MELFA working process?"
    ],
    plc: [
        "What is the purpose of PLC?",
        "How does a PLC work?",
        "Common PLC troubleshooting steps?"
    ],
    cnc: [
        "What is the purpose of this CNC machine?",
        "How does a CNC 3018 pro machine work?",
        "Common CNC problems and solutions?"
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

function updateMachineMetricVisibility() {
    const showPlc = isPlcMachine();

    machineMetricCardTemperature?.classList.toggle("hidden-block", showPlc);
    machineMetricCardHumidity?.classList.toggle("hidden-block", showPlc);
    machineMetricCardVibration?.classList.toggle("hidden-block", showPlc);
    machineMetricCardProximity?.classList.toggle("hidden-block", true);
    machineTrendCard?.classList.toggle("hidden-block", showPlc);

    const showStepperControl = showPlc && (selectedMachineStatsRange === "live");
    const stepperMotorControlCard = document.getElementById("stepper-motor-control-card");
    stepperMotorControlCard?.classList.toggle("hidden-block", !showStepperControl);
}

function renderMachineMetrics() {
    if (!machineMetricsSection) {
        return;
    }

    if (!isOperatorUser()) {
        machineMetricsSection.classList.add("hidden-block");
        return;
    }

    machineMetricsSection.classList.remove("hidden-block");

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
        machineStatsReadingCount.textContent = isPlcMachine() ? "0 Count" : "0 readings";
    }

    if (machineStatsLastUpdated) {
        machineStatsLastUpdated.textContent = "No telemetry yet";
    }

    updateMachineMetricVisibility();
    renderMachineMetricCard(machineMetricTemperature, machineMetricTemperatureMeta, [], "temperature", "C");
    renderMachineMetricCard(machineMetricHumidity, machineMetricHumidityMeta, [], "humidity", "%");
    renderMachineMetricCard(machineMetricVibration, machineMetricVibrationMeta, [], "vibration", "g");
    renderMachineCombinedChart([]);
    toggleMachineCustomRangeControls();
}

function formatMachineMetricValue(value, suffix = "", digits = 2) {
    if (value === null || value === undefined || value === "") {
        return "--";
    }

    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) {
        return "--";
    }

    const formatted = numberValue.toFixed(digits);
    return suffix ? `${formatted}${suffix}` : formatted;
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

function formatMachineMetricCompact(value, digits = 2) {
    if (value === null || value === undefined || value === "") {
        return "--";
    }

    const numberValue = Number(value);
    if (Number.isNaN(numberValue)) {
        return "--";
    }

    return numberValue.toFixed(digits);
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
        live: "Live telemetry",
        today: "Today",
        yesterday: "Yesterday",
        custom: "Custom date"
    };

    return labels[rangeKey] || "Live telemetry";
}

function setDefaultMachineCustomDates() {
    const today = new Date();
    const formatDateForInput = (value) => value.toISOString().slice(0, 10);

    if (machineCustomDateFrom && !machineCustomDateFrom.value) {
        machineCustomDateFrom.value = formatDateForInput(today);
    }
}

function parseMachineRecordedAt(value) {
    if (!value) {
        return null;
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function filterMachineHistoryByRange(records, rangeKey) {
    const now = new Date();
    let startDate = null;
    let endDate = null;

    if (rangeKey === "live") {
        startDate = new Date(now.getTime() - (60 * 60 * 1000));
        endDate = now;
    } else if (rangeKey === "today") {
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        endDate = now;
    } else if (rangeKey === "yesterday") {
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
        startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 1);
    } else if (rangeKey === "custom") {
        if (!machineCustomDateFrom?.value) {
            return [];
        }

        startDate = new Date(`${machineCustomDateFrom.value}T00:00:00`);
        endDate = new Date(`${machineCustomDateFrom.value}T23:59:59.999`);
    }

    return records.filter((record) => {
        const recordDate = parseMachineRecordedAt(record.recorded_at);
        if (!recordDate) {
            return false;
        }

        if (startDate && recordDate < startDate) {
            return false;
        }

        if (endDate && recordDate > endDate) {
            return false;
        }

        return true;
    });
}

function buildMachineSummaryFromRecords(records) {
    const summary = {
        reading_count: records.length,
        avg_temperature: null,
        min_temperature: null,
        max_temperature: null,
        avg_humidity: null,
        min_humidity: null,
        max_humidity: null,
        avg_vibration: null,
        min_vibration: null,
        max_vibration: null,
        latest_recorded_at: null,
        earliest_recorded_at: null,
    };

    if (!records.length) {
        return summary;
    }

    const buildMetric = (key) => {
        const values = records
            .map((record) => Number(record[key]))
            .filter((value) => !Number.isNaN(value));

        if (!values.length) {
            return { avg: null, min: null, max: null };
        }

        const total = values.reduce((sum, value) => sum + value, 0);
        return {
            avg: total / values.length,
            min: Math.min(...values),
            max: Math.max(...values),
        };
    };

    const temperatureStats = buildMetric("temperature");
    const humidityStats = buildMetric("humidity");
    const vibrationStats = buildMetric("vibration");
    const sortedRecords = [...records].sort((a, b) => {
        const dateA = parseMachineRecordedAt(a.recorded_at)?.getTime() || 0;
        const dateB = parseMachineRecordedAt(b.recorded_at)?.getTime() || 0;
        return dateA - dateB;
    });

    summary.avg_temperature = temperatureStats.avg;
    summary.min_temperature = temperatureStats.min;
    summary.max_temperature = temperatureStats.max;
    summary.avg_humidity = humidityStats.avg;
    summary.min_humidity = humidityStats.min;
    summary.max_humidity = humidityStats.max;
    summary.avg_vibration = vibrationStats.avg;
    summary.min_vibration = vibrationStats.min;
    summary.max_vibration = vibrationStats.max;
    summary.earliest_recorded_at = sortedRecords[0]?.recorded_at || null;
    summary.latest_recorded_at = sortedRecords[sortedRecords.length - 1]?.recorded_at || null;

    return summary;
}

function formatMachineCollectionDuration(startValue, endValue) {
    const startDate = parseMachineRecordedAt(startValue);
    const endDate = parseMachineRecordedAt(endValue);
    if (!startDate || !endDate || endDate < startDate) {
        return "--";
    }

    const totalMinutes = Math.round((endDate.getTime() - startDate.getTime()) / 60000);
    if (totalMinutes <= 0) {
        return "Less than 1 min";
    }

    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;
    const parts = [];

    if (days) {
        parts.push(`${days}d`);
    }
    if (hours) {
        parts.push(`${hours}h`);
    }
    if (minutes) {
        parts.push(`${minutes}m`);
    }

    return parts.join(" ");
}

function buildMachineMetaText(summary, avgKey, minKey, maxKey, suffix) {
    return `
        <span>Avg ${formatMachineMetricPlain(summary?.[avgKey], suffix)}</span>
        <span>Min ${formatMachineMetricPlain(summary?.[minKey], suffix)}</span>
        <span>Max ${formatMachineMetricPlain(summary?.[maxKey], suffix)}</span>
    `;
}

function buildSparklineSvg(values, color) {
    const width = 220;
    const height = 64;
    const valuesSafe = values.filter((value) => !Number.isNaN(value));

    if (!valuesSafe.length) {
        return `
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
                <line x1="0" y1="${height - 10}" x2="${width}" y2="${height - 10}" stroke="rgba(148,163,184,0.25)" stroke-dasharray="5 6" />
            </svg>
        `;
    }

    const minValue = Math.min(...valuesSafe);
    const maxValue = Math.max(...valuesSafe);
    const rangeValue = Math.max(maxValue - minValue, 1);
    const points = valuesSafe.map((value, index) => {
        const x = valuesSafe.length === 1 ? width / 2 : (index / (valuesSafe.length - 1)) * width;
        const y = height - 8 - (((value - minValue) / rangeValue) * (height - 18));
        return `${x},${y}`;
    });
    const linePath = points.join(" ");
    const areaPath = `${points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.replace(",", " ")}`).join(" ")} L ${width} ${height} L 0 ${height} Z`;

    return `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id="spark-${color.replace("#", "")}" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="${color}" stop-opacity="0.35"></stop>
                    <stop offset="100%" stop-color="${color}" stop-opacity="0"></stop>
                </linearGradient>
            </defs>
            <path d="${areaPath}" fill="url(#spark-${color.replace("#", "")})"></path>
            <polyline fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${linePath}"></polyline>
        </svg>
    `;
}

function renderMachineRangeTabs() {
    if (!machineStatsRangeTabs) {
        return;
    }

    machineStatsRangeTabs.querySelectorAll(".machine-range-tab").forEach((button) => {
        button.classList.toggle("is-selected", button.dataset.range === selectedMachineStatsRange);
    });
}

function toggleMachineCustomRangeControls() {
    if (!machineCustomRangeControls) {
        return;
    }

    machineCustomRangeControls.classList.toggle("hidden-block", selectedMachineStatsRange !== "custom");
}

function buildMachineTrendLabel(currentValue, averageValue, previousValue) {
    if ([currentValue, averageValue, previousValue].some((item) => item === null || item === undefined || Number.isNaN(Number(item)))) {
        return { text: "Steady", badge: "Stable" };
    }

    const currentNumber = Number(currentValue);
    const averageNumber = Number(averageValue);
    const previousNumber = Number(previousValue);

    if (currentNumber > averageNumber * 1.12) {
        return { text: "Rising", badge: "High" };
    }

    if (currentNumber < averageNumber * 0.88) {
        return { text: "Falling", badge: "Low" };
    }

    if (currentNumber > previousNumber) {
        return { text: "Upward", badge: "Watch" };
    }

    if (currentNumber < previousNumber) {
        return { text: "Cooling", badge: "Stable" };
    }

    return { text: "Steady", badge: "Stable" };
}

function renderMachineMetricCard(valueElement, metaElement, records, valueKey, unit) {
    const latestRecord = records[records.length - 1] || null;
    const summary = buildMachineSummaryFromRecords(records);
    const keyPrefix = valueKey;
    const latestValue = latestRecord ? latestRecord[valueKey] : null;

    if (valueElement) {
        valueElement.textContent = formatMachineMetricValue(latestValue, unit ? ` ${unit}` : "");
    }

    if (metaElement) {
        metaElement.innerHTML = buildMachineMetaText(
            summary,
            `avg_${keyPrefix}`,
            `min_${keyPrefix}`,
            `max_${keyPrefix}`,
            unit
        );
    }
}

function renderMachineStatus(status) {
    const isOnline = Boolean(status?.is_online);
    if (machineStatsStatus) {
        machineStatsStatus.textContent = status?.status_text || (isOnline ? "Components are on" : "Components are off");
        machineStatsStatus.classList.toggle("is-on", isOnline);
        machineStatsStatus.classList.toggle("is-off", !isOnline);
    }
}

function buildMachineLinePath(records, valueKey, width, laneTop, laneBottom, paddingX) {
    const points = records.map((record, index) => {
        const numericValue = Number(record[valueKey]);
        return {
            x: records.length === 1 ? width / 2 : paddingX + ((width - (paddingX * 2)) * (index / (records.length - 1))),
            value: Number.isNaN(numericValue) ? null : numericValue,
        };
    }).filter((point) => point.value !== null);

    if (!points.length) {
        return { path: "", area: "" };
    }

    const values = points.map((point) => point.value);
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const rangeValue = Math.max(maxValue - minValue, 1);
    const laneHeight = laneBottom - laneTop;
    const plotted = points.map((point) => ({
        x: point.x,
        y: laneBottom - (((point.value - minValue) / rangeValue) * laneHeight),
        value: point.value,
    }));
    const path = plotted
        .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
        .join(" ");
    const area = `${path} L ${plotted[plotted.length - 1].x} ${laneBottom} L ${plotted[0].x} ${laneBottom} Z`;

    return { path, area, points: plotted, minValue, maxValue };
}

function buildMachineChartSvg(records) {
    const width = 980;
    const height = 360;
    const paddingX = 90;
    const paddingTop = 24;
    const paddingBottom = 34;

    if (!records.length) {
        return `
            <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
                <text x="50%" y="50%" text-anchor="middle" fill="rgba(148,163,184,0.6)" font-size="18">No telemetry in this range yet</text>
            </svg>
        `;
    }

    const laneGap = 16;
    const laneHeight = ((height - paddingTop - paddingBottom) - (laneGap * 2)) / 3;
    const lanes = [
        {
            key: "temperature",
            label: "Temperature",
            unit: "C",
            color: "#fb923c",
            fillId: "telemetry-temp-fill",
            top: paddingTop,
        },
        {
            key: "humidity",
            label: "Humidity",
            unit: "%",
            color: "#22d3ee",
            fillId: "telemetry-humidity-fill",
            top: paddingTop + laneHeight + laneGap,
        },
        {
            key: "vibration",
            label: "Vibration",
            unit: "g",
            color: "#c084fc",
            fillId: "telemetry-vibration-fill",
            top: paddingTop + ((laneHeight + laneGap) * 2),
        },
    ].map((lane) => ({
        ...lane,
        bottom: lane.top + laneHeight,
        line: buildMachineLinePath(records, lane.key, width, lane.top + 10, lane.top + laneHeight - 10, paddingX),
    }));

    const verticalGridLines = Array.from({ length: 8 }, (_, index) => {
        const x = paddingX + (((width - (paddingX * 2)) / 7) * index);
        return `<line x1="${x}" y1="${paddingTop}" x2="${x}" y2="${height - paddingBottom}" stroke="rgba(148,163,184,0.08)" />`;
    }).join("");

    const laneMarkup = lanes.map((lane) => {
        const lastRecord = records[records.length - 1];
        const currentValue = formatMachineMetricValue(lastRecord?.[lane.key], ` ${lane.unit}`);
        const minLabel = formatMachineMetricValue(lane.line.minValue, ` ${lane.unit}`);
        const maxLabel = formatMachineMetricValue(lane.line.maxValue, ` ${lane.unit}`);
        const centerY = lane.top + (laneHeight / 2);
        const laneGridLines = Array.from({ length: 3 }, (_, index) => {
            const y = lane.top + 10 + ((((laneHeight - 20)) / 2) * index);
            return `<line x1="${paddingX}" y1="${y}" x2="${width - 22}" y2="${y}" stroke="rgba(148,163,184,0.10)" stroke-dasharray="4 8" />`;
        }).join("");

        return `
            <rect x="${paddingX}" y="${lane.top}" width="${width - paddingX - 22}" height="${laneHeight}" rx="14" fill="rgba(15,23,42,0.24)" stroke="rgba(148,163,184,0.08)"></rect>
            ${laneGridLines}
            <text x="22" y="${lane.top + 22}" fill="${lane.color}" font-size="13" font-weight="700">${lane.label}</text>
            <text x="22" y="${centerY + 4}" fill="rgba(148,163,184,0.78)" font-size="11">Min ${minLabel}</text>
            <text x="22" y="${lane.bottom - 8}" fill="rgba(148,163,184,0.78)" font-size="11">Max ${maxLabel}</text>
            <text x="${width - 26}" y="${lane.top + 22}" fill="${lane.color}" font-size="12" font-weight="700" text-anchor="end">Now ${currentValue}</text>
            ${lane.line.area ? `<path d="${lane.line.area}" fill="url(#${lane.fillId})"></path>` : ""}
            ${lane.line.path ? `<path d="${lane.line.path}" fill="none" stroke="${lane.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></path>` : ""}
        `;
    }).join("");

    const timeLabels = Array.from({ length: 4 }, (_, index) => {
        const recordIndex = Math.min(records.length - 1, Math.round((records.length - 1) * (index / 3)));
        const dateValue = parseMachineRecordedAt(records[recordIndex]?.recorded_at);
        const label = dateValue ? dateValue.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "";
        const x = paddingX + (((width - (paddingX * 2)) / 3) * index);
        return `<text x="${x}" y="${height - 10}" text-anchor="${index === 0 ? "start" : index === 3 ? "end" : "middle"}" fill="rgba(148,163,184,0.72)" font-size="11">${label}</text>`;
    }).join("");

    return `
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
            <defs>
                <linearGradient id="telemetry-temp-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#fb923c" stop-opacity="0.18"></stop>
                    <stop offset="100%" stop-color="#fb923c" stop-opacity="0"></stop>
                </linearGradient>
                <linearGradient id="telemetry-humidity-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.15"></stop>
                    <stop offset="100%" stop-color="#22d3ee" stop-opacity="0"></stop>
                </linearGradient>
                <linearGradient id="telemetry-vibration-fill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stop-color="#c084fc" stop-opacity="0.16"></stop>
                    <stop offset="100%" stop-color="#c084fc" stop-opacity="0"></stop>
                </linearGradient>
            </defs>
            ${verticalGridLines}
            ${laneMarkup}
            ${timeLabels}
        </svg>
    `;
}

function renderMachineCombinedChart(records) {
    if (!machineTelemetryChart) {
        return;
    }

    machineTelemetryChart.innerHTML = buildMachineChartSvg(records);
    machineTelemetryChart.onmousemove = null;
    machineTelemetryChart.onmouseleave = null;

    if (!records.length || !machineTelemetryTooltip) {
        machineTelemetryTooltip?.classList.add("hidden-block");
        return;
    }

    machineTelemetryChart.onmousemove = (event) => {
        const bounds = machineTelemetryChart.getBoundingClientRect();
        const relativeX = event.clientX - bounds.left;
        const ratio = bounds.width ? relativeX / bounds.width : 0;
        const pointIndex = Math.min(
            records.length - 1,
            Math.max(0, Math.round(ratio * (records.length - 1)))
        );
        const record = records[pointIndex];
        if (!record) {
            return;
        }

        machineTelemetryTooltip.innerHTML = `
            <strong>${new Date(record.recorded_at).toLocaleString()}</strong>
            <span style="color:#fb923c;">Temperature: ${formatMachineMetricValue(record.temperature, " C")}</span>
            <span style="color:#22d3ee;">Humidity: ${formatMachineMetricValue(record.humidity, "%")}</span>
            <span style="color:#c084fc;">Vibration: ${formatMachineMetricValue(record.vibration, " g")}</span>
        `;
        machineTelemetryTooltip.classList.remove("hidden-block");
        machineTelemetryTooltip.style.left = `${Math.min(bounds.width - 180, Math.max(12, relativeX + 12))}px`;
        machineTelemetryTooltip.style.top = `${Math.max(12, event.clientY - bounds.top - 22)}px`;
    };

    machineTelemetryChart.onmouseleave = () => {
        machineTelemetryTooltip.classList.add("hidden-block");
    };
}

function renderMachineDashboardState(dashboardData, records) {
    const filteredRecords = filterMachineHistoryByRange(records, selectedMachineStatsRange).sort((a, b) => {
        const dateA = parseMachineRecordedAt(a.recorded_at)?.getTime() || 0;
        const dateB = parseMachineRecordedAt(b.recorded_at)?.getTime() || 0;
        return dateA - dateB;
    });
    const summary = buildMachineSummaryFromRecords(filteredRecords);
    const latestRecord = filteredRecords[filteredRecords.length - 1] || dashboardData?.latest || null;

    renderMachineRangeTabs();
    toggleMachineCustomRangeControls();
    renderMachineStatus(dashboardData?.status || {});
    updateMachineMetricVisibility();

    if (isPlcMachine()) {
        const motorState = (dashboardData?.latest && dashboardData.latest.motor !== undefined) ? dashboardData.latest.motor : 0;

        if (!hasResetMotorOnLoad) {
            hasResetMotorOnLoad = true;
            if (motorState == 1) {
                turnOffMotorOnLoad();
                return;
            }
        }

        const motorText = document.getElementById("stepper-motor-status-val");
        const motorToggle = document.getElementById("stepper-motor-toggle");

        if (motorText) {
            motorText.textContent = (motorState == 1) ? "[RUNNING]" : "[STOPPED]";
            motorText.className = "stepper-motor-status-value " + ((motorState == 1) ? "is-running" : "is-stopped");
        }
        if (motorToggle && !window.isTogglingMotor) {
            motorToggle.checked = (motorState == 1);
        }
    }

    if (machineStatsMachineName) {
        machineStatsMachineName.textContent = dashboardData?.machine_name || hardwareMap[currentBotId]?.name || "--";
    }

    if (machineStatsRangeLabel) {
        machineStatsRangeLabel.textContent = getMachineRangeLabel(selectedMachineStatsRange);
    }

    if (machineStatsReadingCount) {
        if (isPlcMachine()) {
            machineStatsReadingCount.textContent = `${summary.reading_count || 0} Count`;
        } else {
            machineStatsReadingCount.textContent = `${summary.reading_count || 0} ${summary.reading_count === 1 ? "reading" : "readings"}`;
        }
    }

    if (machineStatsLastUpdated) {
        machineStatsLastUpdated.textContent = formatMachineStatsTimestamp(
            latestRecord?.recorded_at || summary.latest_recorded_at || dashboardData?.latest?.recorded_at
        );
    }

    renderMachineMetricCard(machineMetricTemperature, machineMetricTemperatureMeta, filteredRecords, "temperature", "C");
    renderMachineMetricCard(machineMetricHumidity, machineMetricHumidityMeta, filteredRecords, "humidity", "%");
    renderMachineMetricCard(machineMetricVibration, machineMetricVibrationMeta, filteredRecords, "vibration", "g");
    renderMachineCombinedChart(filteredRecords);
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
        const [dashboardResponse, historyResponse] = await Promise.all([
            fetch(`/api/machine-stats/${encodeURIComponent(currentBotId)}/dashboard`, {
                headers: getAuthHeaders()
            }),
            fetch(`/api/machine-stats/${encodeURIComponent(currentBotId)}/history?limit=1000`, {
                headers: getAuthHeaders()
            }),
        ]);
        const dashboardData = await readJson(dashboardResponse);
        const historyData = await readJson(historyResponse);

        machineStatsDashboardCache = dashboardData;
        machineStatsHistoryCache = Array.isArray(historyData.history) ? historyData.history : [];

        if (!dashboardResponse.ok) {
            renderMachineMetrics();
            return;
        }

        renderMachineDashboardState(machineStatsDashboardCache, machineStatsHistoryCache);
    } catch (error) {
        renderMachineMetrics();
    }
}

function startMachineStatsPolling() {
    stopMachineStatsPolling();
    loadMachineStats();
    if (selectedMachineStatsRange === "custom") {
        return;
    }

    machineStatsPollHandle = setInterval(loadMachineStats, selectedMachineStatsRange === "live" ? 500 : 12000);
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
        setDefaultMachineCustomDates();
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

async function turnOffMotorOnLoad() {
    const motorText = document.getElementById("stepper-motor-status-val");
    const motorToggle = document.getElementById("stepper-motor-toggle");

    // Force UI to show stopped/OFF optimistically
    if (motorText) {
        motorText.textContent = "[STOPPED]";
        motorText.className = "stepper-motor-status-value is-stopped";
    }
    if (motorToggle) {
        motorToggle.checked = false;
    }

    try {
        await fetch(`/api/machine-control/${encodeURIComponent(currentBotId)}`, {
            method: "POST",
            headers: getAuthHeaders(),
            body: JSON.stringify({ motor: 0 })
        });
    } catch (error) {
        console.error("Failed to automatically stop motor on load/refresh:", error);
    }
}

window.isTogglingMotor = false;
const stepperMotorToggle = document.getElementById("stepper-motor-toggle");
if (stepperMotorToggle) {
    stepperMotorToggle.addEventListener("change", async (event) => {
        if (!currentBotId) return;
        const isChecked = event.target.checked;
        const motorValue = isChecked ? 1 : 0;

        window.isTogglingMotor = true;

        // Optimistically update label and styling
        const motorText = document.getElementById("stepper-motor-status-val");
        if (motorText) {
            motorText.textContent = isChecked ? "[RUNNING]" : "[STOPPED]";
            motorText.className = "stepper-motor-status-value " + (isChecked ? "is-running" : "is-stopped");
        }

        try {
            const response = await fetch(`/api/machine-control/${encodeURIComponent(currentBotId)}`, {
                method: "POST",
                headers: getAuthHeaders(),
                body: JSON.stringify({ motor: motorValue })
            });
            if (!response.ok) {
                // Revert state if error
                event.target.checked = !isChecked;
                if (motorText) {
                    motorText.textContent = !isChecked ? "[RUNNING]" : "[STOPPED]";
                    motorText.className = "stepper-motor-status-value " + (!isChecked ? "is-running" : "is-stopped");
                }
            }
        } catch (error) {
            console.error("Error controlling motor:", error);
            // Revert state if error
            event.target.checked = !isChecked;
            if (motorText) {
                motorText.textContent = !isChecked ? "[RUNNING]" : "[STOPPED]";
                motorText.className = "stepper-motor-status-value " + (!isChecked ? "is-running" : "is-stopped");
            }
        } finally {
            window.isTogglingMotor = false;
        }
    });
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

        selectedMachineStatsRange = rangeButton.dataset.range || "live";
        renderMachineRangeTabs();

        if (selectedMachineStatsRange === "custom") {
            setDefaultMachineCustomDates();
            toggleMachineCustomRangeControls();
            if (machineStatsDashboardCache) {
                renderMachineDashboardState(machineStatsDashboardCache, machineStatsHistoryCache);
            }
            stopMachineStatsPolling();
            return;
        }

        startMachineStatsPolling();
    });
}

if (machineCustomRangeApply) {
    machineCustomRangeApply.addEventListener("click", () => {
        if (selectedMachineStatsRange !== "custom") {
            selectedMachineStatsRange = "custom";
            renderMachineRangeTabs();
        }

        if (!machineCustomDateFrom?.value) {
            return;
        }

        stopMachineStatsPolling();
        if (machineStatsDashboardCache) {
            renderMachineDashboardState(machineStatsDashboardCache, machineStatsHistoryCache);
            return;
        }

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
