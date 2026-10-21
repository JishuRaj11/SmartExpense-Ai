/* ==========================================================================
   SmartExpenses AI — Shared expense form
   --------------------------------------------------------------------------
   add-expense.js and edit-expense.js both use this module so the category
   picker, field validation and live preview behave exactly the same way.

   Usage:
     const view = ExpenseForm.create({ form, alertBox, defaultCategory });
     const values = view.collect();
     if (view.validate(values)) { ... }
     view.setValues(expense);   // used by the edit page
   ========================================================================== */

/**
 * Build the form behaviour.
 * @param {object} options
 * @param {HTMLFormElement} options.form
 * @param {HTMLElement} options.alertBox
 * @param {string} [options.defaultCategory]
 */
function createExpenseForm(options) {
  const opts = options || {};
  const form = opts.form;

  const fields = {
    title: window.UI.byId("title"),
    amount: window.UI.byId("amount"),
    date: window.UI.byId("date"),
  };

  const errors = {
    title: window.UI.byId("titleError"),
    amount: window.UI.byId("amountError"),
    date: window.UI.byId("dateError"),
    category: window.UI.byId("categoryError"),
  };

  const preview = {
    amount: window.UI.byId("previewAmount"),
    category: window.UI.byId("previewCategory"),
    date: window.UI.byId("previewDate"),
  };

  const selected = { category: opts.defaultCategory || "Food" };

  buildCategoryPicker();
  applyDefaults();
  wirePreview();
  clearErrorsOnInput();

  /* ------------------------------------------------------------------
     CATEGORY PICKER
     ------------------------------------------------------------------ */
  function buildCategoryPicker() {
    const picker = window.UI.byId("categoryPicker");
    if (!picker) return;

    window.UI.CATEGORIES.forEach(function (name) {
      const label = window.UI.element("label", { className: "category-option" });
      label.style.setProperty("--cat-color", window.UI.categoryColor(name));

      const input = window.UI.element("input", {
        attrs: { type: "radio", name: "category", value: name },
      });
      input.checked = name === selected.category;

      const box = window.UI.element("div", { className: "box" });
      box.appendChild(window.UI.element("span", { className: "dot" }));
      box.appendChild(window.UI.element("span", { text: name }));

      input.addEventListener("change", function () {
        if (!input.checked) return;
        selected.category = name;
        window.UI.setFieldError(null, errors.category, "");
        updatePreview();
      });

      label.appendChild(input);
      label.appendChild(box);
      picker.appendChild(label);
    });
  }

  /* ------------------------------------------------------------------
     DEFAULTS
     ------------------------------------------------------------------ */
  function applyDefaults() {
    // The backend's `date` field is a Python date, so YYYY-MM-DD is required.
    if (fields.date && !fields.date.value) {
      fields.date.value = api.helpers.todayISODate();
    }

    // Currency symbol lives in one place (ui.js).
    const prefix = window.UI.byId("currencyPrefix");
    if (prefix) prefix.textContent = window.UI.CURRENCY_SYMBOL;

    updatePreview();
  }

  /* ------------------------------------------------------------------
     LIVE PREVIEW
     ------------------------------------------------------------------ */
  function wirePreview() {
    if (fields.amount) {
      fields.amount.addEventListener("input", updatePreview);
    }
    if (fields.date) {
      fields.date.addEventListener("change", updatePreview);
    }
  }

  function updatePreview() {
    const values = collect();

    if (preview.amount) {
      preview.amount.textContent = window.UI.formatCurrency(values.amount || 0);
    }
    if (preview.category) {
      preview.category.textContent = values.category || "Not selected";
      preview.category.style.color = values.category
        ? window.UI.categoryColor(values.category)
        : "";
    }
    if (preview.date) {
      preview.date.textContent = values.date
        ? window.UI.formatDate(values.date)
        : "Not selected";
    }
  }

  /* ------------------------------------------------------------------
     READ + VALIDATE
     ------------------------------------------------------------------ */

  /** Read the current form state as a backend-ready payload. */
  function collect() {
    return {
      title: fields.title ? fields.title.value.trim() : "",
      amount: fields.amount ? Number(fields.amount.value) : NaN,
      category: selected.category || "",
      date: fields.date ? fields.date.value : "",
    };
  }

  /**
   * Client-side validation. Returns true when the payload is safe to send.
   * The backend re-validates everything with Pydantic.
   */
  function validate(values) {
    let valid = true;

    const titleError =
      !values.title ? "Please enter a title."
      : values.title.length < 2 ? "Title must be at least 2 characters."
      : "";

    const amountError =
      !Number.isFinite(values.amount) ? "Please enter an amount."
      : values.amount <= 0 ? "Amount must be greater than zero."
      : values.amount > 100000000 ? "That amount looks too large."
      : "";

    const dateError = !values.date
      ? "Please choose a date."
      : !/^\d{4}-\d{2}-\d{2}$/.test(values.date)
        ? "Please use a valid date."
        : "";

    const categoryError = !values.category ? "Please choose a category." : "";

    window.UI.setFieldError(fields.title, errors.title, titleError);
    window.UI.setFieldError(fields.amount, errors.amount, amountError);
    window.UI.setFieldError(fields.date, errors.date, dateError);
    window.UI.setFieldError(null, errors.category, categoryError);

    if (titleError || amountError || dateError || categoryError) {
      valid = false;

      // Focus the first field that needs attention.
      if (titleError) fields.title.focus();
      else if (amountError) fields.amount.focus();
      else if (dateError) fields.date.focus();
    }

    return valid;
  }

  /* ------------------------------------------------------------------
     FILL (edit page)
     ------------------------------------------------------------------ */

  /** Populate the form from an expense returned by GET /expenses/{id}. */
  function setValues(expense) {
    if (!expense) return;

    if (fields.title) fields.title.value = expense.title;
    if (fields.amount) fields.amount.value = expense.amount;
    if (fields.date) fields.date.value = expense.date;

    selected.category = expense.category;

    // Sync the radio buttons with the stored category.
    document
      .querySelectorAll('#categoryPicker input[name="category"]')
      .forEach(function (input) {
        input.checked = input.value === expense.category;
      });

    updatePreview();
  }

  /** Grey out and hide the form while the record is loading. */
  function setDisabled(disabled) {
    if (form) {
      form.querySelectorAll("input, select, textarea").forEach(function (input) {
        input.disabled = disabled;
      });
    }
  }

  function clearErrorsOnInput() {
    Object.keys(fields).forEach(function (key) {
      const input = fields[key];
      if (!input) return;
      input.addEventListener("input", function () {
        window.UI.setFieldError(input, errors[key], "");
      });
    });
  }

  return {
    collect: collect,
    validate: validate,
    setValues: setValues,
    setDisabled: setDisabled,
    updatePreview: updatePreview,
    fields: fields,
  };
}

window.ExpenseForm = { create: createExpenseForm };