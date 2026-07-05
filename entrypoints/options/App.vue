<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import {
  ensureConfiguration,
  isDividerEntry,
  loadMenuEntries,
  loadWorkflowRules,
  normalizeMenuEntry,
  normalizeMenuEntryKind,
  saveMenuEntries,
  saveWorkflowRules,
  validateMenuLabel,
  validateMenuPath,
  type MenuEntry,
  type MenuEntryKind,
} from '@/utils/config';
import {
  AVAILABLE_TOKENS,
  getTokenExample,
  hasRuleMatchers,
  normalizeFilenameTemplate,
  normalizeMatchers,
  normalizeShortcutMode,
  normalizeTemplate,
  normalizeWorkflowRule,
  renderFilenameTemplate,
  renderPathTemplate,
  validateFilenameTemplate,
  validateMatchers,
  validatePathTemplate,
  validateWorkflowName,
  type RuleMatchers,
  type ShortcutMode,
  type WorkflowRule,
} from '@/utils/folders';
import {
  loadSettings,
  normalizeSettings,
  saveSettings,
  type AutoRouteMissBehavior,
  type DownloadTransport,
  type ExtensionSettings,
} from '@/utils/settings';

interface EditableMenuEntry extends MenuEntry {
  kind: MenuEntryKind;
}

interface EditableWorkflowRule extends WorkflowRule {
  matchers: RuleMatchers;
  shortcutMode: ShortcutMode;
}

const CONFIG_SCHEMA_VERSION = 2;
const PREVIEW_CONTEXT = {
  pageTitle: 'Example documentation article',
  pageUrl: 'https://example.com/articles/sample-page',
  sourceUrl: 'https://downloads.example.com/files/article.pdf',
  linkText: 'Example article link',
  selectionText: 'Example selected text',
  filename: 'article.pdf',
  naiveFilename: 'image.png',
  captures: ['full-match', 'capture-one', 'capture-two'],
};

const menuEntries = ref<EditableMenuEntry[]>([]);
const workflowRules = ref<EditableWorkflowRule[]>([]);
const openMenuEntryIds = ref<string[]>([]);
const openWorkflowRuleIds = ref<string[]>([]);
const openMatcherIds = ref<string[]>([]);
const importInput = ref<HTMLInputElement | null>(null);
const statusMessage = ref('');
const statusVariant = ref<'success' | 'error' | 'info'>('info');
const settings = ref<ExtensionSettings | null>(null);

const autoRouteMissOptions: Array<{ value: AutoRouteMissBehavior; label: string }> = [
  { value: 'none', label: 'Do nothing' },
  { value: 'notify', label: 'Show notification' },
  { value: 'prompt', label: 'Open Save As fallback' },
];

const downloadTransportOptions: Array<{ value: DownloadTransport; label: string; description: string }> = [
  { value: 'direct', label: 'Direct browser download', description: 'Use the browser download API normally.' },
  {
    value: 'fetch-with-page-referrer',
    label: 'Fetch with page referrer first',
    description:
      'Try fetching the file with the current page as referrer, then download the blob. Useful for some referer-sensitive sites.',
  },
];

const shortcutModeOptions: Array<{ value: ShortcutMode; label: string; description: string }> = [
  { value: 'none', label: 'Normal download', description: 'Download the real file or page target.' },
  { value: 'url', label: '.url shortcut', description: 'Windows-style internet shortcut file that opens the target URL.' },
  { value: 'desktop', label: '.desktop shortcut', description: 'Linux/Freedesktop launcher file that opens the target URL.' },
  { value: 'html', label: 'HTML redirect file', description: 'Small HTML file that redirects to the target URL when opened.' },
];

const tokenExamples = computed(() => {
  return AVAILABLE_TOKENS.map((token) => ({
    token: token.token,
    example: getTokenExample(token.token, PREVIEW_CONTEXT),
  }));
});

onMounted(async () => {
  const [{ menuEntries: loadedEntries, workflowRules: loadedRules }, loadedSettings] = await Promise.all([
    ensureConfiguration(),
    loadSettings(),
  ]);

  menuEntries.value = loadedEntries.map(cloneMenuEntry);
  workflowRules.value = loadedRules.map(cloneWorkflowRule);
  openMenuEntryIds.value = [];
  openWorkflowRuleIds.value = [];
  openMatcherIds.value = [];
  settings.value = loadedSettings;
});

