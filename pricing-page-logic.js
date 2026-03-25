/* ==========================================================
   pricing-page-logic.js
   StaxAI Pricing Page — all JavaScript logic
   Loaded by pricing-page.html via <script src="...">
   To split: this file contains all JS. pricing-page.html
   contains all HTML and CSS. No JS lives in the HTML file.
   ========================================================== */

    var pickerSelected = [];
    var pickerLimit = 3;
    var pickerTier = "stax3";

    function openPicker(tier, limit) {
        pickerTier = tier;
        pickerLimit = limit;
        pickerSelected = [];
        renderPickerGrid();
        updatePickerCount();
        var overlay = document.getElementById("picker-overlay");
        if (overlay) {
            overlay.style.display = "flex";
            setTimeout(function() { overlay.style.opacity = "1"; }, 10);
        }
    }

    function closePicker() {
        var overlay = document.getElementById("picker-overlay");
        if (overlay) {
            overlay.style.opacity = "0";
            setTimeout(function() { overlay.style.display = "none"; }, 300);
        }
    }

    function renderPickerGrid() {
        var grid = document.getElementById("picker-grid");
        if (grid) grid.innerHTML = "";
    }

    function togglePickerTool(id) {
        var idx = pickerSelected.indexOf(id);
        if (idx !== -1) {
            pickerSelected.splice(idx, 1);
        } else {
            if (pickerSelected.length < pickerLimit) {
                pickerSelected.push(id);
            }
        }
        updatePickerCount();
    }

    function updatePickerCount() {
        var countEl = document.getElementById("picker-count");
        if (countEl) countEl.textContent = pickerSelected.length + " of " + pickerLimit + " selected";
        var proceedBtn = document.getElementById("picker-proceed");
        if (proceedBtn) proceedBtn.disabled = (pickerSelected.length !== pickerLimit);
    }

    function proceedWithPicker() {
        var toolsParam = pickerSelected.join(",");
        window.location.href = "/login?tab=signup&tier=" + pickerTier + "&tools=" + toolsParam;
    }

    function handlePromptParam() {
        var params = new URLSearchParams(window.location.search);
        if (params.get("prompt") === "true") {
            var el = document.getElementById("bundles");
            if (el) setTimeout(function() { el.scrollIntoView({ behavior: "smooth" }); }, 200);
        }
    }

    handlePromptParam();