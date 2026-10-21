/* ==========================================================================
   SmartExpenses AI — Shared UI helpers
   --------------------------------------------------------------------------
   Formatting, category colours, loading / empty / error states, toasts and the
   delete-confirmation modal. Imported by the page scripts so this logic is not
   duplicated in every file.
   ========================================================================== */

/* --------------------------------------------------------------------------
   CONFIGURATION
   -------------------------------------------------------------------------- */

/** Currency used across the app. Change this one value to change it all. */
const CURRENCY_SYMBOL = "₹";

/** The eight categories offered by the backend product. */
const CATEGORIES = [
  "Food",
  "Travel",
  "Shopping",
  "Bills",
  "Entertainment",
  "Education",
  "Health",
  "Other",
];

/** Colour per category — used by chips, ranking bars and chart datasets. */
const CATEGORY_COLORS = {
  Food: "#f97316",
  Travel: "#0ea5e9",
  Shopping: "#ec4899",
  Bills: "#8b5cf6",
  Entertainment: "#14b8a6",
  Education: "#6366f1",
  Health: "#ef4444",
  Other: "#64748b",
};

/** Categorical palette for chart slices (falls back to the 8 category colours). */
const CHART_PALETTE = CATEGORIES.map(function (name) {
  return CATEGORY_COLORS[name];
});

/** Inline SVG icon set (no icon library dependency). */
const ICONS = {
  wallet:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5"/><path d="M16 12h.01"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  clock:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  piggy:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 5H9a6 6 0 0 0-6 6v1"/><path d="M3 12a4 4 0 0 1 4-4h12a2 2 0 0 1 2 2v3a6 6 0 0 1-6 6H9a6 6 0 0 1-6-6v-1Z"/><path d="M16 9h.01"/><path d="M3 9h.01"/></svg>',
  gauge:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="m16.2 7.8-2.1 2.1"/><path d="M20 12a8 8 0 1 0-16 0"/><path d="M12 12l3.5-3.5"/></svg>',
  trend:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 13 4 4L19 7"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/></svg>',
  info:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  inbox:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h5l2 3h4l2-3h5"/><path d="M5.5 5h13l2.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z"/></svg>',
  refresh:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/></svg>',
  logout:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg>',
  target:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
};

/* --------------------------------------------------------------------------
   FORMATTERS
   -------------------------------------------------------------------------- */

/** 12500.5 -> "12,500.50" */
function formatNumber(value, decimals) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  const places = decimals === undefined ? 2 : decimals;
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: places,
    maximumFractionDigits: places,
  });
}

/** 12500.5 -> "₹12,500.50" */
function formatCurrency(value) {
  return CURRENCY_SYMBOL + formatNumber(value);
}

/** 12500.5 -> "₹12.5K" — used where space is tight (stat cards on mobile). */
function formatCompactCurrency(value) {
  const num = Number(value) || 0;
  const abs = Math.abs(num);
  if (abs >= 10000000) return CURRENCY_SYMBOL + (num / 10000000).toFixed(2) + "Cr";
  if (abs >= 100000) return CURRENCY_SYMBOL + (num / 100000).toFixed(2) + "L";
  if (abs >= 1000) return CURRENCY_SYMBOL + (num / 1000).toFixed(1) + "K";
  return CURRENCY_SYMBOL + formatNumber(num, abs % 1 === 0 ? 0 : 2);
}

