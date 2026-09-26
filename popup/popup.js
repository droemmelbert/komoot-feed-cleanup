/**
 * Komoot Feed Cleanup - Popup Controller
 */

(() => {
    'use strict';

    const browserAPI = globalThis.browser || globalThis.chrome;

    const DEFAULT_SETTINGS = Object.freeze({
        extensionEnabled: true,
        hideSponsored: true,
        hideKomootCollections: true,
        hideRegional: true,
        hideSuggestedProfiles: true,
        hideWhatsNew: true,
        hideChallenges: true,
        hideEvents: true,
        redirectToProfile: false
    });

    const powerButton = document.getElementById('powerButton');
    const settingsList = document.getElementById('settingsList');
    const checkboxes = document.querySelectorAll('input[type="checkbox"][data-setting]');

    let isEnabled = true;

    /**
     * Updates power button visual state and accessibility attributes.
     */
    const renderPowerState = () => {
        powerButton.classList.toggle('on', isEnabled);
        powerButton.classList.toggle('off', !isEnabled);
        powerButton.setAttribute('aria-checked', String(isEnabled));
        settingsList.classList.toggle('disabled', !isEnabled);

        checkboxes.forEach(cb => {
            cb.disabled = !isEnabled;
        });
    };

    /**
     * Optional direct tab ping. Storage onChanged handles actual state synchronization,
     * but this provides immediate notification if a content script is already listening.
     */
    const notifyActiveTabs = async () => {
        try {
            if (!browserAPI.tabs?.query) return;
            const tabs = await browserAPI.tabs.query({ url: '*://*.komoot.com/*' });
            for (const tab of tabs) {
                if (tab.id) {
                    browserAPI.tabs.sendMessage(tab.id, { action: 'updateSettings' }).catch(() => {});
                }
            }
        } catch {
            // Ignore tab query errors if permissions or protocol disallow
        }
    };

    /**
     * Toggles the master power switch.
     */
    const togglePower = async () => {
        isEnabled = !isEnabled;
        renderPowerState();
        await browserAPI.storage.sync.set({ extensionEnabled: isEnabled });
        notifyActiveTabs();
    };

    /**
     * Loads saved settings from storage in a single async request.
     */
    const loadSettings = async () => {
        try {
            const settings = await browserAPI.storage.sync.get(DEFAULT_SETTINGS);
            isEnabled = settings.extensionEnabled !== false;
            renderPowerState();

            checkboxes.forEach(cb => {
                const key = cb.dataset.setting;
                if (key in settings) {
                    cb.checked = Boolean(settings[key]);
                }
            });
        } catch (error) {
            console.error('[Komoot Feed Cleanup] Error loading settings in popup:', error);
        }
    };

    // Power button event listeners
    powerButton.addEventListener('click', togglePower);
    powerButton.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            togglePower();
        }
    });

    // Checkbox change handlers
    checkboxes.forEach(cb => {
        const key = cb.dataset.setting;
        cb.addEventListener('change', async () => {
            await browserAPI.storage.sync.set({ [key]: cb.checked });
            notifyActiveTabs();
        });
    });

    loadSettings();
})();