function cloneMenuEntry(entry: MenuEntry): EditableMenuEntry {
  return {
    id: entry.id,
    kind: normalizeMenuEntryKind(entry.kind),
    label: entry.label,
    menuPath: entry.menuPath ?? '',
    workflowRuleId: entry.workflowRuleId ?? null,
  };
}

function normalizeMenuEntryDraft(entry: EditableMenuEntry): EditableMenuEntry {
  return {
    id: entry.id,
    kind: normalizeMenuEntryKind(entry.kind),
    label: entry.label.trim(),
    menuPath: entry.menuPath ?? '',
    workflowRuleId: entry.workflowRuleId ?? null,
  };
}

function cloneWorkflowRule(rule: WorkflowRule): EditableWorkflowRule {
  return {
    id: rule.id,
    name: rule.name,
    pathTemplate: rule.pathTemplate,
    filenameTemplate: rule.filenameTemplate ?? '',
    shortcutMode: normalizeShortcutMode(rule.shortcutMode),
    matchers: normalizeMatchers(rule.matchers),
  };
}

function normalizeWorkflowRuleDraft(rule: EditableWorkflowRule): EditableWorkflowRule {
  return {
    id: rule.id,
    name: rule.name.trim(),
    pathTemplate: normalizeTemplate(rule.pathTemplate),
    filenameTemplate: normalizeFilenameTemplate(rule.filenameTemplate ?? ''),
    shortcutMode: normalizeShortcutMode(rule.shortcutMode),
    matchers: normalizeMatchers(rule.matchers),
  };
}

function createEmptyMenuEntry(): EditableMenuEntry {
  return {
    id: crypto.randomUUID(),
    kind: 'entry',
    label: '',
    menuPath: '',
    workflowRuleId: workflowRules.value[0]?.id ?? null,
  };
}

function createDividerEntry(): EditableMenuEntry {
  return {
    id: crypto.randomUUID(),
    kind: 'divider',
    label: '',
    menuPath: '',
    workflowRuleId: null,
  };
}

function createEmptyWorkflowRule(): EditableWorkflowRule {
  return {
    id: crypto.randomUUID(),
    name: '',
    pathTemplate: ':date:/:pageurl:',
    filenameTemplate: '',
    shortcutMode: 'none',
    matchers: {
      contextPattern: '',
      pageDomainPattern: '',
      pageUrlPattern: '',
      sourceDomainPattern: '',
      sourceUrlPattern: '',
      fileExtensionPattern: '',
      linkTextPattern: '',
    },
  };
}

function insertMenuEntry(newEntry: EditableMenuEntry, afterId?: string): void {
  if (!afterId) {
    menuEntries.value.push(newEntry);
  } else {
    const index = menuEntries.value.findIndex((entry) => entry.id === afterId);
    if (index === -1) {
      menuEntries.value.push(newEntry);
    } else {
      menuEntries.value.splice(index + 1, 0, newEntry);
    }
  }

  if (!openMenuEntryIds.value.includes(newEntry.id)) {
    openMenuEntryIds.value.push(newEntry.id);
  }
  clearStatus();
}

function addMenuEntry(afterId?: string): void {
  insertMenuEntry(createEmptyMenuEntry(), afterId);
}

function addDividerEntry(afterId?: string): void {
  insertMenuEntry(createDividerEntry(), afterId);
}

function insertWorkflowRule(newRule: EditableWorkflowRule, afterId?: string): void {
  if (!afterId) {
    workflowRules.value.push(newRule);
  } else {
    const index = workflowRules.value.findIndex((rule) => rule.id === afterId);
    if (index === -1) {
      workflowRules.value.push(newRule);
    } else {
      workflowRules.value.splice(index + 1, 0, newRule);
    }
  }

  if (!openWorkflowRuleIds.value.includes(newRule.id)) {
    openWorkflowRuleIds.value.push(newRule.id);
  }
  clearStatus();
}

