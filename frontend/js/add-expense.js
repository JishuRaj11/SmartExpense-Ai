/* ==========================================================================
   SmartExpenses AI — Add Expense logic
   --------------------------------------------------------------------------
   POST /expenses, then redirect to expenses.html on success.
   Shared form helpers live in js/expense-form.js so Add and Edit behave
   identically.
   ========================================================================== */

document.addEventListener("DOMContentLoaded", function () {
  if (!checkAuthentication()) return;

  const form = window.UI.byId("expenseForm");
  const submitButton = window.UI.byId("submitButton");
  const alertBox = window.UI.byId("formAlert");

  // Shared builder: category picker, defaults, live preview, validation.
  const expenseFormView = window.ExpenseForm.create({
    form: form,
    alertBox: alertBox,
    defaultCategory: "Food",
  });

  /* --------------------------------------------------------------------------
     AI CATEGORY SUGGESTION
     As the user types the title, ask the trained model for a category and
     auto-select it. Only applies when the model is confident enough that the
     guess is worth trusting (matches the backend's fallback threshold).
     ------------------------------------------------------------------------- */

  const titleField = window.UI.byId("title");
  const MIN_SUGGEST_CONFIDENCE = 0.3;
  let suggestTimer = null;

  if (titleField) {
    titleField.addEventListener("input", function () {
      if (suggestTimer) clearTimeout(suggestTimer);
      suggestTimer = setTimeout(suggestCategory, 450);
    });
  }

  async function suggestCategory() {
    const title = (titleField.value || "").trim();
    if (title.length < 2) return;

    try {
      const result = await api.predictCategory(title);
      if (!result.category || result.confidence < MIN_SUGGEST_CONFIDENCE) {
        return;
      }

      const selectedNow = document.querySelector(
        '#categoryPicker input[name="category"]:checked'
      );

      const alreadyPicked =
        selectedNow && selectedNow.value === result.category;

      if (selectCategory(result.category) && !alreadyPicked) {
        window.UI.showToast(
          '"' +
            result.category +
            '" looks right (' +
            Math.round(result.confidence * 100) +
            "% confidence).",
          "success",
          "AI Suggested"
        );
      }
    } catch (error) {
      // Model or server unavailable — keep the user's manual pick.
    }
  }

  /** Select a category radio card. Returns true when a card was found. */
  function selectCategory(name) {
    const input = document.querySelector(
      '#categoryPicker input[name="category"][value="' + name + '"]'
    );
    if (!input) return false;

    if (!input.checked) {
      input.checked = true;
      // The radio's change handler in expense-form.js updates the preview.
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  }

  form.addEventListener("submit", async function (event) {
    event.preventDefault();

    window.UI.hideFormAlert(alertBox);

    const values = expenseFormView.collect();
    if (!expenseFormView.validate(values)) return;

    const restore = window.UI.setButtonLoading(submitButton, true, "Saving...");

    try {
      const created = await api.createExpense(values);

      window.UI.showToast(
        '"' + values.title + '" was added.',
        "success",
        "Expense saved"
      );

      // Back to the list, where the new expense is now visible.
      setTimeout(function () {
        window.location.replace("expenses.html");
      }, 550);

      return created;
    } catch (error) {
      restore();
      window.UI.showFormAlert(alertBox, "error", error.message);
    }
  });
});