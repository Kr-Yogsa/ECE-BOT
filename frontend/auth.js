function showMessage(text, isError = true) {
    const messageBox = document.getElementById("message-box");
    if (!messageBox) {
        return;
    }

    messageBox.textContent = text;
    messageBox.style.color = isError ? "#f97066" : "#6ce9a6";
}

function applyVersionLabel() {
    const versionLabel = window.ECE_BOT_UI_CONFIG?.versionLabel?.trim();
    if (!versionLabel) {
        return;
    }

    document.querySelectorAll("[data-app-version]").forEach((element) => {
        element.textContent = versionLabel;
    });
}

function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test((email || "").trim());
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

function setButtonLoading(button, isLoading, loadingText, defaultText) {
    if (!button) {
        return;
    }

    button.disabled = isLoading;
    button.textContent = isLoading ? loadingText : defaultText;
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
const signupOtpSection = document.getElementById("signup-otp-section");
const verifySignupOtpButton = document.getElementById("verify-signup-otp");
const signupPasswordSection = document.getElementById("signup-password-section");

let isSignupOtpVerified = false;

function setSignupOtpVerified(isVerified) {
    isSignupOtpVerified = isVerified;

    if (signupPasswordSection) {
        signupPasswordSection.classList.toggle("hidden-block", !isVerified);
    }

    if (!isVerified && signupPasswordInput) {
        signupPasswordInput.value = "";
        if (passwordStrengthFill) {
            passwordStrengthFill.style.width = "0";
        }
        if (passwordStrengthText) {
            passwordStrengthText.textContent = "Use at least 8 characters for a stronger password.";
        }
    }
}

function setSignupOtpSectionVisible(isVisible) {
    if (!signupOtpSection) {
        return;
    }

    signupOtpSection.classList.toggle("hidden-block", !isVisible);
}

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

applyVersionLabel();

const sendSignupOtpButton = document.getElementById("send-signup-otp");
if (sendSignupOtpButton) {
    restoreOtpCooldown(sendSignupOtpButton, "signupOtpCooldown");
    const savedSignupOtpCooldown = Number(localStorage.getItem("signupOtpCooldown") || "0");
    if (savedSignupOtpCooldown > Date.now()) {
        setSignupOtpSectionVisible(true);
    }

    sendSignupOtpButton.addEventListener("click", async () => {
        if (sendSignupOtpButton.disabled || sendSignupOtpButton.dataset.loading === "true") {
            return;
        }

        const email = document.getElementById("email").value.trim();

        if (!email) {
            showMessage("Enter your email first.");
            return;
        }

        if (!isValidEmail(email)) {
            showMessage("Please enter a valid email address.");
            return;
        }

        setSignupOtpSectionVisible(false);
        setSignupOtpVerified(false);
        setOtpButtonLoading(sendSignupOtpButton, true);

        try {
            const response = await fetch("/auth/request-signup-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email })
            });

            const data = await readJson(response);

            if (response.status === 429) {
                setSignupOtpSectionVisible(true);
                showMessage(data.error || "OTP already sent. Please wait before requesting again.");
                startOtpCooldown(sendSignupOtpButton, "signupOtpCooldown");
                document.getElementById("otp")?.focus();
                return;
            }

            if (!response.ok) {
                showMessage(data.error || "Failed to send OTP.");
                setOtpButtonLoading(sendSignupOtpButton, false);
                return;
            }

            setSignupOtpSectionVisible(true);
            showMessage(data.message || "OTP sent to your email. Now verify the OTP to continue.", false);
            startOtpCooldown(sendSignupOtpButton, "signupOtpCooldown");
            document.getElementById("otp")?.focus();
        } catch (error) {
            showMessage("Unable to send OTP right now. Please try again.");
            setOtpButtonLoading(sendSignupOtpButton, false);
        }
    });
}

if (verifySignupOtpButton) {
    const defaultVerifyOtpText = verifySignupOtpButton.textContent || "Verify OTP";

    verifySignupOtpButton.addEventListener("click", async () => {
        if (verifySignupOtpButton.disabled) {
            return;
        }

        const email = document.getElementById("email").value.trim();
        const otp = document.getElementById("otp").value.trim();

        if (!email || !otp) {
            showMessage("Enter your email and OTP first.");
            return;
        }

        if (!isValidEmail(email)) {
            showMessage("Please enter a valid email address.");
            return;
        }

        setButtonLoading(verifySignupOtpButton, true, "Verifying OTP...", defaultVerifyOtpText);

        try {
            const response = await fetch("/auth/verify-signup-otp", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, otp })
            });

            const data = await readJson(response);

            if (!response.ok) {
                setSignupOtpVerified(false);
                showMessage(data.error || "OTP verification failed.");
                return;
            }

            setSignupOtpVerified(true);
            showMessage(data.message || "OTP verified. You can now create your password.", false);
            setButtonLoading(verifySignupOtpButton, true, "OTP Verified", defaultVerifyOtpText);
            signupPasswordInput?.focus();
        } catch (error) {
            setSignupOtpVerified(false);
            showMessage("Unable to verify OTP right now. Please try again.");
        } finally {
            if (!isSignupOtpVerified) {
                setButtonLoading(verifySignupOtpButton, false, "Verifying OTP...", defaultVerifyOtpText);
            }
        }
    });
}