function addWorkflowRule(afterId?: string): void {
  insertWorkflowRule(createEmptyWorkflowRule(), afterId);
}

async function saveMenuEntry(entryId: string): Promise<void> {
  const entry = menuEntries.value.find((value) => value.id === entryId);
  if (!entry) {
    return;
  }

  const normalized = normalizeMenuEntryDraft(entry);
  const error =
    validateMenuLabel(normalized.label, normalized.kind) ||
    validateMenuPath(normalized.menuPath ?? '') ||
    validateLinkedWorkflow(normalized);

  if (error) {
    statusVariant.value = 'error';
    statusMessage.value = error;
    return;
  }

  const saved = await loadMenuEntries();
  const index = saved.findIndex((value) => value.id === entryId);
  const next = [...saved];
  const persisted = normalizeMenuEntry(normalized);

  if (index === -1) {
    next.push(persisted);
  } else {
    next[index] = persisted;
  }

  await saveMenuEntries(next);
  const localIndex = menuEntries.value.findIndex((value) => value.id === entryId);
  if (localIndex >= 0) {
    menuEntries.value[localIndex] = cloneMenuEntry(persisted);
  }

  statusVariant.value = 'success';
  statusMessage.value = isDividerDraft(normalized) ? 'Divider saved.' : `Saved entry "${persisted.label}".`;
}

async function saveWorkflowRule(ruleId: string): Promise<void> {
  const rule = workflowRules.value.find((value) => value.id === ruleId);
  if (!rule) {
    return;
  }

  const normalized = normalizeWorkflowRuleDraft(rule);
  const error =
    validateWorkflowName(normalized.name) ||
    validatePathTemplate(normalized.pathTemplate) ||
    validateFilenameTemplate(normalized.filenameTemplate ?? '') ||
    validateMatchers(normalized.matchers);

  if (error) {
    statusVariant.value = 'error';
    statusMessage.value = error;
    return;
  }

  const saved = await loadWorkflowRules();
  const index = saved.findIndex((value) => value.id === ruleId);
  const next = [...saved];
  const persisted = normalizeWorkflowRule(normalized);

  if (index === -1) {
    next.push(persisted);
  } else {
    next[index] = persisted;
  }

  await saveWorkflowRules(next);
  const localIndex = workflowRules.value.findIndex((value) => value.id === ruleId);
  if (localIndex >= 0) {
    workflowRules.value[localIndex] = cloneWorkflowRule(persisted);
  }

  statusVariant.value = 'success';
  statusMessage.value = `Saved workflow rule "${persisted.name}".`;
}

async function removeMenuEntry(entryId: string): Promise<void> {
  menuEntries.value = menuEntries.value.filter((entry) => entry.id !== entryId);
  openMenuEntryIds.value = openMenuEntryIds.value.filter((id) => id !== entryId);
  const saved = await loadMenuEntries();
  const next = saved.filter((entry) => entry.id !== entryId);
  if (next.length !== saved.length) {
    await saveMenuEntries(next);
    statusVariant.value = 'success';
    statusMessage.value = 'Entry removed.';
  } else {
    clearStatus();
  }
}

async function removeWorkflowRule(ruleId: string): Promise<void> {
  workflowRules.value = workflowRules.value.filter((rule) => rule.id !== ruleId);
  openWorkflowRuleIds.value = openWorkflowRuleIds.value.filter((id) => id !== ruleId);
  openMatcherIds.value = openMatcherIds.value.filter((id) => id !== ruleId);
  menuEntries.value = menuEntries.value.map((entry) =>
    entry.workflowRuleId === ruleId ? { ...entry, workflowRuleId: null } : entry,
  );

  const [savedRules, savedEntries] = await Promise.all([loadWorkflowRules(), loadMenuEntries()]);
  const nextRules = savedRules.filter((rule) => rule.id !== ruleId);
  const nextEntries = savedEntries.map((entry) =>
    entry.workflowRuleId === ruleId ? { ...entry, workflowRuleId: null } : entry,
  );
  await Promise.all([saveWorkflowRules(nextRules), saveMenuEntries(nextEntries)]);
  statusVariant.value = 'success';
  statusMessage.value = 'Workflow rule removed.';
}

