import '../lib/personal-library.js';

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

function restoreOpenWindowCache() {
    void readOpenWindows()
        .then((windows) => {
            Object.entries(windows).forEach(([windowId, isOpen]) => {
                const numericWindowId = Number(windowId);
                if (isOpen && Number.isFinite(numericWindowId)) {
                    openWindows.add(numericWindowId);
                }
            });
        })
        .catch((error) => {
            console.error('Failed to restore side panel state:', error);
        });
}

function openSidePanelFromAction(windowId: number) {
    openWindows.add(windowId);

    void chrome.sidePanel.open({ windowId })
        .then(() => writeWindowOpenState(windowId, true))
        .catch((error) => {
            openWindows.delete(windowId);
            console.error('Failed to open side panel:', error);
        });
}

function closeSidePanelFromAction(windowId: number) {
    openWindows.delete(windowId);

    void closeSidePanel(windowId)
        .catch((error) => {
            console.error('Failed to close side panel:', error);
            return writeWindowOpenState(windowId, false);
        });
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

    if (openWindows.has(tab.windowId)) {
        closeSidePanelFromAction(tab.windowId);
        return;
    }

    openSidePanelFromAction(tab.windowId);
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

restoreOpenWindowCache();

export {};
