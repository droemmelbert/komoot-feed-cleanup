let isHomepage = false;
let hideSponsored = true;

let updateSettings = () => {
    let currentURL = window.location.href;
    isHomepage = getIsHomepage(currentURL);
}

const getIsHomepage = (url) => {
    try {
        const { pathname } = new URL(url);
        // Matches: "/", "", "/de-de", "/en-us", "/fr"
        // Does NOT match: "/discover", "/de-de/discover"
        const homepagePattern = /^\/([a-z]{2}-[a-z]{2}|[a-z]{2})?\/??$/i;

        return homepagePattern.test(pathname);
    } catch (e) {
        // Handle invalid URL strings gracefully
        return false;
    }
};


// Retrieve user settings from storage
browser.storage.sync.get(["hideSponsored"]).then(settings => {
    hideSponsored = settings.hideSponsored ?? true;
});

let removePosts = (feedSection) => {
    const posts = feedSection.querySelectorAll('article');
    console.log(`Found ${posts.length} posts in the feed.`);
    posts.forEach(post => {
        const isCollectionAd = post.querySelector('[data-test-id^="collection-activity:"]');
        if (isCollectionAd) {
            post.remove();
            console.log("Removed a sponsored post.");
        }
    })
}

let startObserverAndRemovePosts = () => {
    const feedSection = document.querySelector('section[role="feed"]');
    if (feedSection) {
        removePosts(feedSection);
        // Initialize the observer
        const observer = new MutationObserver((mutationsList) => {
            for (const mutation of mutationsList) {
                // Look for newly added nodes
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    console.log("Detected new nodes added to the feed. Checking for sponsored posts...");
                    // Trigger our cleanup whenever the DOM tree inside the feed shifts
                    removePosts(feedSection);
                    break; // Break the inner loop to prevent redundant iterations
                }
            }
        });

        // Start observing the feed for direct children modifications
        observer.observe(feedSection, {
            childList: true, // Watch for adding/removing children (like new <article>s)
            subtree: true    // Watch deep inside the feed layout if elements lazy-load structure
        });
    }

}

let onPageUpdate = () => {
    updateSettings();
    if (isHomepage) {
        startObserverAndRemovePosts();
    }
};

// initial run
onPageUpdate();
console.log("Komoot Feed Cleanup Extension active ✅");