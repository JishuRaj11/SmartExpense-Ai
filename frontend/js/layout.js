/* ==========================================================================
   SmartExpenses AI — Shared page layout
   --------------------------------------------------------------------------
   Every protected page (dashboard, expenses, add/edit expense, analytics,
   budget) uses the same header, sidebar and logout behaviour. Instead of
   duplicating that markup in six HTML files, this module builds it once.

   Each page provides:
     <aside class="sidebar" id="sidebar"></aside>   -> filled in here
     <div class="nav-overlay" id="navOverlay"></div> -> mobile backdrop
     <button class="hamburger" id="menuToggle">     -> mobile drawer trigger
   and optionally data attributes for the topbar user:
     data-page-title, data-page-sub, data-user-avatar, data-user-name,
     data-user-mail, data-today-label
   ========================================================================== */

/** Sidebar definition — order here is the order shown. */
const NAV_ITEMS = [
  {
    href: "dashboard.html",
    label: "Dashboard",
    icon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  },
  {
    href: "expenses.html",
    label: "Expenses",
    icon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3h8a2 2 0 0 1 2 2v16l-3-2-3 2-3-2-3 2V5a2 2 0 0 1 2-2Z"/><path d="M9 8h6M9 12h6"/></svg>',
  },
  {
    href: "analytics.html",
    label: "Analytics",
    icon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  },
  {
    href: "budget.html",
    label: "Budget",
    icon:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v10M15 9.5c0-1-1.2-1.8-3-1.8s-3 .8-3 1.8 1.2 1.6 3 1.9 3 .8 3 1.9-1.2 1.8-3 1.8-3-.8-3-1.8"/></svg>',
  },
];

/** Brand mark used in the sidebar and on the auth pages. */
const BRAND_MARK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3Z"/><path d="M3 9h13"/><circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none"/></svg>';

/* --------------------------------------------------------------------------
   SIDEBAR
   -------------------------------------------------------------------------- */

/** Build the sidebar markup and mark the current page active. */
function renderSidebar() {
  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const currentPage = window.Auth.currentPageName();
  const user = window.Auth.getCurrentUser() || {};

  // ---- Brand block ----
  const head = document.createElement("div");
  head.className = "sidebar-head";
  head.innerHTML =
    '<div class="sidebar-brand">' +
    '<img class="sidebar-logo" src="assets/logo.svg" alt="" />' +
    "<span>SmartExpenses AI</span>" +
    "</div>" +
    '<div class="sidebar-tagline">Track. Understand. Save.</div>';
  sidebar.appendChild(head);

  // ---- Signed-in user ----
  if (user.name || user.gmail) {
    const userBlock = document.createElement("div");
    userBlock.className = "sidebar-user";

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.textContent = window.UI.initialsFrom(user.name || user.gmail);
    userBlock.appendChild(avatar);

    const meta = document.createElement("div");
    meta.className = "meta";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = user.name || "User";
    meta.appendChild(name);

    const mail = document.createElement("div");
    mail.className = "mail";
    mail.textContent = user.gmail || "";
    meta.appendChild(mail);

    userBlock.appendChild(meta);
    sidebar.appendChild(userBlock);
  }

  // ---- Navigation links ----
  const nav = document.createElement("nav");
  nav.className = "sidebar-nav";
  nav.setAttribute("aria-label", "Main navigation");

  const navLabel = document.createElement("div");
  navLabel.className = "nav-label";
  navLabel.textContent = "Menu";
  nav.appendChild(navLabel);

  NAV_ITEMS.forEach(function (item) {
    const link = document.createElement("a");
    link.className = "nav-link" + (item.href === currentPage ? " active" : "");
    link.href = item.href;
    link.setAttribute("aria-current", item.href === currentPage ? "page" : "false");
    link.innerHTML = item.icon + "<span>" + item.label + "</span>";
    link.addEventListener("click", closeDrawer);
    nav.appendChild(link);
  });

  sidebar.appendChild(nav);

  // ---- Footer: logout ----
  const foot = document.createElement("div");
  foot.className = "sidebar-foot";

  const logout = document.createElement("button");
  logout.type = "button";
  logout.className = "nav-link logout";
  logout.style.width = "100%";
  logout.style.textAlign = "left";
  logout.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/></svg><span>Logout</span>';
  logout.addEventListener("click", function () {
    window.Auth.logoutUser();
  });

  foot.appendChild(logout);
  sidebar.appendChild(foot);
}

