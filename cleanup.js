let isHomepage = false;
let hideSponsored = true;
let hideRegional = true;
let hideKomootCollections = true;
let hideSuggestedProfiles = true;
let hideWhatsNew = true;
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

function reloadExtensionSettings() {
    return browser.storage.sync.get([
        "hideSponsored",
        "hideRegional",
        "hideKomootCollections",
        "hideSuggestedProfiles",
        "hideWhatsNew",
        "extensionEnabled"
    ]).then(settings => {
        hideSponsored = settings.hideSponsored ?? true;
        hideRegional = settings.hideRegional ?? true;
        hideKomootCollections = settings.hideKomootCollections ?? true;
        hideSuggestedProfiles = settings.hideSuggestedProfiles ?? true;
        hideWhatsNew = settings.hideWhatsNew ?? true;
        extensionEnabled = settings.extensionEnabled !== false; // default: true

        // If the extension is enabled and we are on the homepage, clean up instantly
        if (extensionEnabled && isHomepage) {
            const feedSection = document.querySelector('section[role="feed"]');
            if (feedSection) {
                removePosts(feedSection);
            }
        } else if (!extensionEnabled) {
            // Unhide hidden posts if extension is turned off without reloading
            document.querySelectorAll('[data-kfc-hidden="true"]').forEach(post => {
                post.style.display = "";
                post.removeAttribute("data-kfc-hidden");
            });
        }
    });
}

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
                return;
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

browser.runtime.onMessage.addListener((request) => {
    if (request.action === "updateSettings") {
        reloadExtensionSettings();
    }
});

// Run everything
async function initializeExtension() {
    updateSettings();
    await reloadExtensionSettings(); // Wait for settings to load
    initGlobalObserver();
}

initializeExtension();

console.log("✅ Komoot Feed Cleanup Extension active");