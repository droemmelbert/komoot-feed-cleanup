let isHomepage = false;
let hideSponsored = true;
let hideRegional = true;
let hideKomootCollections = true;
let hideSuggestedProfiles = true;
let extensionEnabled = true;
let activeObserver = null; // Track the observer so we can disconnect it if needed

const getIsHomepage = (url) => {
    try {
        const { pathname } = new URL(url);
        // Matches: "/", "", "/de-de", "/en-us", "/fr"
        // Does NOT match: "/discover", "/de-de/discover"
        const homepagePattern = /^\/([a-z]{2}-[a-z]{2}|[a-z]{2})?\/??$/i;
        return homepagePattern.test(pathname);
    } catch (e) {
        return false;
    }
};

let updateSettings = () => {
    let currentURL = window.location.href;
    isHomepage = getIsHomepage(currentURL);
};

// Retrieve user settings from storage
browser.storage.sync.get(["hideSponsored"]).then(settings => {
    hideSponsored = settings.hideSponsored ?? true;
});

browser.storage.sync.get(["hideRegional"]).then(settings => {
    hideRegional = settings.hideRegional ?? true;
});

browser.storage.sync.get(["hideKomootCollections"]).then(settings => {
    hideKomootCollections = settings.hideKomootCollections ?? true;
});

browser.storage.sync.get(["hideSuggestedProfiles"]).then(settings => {
    hideSuggestedProfiles = settings.hideSuggestedProfiles ?? true;
});

browser.storage.sync.get(["extensionEnabled"]).then(settings => {
    extensionEnabled = settings.extensionEnabled !== false; // default: true
});

function hidePostSafely(post) {
    // keep node in DOM but make it invisible and non-interactive
    post.style.display = "none";
    post.setAttribute("data-kfc-hidden", "true"); // for debugging/undo
}

let removePosts = (feedSection) => {
    const posts = feedSection.querySelectorAll('article');
    posts.forEach(post => {
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
            }
        }
    });
};

// This function monitors the WHOLE page body for the feed setup
let initGlobalObserver = () => {
    if (activeObserver) activeObserver.disconnect();

    activeObserver = new MutationObserver(() => {
        // Stop all processing if the extension is disabled
        if (!extensionEnabled) return;

        // Double check if we are still on the homepage (handles SPA navigation)
        updateSettings();
        if (!isHomepage) return;

        // Look for the feed section
        const feedSection = document.querySelector('section[role="feed"]');
        if (feedSection) {
            removePosts(feedSection);
        }
    });

    activeObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
};

// Run everything
updateSettings();
initGlobalObserver();

console.log("✅ Komoot Feed Cleanup Extension active");