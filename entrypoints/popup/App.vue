<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue';
import { loadMenuEntries, loadWorkflowRules } from '@/utils/config';
import { loadSettings } from '@/utils/settings';

const menuEntryCount = ref(0);
const workflowRuleCount = ref(0);
const tabMenusEnabled = ref(false);
const tabActionBusy = ref(false);

const summary = computed(() => {
  return `${menuEntryCount.value} entr${menuEntryCount.value === 1 ? 'y' : 'ies'} · ${workflowRuleCount.value} workflow rule${workflowRuleCount.value === 1 ? '' : 's'}.`;
});

onMounted(async () => {
  const [menuEntries, workflowRules, settings] = await Promise.all([
    loadMenuEntries(),
    loadWorkflowRules(),
    loadSettings(),
  ]);
  menuEntryCount.value = menuEntries.length;
  workflowRuleCount.value = workflowRules.length;
  tabMenusEnabled.value = settings.enableTabSaveMenus;
});

async function openSettings(): Promise<void> {
  try {
    await browser.runtime.openOptionsPage();
  } catch {
    await browser.tabs.create({
      url: browser.runtime.getURL('/options.html'),
    });
  }
  window.close();
}

function showDownloadsFolder(): void {
  browser.downloads.showDefaultFolder();
  window.close();
}

async function runTabWorkflow(workflow: 'selected' | 'highlighted' | 'right' | 'children'): Promise<void> {
  tabActionBusy.value = true;
  try {
    await browser.runtime.sendMessage({
      type: 'save-in-tab-workflow',
      workflow,
    });
    window.close();
  } finally {
    tabActionBusy.value = false;
  }
}
</script>

<template>
  <div class="popup-page">
    <header class="popup-header popup-card">
      <div class="brand-row">
        <div class="brand-mark">S</div>
        <span class="brand-eyebrow">Manifest V3 Replacement</span>
      </div>
      <h1 class="popup-title">Save In MV3</h1>
      <p class="popup-copy">
        Open the full settings page to manage rules, matching, shortcut outputs, behavior settings,
        and import/export.
      </p>
      <p class="summary-copy">{{ summary }}</p>
      <p class="small-copy">
        {{ tabMenusEnabled ? 'Tab save actions are enabled.' : 'Tab save actions are disabled.' }}
      </p>
      <div class="action-stack">
        <button class="primary-button" type="button" @click="void openSettings()">
          Open full settings
        </button>
        <button class="secondary-button" type="button" @click="showDownloadsFolder()">
          Show Downloads folder
        </button>
      </div>

      <div v-if="tabMenusEnabled" class="tab-action-list">
        <button class="secondary-button" type="button" :disabled="tabActionBusy" @click="void runTabWorkflow('selected')">
          Save active tab
        </button>
        <button class="secondary-button" type="button" :disabled="tabActionBusy" @click="void runTabWorkflow('highlighted')">
          Save highlighted tabs
        </button>
        <button class="secondary-button" type="button" :disabled="tabActionBusy" @click="void runTabWorkflow('right')">
          Save tabs to the right
        </button>
        <button class="secondary-button" type="button" :disabled="tabActionBusy" @click="void runTabWorkflow('children')">
          Save child tabs
        </button>
      </div>
    </header>

    <section class="popup-card compact-list-card">
      <h2>Available in settings</h2>
      <ul>
        <li>context menu rules and dividers</li>
        <li>matchers and capture groups</li>
        <li>shortcut outputs and behavior settings</li>
        <li>config import and export</li>
      </ul>
    </section>
  </div>
</template>
