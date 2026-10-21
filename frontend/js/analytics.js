/* ==========================================================================
   SmartExpenses AI — Analytics page logic
   --------------------------------------------------------------------------
   The analytics page now focuses on a single AI feature:
     - Spending prediction  -> GET /predict-spending  (history + next month)

   Chart.js is loaded from a CDN in analytics.html and is used only to draw.
   No chart values are hardcoded — every dataset comes from the API layer.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  if (!checkAuthentication()) return;

  /** Live Chart.js instance, so it can be destroyed before a redraw. */
  const charts = {
    forecast: null,
  };

  const refreshButton = window.UI.byId("refreshButton");

  if (refreshButton) {
    refreshButton.addEventListener("click", loadAnalytics);
  }

  loadAnalytics();

  /* ------------------------------------------------------------------
     LOAD
     ------------------------------------------------------------------ */

  async function loadAnalytics() {
    const restore = window.UI.setButtonLoading(
      refreshButton,
      true,
      "Refreshing..."
    );

    renderOverviewSkeletons();
    showChartSkeletons();

    try {
      await renderForecast();
    } catch (error) {
      renderFatalError(error);
    } finally {
      restore();
    }
  }

  /* ------------------------------------------------------------------
     OVERVIEW CARDS
     ------------------------------------------------------------------ */

  function renderOverviewSkeletons() {
    const grid = window.UI.byId("overviewGrid");
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

  function renderOverview(result) {
    const grid = window.UI.byId("overviewGrid");
    if (!grid) return;

    const changePct = Number(result.change_percentage) || 0;
    const trend = result.trend_direction || "—";

    const cards = [
      statCard({
        label: "Predicted for " + result.next_month,
        value: window.UI.formatCurrency(result.predicted_amount),
        foot: result.history_months + " months of history",
        tone: "violet",
        icon: window.UI.ICONS.gauge,
      }),
      statCard({
        label: "This Month (" + result.current_month_label + ")",
        value: window.UI.formatCurrency(result.current_month),
        foot: "Actual spending so far",
        tone: "green",
        icon: window.UI.ICONS.calendar,
      }),
      statCard({
        label: "Expected Change",
        value:
          (Number(result.expected_change) >= 0 ? "+" : "-") +
          window.UI.formatCurrency(Math.abs(Number(result.expected_change) || 0)),
        foot:
          (changePct >= 0 ? "up " : "down ") +
          Math.abs(changePct).toFixed(1) +
          "% vs this month",
        tone: changePct >= 0 ? "amber" : "green",
        icon: window.UI.ICONS.target,
      }),
      statCard({
        label: "Trend",
        value: String(trend).charAt(0).toUpperCase() + String(trend).slice(1),
        foot: result.model || "",
        tone: "blue",
        icon: window.UI.ICONS.wallet,
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

    const value = window.UI.element("div", { className: "stat-value" });
    value.textContent = options.value;
    value.style.fontSize = "1.35rem";
    value.style.overflowWrap = "anywhere";
    card.appendChild(value);

    card.appendChild(
      window.UI.element("div", { className: "stat-foot", text: options.foot })
    );

    return card;
  }

  /* ------------------------------------------------------------------
     SPENDING FORECAST GRAPH
     GET /predict-spending — the next month's forecast drawn on top of the
     monthly history. The last observed point is repeated so the dashed
     segment visibly connects history to the prediction.
     ------------------------------------------------------------------ */

  async function renderForecast() {
    const canvas = window.UI.byId("forecastChart");
    const note = window.UI.byId("forecastNote");
    const source = window.UI.byId("forecastSource");
    const grid = window.UI.byId("overviewGrid");

    let result = null;
    try {
      result = await api.getSpendingPrediction();
    } catch (error) {
      result = null;
    }

    if (!result || result.status !== "success") {
      destroyChart("forecast");
      if (canvas) canvas.style.display = "none";
      if (source) source.textContent = "";
      if (note) note.textContent = "";
      const months = Number(result && result.months_available) || 0;
      const required = Number(result && result.required_months) || 5;
      const message =
        "A forecast needs at least " + required +
        " months of spending history — you currently have " + months + ".";
      window.UI.renderEmpty(grid, "Not enough history yet", message);
      showChartEmpty(
        canvas,
        "Not enough history yet",
        "Keep logging expenses and the forecast graph will appear here."
      );
      return;
    }

    if (canvas) canvas.style.display = "block";
    if (source) {
      source.textContent =
        result.model + " · " + result.history_months + " months of history";
    }

    renderOverview(result);

    const history = result.monthly_history || [];
    const labels = history.map(function (item) {
      return item.month;
    });
    labels.push(result.next_month);

    const actual = history.map(function (item) {
      return Number(item.amount) || 0;
    });

    // null keeps the forecast hidden until the final segment; the last
    // actual value is repeated so the dashed line starts at the last month.
    const forecast = history.map(function () {
      return null;
    });
    forecast.push(null);
    if (actual.length) {
      forecast[actual.length - 1] = actual[actual.length - 1];
      forecast[actual.length] = Number(result.predicted_amount) || 0;
    }

    destroyChart("forecast");
    charts.forecast = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Actual",
            data: actual,
            borderColor: "#4f46e5",
            backgroundColor: "rgba(99, 102, 241, 0.14)",
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: 3,
            pointHoverRadius: 6,
            pointBackgroundColor: "#4f46e5",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
          },
          {
            label: "Forecast",
            data: forecast,
            borderColor: "#a855f7",
            backgroundColor: "rgba(168, 85, 247, 0.12)",
            borderDash: [6, 6],
            fill: false,
            tension: 0,
            borderWidth: 2.5,
            pointRadius: function (context) {
              return context.dataIndex === labels.length - 1 ? 6 : 0;
            },
            pointHoverRadius: 7,
            pointBackgroundColor: "#a855f7",
            pointBorderColor: "#ffffff",
            pointBorderWidth: 2,
          },
        ],
      },
      options: baseOptions({
        plugins: {
          legend: {
            display: true,
            position: "top",
            align: "end",
            labels: {
              usePointStyle: true,
              pointStyle: "rectRounded",
              boxWidth: 10,
              padding: 16,
              color: "#64748b",
              font: { size: 12 },
            },
          },
          tooltip: { callbacks: { label: moneyTooltip } },
        },
      }),
    });

    if (note) {
      const changePct = Number(result.change_percentage) || 0;
      note.textContent =
        result.next_month + " forecast: " +
        window.UI.formatCurrency(result.predicted_amount) +
        " — " + (changePct >= 0 ? "up " : "down ") +
        Math.abs(changePct).toFixed(1) + "% vs " +
        result.current_month_label + " (" +
        window.UI.formatCurrency(result.current_month) + "). " +
        (result.disclaimer || "");
    }
  }

  /* ------------------------------------------------------------------
     HELPERS
     ------------------------------------------------------------------ */

  /** Options shared by every chart so they look consistent. */
  function baseOptions(overrides) {
    const options = {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0f172a",
          titleColor: "#ffffff",
          bodyColor: "#e2e8f0",
          padding: 12,
          cornerRadius: 8,
          displayColors: true,
          boxPadding: 4,
        },
      },
      scales: {
        x: {
          grid: { display: false },
          border: { display: false },
          ticks: { color: "#94a3b8", font: { size: 11 }, maxRotation: 0 },
        },
        y: {
          beginAtZero: true,
          grid: { color: "rgba(148, 163, 184, 0.18)", drawBorder: false },
          border: { display: false },
          ticks: {
            color: "#94a3b8",
            font: { size: 11 },
            callback: function (value) {
              return window.UI.CURRENCY_SYMBOL + compact(value);
            },
          },
        },
      },
    };

    return deepMerge(options, overrides || {});
  }

  /** Merge plain objects recursively (used for chart option overrides). */
  function deepMerge(target, source) {
    Object.keys(source).forEach(function (key) {
      const value = source[key];
      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (!target[key]) target[key] = {};
        deepMerge(target[key], value);
      } else {
        target[key] = value;
      }
    });
    return target;
  }

  /** "12500" -> "12.5K" for axis labels. */
  function compact(value) {
    const num = Number(value) || 0;
    const abs = Math.abs(num);
    if (abs >= 1000000) return (num / 1000000).toFixed(1) + "M";
    if (abs >= 1000) return (num / 1000).toFixed(abs >= 10000 ? 0 : 1) + "K";
    return String(Math.round(num));
  }

  /** Shared tooltip label: "Actual: ₹1,250.00". */
  function moneyTooltip(context) {
    return " " + context.dataset.label + ": " + window.UI.formatCurrency(context.parsed.y || context.parsed);
  }

  function destroyChart(key) {
    if (charts[key]) {
      charts[key].destroy();
      charts[key] = null;
    }
  }

  /** Show an empty state in place of a chart canvas. */
  function showChartEmpty(canvas, title, message) {
    if (!canvas) return;
    const host = canvas.parentNode;
    if (!host) return;

    // Avoid stacking empty states on top of each other.
    const existing = host.querySelector(".state");
    if (existing) existing.remove();

    const box = window.UI.element("div", {});
    window.UI.renderEmpty(box, title, message);
    host.appendChild(box);
  }

  /* ------------------------------------------------------------------
     LOADING + ERROR
     ------------------------------------------------------------------ */

  /** Grey placeholder while the prediction loads. */
  function showChartSkeletons() {
    const box = window.UI.byId("forecastChartBox");
    if (!box) return;
    const existing = box.querySelector(".state");
    if (existing) existing.remove();
    box.style.opacity = "0.4";
  }

  function renderFatalError(error) {
    const message =
      error && error.message
        ? error.message
        : "We could not load your spending prediction right now.";

    window.UI.renderError(window.UI.byId("overviewGrid"), message, loadAnalytics);

    const box = window.UI.byId("forecastChartBox");
    if (box) {
      box.style.opacity = "1";
      window.UI.renderError(box, message, loadAnalytics);
    }
  }
});
