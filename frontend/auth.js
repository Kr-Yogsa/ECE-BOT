function showMessage(text, isError = true) {
    const messageBox = document.getElementById("message-box");
    if (!messageBox) {
        return;
    }

    messageBox.textContent = text;
    messageBox.style.color = isError ? "#f97066" : "#6ce9a6";
}

function setOtpButtonLoading(button, isLoading) {
    if (!button) {
        return;
    }

    if (isLoading) {
        button.disabled = true;
        button.dataset.loading = "true";
        button.textContent = "Sending OTP...";
        return;
    }

    delete button.dataset.loading;
    button.disabled = false;
    button.textContent = "Send OTP";
}

async function readJson(response) {
    try {
        return await response.json();
    } catch (error) {
        return {};
    }
}

function getRequestedBotId() {
    const params = new URLSearchParams(window.location.search);
    return params.get("bot")?.trim().toLowerCase() || "";
}

function buildChatRedirectUrl() {
    const requestedBotId = getRequestedBotId();
    if (!requestedBotId) {
        return "/chat-page";
    }

    return `/chat-page?bot=${encodeURIComponent(requestedBotId)}`;
}

function runOtpCooldown(button, storageKey) {
    function updateButtonState() {
        const savedEndTime = Number(localStorage.getItem(storageKey) || "0");
        const secondsLeft = Math.ceil((savedEndTime - Date.now()) / 1000);

        if (secondsLeft <= 0) {
            delete button.dataset.loading;
            button.disabled = false;
            button.textContent = "Send OTP";
            localStorage.removeItem(storageKey);
            return;
        }

        button.disabled = true;
        button.textContent = `Resend OTP in ${secondsLeft}s`;
        setTimeout(updateButtonState, 1000);
    }

    updateButtonState();
}

function startOtpCooldown(button, storageKey) {
    const cooldownSeconds = 60;
    const endTime = Date.now() + cooldownSeconds * 1000;
    localStorage.setItem(storageKey, String(endTime));
    runOtpCooldown(button, storageKey);
}

function restoreOtpCooldown(button, storageKey) {
    const savedEndTime = Number(localStorage.getItem(storageKey) || "0");
    if (savedEndTime > Date.now()) {
        runOtpCooldown(button, storageKey);
    }
}

const signupPasswordInput = document.getElementById("password");
const passwordStrengthFill = document.getElementById("password-strength-fill");
const passwordStrengthText = document.getElementById("password-strength-text");

if (signupPasswordInput && passwordStrengthFill && passwordStrengthText) {
    signupPasswordInput.addEventListener("input", () => {
        const password = signupPasswordInput.value;
        let score = 0;

        if (password.length >= 8) score += 1;
        if (/[A-Z]/.test(password)) score += 1;
        if (/[0-9]/.test(password)) score += 1;
        if (/[^A-Za-z0-9]/.test(password)) score += 1;

        passwordStrengthFill.style.width = `${score * 25}%`;

        if (score <= 1) {
            passwordStrengthText.textContent = "Weak password. Add length, numbers, and symbols.";
        } else if (score <= 3) {
            passwordStrengthText.textContent = "Good start. Add one more rule for a stronger password.";
        } else {
            passwordStrengthText.textContent = "Strong password.";
        }
    });
}

const sendSignupOtpButton = document.getElementById("send-signup-otp");
if (sendSignupOtpButton) {
    restoreOtpCooldown(sendSignupOtpButton, "signupOtpCooldown");

    sendSignupOtpButton.addEventListener("click", async () => {
        if (sendSignupOtpButton.disabled || sendSignupOtpButton.dataset.loading === "true") {
            return;
        }

        const email = document.getElementById("email").value.trim();

        if (!email) {
            showMessage("Enter your email first.");
            return;
        }

        setOtpButtonLoading(sendSignupOtpButton, true);

        try {
            const response = await fetch("/auth/request-signup-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email })
            });

            const data = await readJson(response);

            if (response.status === 429) {
                showMessage(data.error || "OTP already sent. Please wait before requesting again.");
                startOtpCooldown(sendSignupOtpButton, "signupOtpCooldown");
                return;
            }

            if (!response.ok) {
                showMessage(data.error || "Failed to send OTP.");
                setOtpButtonLoading(sendSignupOtpButton, false);
                return;
            }

            showMessage(data.message || "OTP sent to your email successfully.", false);
            startOtpCooldown(sendSignupOtpButton, "signupOtpCooldown");
        } catch (error) {
            showMessage("Unable to send OTP right now. Please try again.");
            setOtpButtonLoading(sendSignupOtpButton, false);
        }
    });
}

