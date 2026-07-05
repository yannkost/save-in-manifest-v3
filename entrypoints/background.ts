import {
    ensureConfiguration,
    getMenuSegments,
    isDividerEntry,
    loadLastUsedMenuEntry,
    loadMenuEntries,
    loadWorkflowRules,
    MENU_ENTRIES_KEY,
    LAST_USED_MENU_ENTRY_KEY,
    saveLastUsedMenuEntry,
    type LastUsedMenuEntry,
    type MenuEntry,
} from "@/utils/config";
import {
    getNaiveFilenameFromUrl,
    hasRuleMatchers,
    joinRelativePath,
    normalizeShortcutMode,
    renderFilenameTemplate,
    renderPathTemplate,
    resolveRuleMatch,
    sanitizeFileName,
    type RuleMatchInput,
    type RuleMatchResult,
    type ShortcutMode,
    type WorkflowRule,
} from "@/utils/folders";
import {
    SETTINGS_STORAGE_KEY,
    createDefaultSettings,
    loadSettings,
    type ExtensionSettings,
} from "@/utils/settings";

const ROOT_MENU_ID = "save-in-root";
const AUTO_ROUTE_MENU_ID = "save-in-auto-route";
const LAST_USED_MENU_ID = "save-in-last-used";
const MENU_ENTRY_PREFIX = "save-in-entry:";
const GROUP_MENU_PREFIX = "save-in-group:";

const STALE_PENDING_AGE_MS = 2 * 60 * 1000;
const STALE_CONTEXT_AGE_MS = 15 * 1000;
const DOWNLOAD_CONTEXTS = [
    "page",
    "link",
    "image",
    "video",
    "audio",
    "selection",
] as const;

type ConflictAction = "uniquify" | "overwrite" | "prompt";
type DownloadKind = "page" | "link" | "media" | "selection" | "tab";

interface PendingDownload {
    requestId: string;
    downloadId?: number;
    workflowRule: WorkflowRule;
    captures: string[];
    downloadUrl: string;
    sourceUrl?: string;
    pageUrl?: string;
    pageTitle?: string;
    linkText?: string;
    selectionText?: string;
    suggestedFilename?: string;
    naiveFilename?: string;
    createdAt: number;
}

interface ContextMenuClickInfo {
    menuItemId: string | number;
    mediaType?: "image" | "video" | "audio";
    pageUrl?: string;
    selectionText?: string;
    srcUrl?: string;
    linkUrl?: string;
}

interface TabLike {
    id?: number;
    index?: number;
    openerTabId?: number;
    highlighted?: boolean;
    title?: string;
    url?: string;
    windowId?: number;
}

interface DownloadItemLike {
    byExtensionId?: string;
    filename?: string;
    finalUrl?: string;
    id?: number;
    url: string;
}

interface FilenameSuggestionLike {
    filename: string;
    conflictAction: ConflictAction;
}

interface PreparedDownload {
    downloadKind: DownloadKind;
    downloadUrl: string;
    sourceUrl?: string;
    pageUrl?: string;
    pageTitle?: string;
    linkText?: string;
    selectionText?: string;
    suggestedFilename?: string;
    naiveFilename?: string;
}

interface ContextDetailsMessage {
    type: "save-in-context-details";
    linkText?: string;
    linkUrl?: string;
}

interface TabWorkflowMessage {
    type: "save-in-tab-workflow";
    workflow: "selected" | "highlighted" | "right" | "children";
}

interface CachedContextDetails {
    linkText?: string;
    linkUrl?: string;
    timestamp: number;
}

const pendingDownloads: PendingDownload[] = [];
const latestContextDetailsByTabId = new Map<number, CachedContextDetails>();
let rebuildMenusPromise: Promise<void> = Promise.resolve();

export default defineBackground(() => {
    void initializeExtension();

    browser.runtime.onInstalled.addListener(() => {
        void ensureConfiguration();
    });

    browser.runtime.onMessage.addListener((message, sender) => {
        void handleRuntimeMessage(message, sender.tab?.id);
    });

    browser.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") {
            return;
        }

        if (
            changes[MENU_ENTRIES_KEY] ||
            changes[LAST_USED_MENU_ENTRY_KEY] ||
            changes[SETTINGS_STORAGE_KEY]
        ) {
            void queueRebuildContextMenus();
        }
    });

    browser.contextMenus.onClicked.addListener((info, tab) => {
        void handleContextMenuClick(info, tab);
    });

    browser.downloads.onDeterminingFilename.addListener(
        (downloadItem, suggest) => {
            handleDeterminingFilename(downloadItem, suggest);
        },
    );
});

