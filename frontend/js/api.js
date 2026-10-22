/* ==========================================================================
   SmartExpenses AI — API Service Layer
   --------------------------------------------------------------------------
   The ONLY place the backend URL is declared. Everything else imports from
   here, so the URL is never repeated in another file.

   The URL is resolved at runtime (see "CONFIGURATION" below), so the same
   files work unchanged on localhost, on GitHub Pages and behind any domain.

   CORS
   ----
   `main.py` enables FastAPI's CORSMiddleware and reads the allowed origins
   from the CORS_ORIGINS environment variable. A front-end served from a
   different origin than the API — the normal setup on GitHub Pages — is
   therefore blocked by the browser unless that origin is listed:

       CORS_ORIGINS=https://<user>.github.io

   With CORS_ORIGINS unset the backend allows every origin, which is fine
   for local development but should be tightened before going live.
   ========================================================================== */

/* --------------------------------------------------------------------------
   CONFIGURATION — single source of truth
   --------------------------------------------------------------------------
   The base URL is resolved once, when this file loads, in this order
   (first match wins):

     1. ?api=<url>        query string override, for one-off testing
     2. localStorage      "smartexpenses.apiBaseUrl", persists across pages
     3. config.js         window.APP_CONFIG.API_BASE_URL  <- the deployer
     4. automatic         localhost -> http://127.0.0.1:8001
                          anything else -> the same origin as this page

   An empty base URL means "same origin", so a request to /expenses goes to
   https://<host>/expenses rather than https://<host>/api/expenses.
   -------------------------------------------------------------------------- */
const API_BASE_URL = resolveApiBaseUrl();

const TOKEN_KEY = "smartexpenses.token";
const USER_KEY = "smartexpenses.user";

/** Where a saved override of the base URL is kept between pages. */
const API_BASE_URL_STORAGE_KEY = "smartexpenses.apiBaseUrl";

/** The backend used while developing on this machine. */
const LOCAL_API_BASE_URL = "http://127.0.0.1:8001";

/* Budget cache: `GET /budget` answers 404 until a budget exists for a month,
   so the value returned by `POST /budget` is cached as the read path. */
const BUDGET_CACHE_PREFIX = "smartexpenses.budget.";

const REQUEST_TIMEOUT_MS = 20000;

/* --------------------------------------------------------------------------
   BASE URL RESOLUTION
   -------------------------------------------------------------------------- */

/**
 * Clean up a base URL: drop trailing slashes and turn the "same-origin"
 * keyword into an empty string, which means "use the current origin".
 */
function normalizeApiBaseUrl(value) {
  const raw = String(value == null ? "" : value).trim();
  if (!raw || raw.toLowerCase() === "same-origin") return "";
  return raw.replace(/\/+$/, "");
}

/** True when the page is being opened from a development machine. */
function isLocalDevelopmentHost() {
  const host = window.location.hostname;
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0" ||
    /\.local$/i.test(host)
  );
}

/** The `?api=` override, or null when the query string does not carry one. */
function readQueryApiBaseUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("api");
    if (raw === null || !String(raw).trim()) return null;
    return normalizeApiBaseUrl(raw);
  } catch (err) {
    return null;
  }
}

/** The saved override, or null when nothing has been saved. */
function readStoredApiBaseUrl() {
  try {
    const raw = localStorage.getItem(API_BASE_URL_STORAGE_KEY);
    if (raw === null) return null;
    return normalizeApiBaseUrl(raw);
  } catch (err) {
    return null;
  }
}

/**
 * The value from `config.js`.
 *
 * Returns null when there is no configuration file at all, and an empty
 * string when the file asks for automatic behaviour.
 */
function readConfiguredApiBaseUrl() {
  const config = window.APP_CONFIG;
  if (!config) return null;
  if (config.API_BASE_URL === undefined || config.API_BASE_URL === null) {
    return null;
  }
  return normalizeApiBaseUrl(config.API_BASE_URL);
}