function toggleMenuEntry(id: string): void {
  openMenuEntryIds.value = openMenuEntryIds.value.includes(id)
    ? openMenuEntryIds.value.filter((value) => value !== id)
    : [...openMenuEntryIds.value, id];
}

function toggleWorkflowRule(id: string): void {
  openWorkflowRuleIds.value = openWorkflowRuleIds.value.includes(id)
    ? openWorkflowRuleIds.value.filter((value) => value !== id)
    : [...openWorkflowRuleIds.value, id];
}

function toggleMatchers(id: string): void {
  openMatcherIds.value = openMatcherIds.value.includes(id)
    ? openMatcherIds.value.filter((value) => value !== id)
    : [...openMatcherIds.value, id];
}

function isMenuEntryOpen(id: string): boolean {
  return openMenuEntryIds.value.includes(id);
}

function isWorkflowRuleOpen(id: string): boolean {
  return openWorkflowRuleIds.value.includes(id);
}

function areMatchersOpen(id: string): boolean {
  return openMatcherIds.value.includes(id);
}

function previewPath(pathTemplate: string): string {
  return renderPathTemplate(pathTemplate, PREVIEW_CONTEXT);
}

function previewFilename(filenameTemplate: string): string {
  if (!filenameTemplate.trim()) {
    return 'Use detected file name';
  }

  return renderFilenameTemplate(filenameTemplate, PREVIEW_CONTEXT) || 'Use detected file name';
}

function isDividerDraft(entry: EditableMenuEntry): boolean {
  return entry.kind === 'divider';
}

function entryTitle(entry: EditableMenuEntry): string {
  return isDividerDraft(entry) ? 'Divider' : entry.label.trim() || 'Untitled entry';
}

function entrySummary(entry: EditableMenuEntry): string {
  if (isDividerDraft(entry)) {
    return 'Visual separator in the context menu';
  }

  const workflow = workflowRules.value.find((rule) => rule.id === entry.workflowRuleId);
  return workflow ? `Uses workflow · ${workflow.name}` : 'No linked workflow rule';
}

function workflowTitle(rule: EditableWorkflowRule): string {
  return rule.name.trim() || 'Untitled workflow rule';
}

function workflowSummary(rule: EditableWorkflowRule): string {
  const auto = hasRuleMatchers(rule) ? 'Auto-match enabled' : 'Manual only';
  return rule.shortcutMode !== 'none' ? `${auto} · ${rule.shortcutMode} shortcut` : auto;
}

function shortcutModeDescription(mode: ShortcutMode): string {
  return shortcutModeOptions.find((option) => option.value === mode)?.description ?? '';
}

function downloadTransportDescription(mode: DownloadTransport): string {
  return downloadTransportOptions.find((option) => option.value === mode)?.description ?? '';
}

function menuLabelError(entry: EditableMenuEntry): string | null {
  return validateMenuLabel(entry.label, entry.kind);
}

function menuPathError(entry: EditableMenuEntry): string | null {
  return validateMenuPath(entry.menuPath ?? '');
}

function linkedWorkflowError(entry: EditableMenuEntry): string | null {
  return validateLinkedWorkflow(entry);
}

function workflowNameError(rule: EditableWorkflowRule): string | null {
  return validateWorkflowName(rule.name);
}

function workflowPathError(rule: EditableWorkflowRule): string | null {
  return validatePathTemplate(rule.pathTemplate);
}

function workflowFilenameError(rule: EditableWorkflowRule): string | null {
  return validateFilenameTemplate(rule.filenameTemplate ?? '');
}

function workflowMatcherError(rule: EditableWorkflowRule): string | null {
  return validateMatchers(rule.matchers);
}

function validateLinkedWorkflow(entry: EditableMenuEntry): string | null {
  if (isDividerDraft(entry)) {
    return null;
  }

  if (!entry.workflowRuleId) {
    return 'Select a workflow rule for this entry.';
  }

  return null;
}

async function persistSettings(): Promise<void> {
  if (!settings.value) {
    return;
  }

  await saveSettings(settings.value);
  statusVariant.value = 'success';
  statusMessage.value = 'Settings saved.';
}