async function initializeExtension(): Promise<void> {
    const { menuEntries } = await ensureConfiguration();
    await loadSettings().catch(() => createDefaultSettings());
    await cleanupLastUsedMenuEntry(menuEntries);
    await queueRebuildContextMenus();
}

function queueRebuildContextMenus(): Promise<void> {
    rebuildMenusPromise = rebuildMenusPromise
        .catch(() => undefined)
        .then(() => rebuildContextMenus());
    return rebuildMenusPromise;
}

async function handleRuntimeMessage(
    message: unknown,
    tabId?: number,
): Promise<void> {
    if (isContextDetailsMessage(message)) {
        if (!tabId) {
            return;
        }

        latestContextDetailsByTabId.set(tabId, {
            linkText: message.linkText,
            linkUrl: message.linkUrl,
            timestamp: Date.now(),
        });
        pruneContextDetails();
        return;
    }

    if (isTabWorkflowMessage(message)) {
        const activeTabs = await browser.tabs.query({
            active: true,
            currentWindow: true,
            windowType: "normal",
        });
        const activeTab = activeTabs[0];
        if (!activeTab) {
            return;
        }

        await runTabWorkflow(message.workflow, activeTab, await loadSettings());
    }
}

function isContextDetailsMessage(
    message: unknown,
): message is ContextDetailsMessage {
    return Boolean(
        message &&
        typeof message === "object" &&
        "type" in message &&
        (message as { type?: unknown }).type === "save-in-context-details",
    );
}

function isTabWorkflowMessage(message: unknown): message is TabWorkflowMessage {
    return Boolean(
        message &&
        typeof message === "object" &&
        "type" in message &&
        (message as { type?: unknown }).type === "save-in-tab-workflow",
    );
}

async function rebuildContextMenus(): Promise<void> {
    await browser.contextMenus.removeAll();

    createMenuItem({
        id: ROOT_MENU_ID,
        title: "Save In MV3",
        contexts: [...DOWNLOAD_CONTEXTS],
    });

    const [menuEntries, workflowRules, lastUsed] = await Promise.all([
        loadMenuEntries(),
        loadWorkflowRules(),
        loadLastUsedMenuEntry(),
    ]);

    const hasAutoMatchRules = workflowRules.some((rule) =>
        hasRuleMatchers(rule),
    );

    createMenuItem({
        id: AUTO_ROUTE_MENU_ID,
        parentId: ROOT_MENU_ID,
        title: "Best matching rule",
        enabled: hasAutoMatchRules,
        contexts: [...DOWNLOAD_CONTEXTS],
    });

    createMenuItem({
        id: LAST_USED_MENU_ID,
        parentId: ROOT_MENU_ID,
        title: lastUsed
            ? `Last used: ${formatMenuTitle(lastUsed.label, lastUsed.menuPath)}`
            : "Last used",
        enabled: Boolean(lastUsed),
        contexts: [...DOWNLOAD_CONTEXTS],
    });

    if (menuEntries.length === 0) {
        createMenuItem({
            id: `${MENU_ENTRY_PREFIX}empty`,
            parentId: ROOT_MENU_ID,
            title: "Open popup to add entries",
            enabled: false,
            contexts: [...DOWNLOAD_CONTEXTS],
        });
        return;
    }

    const groupIds = new Map<string, string>();

    menuEntries.forEach((entry) => {
        const parentId = ensureMenuGroups(groupIds, entry);

        if (isDividerEntry(entry)) {
            createMenuItem({
                id: `${MENU_ENTRY_PREFIX}${entry.id}`,
                parentId,
                type: "separator",
                contexts: [...DOWNLOAD_CONTEXTS],
            });
            return;
        }

        createMenuItem({
            id: `${MENU_ENTRY_PREFIX}${entry.id}`,
            parentId,
            title: entry.label,
            contexts: [...DOWNLOAD_CONTEXTS],
        });
    });
}