/** The fallback used when nothing has been configured: local dev or same origin. */
function automaticApiBaseUrl() {
  return isLocalDevelopmentHost() ? LOCAL_API_BASE_URL : "";
}

/** Work out which backend this page should talk to. */
function resolveApiBaseUrl() {
  const queryOverride = readQueryApiBaseUrl();
  if (queryOverride !== null) return queryOverride;

  const storedOverride = readStoredApiBaseUrl();
  if (storedOverride !== null) return storedOverride;

  const configured = readConfiguredApiBaseUrl();
  if (configured === null) return automaticApiBaseUrl();
  if (configured === "") return automaticApiBaseUrl();

  return configured;
}

/**
 * Remember a base URL for every page of this site.
 *
 * @param {string} url  e.g. "https://api.example.com", or "" for same origin
 */
function setApiBaseUrl(url) {
  try {
    localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalizeApiBaseUrl(url));
  } catch (err) {
    /* storage unavailable (private mode) — the value is simply not persisted */
  }
  return normalizeApiBaseUrl(url);
}

/** Forget a saved override and fall back to `config.js`. */
function clearApiBaseUrl() {
  try {
    localStorage.removeItem(API_BASE_URL_STORAGE_KEY);
  } catch (err) {
    /* nothing to clean up */
  }
}

/** The backend URL, spelled out for error messages. */
function describeApiBaseUrl() {
  return API_BASE_URL || window.location.origin;
}

/* --------------------------------------------------------------------------
   ENDPOINT STATUS
   Every endpoint the front-end uses exists in the FastAPI backend.

     POST /login                            ✔  auth.py
     POST /register                         ✔  auth.py
     POST /predict-category                 ✔  main.py
     GET  /predict-spending                 ✔  main.py
     POST /expenses                         ✔  main.py
     GET  /expenses[?category=&date=]        ✔  main.py
     GET  /expenses/{id}                    ✔  main.py
     PUT  /expenses/{id}                    ✔  main.py
     DELETE /expenses/{id}                  ✔  main.py
     GET  /dashboard                        ✔  main.py
     GET  /analytics/category               ✔  main.py
     GET  /analytics/monthly                ✔  main.py
     GET  /analytics/daily                  ✔  main.py
     GET  /budget                           ✔  main.py
     GET  /budgets                          ✔  main.py
     POST /budget                           ✔  main.py
     PUT  /budget                           ✔  main.py
     PUT  /budget/{month}                   ✔  main.py
     DELETE /budget/{month}                 ✔  main.py

   The dashboard and analytics helpers still fall back to computing the same
   figure from GET /expenses when their endpoint is unreachable, so the UI
   keeps working against an older backend. The figures always come from real
   backend data — never hardcoded numbers.
   -------------------------------------------------------------------------- */

/* --------------------------------------------------------------------------
   ERRORS
   -------------------------------------------------------------------------- */

/**
 * Error thrown by every failed request. Carries the HTTP status so callers can
 * branch on 401 / 404 without string matching.
 */
class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

/** Map an HTTP status + FastAPI `detail` into a message safe to show a user. */
function friendlyMessage(status, detail) {
  const raw = typeof detail === "string" ? detail.trim() : "";

  // FastAPI validation errors arrive as an array of objects.
  if (Array.isArray(detail) && detail.length) {
    const first = detail[0];
    if (first && first.msg) {
      return String(first.msg).replace(/^Value error,\s*/, "");
    }
    return "Please check the values you entered and try again.";
  }

  switch (status) {
    case 400:
      return raw || "That request was not valid. Please try again.";
    case 401:
      return raw || "Your session has expired. Please log in again.";
    case 403:
      return raw || "You do not have permission to do that.";
    case 404:
      return raw || "We could not find what you were looking for.";
    case 405:
      return "That action is not supported by the server yet.";
    case 422:
      return raw || "Please check the values you entered and try again.";
    case 500:
      return "The server ran into a problem. Please try again in a moment.";
    case 502:
    case 503:
      return "The server is unavailable right now. Please try again shortly.";
    default:
      return raw || "Something went wrong. Please try again.";
  }
}

