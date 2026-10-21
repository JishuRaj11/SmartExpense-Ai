/* ==========================================================================
   SmartExpenses AI — Signup page logic
   --------------------------------------------------------------------------
   Flow:
     1. POST /register through api.js
     2. Show a success message
     3. Redirect to login.html?registered=1
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  // Already signed in? checkAuthentication() redirects to the dashboard.
  checkAuthentication();

  const form = window.UI.byId("signupForm");
  const nameInput = window.UI.byId("name");
  const gmailInput = window.UI.byId("gmail");
  const passwordInput = window.UI.byId("password");
  const signupButton = window.UI.byId("signupButton");
  const alertBox = window.UI.byId("formAlert");

  // ---- Password visibility toggle ----
  const toggleButton = window.UI.byId("togglePassword");
  if (toggleButton) {
    toggleButton.addEventListener("click", function () {
      const isHidden = passwordInput.type === "password";
      passwordInput.type = isHidden ? "text" : "password";
      toggleButton.setAttribute(
        "aria-label",
        isHidden ? "Hide password" : "Show password"
      );
    });
  }

  // ---- Live password strength meter ----
  const strengthBar = window.UI.byId("strengthBar");
  const strengthLabel = window.UI.byId("strengthLabel");

  passwordInput.addEventListener("input", function () {
    const result = scorePassword(passwordInput.value);
    strengthBar.style.width = result.percent + "%";
    strengthBar.classList.remove("is-success", "is-warning", "is-danger");
    strengthBar.classList.add(result.tone);
    strengthLabel.textContent = result.label;
  });

  // ---- Clear field errors on edit ----
  [nameInput, gmailInput, passwordInput].forEach(function (input) {
    input.addEventListener("input", function () {
      window.UI.setFieldError(input, window.UI.byId(input.id + "Error"), "");
    });
  });

  // ---- Submit ----
  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const name = nameInput.value.trim();
    const gmail = gmailInput.value.trim();
    const password = passwordInput.value;

    window.UI.hideFormAlert(alertBox);

    // Client-side validation. The backend hashes with bcrypt and rejects
    // duplicate Gmail addresses with a 400.
    const nameError = name.length >= 2 ? "" : "Please enter your full name.";
    const gmailError = isValidEmail(gmail)
      ? ""
      : "Please enter a valid Gmail address.";
    const passwordError =
      password.length >= 6 ? "" : "Password must be at least 6 characters.";

    window.UI.setFieldError(nameInput, window.UI.byId("nameError"), nameError);
    window.UI.setFieldError(gmailInput, window.UI.byId("gmailError"), gmailError);
    window.UI.setFieldError(
      passwordInput,
      window.UI.byId("passwordError"),
      passwordError
    );

    if (nameError || gmailError || passwordError) return;

    const restore = window.UI.setButtonLoading(
      signupButton,
      true,
      "Creating account..."
    );

    try {
      const result = await window.api.signup(name, gmail, password);

      window.UI.showFormAlert(
        alertBox,
        "success",
        result.message || "Account created successfully."
      );
      window.UI.showToast(
        "Your account is ready. Please log in.",
        "success",
        "Account created"
      );

      restore();
      form.reset();
      strengthBar.style.width = "0";
      strengthLabel.textContent = "Use at least 6 characters.";

      // Give the user a moment to see the confirmation, then send them to login.
      setTimeout(function () {
        window.location.replace("login.html?registered=1");
      }, 1600);
    } catch (error) {
      restore();
      window.UI.showFormAlert(alertBox, "error", error.message);
      // "Gmail already exists" comes back as a 400 — focus the offending field.
      if (error.status === 400) gmailInput.focus();
    }
  });

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  /** Rough strength estimate used only for the meter under the password field. */
  function scorePassword(value) {
    if (!value) {
      return { percent: 0, tone: "", label: "Use at least 6 characters." };
    }

    let score = 0;
    if (value.length >= 6) score += 25;
    if (value.length >= 10) score += 20;
    if (/[A-Z]/.test(value)) score += 15;
    if (/[0-9]/.test(value)) score += 15;
    if (/[^A-Za-z0-9]/.test(value)) score += 15;
    if (/[a-z]/.test(value)) score += 10;

    if (score <= 45) return { percent: 35, tone: "is-danger", label: "Weak password" };
    if (score <= 70) return { percent: 65, tone: "is-warning", label: "Fair password" };
    return { percent: 100, tone: "is-success", label: "Strong password" };
  }
});