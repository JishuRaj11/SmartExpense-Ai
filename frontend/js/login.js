/* ==========================================================================
   SmartExpenses AI — Login page logic
   --------------------------------------------------------------------------
   Flow:
     1. POST /login through api.js (which stores the JWT in localStorage)
     2. On success redirect to the page the user originally wanted
     3. On failure show a friendly message — never a raw JS error
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  // Already signed in? checkAuthentication() redirects to the dashboard.
  checkAuthentication();

  const form = window.UI.byId("loginForm");
  const gmailInput = window.UI.byId("gmail");
  const passwordInput = window.UI.byId("password");
  const loginButton = window.UI.byId("loginButton");
  const alertBox = window.UI.byId("formAlert");

  // ---- Tell the user when they were bounced here for an expired session ----
  const params = new URLSearchParams(window.location.search);
  if (params.get("expired") === "1") {
    window.UI.showFormAlert(
      alertBox,
      "info",
      "Your session expired. Please log in again to continue."
    );
  } else if (params.get("registered") === "1") {
    window.UI.showFormAlert(
      alertBox,
      "success",
      "Account created. Please log in to continue."
    );
  }

  // ---- Password visibility toggle ----
  const toggleButton = window.UI.byId("togglePassword");
  if (toggleButton) {
    toggleButton.addEventListener("click", function () {
      const isHidden = passwordInput.type === "password";
      passwordInput.type = isHidden ? "text" : "password";
      toggleButton.setAttribute("aria-label", isHidden ? "Hide password" : "Show password");
    });
  }

  // ---- Clear a field's error as soon as the user edits it ----
  [gmailInput, passwordInput].forEach(function (input) {
    input.addEventListener("input", function () {
      window.UI.setFieldError(input, window.UI.byId(input.id + "Error"), "");
    });
  });

  // ---- Submit ----
  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    const gmail = gmailInput.value.trim();
    const password = passwordInput.value;

    window.UI.hideFormAlert(alertBox);

    // Client-side checks first, so an empty form never hits the network.
    const gmailError = isValidEmail(gmail)
      ? ""
      : "Please enter a valid Gmail address.";
    const passwordError = password ? "" : "Please enter your password.";

    window.UI.setFieldError(gmailInput, window.UI.byId("gmailError"), gmailError);
    window.UI.setFieldError(passwordInput, window.UI.byId("passwordError"), passwordError);

    if (gmailError || passwordError) return;

    const restore = window.UI.setButtonLoading(loginButton, true, "Signing in...");

    try {
      // Stores the JWT in localStorage before resolving.
      const user = await loginUser(gmail, password);

      window.UI.showToast(
        "Welcome back" + (user && user.name ? ", " + user.name : "") + "!",
        "success",
        "Signed in"
      );

      // Return to whichever protected page sent the user here.
      const destination = Auth.safeReturnPage(Auth.getReturnPage());
      Auth.clearReturnPage();

      // Small delay so the success toast is visible before navigating.
      setTimeout(function () {
        window.location.replace(destination);
      }, 450);
    } catch (error) {
      restore();
      window.UI.showFormAlert(alertBox, "error", error.message);
      passwordInput.value = "";
      passwordInput.focus();
    }
  });

  /** Simple email shape check — the backend does the real validation. */
  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }
});