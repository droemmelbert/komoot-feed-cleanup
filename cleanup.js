/**
 * Komoot Feed Cleanup - Content Script
 * High-performance, low-overhead feed cleaner for Komoot.
 */

(() => {
    'use strict';

    const browserAPI = globalThis.browser || globalThis.chrome;

    const DEFAULT_SETTINGS = Object.freeze({
        extensionEnabled: true,
        hideSponsored: true,
        hideRegional: true,
        hideKomootCollections: true,
        hideSuggestedProfiles: true,
        hideWhatsNew: true,
        hideChallenges: true,
        hideEvents: true,
        redirectToProfile: false
    });

    let currentSettings = { ...DEFAULT_SETTINGS };
    let isHomepage = false;
    let observer = null;
    let rafHandle = null;
    let redirectAttempted = false;
    let styleElement = null;

    // Compiled keyword matchers for language-agnostic detection
    const KOMOOT_COLLECTION_KEYWORDS = [
        'von komoot',
        'by komoot',
        'colección de komoot',
        'collection par komoot',
        'da komoot',
        'di komoot',
        'van komoot'
    ];

    const REGIONAL_KEYWORDS = [
        'aus der region',
        'in deiner region',
        'aus deiner region',
        'in der region',
        'deiner region',
        'in your region',
        'interesting in your region',
        'popular in your region',
        'from your region',
        'in your area',
        'near you',
        'dans la région',
        'dans votre région',
        'de votre région',
        'de la région',
        'dalla tua regione',
        'nella tua regione',
        'dalla vostra regione',
        'nella vostra regione',
        'sitios interesantes en tu región',
        'en tu región',
        'de tu región',
        'en tu zona',
        'uit je regio',
        'in je regio',
        'uit jouw regio',
        'in jouw regio'
    ];

    const WHATS_NEW_KEYWORDS = [
        "what's new",
        "was gibt's neues",
        "neuigkeiten",
        "nouveautés",
        "novedades",
        "novità",
        "wat is er nieuw",
        "nieuws"
    ];

    /**
     * Safely hides a DOM element using both forceful inline style and data attribute.
     */
    const hidePostSafely = (el) => {
        if (!el) return;
        el.style.setProperty('display', 'none', 'important');
        el.setAttribute('data-kfc-hidden', 'true');
    };

    /**
     * Restores visibility of a previously hidden DOM element.
     */
    const restorePostSafely = (el) => {
        if (!el) return;
        el.style.removeProperty('display');
        el.removeAttribute('data-kfc-hidden');
    };

    /**
     * Determine if current pathname corresponds to a Komoot feed view.
     * Matches "/", localized roots like "/de/", "/discover", "/home", or any page rendering feed articles.
     */
    const checkIsHomepage = (url = window.location.href) => {
        try {
            const { pathname } = new URL(url);
            const isFeedPath = /^\/(?:[a-z]{2}(?:-[a-z]{2})?)?\/?(?:discover|home|feed)?\/?$/i.test(pathname);
            if (isFeedPath) return true;
            // Also treat as feed page if feed article elements are present
            return Boolean(document.querySelector('article, section[role="feed"], [role="feed"]'));
        } catch {
            return true;
        }
    };

    /**
     * Resolves the current user's profile URL from available links in navigation or saved routes.
     */
    const getProfileUrl = () => {
        // 1. Saved routes link (contains user numeric ID)
        const savedRoutesLink = document.querySelector('a[href*="/saved-routes/"]');
        if (savedRoutesLink) {
            const href = savedRoutesLink.getAttribute('href')?.trim();
            if (href) {
                const match = href.match(/(?:\/([a-z]{2}(?:-[a-z]{2})?))?\/saved-routes\/(\d+)/i);
                if (match) {
                    const [, locale, id] = match;
                    const basePath = locale ? `/${locale}/user/${id}` : `/user/${id}`;
                    return new URL(basePath, window.location.origin).href;
                }
            }
        }

        // 2. Direct user links in header/navigation
        const userLinks = document.querySelectorAll(
            'header a[href*="/user/"], nav a[href*="/user/"], [data-test-id*="user"] a[href*="/user/"]'
        );
        for (const link of userLinks) {
            const href = link.getAttribute('href')?.trim();
            if (href) {
                const match = href.match(/(?:\/([a-z]{2}(?:-[a-z]{2})?))?\/user\/(\d+)\/?(?:[?#]|$)/i);
                if (match) {
                    const [, locale, id] = match;
                    const basePath = locale ? `/${locale}/user/${id}` : `/user/${id}`;
                    return new URL(basePath, window.location.origin).href;
                }
            }
        }

        return null;
    };

    /**
     * Fast redirect to profile page if setting is enabled on homepage.
     * Uses location.replace to avoid trapping browser history.
     */
    const attemptProfileRedirect = () => {
        if (!currentSettings.redirectToProfile || !isHomepage || redirectAttempted) {
            return false;
        }

        const profileUrl = getProfileUrl();
        if (profileUrl) {
            redirectAttempted = true;
            window.location.replace(profileUrl);
            return true;
        }
        return false;
    };

    /**
     * Injects or updates declarative CSS rules for instantaneous, zero-latency hiding.
     */
    const updateInjectedStyles = () => {
        const targetParent = document.head || document.documentElement;
        if (!targetParent) {
            document.addEventListener('DOMContentLoaded', updateInjectedStyles, { once: true });
            return;
        }

        if (!styleElement) {
            styleElement = document.createElement('style');
            styleElement.id = 'kfc-dynamic-styles';
            targetParent.appendChild(styleElement);
        }

        if (!currentSettings.extensionEnabled) {
            styleElement.textContent = '';
            return;
        }

        const selectors = [
            // Always-hidden promotional banners & overlays when extension is enabled
            '[data-paywall-overlay="true"]',
            '[data-test-id="t_home_tab_bar"]',
            'div:has(> img[src*="/images/family-plan/banner-visual"])',
            'a[href*="/family-plan"]:not(nav *)',
            // Marked items via JS scanner
            'article[data-kfc-hidden="true"]',
            '[data-kfc-hidden="true"]'
        ];

        if (currentSettings.hideEvents) {
            selectors.push('[data-test-id="t_home_feed_public_events"]');
        }

        if (currentSettings.hideChallenges) {
            selectors.push(
                '[data-test-id="challenges-carousel"]',
                'article:has(a[href*="/challenges/"])'
            );
        }

        if (currentSettings.hideSponsored) {
            selectors.push('article:has([data-test-id^="collection-activity:"])');
        }

        if (currentSettings.hideSuggestedProfiles) {
            selectors.push('article:has([data-test-id="user-recommendations"])');
        }

        styleElement.textContent = `${selectors.join(',\n')} {\n    display: none !important;\n}`;
    };

    /**
     * Safely dismisses or closes promotional and paywall dialogs.
     */
    const handleOpenDialogs = () => {
        const openDialogs = document.querySelectorAll('dialog[open]:not([data-kfc-dialog-handled])');
        for (const dialog of openDialogs) {
            const hasPeakBagging = Boolean(dialog.querySelector('img[src*="/images/peak-bagging/"]'));
            const hasFamilyPlanArtwork = Boolean(dialog.querySelector('img[src*="/images/paywalls/family-plan/"]'));
            const text = (dialog.textContent || '').toLowerCase();
            const isFamilyPlan = hasFamilyPlanArtwork ||
                text.includes('family plan') ||
                text.includes('bring deine touren zum leben') ||
                text.includes('premium family plan');

            if (!hasPeakBagging && !isFamilyPlan) {
                continue;
            }

            dialog.setAttribute('data-kfc-dialog-handled', 'true');

            // Find genuine close button
            const closeBtn = dialog.querySelector(
                'button[aria-label*="schließen" i], button[aria-label*="close" i], button[aria-label*="fermer" i], button[data-test-id*="close"]'
            );

            if (closeBtn) {
                closeBtn.click();
            } else if (typeof dialog.close === 'function') {
                dialog.close();
            } else {
                dialog.style.display = 'none';
            }
        }
    };

    /**
     * Hides paywall overlays.
     */
    const hidePaywallOverlay = () => {
        const overlay = document.querySelector('[data-paywall-overlay="true"]');
        if (overlay) {
            hidePostSafely(overlay);
            const firstButton = overlay.querySelector('button');
            if (firstButton) firstButton.click();
        }
    };

    /**
     * Hides family plan promotional banners.
     */
    const hideFamilyPlanBanner = () => {
        const familyPlanImage = document.querySelector(
            'img[src*="/images/family-plan/banner-visual.webp"], img[src*="/images/family-plan/banner-visual@2x.webp"]'
        );
        const familyPlanLink = document.querySelector('a[href*="/family-plan"]');

        const bannerRoot = familyPlanImage?.closest('div')?.parentElement?.parentElement ||
            familyPlanLink?.closest('div')?.parentElement?.parentElement;

        if (bannerRoot && !bannerRoot.hasAttribute('data-kfc-hidden')) {
            hidePostSafely(bannerRoot);
        }
    };

    /**
     * Hides the home tab bar if present.
     */
    const hideHomeTabBar = () => {
        const tabBar = document.querySelector('[data-test-id="t_home_tab_bar"]');
        if (tabBar && !tabBar.hasAttribute('data-kfc-hidden')) {
            hidePostSafely(tabBar);
        }
    };

    /**
     * Tests if an article matches any cleanup criteria in a single efficient pass.
     */
    const shouldHideArticle = (article) => {
        // 1. Challenges
        if (currentSettings.hideChallenges && article.querySelector('a[href*="/challenges/"]')) {
            return true;
        }

        // 2. Sponsored posts
        if (currentSettings.hideSponsored && article.querySelector('[data-test-id^="collection-activity:"]')) {
            return true;
        }

        // 3. Suggested profiles
        if (currentSettings.hideSuggestedProfiles && article.querySelector('[data-test-id="user-recommendations"]')) {
            return true;
        }

        const fullArticleText = (article.textContent || '').toLowerCase();

        // 4. Komoot Curated Collections
        if (currentSettings.hideKomootCollections) {
            const header = article.querySelector('header');
            const headerText = (header?.textContent || '').toLowerCase();
            if (
                KOMOOT_COLLECTION_KEYWORDS.some(kw => headerText.includes(kw) || fullArticleText.includes(kw)) ||
                article.querySelector('a[href*="/user/komoot"]')
            ) {
                return true;
            }
        }

        // 5. Regional Recommendations
        if (currentSettings.hideRegional) {
            // Check full text
            if (REGIONAL_KEYWORDS.some(kw => fullArticleText.includes(kw))) {
                return true;
            }

            // Sub-element scan for styled or isolated badges (e.g. <div class="css-1rvgt1a">Aus der Region</div>)
            const elements = article.querySelectorAll('div, span, p, header');
            for (const el of elements) {
                const text = el.textContent?.trim().toLowerCase();
                if (text && REGIONAL_KEYWORDS.some(kw => text === kw || text.includes(kw))) {
                    return true;
                }
            }
        }

        // 6. "What's New" app updates
        if (currentSettings.hideWhatsNew) {
            for (const kw of WHATS_NEW_KEYWORDS) {
                if (fullArticleText.includes(kw)) {
                    return true;
                }
            }
        }

        return false;
    };

    /**
     * Cleans feed articles across the entire document.
     */
    const cleanFeedArticles = () => {
        const candidateArticles = document.querySelectorAll('article:not([data-kfc-hidden="true"])');

        for (const article of candidateArticles) {
            if (shouldHideArticle(article)) {
                hidePostSafely(article);
            }
        }
    };

    /**
     * Main cleanup routine.
     */
    const cleanHomepage = () => {
        if (!currentSettings.extensionEnabled || !isHomepage) return;

        if (attemptProfileRedirect()) {
            return;
        }

        hidePaywallOverlay();
        handleOpenDialogs();
        hideFamilyPlanBanner();
        hideHomeTabBar();

        if (currentSettings.hideEvents) {
            const events = document.querySelector('[data-test-id="t_home_feed_public_events"]');
            if (events) hidePostSafely(events);
        }

        if (currentSettings.hideChallenges) {
            const carousel = document.querySelector('[data-test-id="challenges-carousel"]');
            if (carousel) hidePostSafely(carousel);
        }

        cleanFeedArticles();
    };

    /**
     * Schedules cleanup execution on the next animation frame to coalesce DOM mutations.
     */
    const scheduleCleanup = () => {
        if (rafHandle !== null) return;
        rafHandle = requestAnimationFrame(() => {
            rafHandle = null;
            isHomepage = checkIsHomepage();
            if (!currentSettings.extensionEnabled || !isHomepage) return;
            cleanHomepage();
        });
    };

    /**
     * Resets state and re-runs cleanup when settings change.
     */
    const reapplySettings = () => {
        isHomepage = checkIsHomepage();
        updateInjectedStyles();

        if (!currentSettings.extensionEnabled) {
            // Restore visibility of any hidden elements
            document.querySelectorAll('[data-kfc-hidden="true"]').forEach(restorePostSafely);
            return;
        }

        if (isHomepage) {
            // Re-evaluate all articles with new settings
            document.querySelectorAll('article').forEach(restorePostSafely);
            cleanHomepage();
        }
    };

    /**
     * Loads settings from storage and updates state.
     */
    const loadSettings = async () => {
        try {
            const stored = await browserAPI.storage.sync.get(DEFAULT_SETTINGS);
            currentSettings = { ...DEFAULT_SETTINGS, ...stored };
            reapplySettings();
        } catch (error) {
            console.warn('[Komoot Feed Cleanup] Error loading settings:', error);
        }
    };

    /**
     * Sets up DOM MutationObserver to catch dynamically loaded posts and dialogs.
     */
    const startObserver = () => {
        if (observer) observer.disconnect();

        observer = new MutationObserver(() => {
            if (!currentSettings.extensionEnabled) return;
            scheduleCleanup();
        });

        const target = document.body || document.documentElement;
        if (target) {
            observer.observe(target, {
                childList: true,
                subtree: true
            });
        }
    };

    /**
     * Sets up storage change listeners for automatic multi-tab synchronization.
     */
    const setupStorageListener = () => {
        browserAPI.storage.onChanged.addListener((changes, area) => {
            if (area !== 'sync' && area !== 'local') return;

            let updated = false;
            for (const key of Object.keys(changes)) {
                if (key in DEFAULT_SETTINGS) {
                    currentSettings[key] = changes[key].newValue;
                    updated = true;
                }
            }

            if (updated) {
                reapplySettings();
            }
        });

        // Backup runtime message listener
        browserAPI.runtime.onMessage.addListener((msg) => {
            if (msg?.action === 'updateSettings') {
                loadSettings();
            }
        });
    };

    /**
     * Initialize extension lifecycle.
     */
    const init = () => {
        isHomepage = checkIsHomepage();
        setupStorageListener();
        loadSettings();
        startObserver();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                updateInjectedStyles();
                isHomepage = checkIsHomepage();
                cleanHomepage();
            }, { once: true });
        } else {
            updateInjectedStyles();
            cleanHomepage();
        }
    };

    init();
})();