/** The network / CORS / server-down message, including the base URL for clarity. */
function networkMessage() {
  return (
    "Cannot reach the server at " +
    describeApiBaseUrl() +
    ". Make sure the FastAPI backend is running, that it allows this " +
    "origin (CORS_ORIGINS), and that the API_BASE_URL in config.js is " +
    "correct."
  );
}

/* --------------------------------------------------------------------------
   TOKEN ACCESS (used by both api.js and auth.js)
   -------------------------------------------------------------------------- */

function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch (err) {
    return null;
  }
}

function setStoredToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch (err) {
    /* storage unavailable (private mode) — request will fail later with 401 */
  }
}

function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch (err) {
    /* nothing to clean up */
  }
}

function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
}

function setStoredUser(user) {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user || null));
  } catch (err) {
    /* non-fatal */
  }
}

/* --------------------------------------------------------------------------
   CORE REQUEST FUNCTION — everything goes through fetch()
   -------------------------------------------------------------------------- */

/**
 * Perform a JSON request against the FastAPI backend.
 *
 * @param {string} path            e.g. "/expenses"
 * @param {object} [options]
 * @param {string} [options.method]        GET / POST / PUT / DELETE
 * @param {object} [options.body]          JSON payload
 * @param {object} [options.query]         query string parameters
 * @param {boolean} [options.auth]         attach the JWT (default true)
 * @param {boolean} [options.redirect401]   clear token + go to login on 401
 * @param {boolean} [options.raw]          return the raw Response instead
 * @returns {Promise<any>} parsed JSON body
 * @throws  {ApiError} on any non-2xx status, timeout, or network failure
 */
async function request(path, options = {}) {
  const {
    method = "GET",
    body = null,
    query = null,
    auth = true,
    redirect401 = auth,
    raw = false,
  } = options;

  // ---- Build the full URL (base URL lives only here) ----
  let url = API_BASE_URL + path;

  if (query) {
    const params = new URLSearchParams();
    Object.keys(query).forEach(function (key) {
      const value = query[key];
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, value);
      }
    });
    const qs = params.toString();
    if (qs) url += "?" + qs;
  }

  // ---- Headers: JSON + Bearer token when required ----
  const headers = { Accept: "application/json" };
  if (body !== null) headers["Content-Type"] = "application/json";
  if (auth) {
    const token = getStoredToken();
    if (token) headers["Authorization"] = "Bearer " + token;
  }

  // ---- Timeout so a hung request never blocks the UI forever ----
  const controller = new AbortController();
  const timer = setTimeout(function () {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method: method,
      headers: headers,
      body: body === null ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    // AbortError means our own timeout fired.
    if (err && err.name === "AbortError") {
      throw new ApiError("The server took too long to respond. Please try again.");
    }
    throw new ApiError(networkMessage(), 0);
  }

  clearTimeout(timer);

  if (raw) return response;

  // ---- Parse the body; FastAPI always answers with JSON here ----
  let data = null;
  let parseFailed = false;
  try {
    const text = await response.text();
    if (text) data = JSON.parse(text);
  } catch (err) {
    parseFailed = true;
  }

  if (!response.ok) {
    const message = friendlyMessage(response.status, data ? data.detail : null);

    // Expired / invalid JWT: drop it and send the user back to login.
    // Skipped for login & signup, where a 401 is just bad credentials.
    if (response.status === 401 && redirect401) {
      handleExpiredSession();
    }

    throw new ApiError(message, response.status, data);
  }

  // A 200 with an unparsable body is a server problem, not a silent success.
  if (parseFailed && data === null) {
    throw new ApiError(
      "The server sent a response we could not read.",
      response.status
    );
  }

  return data;
}