function createMenuItem(properties: {
    id: string;
    parentId?: string;
    title?: string;
    type?: "normal" | "separator" | "checkbox" | "radio";
    enabled?: boolean;
    contexts: readonly string[] | string[];
}): void {
    const chromeApi = (globalThis as { chrome?: any }).chrome;

    if (chromeApi?.contextMenus?.create) {
        chromeApi.contextMenus.create(properties, () => {
            const error = chromeApi.runtime?.lastError;
            if (error) {
                console.error("[save-in] contextMenus.create failed", {
                    id: properties.id,
                    contexts: properties.contexts,
                    parentId: properties.parentId,
                    title: properties.title,
                    type: properties.type,
                    message: error.message,
                });
            }
        });
        return;
    }

    browser.contextMenus.create(properties as never);
}

function ensureMenuGroups(
    groupIds: Map<string, string>,
    entry: MenuEntry,
): string {
    const segments = getMenuSegments(entry.menuPath);
    let currentParent = ROOT_MENU_ID;
    let pathAccumulator = "";

    segments.forEach((segment, index) => {
        pathAccumulator = pathAccumulator
            ? `${pathAccumulator}/${segment}`
            : segment;
        const existing = groupIds.get(pathAccumulator);

        if (existing) {
            currentParent = existing;
            return;
        }

        const groupId = `${GROUP_MENU_PREFIX}${entry.id}:${index}:${pathAccumulator}`;
        createMenuItem({
            id: groupId,
            parentId: currentParent,
            title: segment,
            contexts: [...DOWNLOAD_CONTEXTS],
        });
        groupIds.set(pathAccumulator, groupId);
        currentParent = groupId;
    });

    return currentParent;
}

async function handleContextMenuClick(
    info: ContextMenuClickInfo,
    tab?: TabLike,
): Promise<void> {
    const menuId =
        typeof info.menuItemId === "string"
            ? info.menuItemId
            : String(info.menuItemId);
    const settings = await loadSettings();

    const prepared = prepareDownload(info, tab, settings);
    if (!prepared) {
        console.warn("No downloadable payload found for context-menu action.", {
            info,
        });
        return;
    }

    await executeSelection(
        menuId,
        prepared,
        settings,
        await loadMenuEntries(),
        await loadWorkflowRules(),
    );
}

async function runTabWorkflow(
    workflow: TabWorkflowMessage["workflow"],
    sourceTab: TabLike,
    settings: ExtensionSettings,
): Promise<void> {
    if (!sourceTab.windowId) {
        return;
    }

    const tabs = await collectTabsForWorkflow(workflow, sourceTab);
    const [menuEntries, workflowRules] = await Promise.all([
        loadMenuEntries(),
        loadWorkflowRules(),
    ]);

    for (const tab of tabs) {
        const prepared = prepareTabDownload(tab);
        if (!prepared) {
            continue;
        }

        await executeSelection(
            AUTO_ROUTE_MENU_ID,
            prepared,
            settings,
            menuEntries,
            workflowRules,
            true,
            tab,
        );

        if (settings.closeTabAfterTabSave && typeof tab.id === "number") {
            try {
                await browser.tabs.remove(tab.id);
            } catch {
                // ignore remove failures
            }
        }
    }
}

async function collectTabsForWorkflow(
    workflow: TabWorkflowMessage["workflow"],
    sourceTab: TabLike,
): Promise<TabLike[]> {
    switch (workflow) {
        case "selected":
            return [sourceTab];
        case "highlighted":
            return browser.tabs.query({
                windowId: sourceTab.windowId,
                highlighted: true,
                windowType: "normal",
            });
        case "right": {
            const tabs = await browser.tabs.query({
                windowId: sourceTab.windowId,
                windowType: "normal",
            });
            const sourceIndex = sourceTab.index ?? 0;
            return tabs.filter((tab) => (tab.index ?? -1) >= sourceIndex);
        }
        case "children": {
            const tabs = await browser.tabs.query({
                windowId: sourceTab.windowId,
                windowType: "normal",
            });
            return tabs.filter((tab) => tab.openerTabId === sourceTab.id);
        }
    }
}

