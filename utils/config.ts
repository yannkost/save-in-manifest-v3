import {
  normalizeFilenameTemplate,
  normalizeMatchers,
  normalizeShortcutMode,
  normalizeTemplate,
  type WorkflowRule,
} from './folders';

export type MenuEntryKind = 'entry' | 'divider';

export interface MenuEntry {
  id: string;
  kind?: MenuEntryKind;
  label: string;
  menuPath?: string;
  workflowRuleId?: string | null;
}

export interface LastUsedMenuEntry {
  id: string;
  label: string;
  menuPath?: string;
  workflowRuleId?: string | null;
}

interface LegacyPresetLike {
  id?: unknown;
  kind?: unknown;
  label?: unknown;
  name?: unknown;
  showInContextMenu?: unknown;
  pathTemplate?: unknown;
  menuPath?: unknown;
  filenameTemplate?: unknown;
  shortcutMode?: unknown;
  matchers?: unknown;
}

interface StoredMenuEntryLike {
  id?: unknown;
  kind?: unknown;
  label?: unknown;
  menuPath?: unknown;
  workflowRuleId?: unknown;
}

interface StoredWorkflowRuleLike {
  id?: unknown;
  name?: unknown;
  pathTemplate?: unknown;
  filenameTemplate?: unknown;
  shortcutMode?: unknown;
  matchers?: unknown;
}

export const LEGACY_PRESETS_KEY = 'folderPresets';
export const MENU_ENTRIES_KEY = 'menuEntries';
export const WORKFLOW_RULES_KEY = 'workflowRules';
export const LAST_USED_MENU_ENTRY_KEY = 'lastUsedMenuEntry';

export function createDefaultWorkflowRules(): WorkflowRule[] {
  return [
    {
      id: crypto.randomUUID(),
      name: 'Inbox download',
      pathTemplate: 'inbox',
      filenameTemplate: '',
      shortcutMode: 'none',
      matchers: {},
    },
    {
      id: crypto.randomUUID(),
      name: 'By Date / Page',
      pathTemplate: ':date:/:pageurl:',
      filenameTemplate: '',
      shortcutMode: 'none',
      matchers: {},
    },
  ];
}

export function createDefaultMenuEntries(workflowRules: WorkflowRule[]): MenuEntry[] {
  return [
    {
      id: crypto.randomUUID(),
      kind: 'entry',
      label: 'Inbox',
      menuPath: '',
      workflowRuleId: workflowRules[0]?.id ?? null,
    },
    {
      id: crypto.randomUUID(),
      kind: 'entry',
      label: 'By Date / Page',
      menuPath: 'Smart folders',
      workflowRuleId: workflowRules[1]?.id ?? null,
    },
  ];
}

export async function ensureConfiguration(): Promise<{ menuEntries: MenuEntry[]; workflowRules: WorkflowRule[] }> {
  const [menuEntries, workflowRules] = await Promise.all([loadMenuEntries(), loadWorkflowRules()]);

  if (menuEntries.length > 0 || workflowRules.length > 0) {
    return { menuEntries, workflowRules };
  }

  const migrated = await migrateLegacyConfiguration();
  if (migrated) {
    return migrated;
  }

  const defaultWorkflowRules = createDefaultWorkflowRules();
  const defaultMenuEntries = createDefaultMenuEntries(defaultWorkflowRules);
  await Promise.all([saveWorkflowRules(defaultWorkflowRules), saveMenuEntries(defaultMenuEntries)]);
  return { menuEntries: defaultMenuEntries, workflowRules: defaultWorkflowRules };
}

export async function loadMenuEntries(): Promise<MenuEntry[]> {
  const stored = await browser.storage.local.get(MENU_ENTRIES_KEY);
  const entries = stored[MENU_ENTRIES_KEY];

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.map((entry) => coerceMenuEntry(entry)).filter((entry): entry is MenuEntry => entry !== null);
}

export async function saveMenuEntries(entries: MenuEntry[]): Promise<void> {
  await browser.storage.local.set({
    [MENU_ENTRIES_KEY]: entries.map(normalizeMenuEntry),
  });
}

export async function loadWorkflowRules(): Promise<WorkflowRule[]> {
  const stored = await browser.storage.local.get(WORKFLOW_RULES_KEY);
  const rules = stored[WORKFLOW_RULES_KEY];

  if (!Array.isArray(rules)) {
    return [];
  }

  return rules.map((rule) => coerceWorkflowRule(rule)).filter((rule): rule is WorkflowRule => rule !== null);
}

export async function saveWorkflowRules(rules: WorkflowRule[]): Promise<void> {
  await browser.storage.local.set({
    [WORKFLOW_RULES_KEY]: rules.map(normalizeWorkflowRule),
  });
}

export async function loadLastUsedMenuEntry(): Promise<LastUsedMenuEntry | null> {
  const stored = await browser.storage.local.get(LAST_USED_MENU_ENTRY_KEY);
  const candidate = stored[LAST_USED_MENU_ENTRY_KEY];

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const record = candidate as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : null;
  const label = typeof record.label === 'string' ? record.label.trim() : null;
  const menuPath = typeof record.menuPath === 'string' ? normalizeMenuPath(record.menuPath) : '';
  const workflowRuleId = typeof record.workflowRuleId === 'string' ? record.workflowRuleId : null;

  if (!id || !label) {
    return null;
  }

  return { id, label, menuPath, workflowRuleId };
}