/** Shared 401 handler: clear the JWT and bounce to the login page. */
function handleExpiredSession() {
  clearStoredToken();
  if (!window.location.pathname.endsWith("login.html")) {
    window.location.href = "login.html?expired=1";
  }
}

/* --------------------------------------------------------------------------
   ENDPOINT PROBE
   Used by the sections whose dedicated endpoints do not exist yet.
   -------------------------------------------------------------------------- */

/**
 * Try a not-yet-implemented endpoint. Resolves to `null` when the backend does
 * not expose it (404 / 405), so the caller can compute the value instead.
 * Real failures (401, 500, network) still throw.
 */
async function tryEndpoint(path, options = {}) {
  try {
    return await request(path, options);
  } catch (err) {
    const missing = err.status === 404 || err.status === 405;
    if (missing) return null;
    throw err;
  }
}

/* --------------------------------------------------------------------------
   RESPONSE NORMALISERS
   -------------------------------------------------------------------------- */

/**
 * `main.py` returns HTTP 200 with `{"Message": "Expense not found"}` instead of
 * a 404, so the message is checked explicitly.
 */
function isNotFoundPayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  const message = String(payload.Message || payload.message || "");
  return /not found/i.test(message);
}

/** Accept both `Expense` / `expense` and `Expenses` / `expenses` keys. */
function unwrapExpense(payload) {
  if (!payload || typeof payload !== "object") return null;
  return payload.Expense || payload.expense || null;
}

function unwrapExpenseList(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const list = payload.Expenses || payload.expenses || payload.items;
  return Array.isArray(list) ? list : [];
}

/** Normalise an expense so the UI always sees id/title/amount/category/date. */
function normalizeExpense(raw) {
  if (!raw || typeof raw !== "object") return null;
  const amount = Number(raw.amount);
  return {
    id: raw.id,
    title: String(raw.title == null ? "" : raw.title),
    amount: Number.isFinite(amount) ? amount : 0,
    category: String(raw.category == null ? "Other" : raw.category),
    date: String(raw.date == null ? "" : raw.date).slice(0, 10),
  };
}

/* --------------------------------------------------------------------------
   SMALL DATE / NUMBER HELPERS
   -------------------------------------------------------------------------- */

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "2026-03-09" -> "March" (safe when the string is malformed). */
function monthNameFromDate(dateStr) {
  const parts = String(dateStr || "").split("-");
  const monthIndex = Number(parts[1]) - 1;
  return MONTH_NAMES[monthIndex] || "Unknown";
}

/** Today's date as YYYY-MM-DD in local time (avoids UTC off-by-one). */
function todayISODate() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return now.getFullYear() + "-" + month + "-" + day;
}

/** Current month as YYYY-MM, the key used by the budgets table. */
function currentMonthKey() {
  return todayISODate().slice(0, 7);
}

/* ==========================================================================
   AUTH ENDPOINTS
   ========================================================================== */

/**
 * POST /login  (backend/auth.py)
 * Sends credentials, receives the JWT, stores it in localStorage and returns
 * the user profile.
 */
async function login(gmail, password) {
  // auth:false + redirect401:false so a wrong password does not wipe the
  // session or bounce the user to the login page.
  const data = await request("/login", {
    method: "POST",
    auth: false,
    redirect401: false,
    body: { gmail: gmail, password: password },
  });

  const token = (data && (data.access_token || data.accessToken || data.token)) || null;
  const user = (data && data.User) || null;

  if (!token) {
    throw new ApiError("Login succeeded but no token was returned.", 0);
  }

  setStoredToken(token);
  setStoredUser(user);

  return { token: token, user: user };
}

/**
 * POST /register  (backend/auth.py)
 */
async function signup(name, gmail, password) {
  const data = await request("/register", {
    method: "POST",
    auth: false,
    redirect401: false,
    body: { name: name, gmail: gmail, password: password },
  });

  return {
    message: (data && data.Message) || "Account created successfully.",
    user: (data && data.User) || null,
  };
}

