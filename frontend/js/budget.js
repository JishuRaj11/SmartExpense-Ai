/* ==========================================================================
   SmartExpenses AI — Budget page logic
   --------------------------------------------------------------------------
   Backend endpoints:
     GET  /budget   -> not implemented yet; api.js falls back to the value
                       cached from the backend's own POST /budget response
     POST /budget   -> creates the budget for a month
     PUT  /budget   -> not implemented yet; api.js re-posts through
                       POST /budget, the only write path main.py supports

   "Spent" always comes from the real GET /expenses data.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  if (!checkAuthentication()) return;

  const form = window.UI.byId("budgetForm");
  const amountInput = window.UI.byId("amount");
  const monthInput = window.UI.byId("month");
  const submitButton = window.UI.byId("submitButton");
  const resetButton = window.UI.byId("resetButton");
  const alertBox = window.UI.byId("formAlert");

  /** Budget currently shown on the page. */
  let currentBudget = 0;
  /** Month currently being edited, e.g. "2026-03". */
  let activeMonth = api.helpers.currentMonthKey();
  /** Expenses for the active month, used for "spent". */
  let monthExpenses = [];

  initDefaults();
  wireEvents();
  loadBudgetPage();

  /* ------------------------------------------------------------------
     DEFAULTS
     ------------------------------------------------------------------ */
  function initDefaults() {
    // Default to the current month.
    monthInput.value = activeMonth;

    const prefix = window.UI.byId("currencyPrefix");
    if (prefix) prefix.textContent = window.UI.CURRENCY_SYMBOL;

    const chip = window.UI.byId("monthChip");
    if (chip) chip.textContent = monthLabel(activeMonth);
  }

  function wireEvents() {
    // Switching month reloads that month's budget.
    monthInput.addEventListener("change", function () {
      const value = monthInput.value;
      if (!/^\d{4}-\d{2}$/.test(value)) return;
      activeMonth = value;

      const chip = window.UI.byId("monthChip");
      if (chip) chip.textContent = monthLabel(activeMonth);

      loadBudgetPage();
    });

    amountInput.addEventListener("input", function () {
      window.UI.setFieldError(amountInput, window.UI.byId("amountError"), "");
    });

    resetButton.addEventListener("click", function () {
      amountInput.value = "";
      window.UI.setFieldError(amountInput, window.UI.byId("amountError"), "");
      window.UI.hideFormAlert(alertBox);
      amountInput.focus();
    });

    // Quick-pick presets.
    document.querySelectorAll("[data-preset]").forEach(function (button) {
      button.addEventListener("click", function () {
        amountInput.value = button.getAttribute("data-preset");
        window.UI.setFieldError(amountInput, window.UI.byId("amountError"), "");
      });
    });

    form.addEventListener("submit", saveBudget);
  }

  /* ------------------------------------------------------------------
     LOAD
     ------------------------------------------------------------------ */

  /** Load the budget for the active month plus this month's real expenses. */
  async function loadBudgetPage() {
    renderStatSkeletons();

    try {
      // Both come from the backend: the budget via api.getBudget(), the
      // spending via GET /expenses.
      const results = await Promise.all([
        api.getBudget(activeMonth),
        api.getExpenses(),
      ]);

      currentBudget = Number(results[0].amount) || 0;
      monthExpenses = results[1].filter(function (item) {
        return item.date.slice(0, 7) === activeMonth;
      });

      renderStats();
      renderProgress();
      renderFormState();
      renderCategoryBreakdown();
    } catch (error) {
      renderFatalError(error);
    }
  }

  function renderStatSkeletons() {
    const grid = window.UI.byId("statGrid");
    if (!grid) return;

    const cards = [];
    for (let i = 0; i < 4; i += 1) {
      const card = window.UI.element("div", { className: "stat-card" });
      card.appendChild(
        window.UI.element("div", {
          className: "skeleton sk-line",
          style: { width: "60%", height: "11px" },
        })
      );
      card.appendChild(
        window.UI.element("div", {
          className: "skeleton sk-line",
          style: { width: "70%", height: "26px", marginTop: "14px" },
        })
      );
      cards.push(card);
    }
    window.UI.replaceChildren(grid, cards);
  }

  /* ------------------------------------------------------------------
     SUMMARY CARDS
     ------------------------------------------------------------------ */

  function renderStats() {
    const grid = window.UI.byId("statGrid");
    if (!grid) return;

    const spent = totalSpent();
    const hasBudget = currentBudget > 0;
    const remaining = hasBudget ? currentBudget - spent : 0;
    const percent = hasBudget ? Math.round((spent / currentBudget) * 100) : 0;

    const cards = [
      statCard({
        label: "Current Budget",
        value: hasBudget ? window.UI.formatCompactCurrency(currentBudget) : "--",
        foot: hasBudget ? monthLabel(activeMonth) : "Not set yet",
        tone: "",
        icon: window.UI.ICONS.target,
      }),
      statCard({
        label: "Total Spent",
        value: window.UI.formatCompactCurrency(spent),
        foot: monthExpenses.length +
          (monthExpenses.length === 1 ? " expense" : " expenses") +
          " this month",
        tone: "blue",
        icon: window.UI.ICONS.wallet,
      }),
      statCard({
        label: "Remaining Budget",
        value: hasBudget ? window.UI.formatCompactCurrency(remaining) : "--",
        foot: hasBudget
          ? remaining < 0
            ? "Overspent"
            : "Still available"
          : "Set a budget first",
        tone: hasBudget ? (remaining < 0 ? "red" : "green") : "",
        icon: window.UI.ICONS.piggy,
      }),
      statCard({
        label: "Budget Used %",
        value: hasBudget ? window.UI.formatPercent(percent) : "--",
        foot: hasBudget ? toneLabel(percent) : "Set a budget first",
        tone: hasBudget ? toneClass(percent) : "amber",
        icon: window.UI.ICONS.gauge,
      }),
    ];

    window.UI.replaceChildren(grid, cards);
  }

  function statCard(options) {
    const card = window.UI.element("div", {
      className: "stat-card " + (options.tone || ""),
    });

    const top = window.UI.element("div", { className: "stat-top" });
    top.appendChild(
      window.UI.element("div", { className: "stat-label", text: options.label })
    );
    const iconTile = window.UI.element("div", {
      className: "stat-icon " + (options.tone || ""),
    });
    iconTile.innerHTML = options.icon;
    top.appendChild(iconTile);

    card.appendChild(top);
    card.appendChild(
      window.UI.element("div", { className: "stat-value", text: options.value })
    );
    card.appendChild(
      window.UI.element("div", { className: "stat-foot", text: options.foot })
    );

    return card;
  }

  /* ------------------------------------------------------------------
     PROGRESS BAR
     ------------------------------------------------------------------ */

  function renderProgress() {
    const noBudgetState = window.UI.byId("noBudgetState");
    const progressState = window.UI.byId("progressState");

    if (currentBudget <= 0) {
      // Nothing to measure against.
      if (noBudgetState) noBudgetState.hidden = false;
      if (progressState) progressState.hidden = true;
      return;
    }

    if (noBudgetState) noBudgetState.hidden = true;
    if (progressState) progressState.hidden = false;

    const spent = totalSpent();
    const percent = Math.round((spent / currentBudget) * 100);

    window.UI.setProgress(
      window.UI.byId("budgetBar"),
      window.UI.byId("usedPercentValue"),
      percent
    );

    const spentValue = window.UI.byId("spentValue");
    if (spentValue) spentValue.textContent = window.UI.formatCurrency(spent);

    const budgetValue = window.UI.byId("budgetValue");
    if (budgetValue) budgetValue.textContent = window.UI.formatCurrency(currentBudget);

    const remainingValue = window.UI.byId("remainingValue");
    if (remainingValue) {
      remainingValue.textContent = window.UI.formatCurrency(currentBudget - spent);
      remainingValue.className = "fw-700";
      remainingValue.style.color =
        currentBudget - spent < 0 ? "var(--danger)" : "var(--success)";
      remainingValue.style.fontSize = "1.2rem";
    }

    const hint = window.UI.byId("progressHint");
    if (hint) {
      if (spent > currentBudget) {
        hint.className = "text-sm text-danger fw-700";
        hint.textContent =
          "You are over budget by " +
          window.UI.formatCurrency(spent - currentBudget) +
          " this month.";
      } else if (percent >= 80) {
        hint.className = "text-sm text-warning fw-700";
        hint.textContent =
          "You have used " +
          window.UI.formatPercent(percent) +
          " of your budget. Spend carefully.";
      } else {
        hint.className = "text-sm text-success";
        hint.textContent =
          "You are within budget for " + monthLabel(activeMonth) + ".";
      }
    }
  }

  /* ------------------------------------------------------------------
     FORM STATE
     ------------------------------------------------------------------ */

  /** Switch the form between "Set Budget" and "Update Budget". */
  function renderFormState() {
    const title = window.UI.byId("formTitle");
    const hint = window.UI.byId("formModeHint");
    const subtitle = window.UI.byId("budgetSubtitle");

    if (currentBudget > 0) {
      if (title) title.textContent = "Update Budget";
      if (hint) {
        hint.textContent =
          "Currently " + window.UI.formatCurrency(currentBudget);
      }
      if (submitButton) {
        submitButton.querySelector("span").textContent = "Update Budget";
      }
      if (subtitle) {
        subtitle.textContent =
          "Your spending limit for " + monthLabel(activeMonth) + ".";
      }
      // Pre-fill with the existing amount so it can be tweaked.
      if (!amountInput.value) amountInput.value = currentBudget;
    } else {
      if (title) title.textContent = "Set Budget";
      if (hint) hint.textContent = "No budget for " + monthLabel(activeMonth);
      if (submitButton) {
        submitButton.querySelector("span").textContent = "Save Budget";
      }
      if (subtitle) {
        subtitle.textContent =
          "You have not set a budget for " + monthLabel(activeMonth) + " yet.";
      }
    }
  }

  /* ------------------------------------------------------------------
     SAVE
     ------------------------------------------------------------------ */

  /**
   * Create or update the budget for the active month.
   * Uses POST /budget for a new budget and api.updateBudget() when one already
   * exists, so the same form works in both cases.
   */
  async function saveBudget(event) {
    event.preventDefault();

    window.UI.hideFormAlert(alertBox);

    const amount = Number(amountInput.value);
    const error =
      !Number.isFinite(amount) || amountInput.value === ""
        ? "Please enter a budget amount."
        : amount <= 0
          ? "Budget must be greater than zero."
          : amount > 100000000
            ? "That budget looks too large."
            : "";

    window.UI.setFieldError(amountInput, window.UI.byId("amountError"), error);
    if (error) {
      amountInput.focus();
      return;
    }

    const isUpdate = currentBudget > 0;
    const restore = window.UI.setButtonLoading(
      submitButton,
      true,
      isUpdate ? "Updating..." : "Saving..."
    );

    try {
      if (isUpdate) {
        await api.updateBudget(amount, activeMonth);
      } else {
        await api.setBudget(amount, activeMonth);
      }

      currentBudget = amount;

      window.UI.showFormAlert(
        alertBox,
        "success",
        "Budget of " +
          window.UI.formatCurrency(amount) +
          " saved for " +
          monthLabel(activeMonth) +
          "."
      );
      window.UI.showToast(
        "Your budget for " + monthLabel(activeMonth) + " is now " +
          window.UI.formatCurrency(amount) + ".",
        "success",
        isUpdate ? "Budget updated" : "Budget set"
      );

      // Refresh the progress bar and cards from the backend.
      await loadBudgetPage();
    } catch (error) {
      window.UI.showFormAlert(alertBox, "error", error.message);
    } finally {
      restore();
    }
  }

  /* ------------------------------------------------------------------
     CATEGORY BREAKDOWN
     ------------------------------------------------------------------ */

  function renderCategoryBreakdown() {
    const container = window.UI.byId("categoryBreakdown");
    if (!container) return;

    if (!monthExpenses.length) {
      window.UI.renderEmpty(
        container,
        "No expenses this month",
        "Add an expense and the category breakdown will show here."
      );
      return;
    }

    const totals = api.helpers.categoryTotals(monthExpenses);
    const entries = Object.keys(totals)
      .map(function (key) {
        return { name: key, value: Number(totals[key]) || 0 };
      })
      .sort(function (a, b) {
        return b.value - a.value;
      });

    const max = entries.reduce(function (peak, row) {
      return Math.max(peak, row.value);
    }, 0);

    const list = window.UI.element("div", { className: "rank-list" });
    list.style.padding = "14px 0 4px";

    entries.forEach(function (row) {
      const line = window.UI.element("div", { className: "rank-row" });

      const name = window.UI.element("div", { className: "rank-name" });
      const dot = window.UI.element("span", {
        style: {
          width: "10px",
          height: "10px",
          borderRadius: "50%",
          flex: "0 0 10px",
          background: window.UI.categoryColor(row.name),
          display: "block",
        },
      });
      name.appendChild(dot);
      name.appendChild(window.UI.element("span", { text: row.name }));
      line.appendChild(name);

      const track = window.UI.element("div", { className: "rank-track" });
      const fill = window.UI.element("div", { className: "rank-fill" });
      fill.style.setProperty("--rank-color", window.UI.categoryColor(row.name));
      const percent = max > 0 ? (row.value / max) * 100 : 0;
      fill.style.width = percent + "%";
      track.appendChild(fill);
      line.appendChild(track);

      line.appendChild(
        window.UI.element("div", {
          className: "rank-val",
          text: window.UI.formatCurrency(row.value),
        })
      );

      list.appendChild(line);
    });

    window.UI.replaceChildren(container, list);
  }

  /* ------------------------------------------------------------------
     HELPERS
     ------------------------------------------------------------------ */

  function totalSpent() {
    return monthExpenses.reduce(function (sum, item) {
      return sum + (Number(item.amount) || 0);
    }, 0);
  }

  /** "2026-03" -> "March 2026" */
  function monthLabel(monthKey) {
    return api.helpers.monthNameFromDate(monthKey + "-01") + " " + monthKey.slice(0, 4);
  }

  function toneClass(percent) {
    if (percent >= 100) return "red";
    if (percent >= 80) return "amber";
    return "green";
  }

  function toneLabel(percent) {
    if (percent >= 100) return "Budget exceeded";
    if (percent >= 80) return "Close to your limit";
    return "Within budget";
  }

  function renderFatalError(error) {
    const message =
      error && error.message
        ? error.message
        : "We could not load your budget right now.";

    window.UI.renderError(window.UI.byId("statGrid"), message, loadBudgetPage);

    ["progressCard", "categoryBreakdown"].forEach(function (id) {
      const node = window.UI.byId(id);
      if (node) window.UI.renderError(node, message, loadBudgetPage);
    });
  }
});