export async function saveLastUsedMenuEntry(entry: LastUsedMenuEntry | null): Promise<void> {
  await browser.storage.local.set({
    [LAST_USED_MENU_ENTRY_KEY]: entry,
  });
}

export function normalizeMenuEntry(entry: MenuEntry): MenuEntry {
  return {
    id: entry.id,
    kind: normalizeMenuEntryKind(entry.kind),
    label: entry.label.trim(),
    menuPath: normalizeMenuPath(entry.menuPath ?? ''),
    workflowRuleId: typeof entry.workflowRuleId === 'string' ? entry.workflowRuleId : null,
  };
}

export function normalizeMenuEntryKind(kind?: MenuEntryKind | string | null): MenuEntryKind {
  return kind === 'divider' ? 'divider' : 'entry';
}

export function isDividerEntry(entry: MenuEntry): boolean {
  return normalizeMenuEntryKind(entry.kind) === 'divider';
}

export function normalizeMenuPath(menuPath: string): string {
  return menuPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

export function getMenuSegments(menuPath?: string | null): string[] {
  return normalizeMenuPath(menuPath ?? '')
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

export function validateMenuLabel(label: string, kind: MenuEntryKind = 'entry'): string | null {
  if (kind === 'divider') {
    return null;
  }

  if (label.trim().length === 0) {
    return 'Menu label is required.';
  }

  return null;
}

export function validateMenuPath(menuPath: string): string | null {
  const normalized = normalizeMenuPath(menuPath);

  if (normalized.length === 0) {
    return null;
  }

  if (normalized.split('/').some((segment) => segment === '.' || segment === '..')) {
    return 'Menu groups cannot contain . or .. segments.';
  }

  return null;
}

function coerceMenuEntry(value: unknown): MenuEntry | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as StoredMenuEntryLike;
  const id = typeof record.id === 'string' ? record.id : null;
  const label = typeof record.label === 'string' ? record.label : '';
  const kind = normalizeMenuEntryKind(typeof record.kind === 'string' ? record.kind : 'entry');
  const menuPath = typeof record.menuPath === 'string' ? record.menuPath : '';
  const workflowRuleId = typeof record.workflowRuleId === 'string' ? record.workflowRuleId : null;

  if (!id) {
    return null;
  }

  return normalizeMenuEntry({ id, kind, label, menuPath, workflowRuleId });
}

function coerceWorkflowRule(value: unknown): WorkflowRule | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as StoredWorkflowRuleLike;
  const id = typeof record.id === 'string' ? record.id : null;
  const name = typeof record.name === 'string' ? record.name : null;
  const pathTemplate = typeof record.pathTemplate === 'string' ? record.pathTemplate : null;

  if (!id || !name || !pathTemplate) {
    return null;
  }

  return normalizeWorkflowRule({
    id,
    name,
    pathTemplate,
    filenameTemplate: typeof record.filenameTemplate === 'string' ? record.filenameTemplate : '',
    shortcutMode: normalizeShortcutMode(typeof record.shortcutMode === 'string' ? record.shortcutMode : 'none'),
    matchers: normalizeMatchers(coerceMatchers(record.matchers)),
  });
}

function coerceMatchers(value: unknown) {
  if (!value || typeof value !== 'object') {
    return {};
  }

  return value as RuleMatchers;
}

async function migrateLegacyConfiguration(): Promise<{ menuEntries: MenuEntry[]; workflowRules: WorkflowRule[] } | null> {
  const stored = await browser.storage.local.get(LEGACY_PRESETS_KEY);
  const legacyPresets = stored[LEGACY_PRESETS_KEY];

  if (!Array.isArray(legacyPresets) || legacyPresets.length === 0) {
    return null;
  }

  const workflowRules: WorkflowRule[] = [];
  const menuEntries: MenuEntry[] = [];

  legacyPresets.forEach((value, index) => {
    const record = value as LegacyPresetLike;
    const kind = normalizeMenuEntryKind(typeof record.kind === 'string' ? record.kind : 'entry');
    const menuPath = typeof record.menuPath === 'string' ? record.menuPath : '';
    const label =
      typeof record.label === 'string'
        ? record.label
        : typeof record.name === 'string'
          ? record.name
          : '';
    const id = typeof record.id === 'string' ? record.id : crypto.randomUUID();

    if (kind === 'divider') {
      menuEntries.push(
        normalizeMenuEntry({
          id,
          kind: 'divider',
          label: '',
          menuPath,
          workflowRuleId: null,
        }),
      );
      return;
    }

    const workflowRuleId = crypto.randomUUID();
    workflowRules.push(
      normalizeWorkflowRule({
        id: workflowRuleId,
        name: label || `Workflow ${index + 1}`,
        pathTemplate: typeof record.pathTemplate === 'string' ? record.pathTemplate : ':date:/:pageurl:',
        filenameTemplate: typeof record.filenameTemplate === 'string' ? record.filenameTemplate : '',
        shortcutMode: normalizeShortcutMode(typeof record.shortcutMode === 'string' ? record.shortcutMode : 'none'),
        matchers: normalizeMatchers(coerceMatchers(record.matchers)),
      }),
    );

    if (record.showInContextMenu !== false) {
      menuEntries.push(
        normalizeMenuEntry({
          id,
          kind: 'entry',
          label: label || `Entry ${index + 1}`,
          menuPath,
          workflowRuleId,
        }),
      );
    }
  });

  await Promise.all([saveWorkflowRules(workflowRules), saveMenuEntries(menuEntries)]);
  return { menuEntries, workflowRules };
}