/* ==========================================================================
   EXPENSE ENDPOINTS
   ========================================================================== */

/**
 * POST /predict-category  (backend/main.py)
 * Asks the ML model to guess a category from an expense title. Public endpoint —
 * no JWT needed. Returns { category, confidence } where confidence is 0..1.
 */
async function predictCategory(title) {
  const data = await request("/predict-category", {
    method: "POST",
    auth: false,
    redirect401: false,
    body: { title: title },
  });

  return {
    category: (data && data.predicted_category) || null,
    confidence: Number((data && data.confidence) || 0),
  };
}

/**
 * GET /predict-spending  (backend/main.py)
 * Next month spending prediction for the currently authenticated user.
 * Uses JWT; returns user-specific prediction. If insufficient data, backend
 * returns { status: "insufficient_data", ... } and we pass it through.
 */
async function getSpendingPrediction() {
  const data = await request("/predict-spending", {
    method: "GET",
  });
  return data;
}

/**
 * GET /expenses[?category=&date=]  (backend/main.py)
 * Both filters are optional and are applied server-side by main.py.
 */
async function getExpenses(filters = {}) {
  const data = await request("/expenses", {
    query: {
      category: filters.category || "",
      date: filters.date || "",
    },
  });

  return unwrapExpenseList(data)
    .map(normalizeExpense)
    .filter(Boolean);
}

/** GET /expenses/{id} — used to pre-fill the edit form. */
async function getExpenseById(id) {
  const data = await request("/expenses/" + encodeURIComponent(id));

  if (isNotFoundPayload(data) || !unwrapExpense(data)) {
    throw new ApiError("That expense no longer exists.", 404);
  }

  return normalizeExpense(unwrapExpense(data));
}

/** POST /expenses — `date` must be YYYY-MM-DD for the backend's `date` type. */
async function createExpense(expense) {
  const data = await request("/expenses", {
    method: "POST",
    body: {
      title: expense.title,
      amount: Number(expense.amount),
      category: expense.category,
      date: expense.date,
    },
  });

  return normalizeExpense(unwrapExpense(data));
}

/** PUT /expenses/{id} */
async function updateExpense(id, expense) {
  const data = await request("/expenses/" + encodeURIComponent(id), {
    method: "PUT",
    body: {
      title: expense.title,
      amount: Number(expense.amount),
      category: expense.category,
      date: expense.date,
    },
  });

  if (isNotFoundPayload(data) || !unwrapExpense(data)) {
    throw new ApiError("That expense no longer exists.", 404);
  }

  return normalizeExpense(unwrapExpense(data));
}

/** DELETE /expenses/{id} */
async function deleteExpense(id) {
  const data = await request("/expenses/" + encodeURIComponent(id), {
    method: "DELETE",
  });

  if (isNotFoundPayload(data)) {
    throw new ApiError("That expense no longer exists.", 404);
  }

  return { message: (data && data.Message) || "Expense deleted." };
}

/**
 * Loads the full expense list once and re-applies the filters client-side.
 * Used by the Expenses page so date/category filtering stays instant while the
 * server-side query parameters stay authoritative on reload.
 */
async function getExpensesFiltered(filters = {}) {
  const all = await getExpenses();

  const wantedCategory = filters.category || "";
  const wantedDate = filters.date || "";

  return all.filter(function (item) {
    if (wantedCategory && item.category !== wantedCategory) return false;
    if (wantedDate && item.date !== wantedDate) return false;
    return true;
  });
}

/* ==========================================================================
   DASHBOARD
   ========================================================================== */

/**
 * GET /dashboard
 *
 * Backend endpoint required — `main.py` has no /dashboard route.
 *
 * Strategy: try the endpoint first (so the app switches to server-side
 * aggregation automatically the moment it exists), otherwise derive every
 * figure from the real GET /expenses data plus the cached budget.
 */