/** 12500.5 -> "12,500.5" — drops trailing ".00" noise. */
function formatAmountShort(value) {
  const num = Number(value) || 0;
  return num.toLocaleString("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/** "2026-03-09" -> "09 Mar 2026". Falls back to the raw string. */
function formatDate(dateStr) {
  const raw = String(dateStr || "").slice(0, 10);
  const parts = raw.split("-");
  if (parts.length !== 3) return raw || "—";

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const monthIndex = Number(parts[1]) - 1;
  if (Number.isNaN(monthIndex)) return raw;

  return parts[2] + " " + months[monthIndex] + " " + parts[0];
}

/** "2026-03-09" -> "Today" / "Yesterday" / "09 Mar 2026" */
function formatRelativeDate(dateStr) {
  const raw = String(dateStr || "").slice(0, 10);
  const today = window.api.helpers.todayISODate();
  if (raw === today) return "Today";

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yIso =
    yesterday.getFullYear() +
    "-" +
    String(yesterday.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(yesterday.getDate()).padStart(2, "0");
  if (raw === yIso) return "Yesterday";

  return formatDate(raw);
}

/** Percentage, clamped to 0-999 so a broken value cannot break the layout. */
function formatPercent(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0%";
  return Math.max(0, Math.min(999, Math.round(num))) + "%";
}

function categoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
}

/** Initials for the avatar, e.g. "Jishu Raj" -> "JR". */
function initialsFrom(name) {
  const text = String(name || "").trim();
  if (!text) return "U";
  const parts = text.split(/\s+/).slice(0, 2);
  return parts
    .map(function (part) {
      return part.charAt(0).toUpperCase();
    })
    .join("");
}

/* --------------------------------------------------------------------------
   DOM HELPERS
   -------------------------------------------------------------------------- */

function byId(id) {
  return document.getElementById(id);
}

function show(element, visible) {
  if (!element) return;
  element.classList.toggle("hidden", !visible);
}

/** Replace a container's children with a single node. */
function replaceChildren(container, nodes) {
  if (!container) return;
  container.textContent = "";
  const list = Array.isArray(nodes) ? nodes : [nodes];
  list.forEach(function (node) {
    if (node) container.appendChild(node);
  });
}

/** Build an element with attributes, dataset, classes and text in one call. */
function element(tag, options) {
  const opts = options || {};
  const node = document.createElement(tag);

  if (opts.className) node.className = opts.className;
  if (opts.text !== undefined) node.textContent = opts.text;
  if (opts.html !== undefined) node.innerHTML = opts.html;

  if (opts.attrs) {
    Object.keys(opts.attrs).forEach(function (key) {
      node.setAttribute(key, opts.attrs[key]);
    });
  }

  if (opts.dataset) {
    Object.keys(opts.dataset).forEach(function (key) {
      node.dataset[key] = opts.dataset[key];
    });
  }

  if (opts.style) {
    Object.keys(opts.style).forEach(function (key) {
      node.style[key] = opts.style[key];
    });
  }

  if (opts.onClick) node.addEventListener("click", opts.onClick);

  return node;
}

/* --------------------------------------------------------------------------
   LOADING / EMPTY / ERROR STATES
   -------------------------------------------------------------------------- */

/** Centred spinner with a message, used while a request is in flight. */
function renderLoading(container, message) {
  if (!container) return;
  const wrap = element("div", { className: "loading-overlay" });
  wrap.appendChild(element("span", { className: "spinner dark" }));
  wrap.appendChild(
    element("span", { text: message || "Loading your data..." })
  );
  replaceChildren(container, wrap);
}

/** Skeleton rows shaped like the expense table. */
function renderTableSkeleton(container, rows) {
  if (!container) return;
  const wrap = element("tbody", { className: "skeleton-rows" });

  const count = rows || 5;
  for (let i = 0; i < count; i += 1) {
    const tr = element("tr", { className: "sk-row" });
    tr.appendChild(element("div", { className: "sk-line", style: { width: "38%" } }));
    tr.appendChild(element("div", { className: "sk-line", style: { width: "16%" } }));
    tr.appendChild(element("div", { className: "sk-line", style: { width: "14%" } }));
    tr.appendChild(element("div", { className: "sk-line", style: { width: "12%" } }));
    wrap.appendChild(tr);
  }

  replaceChildren(container, wrap);
}

/**
 * Empty state with an optional call to action.
 * @param {string} title
 * @param {string} message
 * @param {object} [action] {label, href} or {label, onClick}
 */
function renderEmpty(container, title, message, action) {
  if (!container) return;

  const state = element("div", { className: "state" });
  const icon = element("div", { className: "icon" });
  icon.innerHTML = ICONS.inbox;
  state.appendChild(icon);
  state.appendChild(element("h4", { text: title }));
  state.appendChild(element("p", { text: message }));

  if (action && action.label) {
    if (action.href) {
      const link = element("a", { className: "btn btn-primary", text: action.label });
      link.setAttribute("href", action.href);
      state.appendChild(link);
    } else {
      const button = element("button", {
        className: "btn btn-primary",
        text: action.label,
        onClick: action.onClick,
      });
      state.appendChild(button);
    }
  }

  replaceChildren(container, state);
}

/**
 * Error state with a Retry button.
 * @param {HTMLElement} container
 * @param {string} message  already user-safe (produced by ApiError)
 * @param {Function} [retry] callback for the Retry button
 */
function renderError(container, message, retry) {
  if (!container) return;

  const state = element("div", { className: "state error" });
  const icon = element("div", { className: "icon" });
  icon.innerHTML = ICONS.alert;
  state.appendChild(icon);
  state.appendChild(element("h4", { text: "Something went wrong" }));
  state.appendChild(
    element("p", { text: message || "We could not load this right now." })
  );

  if (typeof retry === "function") {
    state.appendChild(
      element("button", {
        className: "btn btn-secondary",
        html: ICONS.refresh + "<span>Try again</span>",
        onClick: retry,
      })
    );
  }

  replaceChildren(container, state);
}

/** Inline alert inside a form. type: "error" | "success" | "info" */
function showFormAlert(container, type, message) {
  if (!container) return;

  container.className = "form-alert show " + type;
  container.innerHTML =
    (type === "error" ? ICONS.alert : type === "success" ? ICONS.check : ICONS.info) +
    "<div>" +
    escapeHtml(message || "") +
    "</div>";
}

function hideFormAlert(container) {
  if (!container) return;
  container.className = "form-alert";
  container.textContent = "";
}

/** Escape text before placing it inside innerHTML. */
function escapeHtml(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Show a field-level validation message. */
function setFieldError(input, errorNode, message) {
  if (input) input.classList.toggle("invalid", Boolean(message));
  if (!errorNode) return;
  errorNode.textContent = message || "";
  errorNode.classList.toggle("show", Boolean(message));
}

/* --------------------------------------------------------------------------
   BUTTON LOADING STATE
   -------------------------------------------------------------------------- */

/**
 * Disable a button and swap in a spinner while a request runs.
 * @returns {Function} call to restore the original button.
 */
function setButtonLoading(button, loading, labelWhenDone) {
  if (!button) return function () {};

  if (loading) {
    button.dataset.originalHtml = button.innerHTML;
    button.disabled = true;
    button.innerHTML =
      '<span class="spinner"></span><span>' + escapeHtml(labelWhenDone || "Please wait") + "</span>";
  } else {
    button.disabled = false;
    if (button.dataset.originalHtml) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
  }

  return function () {
    setButtonLoading(button, false);
  };
}

/* --------------------------------------------------------------------------
   TOASTS
   -------------------------------------------------------------------------- */

function toastHost() {
  let host = byId("toastHost");
  if (!host) {
    host = element("div", { className: "toast-host" });
    host.id = "toastHost";
    document.body.appendChild(host);
  }
  return host;
}

/**
 * Show a transient notification.
 * @param {string} message
 * @param {"success"|"error"|"warning"|"info"} [type]
 * @param {string} [title]
 */
function showToast(message, type, title) {
  const kind = type || "info";
  const host = toastHost();

  const toast = element("div", { className: "toast " + kind });

  const icon = element("span", { className: "t-icon" });
  icon.innerHTML =
    kind === "success" ? ICONS.check : kind === "error" ? ICONS.alert : ICONS.info;
  toast.appendChild(icon);

  const body = element("div", { className: "t-body" });
  body.appendChild(
    element("div", {
      className: "t-title",
      text: title || (kind === "success" ? "Success" : kind === "error" ? "Error" : "Info"),
    })
  );
  body.appendChild(element("div", { className: "t-msg", text: message }));
  toast.appendChild(body);

  const close = element("button", { className: "t-close", text: "\u00D7" });
  close.setAttribute("aria-label", "Dismiss notification");
  toast.appendChild(close);

  let removed = false;
  function dismiss() {
    if (removed) return;
    removed = true;
    toast.classList.add("hide");
    setTimeout(function () {
      if (toast.parentNode) toast.parentNode.removeChild(toast);
    }, 240);
  }

  close.addEventListener("click", dismiss);
  host.appendChild(toast);
  setTimeout(dismiss, kind === "error" ? 6500 : 4000);
}

/* --------------------------------------------------------------------------
   DELETE-CONFIRMATION MODAL
   -------------------------------------------------------------------------- */

/**
 * Promise-based confirm dialog.
 *
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.message      e.g. "Are you sure you want to delete this expense?"
 * @param {string} [options.detail]     e.g. "Lunch - ₹250.00"
 * @param {string} [options.confirmText]
 * @returns {Promise<boolean>} true when the user confirms
 */
function confirmDialog(options) {
  const opts = options || {};

  return new Promise(function (resolve) {
    const backdrop = element("div", { className: "modal-backdrop" });
    const modal = element("div", {
      className: "modal",
      attrs: { role: "dialog", "aria-modal": "true" },
    });

    const icon = element("div", { className: "m-icon" });
    icon.innerHTML = ICONS.trash;
    modal.appendChild(icon);

    modal.appendChild(
      element("h3", { text: opts.title || "Are you sure?" })
    );
    modal.appendChild(
      element("p", {
        text:
          opts.message || "Are you sure you want to delete this expense?",
      })
    );

    if (opts.detail) {
      const box = element("div", { className: "m-body-box" });
      box.appendChild(element("span", { className: "fw-700", text: opts.detail }));
      modal.appendChild(box);
    }

    const actions = element("div", { className: "modal-actions" });

    const cancel = element("button", {
      className: "btn btn-secondary",
      text: "Cancel",
    });
    const confirm = element("button", {
      className: "btn btn-danger",
      text: opts.confirmText || "Yes, delete it",
    });

    actions.appendChild(cancel);
    actions.appendChild(confirm);
    modal.appendChild(actions);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    // Focus the destructive action so Enter works immediately.
    confirm.focus();

    function close(result) {
      document.removeEventListener("keydown", onKey);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      resolve(result);
    }

    function onKey(event) {
      if (event.key === "Escape") close(false);
    }

    confirm.addEventListener("click", function () {
      close(true);
    });
    cancel.addEventListener("click", function () {
      close(false);
    });
    backdrop.addEventListener("click", function (event) {
      if (event.target === backdrop) close(false);
    });
    document.addEventListener("keydown", onKey);
  });
}

/* --------------------------------------------------------------------------
   PROGRESS BAR
   -------------------------------------------------------------------------- */

/**
 * Update a progress bar and colour it by how much budget is consumed.
 * @param {number} percent 0-100+
 */
function setProgress(barNode, percentValueNode, percent) {
  const value = Number(percent) || 0;
  const clamped = Math.max(0, Math.min(100, value));

  if (barNode) {
    barNode.style.width = clamped + "%";
    barNode.classList.remove("is-warning", "is-danger", "is-success");
    if (value >= 100) barNode.classList.add("is-danger");
    else if (value >= 80) barNode.classList.add("is-warning");
    else barNode.classList.add("is-success");
  }

  if (percentValueNode) {
    percentValueNode.textContent = formatPercent(value);
  }
}

/* --------------------------------------------------------------------------
   EXPORTS
   -------------------------------------------------------------------------- */
window.UI = {
  CURRENCY_SYMBOL: CURRENCY_SYMBOL,
  CATEGORIES: CATEGORIES,
  CATEGORY_COLORS: CATEGORY_COLORS,
  CHART_PALETTE: CHART_PALETTE,
  ICONS: ICONS,
  formatNumber: formatNumber,
  formatCurrency: formatCurrency,
  formatCompactCurrency: formatCompactCurrency,
  formatAmountShort: formatAmountShort,
  formatDate: formatDate,
  formatRelativeDate: formatRelativeDate,
  formatPercent: formatPercent,
  categoryColor: categoryColor,
  initialsFrom: initialsFrom,
  byId: byId,
  show: show,
  element: element,
  replaceChildren: replaceChildren,
  escapeHtml: escapeHtml,
  renderLoading: renderLoading,
  renderTableSkeleton: renderTableSkeleton,
  renderEmpty: renderEmpty,
  renderError: renderError,
  showFormAlert: showFormAlert,
  hideFormAlert: hideFormAlert,
  setFieldError: setFieldError,
  setButtonLoading: setButtonLoading,
  showToast: showToast,
  confirmDialog: confirmDialog,
  setProgress: setProgress,
};