const signupForm = document.getElementById("signup-form");
if (signupForm) {
    let latestSignupAttemptId = 0;
    const signupButton = signupForm.querySelector("button[type='submit']");
    const defaultSignupButtonText = signupButton ? signupButton.textContent : "Create Account";

    signupForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        latestSignupAttemptId += 1;
        const attemptId = latestSignupAttemptId;

        if (signupButton?.disabled) {
            return;
        }

        const payload = {
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            otp: document.getElementById("otp").value.trim(),
            password: document.getElementById("password").value.trim()
        };

        if (!payload.name || !payload.email || !payload.otp || !payload.password) {
            showMessage("Name, email, OTP, and password are required.");
            return;
        }

        if (!isValidEmail(payload.email)) {
            showMessage("Please enter a valid email address.");
            return;
        }

        if (!isSignupOtpVerified) {
            showMessage("Verify the OTP before creating your account.");
            return;
        }

        showMessage("", false);
        setButtonLoading(signupButton, true, "Creating Account...", defaultSignupButtonText);

        try {
            const response = await fetch("/auth/signup", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await readJson(response);

            if (attemptId !== latestSignupAttemptId) {
                return;
            }

            if (!response.ok) {
                if (response.status === 409) {
                    showMessage("Account already exists. Redirecting to login...", false);
                    setButtonLoading(signupButton, true, "Redirecting...", defaultSignupButtonText);
                    setTimeout(() => {
                        const requestedBotId = getRequestedBotId();
                        window.location.href = requestedBotId ? `/?bot=${encodeURIComponent(requestedBotId)}` : "/";
                    }, 1200);
                    return;
                }

                showMessage(data.error || "Signup failed.");
                return;
            }

            showMessage(data.message || "Signup successful. Please login.", false);
            setButtonLoading(signupButton, true, "Account Created", defaultSignupButtonText);
            signupForm.reset();
            setSignupOtpSectionVisible(false);
            setSignupOtpVerified(false);
            setTimeout(() => {
                const requestedBotId = getRequestedBotId();
                window.location.href = requestedBotId ? `/?bot=${encodeURIComponent(requestedBotId)}` : "/";
            }, 1200);
        } catch (error) {
            if (attemptId !== latestSignupAttemptId) {
                return;
            }

            showMessage("Unable to complete signup right now. Please try again.");
        } finally {
            if (attemptId === latestSignupAttemptId && signupButton && signupButton.textContent !== "Account Created" && signupButton.textContent !== "Redirecting...") {
                setButtonLoading(signupButton, false, "Creating Account...", defaultSignupButtonText);
            }
        }
    });
}

document.getElementById("email")?.addEventListener("input", () => {
    setSignupOtpSectionVisible(false);
    setSignupOtpVerified(false);
    if (verifySignupOtpButton) {
        verifySignupOtpButton.disabled = false;
        verifySignupOtpButton.textContent = "Verify OTP";
    }
});

document.getElementById("otp")?.addEventListener("input", () => {
    if (isSignupOtpVerified) {
        setSignupOtpVerified(false);
    }
    if (verifySignupOtpButton) {
        verifySignupOtpButton.disabled = false;
        verifySignupOtpButton.textContent = "Verify OTP";
    }
});

const loginForm = document.getElementById("login-form");
if (loginForm) {
    let latestLoginAttemptId = 0;
    const loginButton = loginForm.querySelector("button[type='submit']");
    const defaultLoginButtonText = loginButton ? loginButton.textContent : "Login";

    function setLoginLoading(isLoading) {
        if (!loginButton) {
            return;
        }

        loginButton.disabled = isLoading;
        loginButton.textContent = isLoading ? "Logging in..." : defaultLoginButtonText;
    }

    loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        latestLoginAttemptId += 1;
        const attemptId = latestLoginAttemptId;
        setLoginLoading(true);
        showMessage("", false);

        const payload = {
            email: document.getElementById("email").value.trim(),
            password: document.getElementById("password").value.trim()
        };

        try {
            const response = await fetch("/auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            const data = await readJson(response);

            if (attemptId !== latestLoginAttemptId) {
                return;
            }

            if (!response.ok) {
                showMessage(data.error || "Login failed.");
                return;
            }

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            window.location.href = buildChatRedirectUrl();
        } catch (error) {
            if (attemptId !== latestLoginAttemptId) {
                return;
            }

            showMessage("Unable to login right now. Please try again.");
        } finally {
            if (attemptId === latestLoginAttemptId) {
                setLoginLoading(false);
            }
        }
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

        if (!isValidEmail(resetEmail)) {
            showMessage("Please enter a valid email address.");
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