async function getDashboard() {
  const remote = await tryEndpoint("/dashboard");

  if (remote && typeof remote === "object") {
    return {
      source: "server",
      totalExpenses: numberOr(remote.total_expenses, 0),
      thisMonth: numberOr(remote.this_month, 0),
      today: numberOr(remote.today, 0),
      budget: numberOr(remote.budget, 0),
      remainingBudget: numberOr(remote.remaining_budget, 0),
      budgetUsedPercentage: numberOr(remote.budget_used_percentage, 0),
      topCategory: remote.top_category || "—",
      topCategoryAmount: numberOr(remote.top_category_amount, 0),
      recentTransactions: Array.isArray(remote.recent_transactions)
        ? remote.recent_transactions.map(normalizeExpense).filter(Boolean)
        : [],
      monthlySummary: Array.isArray(remote.monthly_summary)
        ? remote.monthly_summary
        : [],
    };
  }

  // ---- Fallback: computed from GET /expenses (real backend data) ----
  const expenses = await getExpenses();
  const sorted = expenses.slice().sort(sortByDateDesc);
  const today = todayISODate();
  const monthKey = currentMonthKey();

  const totalExpenses = expenses.reduce(sumOf("amount"), 0);
  const thisMonth = expenses
    .filter(function (item) {
      return item.date.slice(0, 7) === monthKey;
    })
    .reduce(sumOf("amount"), 0);
  const todayTotal = expenses
    .filter(function (item) {
      return item.date === today;
    })
    .reduce(sumOf("amount"), 0);

  const budget = getCachedBudget(monthKey);
  const remainingBudget = budget > 0 ? budget - thisMonth : 0;
  const budgetUsedPercentage =
    budget > 0 ? Math.round((thisMonth / budget) * 100) : 0;

  // The category with the highest total, plus that total, for the dashboard card.
  const totals = categoryTotals(expenses);
  const topCategory = topCategoryOf(expenses);
  const topCategoryAmount = topCategory === "—" ? 0 : totals[topCategory] || 0;

  return {
    source: "computed",
    totalExpenses: totalExpenses,
    thisMonth: thisMonth,
    today: todayTotal,
    budget: budget,
    remainingBudget: remainingBudget,
    budgetUsedPercentage: budgetUsedPercentage,
    topCategory: topCategory,
    topCategoryAmount: topCategoryAmount,
    recentTransactions: sorted.slice(0, 6),
    monthlySummary: monthlyTotals(expenses),
  };
}

/** Newest expense first; ties broken by id so the order is stable. */
function sortByDateDesc(a, b) {
  if (a.date !== b.date) return a.date < b.date ? 1 : -1;
  return (b.id || 0) - (a.id || 0);
}

/** `arr.reduce(sumOf("amount"), 0)` helper. */
function sumOf(key) {
  return function (total, item) {
    return total + (Number(item[key]) || 0);
  };
}

function numberOr(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

/** Category with the highest total spend, or "—" when there are no expenses. */
function topCategoryOf(expenses) {
  if (!expenses.length) return "—";
  const totals = categoryTotals(expenses);
  let best = "—";
  let bestValue = -1;
  Object.keys(totals).forEach(function (key) {
    if (totals[key] > bestValue) {
      bestValue = totals[key];
      best = key;
    }
  });
  return best;
}

function categoryTotals(expenses) {
  const totals = {};
  expenses.forEach(function (item) {
    const key = item.category || "Other";
    totals[key] = (totals[key] || 0) + (Number(item.amount) || 0);
  });
  return totals;
}

function monthlyTotals(expenses) {
  const totals = {};
  expenses.forEach(function (item) {
    const key = item.date.slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(key)) return;
    totals[key] = (totals[key] || 0) + (Number(item.amount) || 0);
  });
  return Object.keys(totals)
    .sort()
    .map(function (key) {
      return {
        key: key,
        label: monthNameFromDate(key + "-01"),
        year: Number(key.slice(0, 4)),
        total: totals[key],
      };
    });
}

