<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useSavedStore } from "@/stores/saved";
import { encodeIds, decodeIds } from "@/lib/idCodec";

function parseIds(text: string): string[] {
  if (!text) return [];
  return text
    .split(/[^A-Za-z0-9]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const ui = useUiStore();
const saved = useSavedStore();
const router = useRouter();
const route = useRoute();
const { savedIds } = storeToRefs(saved);

const importText = ref("");
const copied = ref(false);
const linkCopied = ref(false);
const exportField = useTemplateRef<HTMLTextAreaElement>("exportField");
const shareField = useTemplateRef<HTMLTextAreaElement>("shareField");

const savedList = computed(() => savedIds.value);
const exportText = computed(() => savedList.value.join(", "));
const shareUrl = computed(() => {
  if (savedList.value.length === 0) return "";
  const encoded = encodeIds(savedList.value);
  if (!encoded) return "";
  const href = router.resolve({
    path: "/export",
    query: { ids: encoded },
  }).href;
  return `${window.location.origin}${href}`;
});
const parsed = computed(() => parseIds(importText.value));
const canImport = computed(() => parsed.value.length > 0);
const importStatus = computed(() => {
  if (!importText.value.trim()) return "";
  const n = parsed.value.length;
  return n === 0
    ? "No valid IDs found."
    : `${n} ID${n === 1 ? "" : "s"} detected.`;
});

{
  const raw = route.query.ids;
  const param = Array.isArray(raw) ? raw[0] : raw;
  if (typeof param === "string" && param && !importText.value) {
    const decoded = decodeIds(param);
    if (decoded.length > 0) importText.value = decoded.join(", ");
  }
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

async function copyLink() {
  if (!shareUrl.value) return;
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    linkCopied.value = true;
    setTimeout(() => {
      linkCopied.value = false;
    }, 1500);
  } catch {
    const ta = shareField.value;
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
  ui.setTab("schedule");
}

function selectAllExport(e: FocusEvent) {
  (e.target as HTMLTextAreaElement).select();
}

function selectAllShare(e: FocusEvent) {
  (e.target as HTMLTextAreaElement).select();
}
</script>

<template>
  <div class="page">
    <div class="page-head">Export / Import</div>

    <div class="det-section-title">Export ({{ savedList.length }} saved)</div>
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

    <div class="det-section-title" style="margin-top: 28px">Share link</div>
    <p class="exp-hint">
      Anyone opening this link will see these IDs ready to import.
    </p>
    <textarea
      ref="shareField"
      class="exp-field readonly"
      readonly
      rows="2"
      :value="shareUrl"
      placeholder="Save some papers to generate a shareable link."
      @focus="selectAllShare"
    />
    <div class="exp-actions">
      <button
        class="btn primary"
        :disabled="!shareUrl"
        :class="{ disabled: !shareUrl }"
        @click="copyLink"
      >
        {{ linkCopied ? "Copied ✓" : "Copy link" }}
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
</template>