async function exportConfiguration(): Promise<void> {
  if (!settings.value) {
    return;
  }

  const payload = {
    app: 'save-in-mv3',
    version: CONFIG_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    menuEntries: menuEntries.value.map((entry) => normalizeMenuEntry(normalizeMenuEntryDraft(entry))),
    workflowRules: workflowRules.value.map((rule) => normalizeWorkflowRule(normalizeWorkflowRuleDraft(rule))),
    settings: normalizeSettings(settings.value),
  };

  const objectUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }));

  try {
    await browser.downloads.download({
      url: objectUrl,
      filename: 'save-in-mv3-config.json',
      saveAs: true,
      conflictAction: 'uniquify',
    });
    statusVariant.value = 'success';
    statusMessage.value = 'Configuration exported.';
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}

function openImportDialog(): void {
  importInput.value?.click();
}

async function importConfiguration(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement | null;
  const file = input?.files?.[0];
  if (!file) {
    return;
  }

  try {
    const text = await file.text();
    const parsed = JSON.parse(text) as {
      menuEntries?: MenuEntry[];
      workflowRules?: WorkflowRule[];
      settings?: ExtensionSettings;
    };

    if (!Array.isArray(parsed.menuEntries) || !Array.isArray(parsed.workflowRules)) {
      throw new Error('Missing menuEntries or workflowRules arrays.');
    }

    const normalizedEntries = parsed.menuEntries.map((entry) => normalizeMenuEntry(entry));
    const normalizedRules = parsed.workflowRules.map((rule) => normalizeWorkflowRule(rule));
    const normalizedSettings = normalizeSettings(parsed.settings);

    await Promise.all([
      saveMenuEntries(normalizedEntries),
      saveWorkflowRules(normalizedRules),
      saveSettings(normalizedSettings),
    ]);

    menuEntries.value = normalizedEntries.map(cloneMenuEntry);
    workflowRules.value = normalizedRules.map(cloneWorkflowRule);
    openMenuEntryIds.value = [];
    openWorkflowRuleIds.value = [];
    openMatcherIds.value = [];
    settings.value = normalizedSettings;
    statusVariant.value = 'success';
    statusMessage.value = `Imported ${normalizedEntries.length} entr${normalizedEntries.length === 1 ? 'y' : 'ies'} and ${normalizedRules.length} workflow rule${normalizedRules.length === 1 ? '' : 's'}.`;
  } catch (error) {
    statusVariant.value = 'error';
    statusMessage.value = error instanceof Error ? `Import failed: ${error.message}` : 'Import failed.';
  } finally {
    if (input) {
      input.value = '';
    }
  }
}

function onEdit(): void {
  clearStatus();
}

function clearStatus(): void {
  statusMessage.value = '';
}
</script>