async function executeSelection(
    menuId: string,
    prepared: PreparedDownload,
    settings: ExtensionSettings,
    menuEntries: MenuEntry[],
    workflowRules: WorkflowRule[],
    isTabWorkflow = false,
    sourceTab?: TabLike,
): Promise<void> {
    let workflowRule: WorkflowRule | undefined;
    let matchResult: RuleMatchResult = { matches: false, captures: [] };
    const matchInput = createRuleMatchInput(prepared);

    if (menuId === AUTO_ROUTE_MENU_ID) {
        for (const candidate of workflowRules) {
            const result = resolveRuleMatch(candidate, matchInput);
            if (result.matches) {
                workflowRule = candidate;
                matchResult = result;
                break;
            }
        }

        if (!workflowRule && isTabWorkflow) {
            const lastUsed = await loadLastUsedMenuEntry();
            if (lastUsed?.workflowRuleId) {
                workflowRule = workflowRules.find(
                    (value) => value.id === lastUsed.workflowRuleId,
                );
            }
        }
    } else if (menuId === LAST_USED_MENU_ID) {
        const lastUsed = await loadLastUsedMenuEntry();
        if (!lastUsed?.workflowRuleId) {
            return;
        }

        workflowRule = workflowRules.find(
            (value) => value.id === lastUsed.workflowRuleId,
        );
    } else if (menuId.startsWith(MENU_ENTRY_PREFIX)) {
        const entryId = menuId.slice(MENU_ENTRY_PREFIX.length);
        const menuEntry = menuEntries.find((value) => value.id === entryId);
        if (
            !menuEntry ||
            isDividerEntry(menuEntry) ||
            !menuEntry.workflowRuleId
        ) {
            return;
        }
        workflowRule = workflowRules.find(
            (value) => value.id === menuEntry.workflowRuleId,
        );
    }

    if (!workflowRule) {
        await handleAutoRouteMiss(prepared, settings);
        return;
    }

    if (menuId !== AUTO_ROUTE_MENU_ID || !matchResult.matches) {
        matchResult = resolveRuleMatch(workflowRule, matchInput);
    }

    if (menuId === AUTO_ROUTE_MENU_ID && settings.notifyOnAutoRouteMatch) {
        await notify(
            "Best matching rule",
            `Matched workflow: ${workflowRule.name}`,
        );
    }

    await startPreparedDownload(
        prepared,
        workflowRule,
        matchResult.captures,
        sourceTab,
    );
}

function prepareDownload(
    info: ContextMenuClickInfo,
    tab: TabLike | undefined,
    settings: ExtensionSettings,
): PreparedDownload | null {
    const pageUrl = info.pageUrl ?? tab?.url;
    const pageTitle = tab?.title ?? "";
    const contextDetails = tab?.id
        ? getContextDetails(tab.id, info.linkUrl)
        : null;
    const linkText = contextDetails?.linkText;

    if (info.selectionText?.trim()) {
        const selectionText = info.selectionText.trim();
        const objectUrl = URL.createObjectURL(
            new Blob([selectionText], { type: "text/plain;charset=utf-8" }),
        );
        scheduleObjectUrlCleanup(objectUrl);
        return {
            downloadKind: "selection",
            downloadUrl: objectUrl,
            sourceUrl: pageUrl,
            pageUrl,
            pageTitle,
            linkText,
            selectionText,
            suggestedFilename: buildSelectionFilename(pageTitle, selectionText),
            naiveFilename: "selection.txt",
        };
    }

    if (info.mediaType && info.srcUrl) {
        if (settings.preferLinkTargetOnMedia && info.linkUrl) {
            return {
                downloadKind: "link",
                downloadUrl: info.linkUrl,
                sourceUrl: info.linkUrl,
                pageUrl,
                pageTitle,
                linkText,
                naiveFilename: getNaiveFilenameFromUrl(info.linkUrl),
            };
        }

        return {
            downloadKind: "media",
            downloadUrl: info.srcUrl,
            sourceUrl: info.srcUrl,
            pageUrl,
            pageTitle,
            linkText,
            naiveFilename: getNaiveFilenameFromUrl(info.srcUrl),
        };
    }

    if (info.linkUrl) {
        return {
            downloadKind: "link",
            downloadUrl: info.linkUrl,
            sourceUrl: info.linkUrl,
            pageUrl,
            pageTitle,
            linkText,
            naiveFilename: getNaiveFilenameFromUrl(info.linkUrl),
        };
    }

    if (pageUrl) {
        return {
            downloadKind: "page",
            downloadUrl: pageUrl,
            sourceUrl: pageUrl,
            pageUrl,
            pageTitle,
            linkText,
            suggestedFilename: pageTitle
                ? sanitizeFileName(pageTitle)
                : undefined,
            naiveFilename: getNaiveFilenameFromUrl(pageUrl),
        };
    }

    return null;
}

