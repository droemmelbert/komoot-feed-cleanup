let isHomepage = false;
let hideSponsored = true;
let hideRegional = true;
let hideKomootCollections = true;
let hideSuggestedProfiles = true;
let hideWhatsNew = true;
let hideChallenges = true;
let hideEvents = true;
let redirectToProfile = false;
let extensionEnabled = true;
let activeObserver = null;
let profileRedirectTriggered = false;

const getProfileUrlFromSavedRoutes = () => {
    const savedRoutesLink = document.querySelector('a[href*="/saved-routes/"]');
    const savedRoutesHref = savedRoutesLink?.getAttribute("href")?.trim();

    if (!savedRoutesHref) {
        return null;
    }

    try {
        const savedRoutesUrl = new URL(savedRoutesHref, window.location.origin);
        const match = savedRoutesUrl.pathname.match(/^\/(?:(?<locale>[a-z]{2}(?:-[a-z]{2})?)\/)?saved-routes\/(?<id>\d+)\/?$/i);

        if (!match?.groups?.id) {
            return null;
        }

        const {locale, id} = match.groups;
        const profilePath = locale ? `/${locale}/user/${id}` : `/user/${id}`;

        return new URL(profilePath, savedRoutesUrl.origin).href;
    } catch (error) {
        return null;
    }
};

const attemptProfileRedirect = () => {
    if (!redirectToProfile || !isHomepage || profileRedirectTriggered) {
        return false;
    }

    const profileUrl = getProfileUrlFromSavedRoutes();
    if (!profileUrl) {
        return false;
    }

    profileRedirectTriggered = true;
    window.location.assign(profileUrl);
    console.log(`Komoot Feed Cleanup Extension: Redirecting to profile page: ${profileUrl}`);
    return true;
};

const hidePaywallOverlay = () => {
    const overlay = document.querySelector('[data-paywall-overlay="true"]');
    const firstButton = overlay?.querySelector('button');

    if (firstButton) {
        firstButton.click();
        console.log("Removed paywall overlay.");
    }
};

const hidePeakBaggingDialog = () => {
    for (const dialog of document.querySelectorAll('dialog[open]')) {
        if (dialog.querySelector('img[src*="/images/peak-bagging/"]')) {
            const firstButton = dialog.querySelector('button');
            if (firstButton) {
                firstButton.click();
                console.log("Removed peak bagging dialog.");
            }
            break;
        }
    }
};

const hideFamilyPlanDialog = () => {
    for (const dialog of document.querySelectorAll('dialog[open]')) {
        const hasFamilyPlanArtwork = Boolean(dialog.querySelector('img[src*="/images/paywalls/family-plan/"]'));
        const dialogText = dialog.textContent?.toLowerCase() || "";
        const looksLikeFamilyPlanDialog = hasFamilyPlanArtwork ||
            dialogText.includes("family plan") ||
            dialogText.includes("bring deine touren zum leben") ||
            dialogText.includes("premium family plan");

        if (!looksLikeFamilyPlanDialog) {
            continue;
        }

        const closeButton =
            dialog.querySelector('button[aria-label="Schließen"]') ||
            dialog.querySelector('button[aria-label="Close"]') ||
            dialog.querySelector('button');

        if (closeButton) {
            closeButton.click();
            console.log("Removed family plan dialog.");
        }

        break;
    }
};

const hideFamilyPlanBanner = () => {
    const familyPlanImage = document.querySelector(
        'img[src*="/images/family-plan/banner-visual.webp"], img[src*="/images/family-plan/banner-visual@2x.webp"]'
    );
    const familyPlanLink = document.querySelector('a[href*="/family-plan"]');

    const bannerRoot = familyPlanImage?.closest('div')?.parentElement?.parentElement ||
        familyPlanLink?.closest('div')?.parentElement?.parentElement;

    if (bannerRoot && !bannerRoot.hasAttribute("data-kfc-hidden")) {
        hidePostSafely(bannerRoot);
        console.log("Komoot Feed Cleanup Extension: Removed family plan banner.");
    }
};

const hideHomeTabBar = () => {
    const tabBar = document.querySelector('[data-test-id="t_home_tab_bar"]');

    if (tabBar && !tabBar.hasAttribute("data-kfc-hidden")) {
        hidePostSafely(tabBar);
        console.log("Komoot Feed Cleanup Extension: Removed home tab bar.");
    }
};

const getIsHomepage = (url) => {
    try {
        const {pathname} = new URL(url);
        const homepagePattern = /^\/([a-z]{2}-[a-z]{2}|[a-z]{2})?\/??$/i;
        return homepagePattern.test(pathname);
    } catch (e) {
        return false;
    }
};

let updateSettings = () => {
    isHomepage = getIsHomepage(window.location.href);
};

function reloadExtensionSettings() {
    return browser.storage.sync.get([
        "hideSponsored",
        "hideRegional",
        "hideKomootCollections",
        "hideSuggestedProfiles",
        "hideWhatsNew",
        "hideChallenges",
        "hideEvents",
        "redirectToProfile",
        "extensionEnabled"
    ]).then(settings => {
        hideSponsored = settings.hideSponsored ?? true;
        hideRegional = settings.hideRegional ?? true;
        hideKomootCollections = settings.hideKomootCollections ?? true;
        hideSuggestedProfiles = settings.hideSuggestedProfiles ?? true;
        hideWhatsNew = settings.hideWhatsNew ?? true;
        hideChallenges = settings.hideChallenges ?? true;
        hideEvents = settings.hideEvents ?? true;
        redirectToProfile = settings.redirectToProfile ?? false;
        extensionEnabled = settings.extensionEnabled !== false;

        if (extensionEnabled && isHomepage) {
            cleanHomepage(); // Clean up instantly using global scope
        } else if (!extensionEnabled) {
            // Unhide everything (global selector naturally catches the carousel too)
            document.querySelectorAll('[data-kfc-hidden="true"]').forEach(post => {
                post.style.display = "";
                post.removeAttribute("data-kfc-hidden");
            });
        }
    });
}

