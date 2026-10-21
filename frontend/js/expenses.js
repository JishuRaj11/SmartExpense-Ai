/* ==========================================================================
   SmartExpenses AI — Expenses page logic
   --------------------------------------------------------------------------
   Features: real data from GET /expenses, category + date filters, inline
   edit / delete, and loading / empty / error states.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  // Gate: without a valid JWT, checkAuthentication() redirects to login.html.
  if (!checkAuthentication()) return;

  const tableWrap = window.UI.byId("expenseTableWrap");
  const tableFoot = window.UI.byId("tableFoot");
  const categorySelect = window.UI.byId("filterCategory");
  const dateInput = window.UI.byId("filterDate");
  const applyButton = window.UI.byId("applyFilters");
  const clearButton = window.UI.byId("clearFilters");

  /** Currently applied filters. */
  const activeFilters = { category: "", date: "" };

  initCategoryOptions();
  wireFilterEvents();
  loadExpenses();

  /* ------------------------------------------------------------------
     FILTERS
     ------------------------------------------------------------------ */

  /** Populate the category dropdown from the shared category list. */
  function initCategoryOptions() {
    window.UI.CATEGORIES.forEach(function (name) {
      const option = window.UI.element("option", { text: name });
      option.value = name;
      categorySelect.appendChild(option);
    });
  }

  function wireFilterEvents() {
    applyButton.addEventListener("click", function () {
      activeFilters.category = categorySelect.value;
      activeFilters.date = dateInput.value;
      loadExpenses();
    });

    clearButton.addEventListener("click", function () {
      categorySelect.value = "";
      dateInput.value = "";
      activeFilters.category = "";
      activeFilters.date = "";
      loadExpenses();
    });

    // Enter inside the date field applies the filters straight away.
    dateInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        event.preventDefault();
        applyButton.click();
      }
    });
  }

  /* ------------------------------------------------------------------
     LOAD + RENDER
     ------------------------------------------------------------------ */

  /**
   * GET /expenses with the active filters, then paint the table.
   * Shows loading, empty or error states depending on the outcome.
   */
  async function loadExpenses() {
    showLoadingState();

    try {
      const expenses = await api.getExpensesFiltered(activeFilters);
      renderTable(expenses);
    } catch (error) {
      // 401 already redirects via api.js; other errors show the retry state.
      window.UI.renderError(tableWrap, error.message, loadExpenses);
      hideFoot();
    }
  }

  /** Skeleton rows while the request is in flight. */
  function showLoadingState() {
    hideFoot();

    const table = window.UI.element("table", { className: "data-table" });
    const head = window.UI.element("thead", {});
    const headRow = window.UI.element("tr", {});

    ["Expense", "Category", "Date", "Amount", "Actions"].forEach(function (label) {
      headRow.appendChild(window.UI.element("th", { text: label }));
    });
    head.appendChild(headRow);
    table.appendChild(head);

    const body = window.UI.element("tbody", {});
    for (let i = 0; i < 6; i += 1) {
      const row = window.UI.element("tr", { className: "sk-row" });
      row.appendChild(window.UI.element("div", { className: "sk-line", style: { width: "36%" } }));
      row.appendChild(window.UI.element("div", { className: "sk-line", style: { width: "18%" } }));
      row.appendChild(window.UI.element("div", { className: "sk-line", style: { width: "16%" } }));
      row.appendChild(window.UI.element("div", { className: "sk-line", style: { width: "14%" } }));
      body.appendChild(row);
    }
    table.appendChild(body);

    window.UI.replaceChildren(tableWrap, table);
  }

  /**
   * Render the expense table.
   * Each row is built with DOM nodes (not innerHTML) so user-entered titles
   * can never inject markup.
   */
  function renderTable(expenses) {
    if (!expenses.length) {
      window.UI.renderEmpty(
        tableWrap,
        hasFilters() ? "No matching expenses" : "No expenses yet",
        hasFilters()
          ? "No expenses match the filters you selected. Try clearing them."
          : "Add your first expense to start tracking where your money goes.",
        hasFilters()
          ? { label: "Clear filters", onClick: clearFiltersNow }
          : { label: "Add Expense", href: "add-expense.html" }
      );
      hideFoot();
      return;
    }

    const table = window.UI.element("table", { className: "data-table" });

    // ---- Header ----
    const thead = window.UI.element("thead", {});
    const headRow = window.UI.element("tr", {});
    [
      { label: "Expense", width: "" },
      { label: "Category", width: "" },
      { label: "Date", width: "" },
      { label: "Amount", width: "" },
      { label: "Actions", width: "" },
    ].forEach(function (column) {
      const th = window.UI.element("th", { text: column.label });
      if (column.label === "Amount" || column.label === "Actions") {
        th.style.textAlign = "right";
      }
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    // ---- Body ----
    const tbody = window.UI.element("tbody", {});

    expenses.forEach(function (item) {
      const row = window.UI.element("tr", {});

      // Title
      const titleCell = window.UI.element("td", {});
      titleCell.dataset.label = "Expense";
      titleCell.appendChild(
        window.UI.element("div", { className: "cell-title", text: item.title })
      );
      titleCell.appendChild(
        window.UI.element("div", { className: "cell-sub", text: "#" + item.id })
      );
      row.appendChild(titleCell);

      // Category chip
      const categoryCell = window.UI.element("td", {});
      categoryCell.dataset.label = "Category";
      const chip = window.UI.element("span", { className: "badge" });
      const dot = window.UI.element("span", { className: "dot" });
      dot.style.background = window.UI.categoryColor(item.category);
      chip.appendChild(dot);
      chip.appendChild(document.createTextNode(item.category));
      categoryCell.appendChild(chip);
      row.appendChild(categoryCell);

      // Date
      const dateCell = window.UI.element("td", { className: "nowrap" });
      dateCell.dataset.label = "Date";
      dateCell.appendChild(
        window.UI.element("span", { text: window.UI.formatDate(item.date) })
      );
      row.appendChild(dateCell);

      // Amount
      const amountCell = window.UI.element("td", {
        className: "col-amount",
        text: window.UI.formatCurrency(item.amount),
      });
      amountCell.dataset.label = "Amount";
      row.appendChild(amountCell);

      // Actions
      const actionsCell = window.UI.element("td", { className: "col-actions" });
      actionsCell.dataset.label = "Actions";

      const editButton = window.UI.element("button", {
        className: "btn btn-secondary btn-icon",
        attrs: { type: "button", title: "Edit expense", "aria-label": "Edit " + item.title },
      });
      editButton.innerHTML = window.UI.ICONS.edit;
      editButton.addEventListener("click", function () {
        goToEdit(item.id);
      });

      const deleteButton = window.UI.element("button", {
        className: "btn btn-danger-soft btn-icon",
        attrs: { type: "button", title: "Delete expense", "aria-label": "Delete " + item.title },
      });
      deleteButton.innerHTML = window.UI.ICONS.trash;
      deleteButton.addEventListener("click", function () {
        confirmAndDelete(item);
      });

      const buttonRow = window.UI.element("div", {});
      buttonRow.style.display = "inline-flex";
      buttonRow.style.gap = "6px";
      buttonRow.appendChild(editButton);
      buttonRow.appendChild(deleteButton);
      actionsCell.appendChild(buttonRow);

      row.appendChild(actionsCell);
      tbody.appendChild(row);
    });

    table.appendChild(tbody);

    const wrap = window.UI.element("div", { className: "table-wrap" });
    wrap.appendChild(table);
    window.UI.replaceChildren(tableWrap, wrap);

    renderFoot(expenses);
  }

  /** Footer: how many rows are shown and their combined total. */
  function renderFoot(expenses) {
    if (!tableFoot) return;

    const total = expenses.reduce(function (sum, item) {
      return sum + (Number(item.amount) || 0);
    }, 0);

    const countNode = window.UI.byId("resultCount");
    const totalNode = window.UI.byId("resultTotal");

    if (countNode) {
      countNode.textContent =
        "Showing " +
        expenses.length +
        (expenses.length === 1 ? " expense" : " expenses") +
        (hasFilters() ? " matching your filters" : "");
    }
    if (totalNode) {
      totalNode.textContent = window.UI.formatCurrency(total);
    }

    tableFoot.hidden = false;
  }

  function hideFoot() {
    if (tableFoot) tableFoot.hidden = true;
  }

  function hasFilters() {
    return Boolean(activeFilters.category || activeFilters.date);
  }

  function clearFiltersNow() {
    categorySelect.value = "";
    dateInput.value = "";
    activeFilters.category = "";
    activeFilters.date = "";
    loadExpenses();
  }

  /* ------------------------------------------------------------------
     EDIT / DELETE
     ------------------------------------------------------------------ */

  /** Hand the id to edit-expense.html via the query string. */
  function goToEdit(id) {
    window.location.href = "edit-expense.html?id=" + encodeURIComponent(id);
  }

  /**
   * Ask for confirmation, then DELETE /expenses/{id} and refresh the list.
   */
  async function confirmAndDelete(item) {
    const confirmed = await window.UI.confirmDialog({
      title: "Delete expense?",
      message: "Are you sure you want to delete this expense?",
      detail: item.title + " · " + window.UI.formatCurrency(item.amount),
      confirmText: "Yes, delete it",
    });

    if (!confirmed) return;

    try {
      const result = await api.deleteExpense(item.id);
      window.UI.showToast(
        '"' + item.title + '" was deleted.',
        "success",
        "Expense deleted"
      );
      await loadExpenses();
      return result;
    } catch (error) {
      window.UI.showToast(error.message, "error", "Could not delete");
    }
  }

  /* ------------------------------------------------------------------
     CROSS-TAB REFRESH
     Keeps the list fresh after adding an expense in another tab.
     ------------------------------------------------------------------ */
  window.addEventListener("focus", function () {
    // Only re-fetch when no filters are active, to avoid surprising the user.
    if (!hasFilters() && document.visibilityState === "visible") {
      loadExpenses();
    }
  });
});