/* ==========================================================================
   ANALYTICS ENDPOINTS
   ========================================================================== */

/**
 * GET /analytics/category
 *
 * Backend endpoint required.
 * Expected shape: {"Food": 4500, "Travel": 2500, ...}
 * Fallback derives the identical map from GET /expenses.
 */
async function getCategoryAnalytics() {
  const remote = await tryEndpoint("/analytics/category");

  if (remote && typeof remote === "object" && !Array.isArray(remote)) {
    const totals = {};
    Object.keys(remote).forEach(function (key) {
      totals[key] = numberOr(remote[key], 0);
    });
    return { source: "server", totals: totals };
  }

  const expenses = await getExpenses();
  return { source: "computed", totals: categoryTotals(expenses) };
}

/**
 * GET /analytics/monthly
 *
 * Backend endpoint required.
 * Expected shape: {"January": 8000, "February": 6500, ...}
 * Fallback groups real expenses by the month part of their date.
 */
async function getMonthlyAnalytics() {
  const remote = await tryEndpoint("/analytics/monthly");

  if (remote && typeof remote === "object" && !Array.isArray(remote)) {
    const totals = {};
    Object.keys(remote).forEach(function (key) {
      totals[key] = numberOr(remote[key], 0);
    });
    return { source: "server", totals: totals };
  }

  const expenses = await getExpenses();
  const totals = {};
  monthlyTotals(expenses).forEach(function (row) {
    totals[row.label] = row.total;
  });
  return { source: "computed", totals: totals };
}

/**
 * GET /analytics/daily
 *
 * Backend endpoint required.
 * Expected shape: {"01": 300, "02": 450, ...}
 * Fallback groups this month's real expenses by day-of-month.
 */
async function getDailyAnalytics() {
  const remote = await tryEndpoint("/analytics/daily");

  if (remote && typeof remote === "object" && !Array.isArray(remote)) {
    const totals = {};
    Object.keys(remote).forEach(function (key) {
      totals[String(key)] = numberOr(remote[key], 0);
    });
    return { source: "server", totals: totals };
  }

  const expenses = await getExpenses();
  const monthKey = currentMonthKey();
  const totals = {};
  expenses.forEach(function (item) {
    if (item.date.slice(0, 7) !== monthKey) return;
    const day = item.date.slice(8, 10);
    if (!day) return;
    totals[day] = (totals[day] || 0) + (Number(item.amount) || 0);
  });
  return { source: "computed", totals: totals };
}

/** Combined fetch for the Analytics page — one place to handle failures. */
async function getAnalyticsBundle() {
  const [category, monthly, daily, expenses] = await Promise.all([
    getCategoryAnalytics(),
    getMonthlyAnalytics(),
    getDailyAnalytics(),
    getExpenses(),
  ]);

  return { category: category, monthly: monthly, daily: daily, expenses: expenses };
}

/* ==========================================================================
   BUDGET ENDPOINTS
   ========================================================================== */

/** Cache key for a month's budget, e.g. "smartexpenses.budget.2026-03". */
function budgetCacheKey(month) {
  return BUDGET_CACHE_PREFIX + month;
}

/**
 * GET /budget
 *
 * Backend endpoint required — `main.py` only exposes POST /budget.
 *
 * Until a read endpoint exists, the budget created through POST /budget is
 * cached in localStorage from the server's own response, so the value shown is
 * still the value the backend accepted.
 */
async function getBudget(month) {
  const target = month || currentMonthKey();

  const remote = await tryEndpoint("/budget", { query: { month: target } });

  if (remote) {
    const raw = remote.Budget || remote.budget || remote;
    if (raw && typeof raw === "object") {
      const amount = numberOr(raw.amount, 0);
      setCachedBudget(target, amount);
      return { month: target, amount: amount, source: "server" };
    }
  }

  const cached = getCachedBudget(target);
  return { month: target, amount: cached, source: cached > 0 ? "cache" : "none" };
}