function prepareTabDownload(tab: TabLike): PreparedDownload | null {
    if (!tab.url) {
        return null;
    }

    return {
        downloadKind: "tab",
        downloadUrl: tab.url,
        sourceUrl: tab.url,
        pageUrl: tab.url,
        pageTitle: tab.title ?? "",
        suggestedFilename: tab.title ? sanitizeFileName(tab.title) : undefined,
        naiveFilename: getNaiveFilenameFromUrl(tab.url),
    };
}

function getContextDetails(
    tabId: number,
    linkUrl?: string,
): CachedContextDetails | null {
    pruneContextDetails();
    const cached = latestContextDetailsByTabId.get(tabId);
    if (!cached) {
        return null;
    }

    if (
        linkUrl &&
        cached.linkUrl &&
        normalizeUrl(linkUrl) !== normalizeUrl(cached.linkUrl)
    ) {
        return null;
    }

    return cached;
}

function createRuleMatchInput(prepared: PreparedDownload): RuleMatchInput {
    return {
        context: prepared.downloadKind,
        pageUrl: prepared.pageUrl,
        sourceUrl: prepared.sourceUrl,
        filename: prepared.suggestedFilename ?? prepared.naiveFilename ?? "",
        linkText: prepared.linkText,
    };
}

async function startPreparedDownload(
    prepared: PreparedDownload,
    workflowRule: WorkflowRule,
    captures: string[],
    sourceTab?: TabLike,
): Promise<void> {
    let finalPrepared = applyShortcutMode(prepared, workflowRule);
    finalPrepared = await applyDownloadTransport(finalPrepared);

    const pendingDownload: PendingDownload = {
        requestId: crypto.randomUUID(),
        workflowRule,
        captures,
        downloadUrl: finalPrepared.downloadUrl,
        sourceUrl: finalPrepared.sourceUrl,
        pageUrl: finalPrepared.pageUrl,
        pageTitle: finalPrepared.pageTitle,
        linkText: finalPrepared.linkText,
        selectionText: finalPrepared.selectionText,
        suggestedFilename: finalPrepared.suggestedFilename,
        naiveFilename: finalPrepared.naiveFilename,
        createdAt: Date.now(),
    };

    pendingDownloads.push(pendingDownload);
    prunePendingDownloads();

    try {
        const downloadId = await browser.downloads.download({
            url: finalPrepared.downloadUrl,
            saveAs: false,
            conflictAction: "uniquify",
        });

        pendingDownload.downloadId = downloadId;

        // Update last used only for visible menu-entry-based manual saves is skipped here intentionally;
        // tab workflows and auto-match shouldn't override the user-facing last-used menu entry.
        if (sourceTab && typeof sourceTab.id === "number") {
            // no-op placeholder for future per-workflow history
        }
    } catch (error) {
        removePendingDownload(pendingDownload.requestId);
        await notify("Download failed", workflowRule.name);
        console.error("Failed to start download.", error);
    }
}

