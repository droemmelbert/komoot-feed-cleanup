let isHomepage = false;
let hideSponsored = true;
let hideRegional = true;
let hideKomootCollections = true;
let hideSuggestedProfiles = true;
let hideWhatsNew = true;
let hideChallenges = true;
let redirectToProfile = false;
let extensionEnabled = true;
let activeObserver = null;
let lastObservedURL = "";
let profileRedirectTriggered = false;

const resetProfileRedirectState = () => {
    profileRedirectTriggered = false;
};

const getProfileUrlFromHead = () => {
    const ogUrlMeta = document.head?.querySelector('meta[property="og:url"]');
    const profileUrl = ogUrlMeta?.getAttribute("content")?.trim();

    return profileUrl || null;
};

const attemptProfileRedirect = () => {
    if (!redirectToProfile || !isHomepage || profileRedirectTriggered) {
        return false;
    }

    const profileUrl = getProfileUrlFromHead();
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
    let currentURL = window.location.href;
    if (currentURL !== lastObservedURL) {
        lastObservedURL = currentURL;
        resetProfileRedirectState();
    }

    isHomepage = getIsHomepage(currentURL);
};

function reloadExtensionSettings() {
    return browser.storage.sync.get([
        "hideSponsored",
        "hideRegional",
        "hideKomootCollections",
        "hideSuggestedProfiles",
        "hideWhatsNew",
        "hideChallenges",
        "redirectToProfile",
        "extensionEnabled"
    ]).then(settings => {
        hideSponsored = settings.hideSponsored ?? true;
        hideRegional = settings.hideRegional ?? true;
        hideKomootCollections = settings.hideKomootCollections ?? true;
        hideSuggestedProfiles = settings.hideSuggestedProfiles ?? true;
        hideWhatsNew = settings.hideWhatsNew ?? true;
        hideChallenges = settings.hideChallenges ?? true;
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