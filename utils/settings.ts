export type AutoRouteMissBehavior = 'none' | 'notify' | 'prompt';
export type DownloadTransport = 'direct' | 'fetch-with-page-referrer';

export interface ExtensionSettings {
  preferLinkTargetOnMedia: boolean;
  notifyOnAutoRouteMatch: boolean;
  autoRouteMissBehavior: AutoRouteMissBehavior;
  downloadTransport: DownloadTransport;
  enableTabSaveMenus: boolean;
  closeTabAfterTabSave: boolean;
}

export const SETTINGS_STORAGE_KEY = 'extensionSettings';

export function createDefaultSettings(): ExtensionSettings {
  return {
    preferLinkTargetOnMedia: false,
    notifyOnAutoRouteMatch: false,
    autoRouteMissBehavior: 'notify',
    downloadTransport: 'direct',
    enableTabSaveMenus: true,
    closeTabAfterTabSave: false,
  };
}

export async function loadSettings(): Promise<ExtensionSettings> {
  const stored = await browser.storage.local.get(SETTINGS_STORAGE_KEY);
  return normalizeSettings(stored[SETTINGS_STORAGE_KEY]);
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await browser.storage.local.set({
    [SETTINGS_STORAGE_KEY]: normalizeSettings(settings),
  });
}

export function normalizeSettings(value: unknown): ExtensionSettings {
  const defaults = createDefaultSettings();

  if (!value || typeof value !== 'object') {
    return defaults;
  }

  const record = value as Record<string, unknown>;
  return {
    preferLinkTargetOnMedia:
      typeof record.preferLinkTargetOnMedia === 'boolean'
        ? record.preferLinkTargetOnMedia
        : defaults.preferLinkTargetOnMedia,
    notifyOnAutoRouteMatch:
      typeof record.notifyOnAutoRouteMatch === 'boolean'
        ? record.notifyOnAutoRouteMatch
        : defaults.notifyOnAutoRouteMatch,
    autoRouteMissBehavior:
      record.autoRouteMissBehavior === 'none' ||
      record.autoRouteMissBehavior === 'notify' ||
      record.autoRouteMissBehavior === 'prompt'
        ? record.autoRouteMissBehavior
        : defaults.autoRouteMissBehavior,
    downloadTransport:
      record.downloadTransport === 'fetch-with-page-referrer'
        ? 'fetch-with-page-referrer'
        : defaults.downloadTransport,
    enableTabSaveMenus:
      typeof record.enableTabSaveMenus === 'boolean'
        ? record.enableTabSaveMenus
        : defaults.enableTabSaveMenus,
    closeTabAfterTabSave:
      typeof record.closeTabAfterTabSave === 'boolean'
        ? record.closeTabAfterTabSave
        : defaults.closeTabAfterTabSave,
  };
}
