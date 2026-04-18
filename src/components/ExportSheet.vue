<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { storeToRefs } from "pinia";
import { useUiStore } from "@/stores/ui";
import { useSavedStore } from "@/stores/saved";

function parseIds(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[^A-Za-z0-9]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ui = useUiStore();
const saved = useSavedStore();
const { exportOpen } = storeToRefs(ui);
const { savedIds } = storeToRefs(saved);

const importText = ref("");
const copied = ref(false);
const exportField = useTemplateRef<HTMLTextAreaElement>("exportField");

const savedList = computed(() => savedIds.value);
const exportText = computed(() => savedList.value.join(", "));
const parsed = computed(() => parseIds(importText.value));
const canImport = computed(() => parsed.value.length > 0);
const importStatus = computed(() => {
  if (!importText.value.trim()) return "";
  const n = parsed.value.length;
  return n === 0
    ? "No valid IDs found."
    : `${n} ID${n === 1 ? "" : "s"} detected.`;
});

function close() {
  ui.closeExport();
  importText.value = "";
  copied.value = false;
}

async function copy() {
  try {
    await navigator.clipboard.writeText(exportText.value);
    copied.value = true;
    setTimeout(() => {
      copied.value = false;
    }, 1500);
  } catch {
    const ta = exportField.value;
    if (ta) {
      ta.focus();
      ta.select();
    }
  }
}

function doImport() {
  if (!canImport.value) return;
  saved.importIds(parsed.value);
  importText.value = "";
  close();
}

function selectAllExport(e: FocusEvent) {
  (e.target as HTMLTextAreaElement).select();
}
</script>

<template>
  <template v-if="exportOpen">
    <div class="sheet-overlay" @click="close" />
    <div class="sheet" @click.stop>
      <div class="sheet-head">
        <span>Export / Import</span>
        <button class="close" title="Close" @click="close">×</button>
      </div>
      <div class="sheet-body">
        <div class="det-section-title">
          Export ({{ savedList.length }} saved)
        </div>
        <p class="exp-hint">Copy these IDs or select and save them anywhere.</p>
        <textarea
          ref="exportField"
          class="exp-field readonly"
          readonly
          rows="6"
          :value="exportText"
          placeholder="Nothing saved yet — save some papers from Explore to see IDs here."
          @focus="selectAllExport"
        />
        <div class="exp-actions">
          <button
            class="btn primary"
            :disabled="!savedList.length"
            :class="{ disabled: !savedList.length }"
            @click="copy"
          >
            {{ copied ? "Copied ✓" : "Copy" }}
          </button>
        </div>

        <div class="det-section-title" style="margin-top: 28px">Import</div>
        <p class="exp-hint">
          Paste IDs separated by commas, spaces, or newlines. Importing
          <strong>replaces</strong> your current saved list.
        </p>
        <textarea
          v-model="importText"
          class="exp-field"
          rows="6"
          placeholder="Paste IDs here…"
        />
        <div class="exp-status">{{ importStatus }}</div>
        <div class="exp-actions">
          <button
            class="btn primary"
            :disabled="!canImport"
            :class="{ disabled: !canImport }"
            @click="doImport"
          >
            Import {{ canImport ? "(" + parsed.length + ")" : "" }}
          </button>
        </div>
      </div>
    </div>
  </template>
</template>
