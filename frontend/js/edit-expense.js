/* ==========================================================================
   SmartExpenses AI — Edit Expense logic
   --------------------------------------------------------------------------
   Flow:
     1. Read the id from the URL (?id=3)
     2. GET /expenses/{id} and populate the form
     3. PUT /expenses/{id} on submit
     4. Redirect to expenses.html
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  if (!checkAuthentication()) return;

  const form = window.UI.byId("expenseForm");
  const formLoader = window.UI.byId("formLoader");
  const submitButton = window.UI.byId("submitButton");
  const deleteButton = window.UI.byId("deleteButton");
  const alertBox = window.UI.byId("formAlert");
  const subtitle = window.UI.byId("editSubtitle");
  const idChip = window.UI.byId("expenseIdChip");

  /** The expense currently being edited. */
  let currentExpense = null;

  // Shared form behaviour (category picker, validation, live preview).
  const expenseFormView = window.ExpenseForm.create({
    form: form,
    alertBox: alertBox,
    defaultCategory: "Food",
  });

  const expenseId = readIdFromUrl();

  // No id in the URL: nothing can be edited.
  if (expenseId === null) {
    renderLoadError(
      "No expense was specified. Open this page from the Expenses list."
    );
  } else {
    loadExpense();
  }

  /* ------------------------------------------------------------------
     URL
     ------------------------------------------------------------------ */

  /** expense.html?id=12 -> 12. Returns null when absent or invalid. */
  function readIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("id");

    if (raw === null) return null;
    const id = Number(raw);
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  /* ------------------------------------------------------------------
     LOAD
     ------------------------------------------------------------------ */

  /** GET /expenses/{id}, then fill in the form. */
  async function loadExpense() {
    if (idChip) idChip.textContent = "Expense #" + expenseId;

    try {
      currentExpense = await api.getExpenseById(expenseId);

      expenseFormView.setValues(currentExpense);

      if (subtitle) {
        subtitle.textContent =
          "Editing expense #" + currentExpense.id + " created for " +
          window.UI.formatDate(currentExpense.date) + ".";
      }

      showForm();
    } catch (error) {
      renderLoadError(error.message);
    }
  }

  function showForm() {
    if (formLoader) formLoader.hidden = true;
    if (form) form.hidden = false;
  }

  /* ------------------------------------------------------------------
     SAVE
     ------------------------------------------------------------------ */

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    window.UI.hideFormAlert(alertBox);

    const values = expenseFormView.collect();
    if (!expenseFormView.validate(values)) return;

    const restore = window.UI.setButtonLoading(submitButton, true, "Saving...");

    try {
      await api.updateExpense(expenseId, values);

      window.UI.showToast(
        '"' + values.title + '" was updated.',
        "success",
        "Changes saved"
      );

      setTimeout(function () {
        window.location.replace("expenses.html");
      }, 550);
    } catch (error) {
      restore();
      window.UI.showFormAlert(alertBox, "error", error.message);
    }
  });

  /* ------------------------------------------------------------------
     DELETE FROM THIS PAGE
     ------------------------------------------------------------------ */

  if (deleteButton) {
    deleteButton.addEventListener("click", async function () {
      if (!currentExpense) return;

      const confirmed = await window.UI.confirmDialog({
        title: "Delete expense?",
        message: "Are you sure you want to delete this expense?",
        detail:
          currentExpense.title + " · " + window.UI.formatCurrency(currentExpense.amount),
        confirmText: "Yes, delete it",
      });

      if (!confirmed) return;

      const restore = window.UI.setButtonLoading(deleteButton, true, "Deleting...");

      try {
        await api.deleteExpense(expenseId);
        window.UI.showToast(
          '"' + currentExpense.title + '" was deleted.',
          "success",
          "Expense deleted"
        );
        setTimeout(function () {
          window.location.replace("expenses.html");
        }, 550);
      } catch (error) {
        restore();
        window.UI.showFormAlert(alertBox, "error", error.message);
      }
    });
  }

  /* ------------------------------------------------------------------
     LOAD-ERROR STATE
     ------------------------------------------------------------------ */

  /** Replace the form area with a message and a link back to the list. */
  function renderLoadError(message) {
    if (formLoader) formLoader.hidden = true;
    if (form) form.hidden = true;
    if (subtitle) subtitle.textContent = "This expense could not be loaded.";

    const container = window.UI.element("div", {});
    window.UI.renderError(
      container,
      message,
      expenseId === null ? null : loadExpense
    );

    // Always offer a way back to the list.
    const link = window.UI.element("a", {
      className: "btn btn-primary",
      text: "Back to Expenses",
    });
    link.setAttribute("href", "expenses.html");

    const actions = window.UI.element("div", {
      className: "row-actions",
      style: { justifyContent: "center", marginTop: "14px" },
    });
    actions.appendChild(link);

    const cardBody = document.querySelector(".card-body");
    if (cardBody) {
      const alertSlot = window.UI.byId("formAlert");
      const nodes = [container, actions];
      if (alertSlot && alertSlot.parentNode) {
        nodes.unshift(alertSlot);
      }
      window.UI.replaceChildren(cardBody, nodes);
    }
  }
});