const signupForm = document.getElementById("signup-form");
if (signupForm) {
    signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            otp: document.getElementById("otp").value.trim(),
            password: document.getElementById("password").value.trim()
        };

        const response = await fetch("/auth/signup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await readJson(response);

        if (!response.ok) {
            showMessage(data.error || "Signup failed.");
            return;
        }

        showMessage(data.message || "Signup successful. Please login.", false);
        signupForm.reset();
        setTimeout(() => {
            const requestedBotId = getRequestedBotId();
            window.location.href = requestedBotId ? `/?bot=${encodeURIComponent(requestedBotId)}` : "/";
        }, 1200);
    });
}

const loginForm = document.getElementById("login-form");
if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const payload = {
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value.trim()
        };

        const response = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });

        const data = await readJson(response);

        if (!response.ok) {
            showMessage(data.error || "Login failed.");
            return;
        }

        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));
        window.location.href = buildChatRedirectUrl();
    });
}

const forgotPanel = document.getElementById("forgot-password-panel");
const forgotEmailForm = document.getElementById("forgot-email-form");
const forgotOtpForm = document.getElementById("forgot-otp-form");
const resetPasswordForm = document.getElementById("reset-password-form");
const forgotSubtitle = document.getElementById("forgot-subtitle");
const showForgotPasswordButton = document.getElementById("show-forgot-password");
const closeForgotPasswordButton = document.getElementById("close-forgot-password");

if (showForgotPasswordButton && forgotPanel) {
    let resetEmail = "";
    let verifiedOtp = "";
    const forgotSendOtpButton = forgotEmailForm.querySelector("button[type='submit']");

    if (forgotSendOtpButton) {
        restoreOtpCooldown(forgotSendOtpButton, "forgotOtpCooldown");
    }

    showForgotPasswordButton.addEventListener("click", () => {
        forgotPanel.classList.remove("hidden-block");
    });

    closeForgotPasswordButton.addEventListener("click", () => {
        forgotPanel.classList.add("hidden-block");
        forgotEmailForm.reset();
        forgotOtpForm.reset();
        resetPasswordForm.reset();
        forgotOtpForm.classList.add("hidden-block");
        resetPasswordForm.classList.add("hidden-block");
        forgotSubtitle.textContent = "Enter your email to receive an OTP.";
        resetEmail = "";
        verifiedOtp = "";
    });

    forgotEmailForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (forgotSendOtpButton && (forgotSendOtpButton.disabled || forgotSendOtpButton.dataset.loading === "true")) {
            return;
        }

        resetEmail = document.getElementById("forgot-email").value.trim();

        if (!resetEmail) {
            showMessage("Enter your email first.");
            return;
        }

        if (forgotSendOtpButton) {
            setOtpButtonLoading(forgotSendOtpButton, true);
        }

        try {
            const response = await fetch("/auth/forgot-password/request-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: resetEmail })
            });

            const data = await readJson(response);

            if (response.status === 429) {
                showMessage(data.error || "OTP already sent. Please wait before requesting again.");
                if (forgotSendOtpButton) {
                    startOtpCooldown(forgotSendOtpButton, "forgotOtpCooldown");
                }
                return;
            }

            if (!response.ok) {
                showMessage(data.error || "Failed to send OTP.");
                if (forgotSendOtpButton) {
                    setOtpButtonLoading(forgotSendOtpButton, false);
                }
                return;
            }

            forgotOtpForm.classList.remove("hidden-block");
            forgotSubtitle.textContent = "Enter the OTP sent to your email.";
            showMessage(data.message || "OTP sent to your email successfully.", false);
            if (forgotSendOtpButton) {
                startOtpCooldown(forgotSendOtpButton, "forgotOtpCooldown");
            }
        } catch (error) {
            showMessage("Unable to send OTP right now. Please try again.");
            if (forgotSendOtpButton) {
                setOtpButtonLoading(forgotSendOtpButton, false);
            }
        }
    });

    forgotOtpForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        verifiedOtp = document.getElementById("forgot-otp").value.trim();

        const response = await fetch("/auth/forgot-password/verify-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: resetEmail,
                otp: verifiedOtp
            })
        });

        const data = await readJson(response);

        if (!response.ok) {
            showMessage(data.error || "OTP verification failed.");
            return;
        }

        resetPasswordForm.classList.remove("hidden-block");
        forgotSubtitle.textContent = "Set your new password.";
        showMessage(data.message || "OTP verified.", false);
    });

    resetPasswordForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        const response = await fetch("/auth/forgot-password/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: resetEmail,
                otp: verifiedOtp,
                new_password: document.getElementById("new-password").value.trim()
            })
        });

        const data = await readJson(response);

        if (!response.ok) {
            showMessage(data.error || "Password reset failed.");
            return;
        }

        showMessage(data.message || "Password updated successfully.", false);
        setTimeout(() => {
            closeForgotPasswordButton.click();
        }, 1000);
    });
}
