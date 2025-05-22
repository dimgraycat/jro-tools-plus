const test = (): void => {
    chrome.tabs.create({
        url: "/tools/index.html"
    })
}

(() => {
    chrome.action.onClicked.addListener(test)
})()