<template>
  <div class="options-page">
    <header class="page-header">
      <div class="page-header__inner">
        <div>
          <div class="brand-row">
            <div class="brand-mark">S</div>
            <span class="brand-eyebrow">Manifest V3 Replacement</span>
          </div>
          <h1 class="page-title">Save In MV3</h1>
          <p class="page-copy">
            Manage context menu entries and workflow rules for downloads routed inside your Downloads folder.
          </p>
        </div>
        <div class="top-actions">
          <button class="secondary-button" type="button" @click="addDividerEntry()">Add divider</button>
          <button class="primary-button top-action" type="button" @click="addMenuEntry()">
            <span class="button-plus">+</span>
            Add context menu entry
          </button>
        </div>
      </div>
    </header>

    <main class="page-main split-page-main">
      <div class="main-column-stack">
        <section class="card panel-rules">
          <div class="card-header">
            <h2>Context menu entries</h2>
            <p>
              These are the visible items that appear in the regular page, link, media, and selection context menus.
              Entries can point at workflow rules, and dividers can be inserted between them.
            </p>
          </div>

          <div class="rule-list">
            <div v-for="entry in menuEntries" :key="entry.id" class="rule-wrap">
              <article class="rule-card" :class="{ 'is-open': isMenuEntryOpen(entry.id) }">
                <div class="rule-card__summary" @click="toggleMenuEntry(entry.id)">
                  <div class="rule-card__bar" :class="{ active: isMenuEntryOpen(entry.id) }"></div>
                  <div class="rule-card__copy">
                    <div class="rule-card__topline">
                      <span class="rule-title">{{ entryTitle(entry) }}</span>
                      <span class="rule-badge">Group · {{ entry.menuPath?.trim() || 'Root' }}</span>
                      <span class="rule-badge muted">{{ isDividerDraft(entry) ? 'Divider' : 'Visible entry' }}</span>
                    </div>
                    <div class="rule-meta">
                      {{ entrySummary(entry) }}
                    </div>
                  </div>
                  <span class="chevron">{{ isMenuEntryOpen(entry.id) ? '▲' : '▼' }}</span>
                </div>

                <div v-if="isMenuEntryOpen(entry.id)" class="rule-editor">
                  <div class="editor-grid">
                    <label class="field">
                      <span>Entry type</span>
                      <div class="select-wrap">
                        <select v-model="entry.kind" @change="onEdit">
                          <option value="entry">Context menu entry</option>
                          <option value="divider">Divider</option>
                        </select>
                        <span class="select-caret">▼</span>
                      </div>
                    </label>

                    <label class="field">
                      <span>Menu group</span>
                      <input v-model="entry.menuPath" type="text" placeholder="Research/Clippings" @input="onEdit" />
                      <small class="field-help">Optional nested group path using <code>/</code>.</small>
                      <small v-if="menuPathError(entry)" class="field-error">{{ menuPathError(entry) }}</small>
                    </label>
                  </div>

                  <template v-if="!isDividerDraft(entry)">
                    <label class="field">
                      <span>Context menu label</span>
                      <input v-model="entry.label" type="text" placeholder="Articles" @input="onEdit" />
                      <small v-if="menuLabelError(entry)" class="field-error">{{ menuLabelError(entry) }}</small>
                    </label>

                    <label class="field">
                      <span>Workflow rule</span>
                      <div class="select-wrap">
                        <select v-model="entry.workflowRuleId" @change="onEdit">
                          <option :value="null">Select workflow rule</option>
                          <option v-for="rule in workflowRules" :key="rule.id" :value="rule.id">
                            {{ workflowTitle(rule) }}
                          </option>
                        </select>
                        <span class="select-caret">▼</span>
                      </div>
                      <small v-if="linkedWorkflowError(entry)" class="field-error">{{ linkedWorkflowError(entry) }}</small>
                    </label>
                  </template>

                  <div v-else class="divider-help">
                    This entry creates a non-clickable separator in the generated context menu.
                  </div>

                  <div class="rule-actions rule-actions--right-only">
                    <div class="rule-actions__right">
                      <button class="danger-button" type="button" @click="void removeMenuEntry(entry.id)">
                        Remove entry
                      </button>
                      <button class="primary-button" type="button" @click="void saveMenuEntry(entry.id)">
                        Save entry
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <div class="list-add-actions">
              <button class="add-more-button" type="button" @click="addMenuEntry()">
                <span class="button-plus">+</span>
                Add context menu entry
              </button>
              <button class="add-more-button secondary-add" type="button" @click="addDividerEntry()">
                Add divider
              </button>
            </div>
          </div>
        </section>

        <section class="card panel-rules">
          <div class="card-header">
            <h2>Workflow rules</h2>
            <p>
              These rules define matching, path routing, filename templating, and shortcut output behavior.
              Auto-only workflows such as tab saves use this rule set directly.
            </p>
          </div>

          <div class="rule-list">
            <div v-for="rule in workflowRules" :key="rule.id" class="rule-wrap">
              <article class="rule-card" :class="{ 'is-open': isWorkflowRuleOpen(rule.id) }">
                <div class="rule-card__summary" @click="toggleWorkflowRule(rule.id)">
                  <div class="rule-card__bar" :class="{ active: isWorkflowRuleOpen(rule.id) }"></div>
                  <div class="rule-card__copy">
                    <div class="rule-card__topline">
                      <span class="rule-title">{{ workflowTitle(rule) }}</span>
                      <span class="rule-badge muted">{{ workflowSummary(rule) }}</span>
                    </div>
                    <div class="rule-meta">Path <code>{{ rule.pathTemplate || 'Not configured yet' }}</code></div>
                    <div class="rule-meta">Preview <code class="preview-code">{{ previewPath(rule.pathTemplate) }}</code></div>
                  </div>
                  <span class="chevron">{{ isWorkflowRuleOpen(rule.id) ? '▲' : '▼' }}</span>
                </div>

                <div v-if="isWorkflowRuleOpen(rule.id)" class="rule-editor">
                  <label class="field">
                    <span>Workflow rule name</span>
                    <input v-model="rule.name" type="text" placeholder="Saved Tabs" @input="onEdit" />
                    <small v-if="workflowNameError(rule)" class="field-error">{{ workflowNameError(rule) }}</small>
                  </label>

                  <label class="field">
                    <span>Relative download path</span>
                    <input v-model="rule.pathTemplate" type="text" placeholder=":date:/:pageurl:" @input="onEdit" />
                    <small v-if="workflowPathError(rule)" class="field-error">{{ workflowPathError(rule) }}</small>
                  </label>

                  <label class="field">
                    <span>Filename template</span>
                    <input v-model="rule.filenameTemplate" type="text" placeholder=":filename:" @input="onEdit" />
                    <small class="field-help">
                      Optional. Leave empty to keep the detected file name. Preview:
                      <code>{{ previewFilename(rule.filenameTemplate ?? '') }}</code>
                    </small>
                    <small v-if="workflowFilenameError(rule)" class="field-error">{{ workflowFilenameError(rule) }}</small>
                  </label>

                  <label class="field">
                    <span>Shortcut output</span>
                    <div class="select-wrap">
                      <select v-model="rule.shortcutMode" @change="onEdit">
                        <option v-for="option in shortcutModeOptions" :key="option.value" :value="option.value">
                          {{ option.label }}
                        </option>
                      </select>
                      <span class="select-caret">▼</span>
                    </div>
                    <small class="field-help">{{ shortcutModeDescription(rule.shortcutMode) }}</small>
                    <small class="field-help">Applies to page, link, media, and tab workflows. Selection saves remain plain text.</small>
                  </label>

                  <div class="matcher-block">
                    <button class="matcher-toggle" type="button" @click="toggleMatchers(rule.id)">
                      <div class="matcher-toggle__title">
                        <h3>Auto-match fields</h3>
                        <span class="rule-badge muted">Optional</span>
                      </div>
                      <span class="chevron small">{{ areMatchersOpen(rule.id) ? '▲' : '▼' }}</span>
                    </button>
                    <p class="matcher-intro">
                      Fill one or more matcher fields to make this workflow eligible for
                      <strong>Best matching rule</strong> and popup tab-save actions.
                    </p>

                    <div v-if="areMatchersOpen(rule.id)" class="matcher-fields">
                      <p class="matcher-note">
                        Capture groups can be reused in the path or filename template with
                        <code>:$0:</code>, <code>:$1:</code>, <code>:$2:</code>, and so on.
                      </p>

                      <div class="editor-grid">
                        <label class="field">
                          <span>Context regex</span>
                          <input v-model="rule.matchers.contextPattern" type="text" placeholder="page|link|media|selection|tab" @input="onEdit" />
                        </label>
                        <label class="field">
                          <span>File extension regex</span>
                          <input v-model="rule.matchers.fileExtensionPattern" type="text" placeholder="pdf|png|jpe?g" @input="onEdit" />
                        </label>
                        <label class="field">
                          <span>Page domain regex</span>
                          <input v-model="rule.matchers.pageDomainPattern" type="text" placeholder="example\\.com" @input="onEdit" />
                        </label>
                        <label class="field">
                          <span>Source domain regex</span>
                          <input v-model="rule.matchers.sourceDomainPattern" type="text" placeholder="downloads\\.example\\.com" @input="onEdit" />
                        </label>
                      </div>

                      <label class="field">
                        <span>Link text regex</span>
                        <input v-model="rule.matchers.linkTextPattern" type="text" placeholder="download|article|spec" @input="onEdit" />
                      </label>

                      <label class="field">
                        <span>Page URL regex</span>
                        <input v-model="rule.matchers.pageUrlPattern" type="text" placeholder="/articles/|/docs/" @input="onEdit" />
                      </label>

                      <label class="field">
                        <span>Source URL regex</span>
                        <input v-model="rule.matchers.sourceUrlPattern" type="text" placeholder="\\.(pdf|zip)$" @input="onEdit" />
                      </label>

                      <small v-if="workflowMatcherError(rule)" class="field-error">{{ workflowMatcherError(rule) }}</small>
                    </div>
                  </div>

                  <div class="rule-actions rule-actions--right-only">
                    <div class="rule-actions__right">
                      <button class="danger-button" type="button" @click="void removeWorkflowRule(rule.id)">
                        Remove workflow
                      </button>
                      <button class="primary-button" type="button" @click="void saveWorkflowRule(rule.id)">
                        Save workflow
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            </div>

            <div class="list-add-actions single-action">
              <button class="add-more-button" type="button" @click="addWorkflowRule()">
                <span class="button-plus">+</span>
                Add workflow rule
              </button>
            </div>
          </div>
        </section>
      </div>

      <div class="sidebar-column">
        <section v-if="settings" class="card sidebar-card">
          <div class="card-header compact">
            <h2>Behavior</h2>
            <p>Global options for auto-route fallback, referrer handling, tab workflows, and config backups.</p>
          </div>

          <div class="settings-list">
            <div class="settings-actions">
              <button class="secondary-button fill" type="button" @click="void exportConfiguration()">Export config</button>
              <button class="secondary-button fill" type="button" @click="openImportDialog()">Import config</button>
              <input ref="importInput" class="visually-hidden" type="file" accept="application/json,.json" @change="void importConfiguration($event)" />
            </div>

            <label class="checkbox-row">
              <input v-model="settings.preferLinkTargetOnMedia" type="checkbox" @change="void persistSettings()" />
              <span>Prefer the enclosing link target over the media source when right-clicking linked images/video/audio.</span>
            </label>

            <label class="checkbox-row">
              <input v-model="settings.notifyOnAutoRouteMatch" type="checkbox" @change="void persistSettings()" />
              <span>Show a notification when <strong>Best matching rule</strong> finds a workflow rule.</span>
            </label>

            <label class="field">
              <span>Auto-route miss behavior</span>
              <div class="select-wrap">
                <select v-model="settings.autoRouteMissBehavior" @change="void persistSettings()">
                  <option v-for="option in autoRouteMissOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <span class="select-caret">▼</span>
              </div>
            </label>

            <label class="field">
              <span>Download transport</span>
              <div class="select-wrap">
                <select v-model="settings.downloadTransport" @change="void persistSettings()">
                  <option v-for="option in downloadTransportOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
                <span class="select-caret">▼</span>
              </div>
              <small class="field-help">{{ downloadTransportDescription(settings.downloadTransport) }}</small>
            </label>

            <label class="checkbox-row active">
              <input v-model="settings.enableTabSaveMenus" type="checkbox" @change="void persistSettings()" />
              <span>Enable tab save actions in the popup and workflow tools (selected tab, highlighted tabs, tabs to the right, child tabs).</span>
            </label>

            <label class="checkbox-row active">
              <input v-model="settings.closeTabAfterTabSave" type="checkbox" @change="void persistSettings()" />
              <span>Close tabs after a tab-save workflow successfully queues them.</span>
            </label>
          </div>
        </section>

        <section class="card sidebar-card">
          <div class="card-header compact">
            <h2>Tokens</h2>
            <p>Available variables for the relative download path and filename template.</p>
          </div>

          <div class="token-list">
            <div v-for="token in tokenExamples" :key="token.token" class="token-row">
              <code>{{ token.token }}</code>
              <span>{{ token.example }}</span>
            </div>
          </div>
        </section>
      </div>
    </main>

    <div v-if="statusMessage" class="toast" :class="statusVariant">
      {{ statusMessage }}
    </div>
  </div>
</template>
