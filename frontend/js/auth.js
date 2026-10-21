/* ==========================================================================
   SmartExpenses AI — Authentication module
   --------------------------------------------------------------------------
   Required functions:
     loginUser(email, password)   -> POST /login, saves the JWT
     logoutUser()                 -> clears the JWT, returns to login.html
     isLoggedIn()                 -> is a token present?
     getToken()                   -> read the JWT
     checkAuthentication()        -> gate for protected pages

   Token storage: localStorage, under the key exported from api.js so the
   key is never written twice.
   ========================================================================== */

/** Page the user was trying to reach, so login can return them there. */
const RETURN_PAGE_KEY = "smartexpenses.returnTo";

/** Pages that must never run while signed out. */
const PROTECTED_PAGES = [
  "dashboard.html",
  "expenses.html",
  "add-expense.html",
  "edit-expense.html",
  "analytics.html",
  "budget.html",
];

/* --------------------------------------------------------------------------
   TOKEN ACCESS
   -------------------------------------------------------------------------- */

/** Read the JWT from localStorage. Returns null when signed out. */
function getToken() {
  return window.api.getStoredToken();
}

/** True when a token exists in localStorage. */
function isLoggedIn() {
  const token = getToken();
  return typeof token === "string" && token.length > 0;
}

/** Cached user profile saved alongside the token by api.login(). */
function getCurrentUser() {
  return window.api.getStoredUser();
}

/** Remember the page to open once the user has logged in. */
function setReturnPage(page) {
  try {
    localStorage.setItem(RETURN_PAGE_KEY, page);
  } catch (err) {
    /* non-fatal */
  }
}

function getReturnPage() {
  try {
    return localStorage.getItem(RETURN_PAGE_KEY) || "dashboard.html";
  } catch (err) {
    return "dashboard.html";
  }
}

function clearReturnPage() {
  try {
    localStorage.removeItem(RETURN_PAGE_KEY);
  } catch (err) {
    /* non-fatal */
  }
}

/** Only allow known internal pages, so `returnTo` cannot become an open redirect. */
function safeReturnPage(page) {
  const target = String(page || "").trim();
  if (!target) return "dashboard.html";
  if (PROTECTED_PAGES.indexOf(target) !== -1) return target;
  return "dashboard.html";
}

/* --------------------------------------------------------------------------
   LOGIN / LOGOUT
   -------------------------------------------------------------------------- */

/**
 * Log in through the FastAPI backend and persist the JWT.
 *
 * @param {string} gmail     email address entered on the login form
 * @param {string} password  plain-text password (sent over fetch, never stored)
 * @returns {Promise<object>} the user profile returned by the backend
 * @throws  {ApiError} with a user-safe message when login fails
 *          - 404 "User not found"
 *          - 401 "Incorrect password"
 */
async function loginUser(gmail, password) {
  const result = await window.api.login(gmail, password);

  // api.login() has already written the token and user into localStorage.
  return result.user || null;
}

/**
 * Sign out: remove the JWT and go back to login.html.
 * Safe to call from an inline onclick handler.
 */
function logoutUser() {
  window.api.clearStoredToken();
  clearReturnPage();

  try {
    window.location.replace("login.html");
  } catch (err) {
    window.location.href = "login.html";
  }
}

/* --------------------------------------------------------------------------
   PAGE GUARD
   -------------------------------------------------------------------------- */

/** Name of the current HTML file, e.g. "expenses.html". */
function currentPageName() {
  const path = window.location.pathname;
  const file = path.substring(path.lastIndexOf("/") + 1);
  return file || "index.html";
}

/** True when the current page requires a JWT. */
function isProtectedPage() {
  return PROTECTED_PAGES.indexOf(currentPageName()) !== -1;
}

/**
 * Gate for protected pages.
 *
 * Called at the top of every protected page script:
 *   - no token  -> remember the page and redirect to login.html
 *   - token set -> continue
 *
 * @param {boolean} [redirectTo] optional page to send the user to when signed in
 */
function checkAuthentication(redirectTo) {
  if (!isLoggedIn()) {
    if (isProtectedPage()) {
      setReturnPage(currentPageName());
      window.location.replace("login.html");
    }
    return false;
  }

  // Already authenticated: skip login / signup.
  const page = currentPageName();
  if (page === "login.html" || page === "signup.html") {
    const target = safeReturnPage(
      getReturnPage() || (redirectTo || "dashboard.html")
    );
    window.location.replace(target);
    return false;
  }

  return true;
}

/* --------------------------------------------------------------------------
   EXPORTS  (both window.* for page scripts and window.Auth for modules)
   -------------------------------------------------------------------------- */
window.Auth = {
  loginUser: loginUser,
  logoutUser: logoutUser,
  isLoggedIn: isLoggedIn,
  getToken: getToken,
  checkAuthentication: checkAuthentication,
  getCurrentUser: getCurrentUser,
  setReturnPage: setReturnPage,
  getReturnPage: getReturnPage,
  clearReturnPage: clearReturnPage,
  safeReturnPage: safeReturnPage,
  isProtectedPage: isProtectedPage,
  currentPageName: currentPageName,
  PROTECTED_PAGES: PROTECTED_PAGES,
};

// Named globals so page scripts read naturally: checkAuthentication(); logoutUser();
window.loginUser = loginUser;
window.logoutUser = logoutUser;
window.isLoggedIn = isLoggedIn;
window.getToken = getToken;
window.checkAuthentication = checkAuthentication;