function hidePostSafely(post) {
    post.style.display = "none";
    post.setAttribute("data-kfc-hidden", "true");
}

let cleanHomepage = () => {
    if (attemptProfileRedirect()) {
        return;
    }

    hidePaywallOverlay();
    hidePeakBaggingDialog();
    hideFamilyPlanDialog();
    hideFamilyPlanBanner();
    hideHomeTabBar();

    if (hideEvents) {
        const homeEventsSection = document.querySelector('[data-test-id="t_home_feed_public_events"]');
        if (homeEventsSection && !homeEventsSection.hasAttribute("data-kfc-hidden")) {
            hidePostSafely(homeEventsSection);
            console.log("Komoot Feed Cleanup Extension: Removed home events section.");
        }
    }

    // 1. Handle Challenges Carousel (checks globally on the page)
    if (hideChallenges) {
        const challengesCarousel = document.querySelector('[data-test-id="challenges-carousel"]');
        if (challengesCarousel && !challengesCarousel.hasAttribute("data-kfc-hidden")) {
            hidePostSafely(challengesCarousel);
            console.log("Komoot Feed Cleanup Extension: Removed challenges carousel.");
        }
    }

    // 2. Handle Feed Section Articles
    const feedSection = document.querySelector('section[role="feed"]');
    if (!feedSection) return;

    const posts = feedSection.querySelectorAll('article');
    posts.forEach(post => {
        if (hideChallenges) {
            if (post.querySelector('a[href*="/challenges/"]')) {
                hidePostSafely(post);
                console.log("Komoot Feed Cleanup Extension: Removed a challenge feed article.");
                return;
            }
        }

        if (hideSponsored) {
            if (post.querySelector('[data-test-id^="collection-activity:"]')) {
                hidePostSafely(post);
                console.log("Komoot Feed Cleanup Extension: Removed a sponsored post.");
                return;
            }
        }

        if (hideKomootCollections) {
            const headerText = post.querySelector('header')?.textContent || '';
            const isKomootCollection = headerText.toLowerCase().includes('von komoot') ||
                headerText.toLowerCase().includes('by komoot') ||
                headerText.toLowerCase().includes('colección de komoot') ||
                headerText.toLowerCase().includes('collection par komoot');

            if (isKomootCollection) {
                hidePostSafely(post);
                console.log("Komoot Feed Cleanup Extension: Removed a Komoot editorial collection.");
                return;
            }
        }

        if (hideRegional) {
            const divs = post.querySelectorAll('div');
            let isRegional = false;

            for (const div of divs) {
                const text = div.textContent.trim();
                if (text.toLowerCase().includes('aus der region') ||
                    text.toLowerCase().includes('in your region') ||
                    text.toLowerCase().includes('interesting in your region') ||
                    text.toLowerCase().includes('dans la région') ||
                    text.toLowerCase().includes('dalla tua regione') ||
                    text.toLowerCase().includes('sitios interesantes en tu región')
                ) {
                    isRegional = true;
                    break;
                }
            }

            if (isRegional) {
                hidePostSafely(post);
                console.log("Komoot Feed Cleanup Extension: Removed a regional post.");
                return;
            }
        }

        if (hideSuggestedProfiles) {
            const isProfileSuggestion = post.querySelector('[data-test-id="user-recommendations"]');
            if (isProfileSuggestion) {
                hidePostSafely(post);
                console.log("Komoot Feed Cleanup Extension: Removed a suggested profiles block.");
                return;
            }
        }

        if (hideWhatsNew) {
            const divs = post.querySelectorAll('div');
            let isWhatsNew = false;

            for (const div of divs) {
                const text = div.textContent.trim().toLowerCase();
                if (text === "what's new" ||
                    text === "was gibt's neues" ||
                    text === "neuigkeiten" ||
                    text === "nouveautés" ||
                    text === "novedades" ||
                    text === "novità"
                ) {
                    isWhatsNew = true;
                    break;
                }
            }

            if (isWhatsNew) {
                hidePostSafely(post);
                console.log("Komoot Feed Cleanup Extension: Removed a 'What's New' app feature update.");
            }
        }
    });
};

let initGlobalObserver = () => {
    if (activeObserver) activeObserver.disconnect();

    activeObserver = new MutationObserver(() => {
        if (!extensionEnabled) return;
        updateSettings();
        if (!isHomepage) return;

        cleanHomepage(); // Runs globally across the body mutations
    });

    activeObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
};

browser.runtime.onMessage.addListener((request) => {
    if (request.action === "updateSettings") {
        reloadExtensionSettings();
    }
});

async function initializeExtension() {
    updateSettings();
    await reloadExtensionSettings();
    initGlobalObserver();
}

initializeExtension();

console.log("✅ Komoot Feed Cleanup Extension active");