/* --------------------------------------------------------------------------
   MOBILE DRAWER
   -------------------------------------------------------------------------- */

function openDrawer() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("navOverlay");
  if (sidebar) sidebar.classList.add("open");
  if (overlay) overlay.classList.add("show");
  document.body.style.overflow = "hidden";
}

function closeDrawer() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("navOverlay");
  if (sidebar) sidebar.classList.remove("open");
  if (overlay) overlay.classList.remove("show");
  document.body.style.overflow = "";
}

function wireDrawer() {
  const toggle = document.getElementById("menuToggle");
  const overlay = document.getElementById("navOverlay");

  if (toggle) {
    toggle.addEventListener("click", function () {
      const sidebar = document.getElementById("sidebar");
      if (sidebar && sidebar.classList.contains("open")) closeDrawer();
      else openDrawer();
    });
  }

  if (overlay) {
    overlay.addEventListener("click", closeDrawer);
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") closeDrawer();
  });

  // Close the drawer if the viewport grows past the mobile breakpoint.
  window.addEventListener("resize", function () {
    if (window.innerWidth > 1024) closeDrawer();
  });
}

/* --------------------------------------------------------------------------
   TOPBAR USER + DATE
   -------------------------------------------------------------------------- */

/** Add the app logo to the topbar so the app chrome matches the landing navbar. */
function renderTopbarBrand() {
  document.querySelectorAll(".topbar").forEach(function (topbar) {
    if (topbar.querySelector(".topbar-logo")) return;

    const logo = document.createElement("img");
    logo.className = "topbar-logo";
    logo.src = "assets/logo.svg";
    logo.alt = "";
    logo.width = 40;
    logo.height = 40;

    const hamburger = topbar.querySelector(".hamburger");
    if (hamburger) hamburger.insertAdjacentElement("afterend", logo);
    else topbar.insertBefore(logo, topbar.firstChild);
  });
}

/** Fill any data-attribute driven slot the page provides. */
function renderTopbarSlots() {
  const user = window.Auth.getCurrentUser() || {};
  const now = new Date();

  const dateLabel = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  const timeLabel = now.toLocaleDateString("en-IN", {
    year: "numeric",
  });

  document.querySelectorAll("[data-today-label]").forEach(function (node) {
    node.textContent = dateLabel;
  });
  document.querySelectorAll("[data-today-year]").forEach(function (node) {
    node.textContent = timeLabel;
  });
  document.querySelectorAll("[data-user-name]").forEach(function (node) {
    node.textContent = user.name || "User";
  });
  document.querySelectorAll("[data-user-mail]").forEach(function (node) {
    node.textContent = user.gmail || "";
  });
  document.querySelectorAll("[data-user-avatar]").forEach(function (node) {
    node.textContent = window.UI.initialsFrom(user.name || user.gmail);
  });
}

/* --------------------------------------------------------------------------
   BOOT
   -------------------------------------------------------------------------- */

/**
 * Initialise the shared chrome. Runs on DOMContentLoaded for every protected
 * page after checkAuthentication() has confirmed a valid JWT.
 */
function initLayout() {
  renderSidebar();
  renderTopbarBrand();
  wireDrawer();
  renderTopbarSlots();
}

// Exposed globally so each page calls Layout.init() before its own render.
window.Layout = {
  init: initLayout,
  renderSidebar: renderSidebar,
  closeDrawer: closeDrawer,
  BRAND_MARK: BRAND_MARK,
  NAV_ITEMS: NAV_ITEMS,
};

document.addEventListener("DOMContentLoaded", initLayout);