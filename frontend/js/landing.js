/* ==========================================================================
   SmartExpenses AI — Landing page interactions
   --------------------------------------------------------------------------
   Two jobs only:
     1. Draw the 11 silver spiral rings on the diary binding.
     2. Drive the page-flip interaction (3 diary days, wrap-around) and replay
        the turn animation on every click by alternating flipA / flipB.
   ========================================================================== */

(function () {
  "use strict";

  var RING_COUNT = 11;

  /* Three diary pages. Chip colours are class names defined in landing.css. */
  var PAGES = [
    {
      date: "Mon, 12 Oct",
      rows: [
        { label: "Chai and samosa", chip: "FOOD", cls: "chip--food", amount: "\u20B960" },
        { label: "Auto to office", chip: "TRAVEL", cls: "chip--travel", amount: "\u20B9120" },
        { label: "Groceries", chip: "HOME", cls: "chip--home", amount: "\u20B9842" },
        { label: "Netflix", chip: "SUBS", cls: "chip--subs", amount: "\u20B9199" },
      ],
      total: "\u20B91,221",
      note: "groceries were the big one today. nothing scary!",
    },
    {
      date: "Tue, 13 Oct",
      rows: [
        { label: "Metro card top-up", chip: "TRAVEL", cls: "chip--travel", amount: "\u20B9500" },
        { label: "Lunch with team", chip: "FOOD", cls: "chip--food", amount: "\u20B9380" },
        { label: "Phone recharge", chip: "BILLS", cls: "chip--bills", amount: "\u20B9299" },
      ],
      total: "\u20B91,179",
      note: "lunch with the team was fun. still inside the weekly budget.",
    },
    {
      date: "Wed, 14 Oct",
      rows: [
        { label: "Atomic Habits", chip: "LEARNING", cls: "chip--learning", amount: "\u20B9450" },
        { label: "Coffee", chip: "FOOD", cls: "chip--food", amount: "\u20B9180" },
        { label: "Electricity", chip: "BILLS", cls: "chip--bills", amount: "\u20B91,240" },
      ],
      total: "\u20B91,870",
      note: "electricity bill landed. good thing it was planned for.",
    },
  ];

  var spiral = document.querySelector(".spiral");
  var page = document.querySelector(".diary-page");
  var dateEl = document.querySelector(".page-date");
  var rowsEl = document.querySelector(".page-rows");
  var totalEl = document.querySelector(".total-amount");
  var noteEl = document.querySelector(".ai-note");
  var prevBtn = document.querySelector('[data-pager="prev"]');
  var nextBtn = document.querySelector('[data-pager="next"]');
  var dots = Array.prototype.slice.call(document.querySelectorAll(".dot"));

  if (!page || !rowsEl) return;

  /* ---- 1. Spiral rings ---- */
  if (spiral) {
    for (var i = 0; i < RING_COUNT; i++) {
      var ring = document.createElement("span");
      ring.className = "ring";
      spiral.appendChild(ring);
    }
  }

  /* ---- 2. Page flipping ---- */
  var index = 0;
  var useFlipA = false;

  function render(i) {
    var data = PAGES[i];

    dateEl.textContent = data.date;

    rowsEl.innerHTML = "";
    data.rows.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "row";

      var left = document.createElement("span");
      left.className = "row-left";

      var label = document.createElement("span");
      label.className = "row-label";
      label.textContent = item.label;

      var chip = document.createElement("span");
      chip.className = "chip " + item.cls;
      chip.textContent = item.chip;

      left.appendChild(label);
      left.appendChild(chip);

      var amount = document.createElement("span");
      amount.className = "row-amount";
      amount.textContent = item.amount;

      row.appendChild(left);
      row.appendChild(amount);
      rowsEl.appendChild(row);
    });

    totalEl.textContent = data.total;
    noteEl.textContent = data.note;

    dots.forEach(function (dot, k) {
      dot.classList.toggle("active", k === i);
    });
  }

  function flip() {
    /* Reset, force a reflow so the browser forgets the last run, then add the
       other keyframe class. Alternating names is what replays the animation. */
    page.classList.remove("flip-a", "flip-b");
    void page.offsetWidth;
    useFlipA = !useFlipA;
    page.classList.add(useFlipA ? "flip-a" : "flip-b");
  }

  function go(delta) {
    index = (index + delta + PAGES.length) % PAGES.length;
    render(index);
    flip();
  }

  if (prevBtn) prevBtn.addEventListener("click", function () { go(-1); });
  if (nextBtn) nextBtn.addEventListener("click", function () { go(1); });

  render(0);
})();