/** POST /budget — creates the budget for a month. */
async function setBudget(amount, month) {
  const target = month || currentMonthKey();

  const data = await request("/budget", {
    method: "POST",
    body: { amount: Number(amount), month: target },
  });

  const raw = (data && (data.Budget || data.budget)) || null;
  const accepted = raw ? numberOr(raw.amount, Number(amount)) : Number(amount);

  setCachedBudget(target, accepted);

  return { month: target, amount: accepted };
}

/**
 * PUT /budget
 *
 * Backend endpoint required — there is no update route yet. main.py's budget
 * table is append-only (POST /budget always inserts a row), so an "update"
 * is performed by posting the new amount for the month, which is the only
 * write path the backend actually supports.
 */
async function updateBudget(amount, month) {
  const target = month || currentMonthKey();

  const remote = await tryEndpoint("/budget/" + encodeURIComponent(target), {
    method: "PUT",
    body: { amount: Number(amount) },
  });

  if (remote) {
    const raw = remote.Budget || remote.budget || remote;
    const accepted = raw ? numberOr(raw.amount, Number(amount)) : Number(amount);
    setCachedBudget(target, accepted);
    return { month: target, amount: accepted, source: "server" };
  }

  const result = await setBudget(amount, target);
  return { month: result.month, amount: result.amount, source: "post-fallback" };
}

function setCachedBudget(month, amount) {
  try {
    localStorage.setItem(
      budgetCacheKey(month),
      JSON.stringify({ amount: Number(amount) || 0, savedAt: new Date().toISOString() })
    );
  } catch (err) {
    /* non-fatal */
  }
}

function getCachedBudget(month) {
  try {
    const raw = localStorage.getItem(budgetCacheKey(month));
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return numberOr(parsed && parsed.amount, 0);
  } catch (err) {
    return 0;
  }
}

/* ==========================================================================
   PUBLIC EXPORTS
   ========================================================================== */
const Api = {
  // config
  API_BASE_URL: API_BASE_URL,
  TOKEN_KEY: TOKEN_KEY,
  USER_KEY: USER_KEY,
  // base URL overrides
  setApiBaseUrl: setApiBaseUrl,
  clearApiBaseUrl: clearApiBaseUrl,
  describeApiBaseUrl: describeApiBaseUrl,
  // errors + low-level helpers
  ApiError: ApiError,
  request: request,
  handleExpiredSession: handleExpiredSession,
  getStoredToken: getStoredToken,
  setStoredToken: setStoredToken,
  clearStoredToken: clearStoredToken,
  getStoredUser: getStoredUser,
  setStoredUser: setStoredUser,
  // auth
  login: login,
  signup: signup,
  // ai category prediction
  predictCategory: predictCategory,
  // spending prediction (next month)
  getSpendingPrediction: getSpendingPrediction,
  // expenses
  getExpenses: getExpenses,
  getExpensesFiltered: getExpensesFiltered,
  getExpenseById: getExpenseById,
  createExpense: createExpense,
  updateExpense: updateExpense,
  deleteExpense: deleteExpense,
  // dashboard
  getDashboard: getDashboard,
  // analytics
  getCategoryAnalytics: getCategoryAnalytics,
  getMonthlyAnalytics: getMonthlyAnalytics,
  getDailyAnalytics: getDailyAnalytics,
  getAnalyticsBundle: getAnalyticsBundle,
  // budget
  getBudget: getBudget,
  setBudget: setBudget,
  updateBudget: updateBudget,
  // date helpers reused by page scripts
  helpers: {
    todayISODate: todayISODate,
    currentMonthKey: currentMonthKey,
    monthNameFromDate: monthNameFromDate,
    categoryTotals: categoryTotals,
    monthlyTotals: monthlyTotals,
    sortByDateDesc: sortByDateDesc,
  },
};

// Also expose globally so page scripts can call `api.getExpenses()`.
window.api = Api;