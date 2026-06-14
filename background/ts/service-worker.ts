type SidePanelOpenInfo = {
    path: string;
    tabId?: number;
    windowId: number;
};

type SidePanelCloseInfo = SidePanelOpenInfo;

type SidePanelWithClose = typeof chrome.sidePanel & {
    close?: (options: { tabId?: number; windowId?: number }) => Promise<void>;
    onOpened?: chrome.events.Event<(info: SidePanelOpenInfo) => void>;
    onClosed?: chrome.events.Event<(info: SidePanelCloseInfo) => void>;
};

const SIDEPANEL_PATH = 'tools/sidepanel.html';
const OPEN_WINDOWS_STORAGE_KEY = 'sidePanelOpenWindows';
const openWindows = new Set<number>();
const sidePanel = chrome.sidePanel as SidePanelWithClose;

async function readOpenWindows(): Promise<Record<string, boolean>> {
    const result = await chrome.storage.session.get([OPEN_WINDOWS_STORAGE_KEY]);
    const stored = result[OPEN_WINDOWS_STORAGE_KEY];
    return stored && typeof stored === 'object' && !Array.isArray(stored)
        ? stored as Record<string, boolean>
        : {};
}

async function writeWindowOpenState(windowId: number, isOpen: boolean) {
    const windows = await readOpenWindows();
    if (isOpen) {
        windows[String(windowId)] = true;
        openWindows.add(windowId);
    } else {
        delete windows[String(windowId)];
        openWindows.delete(windowId);
    }

    await chrome.storage.session.set({ [OPEN_WINDOWS_STORAGE_KEY]: windows });
}

async function isWindowOpen(windowId: number): Promise<boolean> {
    if (openWindows.has(windowId)) {
        return true;
    }

    const windows = await readOpenWindows();
    if (windows[String(windowId)]) {
        openWindows.add(windowId);
        return true;
    }

    return false;
}

async function ensureSidePanelEnabled() {
    await chrome.sidePanel.setOptions({
        path: SIDEPANEL_PATH,
        enabled: true,
    });
}

async function closeSidePanel(windowId: number) {
    if (typeof sidePanel.close === 'function') {
        await sidePanel.close({ windowId });
        await writeWindowOpenState(windowId, false);
        return;
    }

    await chrome.sidePanel.setOptions({ enabled: false });
    await writeWindowOpenState(windowId, false);
    await ensureSidePanelEnabled();
}

async function openSidePanel(windowId: number) {
    await ensureSidePanelEnabled();
    await chrome.sidePanel.open({ windowId });
    await writeWindowOpenState(windowId, true);
}

chrome.runtime.onInstalled.addListener(() => {
    void ensureSidePanelEnabled();
});

chrome.runtime.onStartup.addListener(() => {
    void ensureSidePanelEnabled();
});

chrome.action.onClicked.addListener((tab) => {
    if (typeof tab.windowId !== 'number') {
        return;
    }

    void (async () => {
        if (await isWindowOpen(tab.windowId)) {
            await closeSidePanel(tab.windowId);
            return;
        }

        await openSidePanel(tab.windowId);
    })();
});

sidePanel.onOpened?.addListener((info) => {
    void writeWindowOpenState(info.windowId, true);
});

sidePanel.onClosed?.addListener((info) => {
    void writeWindowOpenState(info.windowId, false);
});

chrome.windows.onRemoved.addListener((windowId) => {
    void writeWindowOpenState(windowId, false);
});

export {};