async function applyDownloadTransport(
    prepared: PreparedDownload,
): Promise<PreparedDownload> {
    const settings = await loadSettings();
    if (settings.downloadTransport !== "fetch-with-page-referrer") {
        return prepared;
    }

    if (!/^https?:/i.test(prepared.downloadUrl)) {
        return prepared;
    }

    try {
        const response = await fetch(prepared.downloadUrl, {
            credentials: "include",
            referrer:
                prepared.pageUrl ?? prepared.sourceUrl ?? prepared.downloadUrl,
            referrerPolicy: "strict-origin-when-cross-origin",
        });

        if (!response.ok) {
            throw new Error(`Fetch failed with ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        scheduleObjectUrlCleanup(objectUrl);
        return { ...prepared, downloadUrl: objectUrl };
    } catch (error) {
        await notify(
            "Fetch with referrer failed",
            "Falling back to direct download.",
        );
        console.warn(
            "Fetch with referrer failed, falling back to direct download.",
            error,
        );
        return prepared;
    }
}

async function handleAutoRouteMiss(
    prepared: PreparedDownload,
    settings: ExtensionSettings,
): Promise<void> {
    if (settings.autoRouteMissBehavior === "notify") {
        await notify(
            "No matching rule",
            "No workflow rule matched this save request.",
        );
        return;
    }

    if (settings.autoRouteMissBehavior === "prompt") {
        const fallbackPrepared = await applyDownloadTransport(prepared);
        await browser.downloads.download({
            url: fallbackPrepared.downloadUrl,
            filename:
                fallbackPrepared.suggestedFilename ||
                fallbackPrepared.naiveFilename ||
                undefined,
            saveAs: true,
            conflictAction: "uniquify",
        });
    }
}

function applyShortcutMode(
    prepared: PreparedDownload,
    workflowRule: WorkflowRule,
): PreparedDownload {
    const shortcutMode = normalizeShortcutMode(workflowRule.shortcutMode);

    if (shortcutMode === "none" || prepared.downloadKind === "selection") {
        return prepared;
    }

    const targetUrl = prepared.sourceUrl ?? prepared.pageUrl;
    if (!targetUrl) {
        return prepared;
    }

    const objectUrl = URL.createObjectURL(
        new Blob(
            [makeShortcutContent(shortcutMode, targetUrl, prepared.pageTitle)],
            {
                type:
                    shortcutMode === "html"
                        ? "text/html;charset=utf-8"
                        : "text/plain;charset=utf-8",
            },
        ),
    );
    scheduleObjectUrlCleanup(objectUrl);

    return {
        ...prepared,
        downloadUrl: objectUrl,
        suggestedFilename: buildShortcutFilename(shortcutMode, prepared),
        naiveFilename: buildShortcutFilename(shortcutMode, prepared),
    };
}

function makeShortcutContent(
    shortcutMode: Exclude<ShortcutMode, "none">,
    targetUrl: string,
    pageTitle?: string,
): string {
    switch (shortcutMode) {
        case "url":
            return `[InternetShortcut]\r\nURL=${targetUrl}`;
        case "desktop": {
            const name = sanitizeDesktopValue(pageTitle || targetUrl);
            return [
                "[Desktop Entry]",
                "Encoding=UTF-8",
                "Type=Link",
                `Name=${name}`,
                `URL=${targetUrl}`,
                "Icon=text-html",
            ].join("\n");
        }
        case "html":
            return [
                "<!doctype html>",
                "<html>",
                "<head>",
                '  <meta charset="utf-8">',
                `  <meta http-equiv="refresh" content="0; url=${escapeHtmlAttribute(targetUrl)}">`,
                `  <title>${escapeHtmlText(pageTitle || targetUrl)}</title>`,
                "</head>",
                "<body>",
                `  <p>Open <a href="${escapeHtmlAttribute(targetUrl)}">${escapeHtmlText(targetUrl)}</a></p>`,
                "</body>",
                "</html>",
            ].join("\n");
    }
}

function buildShortcutFilename(
    shortcutMode: Exclude<ShortcutMode, "none">,
    prepared: PreparedDownload,
): string {
    const extension =
        shortcutMode === "desktop"
            ? ".desktop"
            : shortcutMode === "html"
              ? ".html"
              : ".url";
    const baseSource =
        prepared.suggestedFilename ||
        prepared.linkText ||
        prepared.pageTitle ||
        prepared.naiveFilename ||
        prepared.sourceUrl ||
        "shortcut";
    const base = stripExtension(sanitizeFileName(baseSource));
    return `${base || "shortcut"}${extension}`;
}

function stripExtension(filename: string): string {
    return filename.replace(/\.[0-9a-z]{1,16}$/i, "");
}

function sanitizeDesktopValue(value: string): string {
    return value.replace(/[\r\n]+/g, " ").trim();
}

function escapeHtmlText(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
}

function escapeHtmlAttribute(value: string): string {
    return escapeHtmlText(value).replaceAll("'", "&#39;");
}

function scheduleObjectUrlCleanup(objectUrl: string): void {
    setTimeout(() => {
        try {
            URL.revokeObjectURL(objectUrl);
        } catch {
            // ignore cleanup failures
        }
    }, 60_000);
}

function handleDeterminingFilename(
    downloadItem: DownloadItemLike,
    suggest: (suggestion?: FilenameSuggestionLike) => void,
): void {
    prunePendingDownloads();

    if (
        downloadItem.byExtensionId &&
        downloadItem.byExtensionId !== browser.runtime.id
    ) {
        suggest();
        return;
    }

    const pendingIndex = findPendingDownloadIndex(downloadItem);
    if (pendingIndex === -1) {
        suggest();
        return;
    }

    const [pendingDownload] = pendingDownloads.splice(pendingIndex, 1);
    const baseFilename = getDownloadFilename(
        downloadItem,
        pendingDownload.suggestedFilename,
    );
    const filenameFromTemplate = renderFilenameTemplate(
        pendingDownload.workflowRule.filenameTemplate ?? "",
        {
            pageUrl: pendingDownload.pageUrl,
            pageTitle: pendingDownload.pageTitle,
            sourceUrl: pendingDownload.sourceUrl,
            linkText: pendingDownload.linkText,
            selectionText: pendingDownload.selectionText,
            filename: baseFilename,
            naiveFilename: pendingDownload.naiveFilename,
            captures: pendingDownload.captures,
            now: new Date(pendingDownload.createdAt),
        },
    );
    const finalFilename = filenameFromTemplate || baseFilename;
    const directory = renderPathTemplate(
        pendingDownload.workflowRule.pathTemplate,
        {
            pageUrl: pendingDownload.pageUrl,
            pageTitle: pendingDownload.pageTitle,
            sourceUrl: pendingDownload.sourceUrl,
            linkText: pendingDownload.linkText,
            selectionText: pendingDownload.selectionText,
            filename: finalFilename,
            naiveFilename: pendingDownload.naiveFilename,
            captures: pendingDownload.captures,
            now: new Date(pendingDownload.createdAt),
        },
    );

    suggest({
        filename: joinRelativePath(directory, finalFilename),
        conflictAction: "uniquify",
    });
}

function findPendingDownloadIndex(downloadItem: DownloadItemLike): number {
    if (typeof downloadItem.id === "number") {
        const byId = pendingDownloads.findIndex(
            (pendingDownload) => pendingDownload.downloadId === downloadItem.id,
        );
        if (byId >= 0) {
            return byId;
        }
    }

    const candidateUrl = normalizeUrl(
        downloadItem.finalUrl || downloadItem.url,
    );
    return pendingDownloads.findIndex(
        (pendingDownload) =>
            normalizeUrl(pendingDownload.downloadUrl) === candidateUrl,
    );
}

function getDownloadFilename(
    downloadItem: DownloadItemLike,
    suggestedFilename?: string,
): string {
    const candidates = [
        suggestedFilename,
        downloadItem.filename,
        downloadItem.finalUrl,
        downloadItem.url,
    ];

    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }

        const filename = sanitizeFileName(candidate);
        if (filename) {
            return filename;
        }
    }

    return "download";
}

function buildSelectionFilename(
    pageTitle: string,
    selectionText: string,
): string {
    const base = sanitizeFileName(pageTitle || selectionText || "selection");
    return `${truncate(base, 64)}.selection.txt`;
}

function truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
}

async function cleanupLastUsedMenuEntry(
    menuEntries: MenuEntry[],
): Promise<void> {
    const lastUsed = await loadLastUsedMenuEntry();
    if (!lastUsed) {
        return;
    }

    const exists = menuEntries.some((entry) => entry.id === lastUsed.id);
    if (!exists) {
        await saveLastUsedMenuEntry(null);
    }
}

function formatMenuTitle(label: string, menuPath?: string): string {
    const segments = getMenuSegments(menuPath);
    return segments.length > 0 ? `${segments.join(" / ")} / ${label}` : label;
}

function prunePendingDownloads(): void {
    const cutoff = Date.now() - STALE_PENDING_AGE_MS;
    const freshDownloads = pendingDownloads.filter(
        (pendingDownload) => pendingDownload.createdAt >= cutoff,
    );

    pendingDownloads.length = 0;
    pendingDownloads.push(...freshDownloads);
}

function pruneContextDetails(): void {
    const cutoff = Date.now() - STALE_CONTEXT_AGE_MS;
    for (const [tabId, details] of latestContextDetailsByTabId.entries()) {
        if (details.timestamp < cutoff) {
            latestContextDetailsByTabId.delete(tabId);
        }
    }
}

function removePendingDownload(requestId: string): void {
    const index = pendingDownloads.findIndex(
        (pendingDownload) => pendingDownload.requestId === requestId,
    );
    if (index >= 0) {
        pendingDownloads.splice(index, 1);
    }
}

async function notify(title: string, message: string): Promise<void> {
    try {
        await browser.notifications.create({
            type: "basic",
            iconUrl: browser.runtime.getURL("/icon/48.png"),
            title,
            message,
        });
    } catch {
        // ignore notification failures
    }
}

function normalizeUrl(urlValue: string): string {
    try {
        return new URL(urlValue).toString();
    } catch {
        return urlValue;
    }
}
