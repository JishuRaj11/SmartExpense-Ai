/* ==========================================================================
   SmartExpenses AI — Dashboard logic
   --------------------------------------------------------------------------
   All figures come from api.getDashboard(), which reads GET /dashboard when
   the backend provides it and otherwise derives the same values from the real
   GET /expenses data. Nothing on this page is hardcoded.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  // No valid JWT? checkAuthentication() redirects to login.html and returns.
  if (!checkAuthentication()) return;

  loadDashboard();

  /**
   * Fetch the dashboard data and paint every section.
   * Also re-runs when returning from another tab via the storage event.
   */
  async function loadDashboard() {
    renderStatSkeletons();

    try {
      const data = await api.getDashboard();

      renderStats(data);
      renderBudgetBar(data);
      renderRecentTransactions(data.recentTransactions);
      renderTopCategory(data);
      renderMonthlySummary(data.monthlySummary);
      loadPrediction();
    } catch (error) {
      // A 401 has already redirected to login via api.js.
      renderFatalError(error);
    }
  }

  /* ------------------------------------------------------------------
     SUMMARY CARDS
     ------------------------------------------------------------------ */

  function renderStatSkeletons() {
    const grid = window.UI.byId("statGrid");
    if (!grid) return;

    const cards = [];
    for (let i = 0; i < 5; i += 1) {
      const card = window.UI.element("div", { className: "stat-card" });
      card.appendChild(window.UI.element("div", {
        className: "skeleton sk-line",
        style: { width: "60%", height: "11px" },
      }));
      card.appendChild(window.UI.element("div", {
        className: "skeleton sk-line",
        style: { width: "70%", height: "26px", marginTop: "14px" },
      }));
      cards.push(card);
    }
    window.UI.replaceChildren(grid, cards);
  }

  function renderStats(data) {
    const grid = window.UI.byId("statGrid");
    if (!grid) return;

    const hasBudget = Number(data.budget) > 0;

    const cards = [
      buildStatCard({
        label: "Total Expenses",
        value: window.UI.formatCompactCurrency(data.totalExpenses),
        foot: "All time",
        tone: "",
        icon: window.UI.ICONS.wallet,
      }),
      buildStatCard({
        label: "This Month",
        value: window.UI.formatCompactCurrency(data.thisMonth),
        foot: currentMonthLabel(),
        tone: "green",
        icon: window.UI.ICONS.calendar,
      }),
      buildStatCard({
        label: "Today's Expenses",
        value: window.UI.formatCompactCurrency(data.today),
        foot: window.UI.formatRelativeDate(api.helpers.todayISODate()),
        tone: "blue",
        icon: window.UI.ICONS.clock,
      }),
      buildStatCard({
        label: "Remaining Budget",
        // No budget set yet -> show a dash rather than a misleading zero.
        value: hasBudget
          ? window.UI.formatCompactCurrency(data.remainingBudget)
          : "--",
        foot: hasBudget
          ? "of " + window.UI.formatCompactCurrency(data.budget)
          : "No budget set",
        tone: data.remainingBudget < 0 ? "red" : hasBudget ? "green" : "",
        icon: window.UI.ICONS.piggy,
      }),
      buildStatCard({
        label: "Budget Used %",
        value: hasBudget ? window.UI.formatPercent(data.budgetUsedPercentage) : "--",
        foot: hasBudget ? budgetToneLabel(data.budgetUsedPercentage) : "Set a budget first",
        tone: hasBudget ? budgetTone(data.budgetUsedPercentage) : "amber",
        icon: window.UI.ICONS.gauge,
      }),
    ];

    window.UI.replaceChildren(grid, cards);
  }

  /** Build one stat card: icon tile, label, value and a footnote. */
  function buildStatCard(options) {
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
     BUDGET PROGRESS BAR
     ------------------------------------------------------------------ */

  function renderBudgetBar(data) {
    const bar = window.UI.byId("budgetBar");
    const percentNode = window.UI.byId("budgetUsedPercent");
    const metaValue = window.UI.byId("budgetMetaValue");
    const hint = window.UI.byId("budgetHint");

    if (Number(data.budget) <= 0) {
      // Nothing to measure against.
      if (bar) bar.style.width = "0";
      if (percentNode) percentNode.textContent = "--";
      if (metaValue) metaValue.textContent = window.UI.formatCurrency(0);
      if (hint) {
        hint.innerHTML =
          'You have not set a monthly budget yet. ' +
          '<a href="budget.html">Set your budget</a> to track how much is left.';
      }
      return;
    }

    window.UI.setProgress(bar, percentNode, data.budgetUsedPercentage);

    if (metaValue) {
      metaValue.textContent = window.UI.formatCurrency(data.budget) + " set";
    }

    if (hint) {
      if (data.remainingBudget < 0) {
        hint.innerHTML =
          '<span class="text-danger fw-700">You have overspent by ' +
          window.UI.escapeHtml(window.UI.formatCurrency(Math.abs(data.remainingBudget))) +
          "</span> this month.";
      } else {
        hint.innerHTML =
          "<span>" +
          window.UI.escapeHtml(window.UI.formatCurrency(data.remainingBudget)) +
          " left of " +
          window.UI.escapeHtml(window.UI.formatCurrency(data.budget)) +
          " for " +
          window.UI.escapeHtml(currentMonthLabel()) +
          ".</span>";
      }
    }
  }

  /* ------------------------------------------------------------------
     RECENT TRANSACTIONS
     ------------------------------------------------------------------ */

  function renderRecentTransactions(items) {
    const container = window.UI.byId("recentList");
    if (!container) return;

    if (!items || !items.length) {
      window.UI.renderEmpty(
        container,
        "No transactions yet",
        "Once you add your first expense it will show up here.",
        { label: "Add your first expense", href: "add-expense.html" }
      );
      return;
    }

    const list = window.UI.element("div", {});
    list.style.padding = "8px 20px 16px";

    items.forEach(function (item) {
      const row = window.UI.element("div", { className: "sk-row" });
      row.style.borderBottom = "1px solid var(--line)";

      // Category colour dot
      const dot = window.UI.element("span", {
        className: "badge",
        style: { padding: "0", background: "transparent" },
      });
      const inner = window.UI.element("span", { className: "dot" });
      inner.style.background = window.UI.categoryColor(item.category);
      inner.style.width = "11px";
      inner.style.height = "11px";
      inner.style.borderRadius = "50%";
      inner.style.display = "block";
      dot.appendChild(inner);
      row.appendChild(dot);

      // Title + meta
      const meta = window.UI.element("div", {});
      meta.style.flex = "1";
      meta.style.minWidth = "0";

      meta.appendChild(
        window.UI.element("div", { className: "cell-title", text: item.title })
      );
      meta.appendChild(
        window.UI.element("div", {
          className: "cell-sub",
          text: item.category + " · " + window.UI.formatRelativeDate(item.date),
        })
      );
      row.appendChild(meta);

      // Amount
      row.appendChild(
        window.UI.element("div", {
          className: "amount",
          style: { color: "var(--ink-900)" },
          text: window.UI.formatCurrency(item.amount),
        })
      );

      list.appendChild(row);
    });

    window.UI.replaceChildren(container, list);
  }

  /* ------------------------------------------------------------------
     TOP CATEGORY
     ------------------------------------------------------------------ */

  function renderTopCategory(data) {
    const container = window.UI.byId("topCategory");
    if (!container) return;

    const name = data.topCategory;

    if (!name || name === "—" || name === "--") {
      window.UI.renderEmpty(
        container,
        "Nothing to show yet",
        "Add a few expenses and your top spending category will appear here."
      );
      return;
    }

    const total = Number(data.totalExpenses) || 0;
    const topAmount = Number(data.topCategoryAmount) || 0;

    const wrap = window.UI.element("div", {});

    // Category chip in the category's own colour
    const badge = window.UI.element("span", { className: "badge badge-brand" });
    const dot = window.UI.element("span", { className: "dot" });
    dot.style.background = window.UI.categoryColor(name);
    dot.style.width = "8px";
    dot.style.height = "8px";
    badge.appendChild(dot);
    badge.appendChild(document.createTextNode(name));
    wrap.appendChild(badge);

    wrap.appendChild(
      window.UI.element("div", {
        className: "stat-value sm",
        text: window.UI.formatCurrency(topAmount),
        style: { marginTop: "14px" },
      })
    );

    // Share of total spend, derived from real backend data.
    const share = total > 0 ? Math.round((topAmount / total) * 100) : 0;
    wrap.appendChild(
      window.UI.element("div", {
        className: "text-xs text-muted",
        text: share + "% of all your spending",
        style: { marginTop: "4px" },
      })
    );

    window.UI.replaceChildren(container, wrap);
  }

  /* ------------------------------------------------------------------
     MONTHLY SUMMARY
     ------------------------------------------------------------------ */

  function renderMonthlySummary(rows) {
    const container = window.UI.byId("monthlySummary");
    if (!container) return;

    if (!rows || !rows.length) {
      window.UI.renderEmpty(
        container,
        "No monthly data",
        "Your month-by-month totals will appear here."
      );
      return;
    }

    const max = rows.reduce(function (peak, row) {
      return Math.max(peak, Number(row.total) || 0);
    }, 0);

    const list = window.UI.element("div", {});
    list.style.padding = "8px 0 4px";

    rows
      .slice()
      .reverse()
      .forEach(function (row) {
        const item = window.UI.element("div", {
          className: "rank-row",
          style: {
            gridTemplateColumns: "1fr auto",
            gridTemplateAreas: '"name val" "track track"',
            rowGap: "7px",
            marginBottom: "12px",
          },
        });

        const name = window.UI.element("div", {
          className: "rank-name",
          style: { gridArea: "name" },
        });
        name.appendChild(
          window.UI.element("span", {
            text: row.label + " " + String(row.year || ""),
          })
        );
        item.appendChild(name);

        item.appendChild(
          window.UI.element("div", {
            className: "rank-val",
            style: { gridArea: "val" },
            text: window.UI.formatCurrency(row.total),
          })
        );

        const track = window.UI.element("div", {
          className: "rank-track",
          style: { gridArea: "track" },
        });
        const fill = window.UI.element("div", { className: "rank-fill" });
        fill.style.setProperty("--rank-color", "#6366f1");
        fill.style.width = (max > 0 ? (row.total / max) * 100 : 0) + "%";
        // Let the bar animate in on the next frame.
        window.UI.replaceChildren(track, fill);
        requestAnimationFrame(function () {
          fill.style.width = (max > 0 ? (row.total / max) * 100 : 0) + "%";
        });
        item.appendChild(track);

        list.appendChild(item);
      });

    window.UI.replaceChildren(container, list);
  }

  /* ------------------------------------------------------------------
     SPENDING PREDICTION
     GET /predict-spending — next month forecast for the logged-in user.
     Fetched on its own so a prediction problem never blocks the rest of
     the dashboard. Handles the backend's "insufficient_data" status too.
     ------------------------------------------------------------------ */

  async function loadPrediction() {
    const container = window.UI.byId("predictionCard");
    if (!container) return;

    try {
      const result = await api.getSpendingPrediction();
      renderPrediction(result);
    } catch (error) {
      window.UI.renderError(
        container,
        error && error.message
          ? error.message
          : "We could not load your spending prediction right now.",
        loadPrediction
      );
    }
  }

  function renderPrediction(result) {
    const container = window.UI.byId("predictionCard");
    const hint = window.UI.byId("predictionHint");
    if (!container) return;

    // Not enough history yet: show the helpful message the backend sent.
    if (!result || result.status !== "success") {
      if (hint) hint.textContent = "";
      const months = Number(result && result.months_available) || 0;
      const required = Number(result && result.required_months) || 5;
      window.UI.renderEmpty(
        container,
        "Not enough history yet",
        "The forecast needs at least " + required +
          " months of spending history (you currently have " + months +
          "). Keep logging expenses and the prediction will appear here."
      );
      return;
    }

    if (hint) {
      hint.textContent =
        result.model + " · " + result.history_months + " months of history";
    }

    const wrap = window.UI.element("div", {});

    // Headline: predicted amount + change badge.
    const head = window.UI.element("div", { className: "row-between" });

    const figures = window.UI.element("div", {});
    figures.appendChild(
      window.UI.element("div", {
        className: "stat-value sm",
        text: window.UI.formatCurrency(result.predicted_amount),
      })
    );
    figures.appendChild(
      window.UI.element("div", {
        className: "text-xs text-muted",
        style: { marginTop: "4px" },
        text: "Predicted for " + result.next_month,
      })
    );
    head.appendChild(figures);

    // Spending up is the cautionary case; down is the good one.
    const change = Number(result.expected_change) || 0;
    const changePct = Number(result.change_percentage) || 0;
    const tone =
      change > 0 ? "badge-warning" : change < 0 ? "badge-success" : "badge-info";
    const arrow = change > 0 ? "↑" : change < 0 ? "↓" : "→";
    head.appendChild(
      window.UI.element("span", {
        className: "badge " + tone,
        text:
          arrow + " " +
          (change > 0 ? "+" : change < 0 ? "-" : "") +
          window.UI.formatCurrency(Math.abs(change)) +
          " (" + (changePct >= 0 ? "+" : "") + changePct.toFixed(1) + "%)",
      })
    );
    wrap.appendChild(head);

    // Context: this month, trend direction.
    wrap.appendChild(
      window.UI.element("div", {
        className: "text-sm text-muted",
        style: { marginTop: "10px" },
        text:
          "This month (" + result.current_month_label + "): " +
          window.UI.formatCurrency(result.current_month) +
          " · Trend: " + result.trend_direction,
      })
    );

    // Fine print: hold-out error and the model disclaimer.
    const maeLine =
      result.mae == null
        ? ""
        : "MAE ±" + window.UI.formatCurrency(result.mae) + " · ";
    wrap.appendChild(
      window.UI.element("div", {
        className: "text-xs text-muted",
        style: { marginTop: "10px" },
        text: maeLine + (result.disclaimer || ""),
      })
    );

    window.UI.replaceChildren(container, wrap);
  }

  /* ------------------------------------------------------------------
     ERROR STATE
     ------------------------------------------------------------------ */

  function renderFatalError(error) {
    const message =
      error && error.message
        ? error.message
        : "We could not load your dashboard right now.";

    window.UI.renderError(window.UI.byId("statGrid"), message, loadDashboard);

    ["recentList", "topCategory", "monthlySummary", "predictionCard"].forEach(function (id) {
      const node = window.UI.byId(id);
      if (node) window.UI.renderError(node, message, loadDashboard);
    });
  }

  /* ------------------------------------------------------------------
     SMALL HELPERS
     ------------------------------------------------------------------ */

  /** "March" for the current month. */
  function currentMonthLabel() {
    return api.helpers.monthNameFromDate(api.helpers.todayISODate());
  }

  function budgetTone(percent) {
    if (percent >= 100) return "red";
    if (percent >= 80) return "amber";
    return "green";
  }

  function budgetToneLabel(percent) {
    if (percent >= 100) return "Budget exceeded";
    if (percent >= 80) return "Close to your limit";
    return "Within budget";
  }
});