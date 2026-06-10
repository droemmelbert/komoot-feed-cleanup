const checkboxes = document.querySelectorAll('input[type="checkbox"][data-setting]');
const powerButton = document.getElementById("powerButton");
const settingsGroup = document.getElementById("settingsGroup");

let isExtensionEnabled = true;

function updatePowerButtonState() {
    const enabled = isExtensionEnabled;

    powerButton.classList.toggle("on", enabled);
    powerButton.classList.toggle("off", !enabled);

    settingsGroup.classList.toggle("disabled", !enabled);

    checkboxes.forEach((checkbox) => {
        checkbox.disabled = !enabled;
    });

    powerButton.setAttribute("aria-pressed", String(enabled));
}

async function loadPowerState() {
    const data = await browser.storage.sync.get("extensionEnabled");
    isExtensionEnabled = data.extensionEnabled !== false; // default: true
    updatePowerButtonState();
}

powerButton.addEventListener("click", async () => {
    isExtensionEnabled = !isExtensionEnabled;
    await browser.storage.sync.set({ extensionEnabled: isExtensionEnabled });
    updatePowerButtonState();
});

checkboxes.forEach((checkbox) => {
    const key = checkbox.dataset.setting;

    browser.storage.sync.get(key).then((data) => {
        checkbox.checked = data[key] ?? true;
    });

    checkbox.addEventListener("change", () => {
        browser.storage.sync.set({ [key]: checkbox.checked });
    });
});

loadPowerState();