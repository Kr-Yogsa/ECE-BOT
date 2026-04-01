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
const sidebarElement = document.getElementById("chat-sidebar");
const sidebarOverlay = document.getElementById("sidebar-overlay");
const sidebarToggleButton = document.getElementById("sidebar-toggle");

let currentSessionId = null;
let currentBotId = "";
let hardwareMap = {};
let lastUserMessage = "";
let requestedBotId = "";

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

    const response = await fetch(`/chat/session/${currentSessionId}`, {
        headers: { "Authorization": `Bearer ${token}` }
    });

    if (response.status === 401) {
        logout();
        return;
    }

    const data = await readJson(response);
    if (!response.ok) {
        addMessage(data.error || "Failed to load chat.", "assistant", {
            label: getBotLabel(currentBotId),
            hardwareId: currentBotId
        });
        return;
    }

    currentBotId = data.session.hardware_id;
    updateBotSelectionUi();
    renderSuggestions();
    renderHistoryMessages(data.messages, currentBotId);
}

// ADDED
async function requestReply(message, sessionId) {
    const response = await fetch("/chat", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
            message: message,
            session_id: sessionId
        })
    });

    if (response.status === 401) {
        logout();
        return null;
    }

    const data = await readJson(response);
    if (!response.ok) {
        return { error: data.error || "Chat request failed." };
    }

    return data;
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
        await loadCurrentSession();
    }
}

function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    window.location.href = "/";
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
    // ADDED
    applyTheme(localStorage.getItem("theme") || "dark");
    autoResizeTextarea();
    updateChatEmptyState();
    await loadBots();
    await applyRequestedBotSelection();
    await loadChatSessions();
    await loadCurrentSession();
}

initializePage();
