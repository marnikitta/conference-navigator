<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import { storeToRefs } from "pinia";
import { useRoute, useRouter } from "vue-router";
import { useUiStore } from "@/stores/ui";
import { useSavedStore } from "@/stores/saved";
import { usePapersStore } from "@/stores/papers";
import { encodeIds, decodeIds } from "@/lib/idCodec";
import QrCode from "@/components/QrCode.vue";

function parseIds(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of text.split(/[^A-Za-z0-9]+/)) {
    const id = raw.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

const ui = useUiStore();
const saved = useSavedStore();
const papersStore = usePapersStore();
const router = useRouter();
const route = useRoute();
const { savedIds } = storeToRefs(saved);
const { papers } = storeToRefs(papersStore);

const linkCopied = ref(false);
const editOpen = ref(false);
const editText = ref(savedIds.value.join(", "));
const shareField = useTemplateRef<HTMLInputElement>("shareField");

const savedList = computed(() => savedIds.value);
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

// Title lookup for diff rows. Falls back to the bare ID until papers load.
const titleById = computed(() => {
  const m = new Map<string, string>();
  for (const p of papers.value) m.set(p.id, p.title);
  return m;
});
function titleFor(id: string): string {
  return titleById.value.get(id) || `#${id}`;
}

// ---------- Import mode (?ids=…) ----------

const incomingParam = computed(() => {
  const raw = route.query.ids;
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" ? v : "";
});

const incomingIds = computed(() => {
  if (!incomingParam.value) return [];
  return decodeIds(incomingParam.value);
});

const isImportMode = computed(() => incomingIds.value.length > 0);

type DiffRow = { kind: "add" | "del" | "same"; id: string; title: string };

function diff(fromIds: string[], toIds: string[]): DiffRow[] {
  const fromSet = new Set(fromIds);
  const toSet = new Set(toIds);
  const rows: DiffRow[] = [];
  for (const id of fromIds) {
    if (!toSet.has(id)) rows.push({ kind: "del", id, title: titleFor(id) });
  }
  for (const id of toIds) {
    if (!fromSet.has(id)) rows.push({ kind: "add", id, title: titleFor(id) });
    else rows.push({ kind: "same", id, title: titleFor(id) });
  }
  return rows;
}

// Diff relative to current saved list. For overwrite semantics, this is
// exactly what changes. For merge, only the `add` rows apply.
const importDiff = computed(() => diff(savedList.value, incomingIds.value));
const importAdds = computed(() =>
  importDiff.value.filter((r) => r.kind === "add"),
);
const importDels = computed(() =>
  importDiff.value.filter((r) => r.kind === "del"),
);
const importSames = computed(() =>
  importDiff.value.filter((r) => r.kind === "same"),
);
const importChanges = computed(() =>
  importDiff.value.filter((r) => r.kind !== "same"),
);

function doMerge() {
  saved.mergeIds(incomingIds.value);
  router.replace({ path: "/schedule" });
  ui.setTab("schedule");
}

function doOverwrite() {
  saved.importIds(incomingIds.value);
  router.replace({ path: "/schedule" });
  ui.setTab("schedule");
}

function cancelImport() {
  router.replace({ path: "/export" });
}

// ---------- Export mode: edit saved list ----------

// Keep the editor textarea in sync with the saved list when the user hasn't
// opened the editor. Once opened, we stop mirroring so typing isn't clobbered.
watch(
  savedIds,
  (v) => {
    if (!editOpen.value) editText.value = v.join(", ");
  },
  { deep: true },
);

const editParsed = computed(() => parseIds(editText.value));
const editDiff = computed(() => diff(savedList.value, editParsed.value));
const editAdds = computed(() => editDiff.value.filter((r) => r.kind === "add"));
const editDels = computed(() => editDiff.value.filter((r) => r.kind === "del"));
const editDirty = computed(
  () => editAdds.value.length > 0 || editDels.value.length > 0,
);

function saveEdit() {
  if (!editDirty.value) return;
  saved.importIds(editParsed.value);
  editText.value = editParsed.value.join(", ");
}

function resetEdit() {
  editText.value = savedIds.value.join(", ");
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
    const field = shareField.value;
    if (field) {
      field.focus();
      field.select();
    }
  }
}

function selectAllShare(e: FocusEvent) {
  (e.target as HTMLInputElement).select();
}
</script>

<template>
  <!-- ======================= IMPORT MODE ======================= -->
  <div v-if="isImportMode" class="page">
    <div class="page-head">Import</div>
    <h1 class="det-title" style="margin-bottom: 8px">
      Import {{ incomingIds.length }} paper{{
        incomingIds.length === 1 ? "" : "s"
      }}
    </h1>
    <p class="exp-hint">
      You currently have <strong>{{ savedList.length }}</strong> saved locally.
      This link has <strong>{{ incomingIds.length }}</strong
      >:
      <strong class="diff-add-ink">+{{ importAdds.length }}</strong>
      new<template v-if="importDels.length > 0"
        >,
        <strong class="diff-del-ink">−{{ importDels.length }}</strong>
        would be removed if you overwrite</template
      ><template v-if="importSames.length > 0">
        ·
        <span class="exp-muted"
          >{{ importSames.length }} already saved</span
        ></template
      >.
    </p>

    <div class="exp-callout">
      <strong>Merge</strong> adds the {{ incomingIds.length }} incoming paper{{
        incomingIds.length === 1 ? "" : "s"
      }}
      to your saved list without removing anything.<template
        v-if="importDels.length > 0"
      >
        <strong>Overwrite</strong> replaces your local list — the
        <span class="diff-del-ink"
          >{{ importDels.length }} paper{{
            importDels.length === 1 ? "" : "s"
          }}</span
        >
        below marked <code>−</code> will be removed from this browser.
      </template>
    </div>

    <div class="exp-actions-row">
      <button class="btn" @click="cancelImport">Cancel</button>
      <button
        v-if="importDels.length > 0"
        class="btn danger"
        @click="doOverwrite"
      >
        Overwrite
        <span class="btn-delta">
          (<span v-if="importAdds.length > 0">+{{ importAdds.length }}</span
          ><span v-if="importAdds.length > 0">,&nbsp;</span>−{{
            importDels.length
          }})
        </span>
      </button>
      <button
        class="btn good"
        :disabled="importAdds.length === 0"
        :class="{ disabled: importAdds.length === 0 }"
        @click="doMerge"
      >
        Merge (+{{ importAdds.length }})
      </button>
    </div>

    <div class="det-section-title" style="margin-top: 28px">Changes</div>
    <div
      v-if="importAdds.length === 0 && importDels.length === 0"
      class="exp-empty-diff"
    >
      <template v-if="importSames.length > 0">
        Nothing to change — you already have exactly these
        {{ importSames.length }} paper{{ importSames.length === 1 ? "" : "s" }}
        saved.
      </template>
      <template v-else>No changes.</template>
    </div>
    <ul v-else class="diff-list">
      <li
        v-for="row in importChanges"
        :key="row.kind + ':' + row.id"
        class="diff-row"
        :class="'diff-' + row.kind"
      >
        <span class="diff-sign" aria-hidden="true">{{
          row.kind === "add" ? "+" : "−"
        }}</span>
        <span class="diff-body">
          <router-link
            class="diff-title"
            :to="{ name: 'paper', params: { id: row.id } }"
            >{{ row.title }}</router-link
          >
          <span class="diff-id">#{{ row.id }}</span>
        </span>
      </li>
    </ul>
  </div>

  <!-- ======================= EXPORT MODE ======================= -->
  <div v-else class="page">
    <div class="page-head">Export / Import</div>

    <p class="exp-hint" style="margin-top: 4px">
      Your saved list (<strong>{{ savedList.length }}</strong> paper{{
        savedList.length === 1 ? "" : "s"
      }}) lives only in this browser. Share the link below to back it up, move
      to another device, or hand it to a colleague.
    </p>

    <div class="det-section-title" style="margin-top: 24px">Share link</div>
    <template v-if="shareUrl">
      <div class="share-row">
        <input
          ref="shareField"
          type="text"
          class="share-url"
          readonly
          :value="shareUrl"
          @focus="selectAllShare"
        />
        <button class="btn primary" type="button" @click="copyLink">
          {{ linkCopied ? "Copied ✓" : "Copy link" }}
        </button>
      </div>

      <div class="qr-card">
        <QrCode :value="shareUrl" :size="200" />
        <div class="qr-caption">
          Scan on another device to import your saved list
        </div>
      </div>
    </template>
    <p v-else class="share-empty">
      Save some papers to generate a shareable link.
    </p>

    <details
      class="exp-details"
      :open="editOpen"
      @toggle="editOpen = ($event.target as HTMLDetailsElement).open"
    >
      <summary class="exp-summary">Edit saved IDs</summary>
      <p class="exp-hint" style="margin-top: 10px">
        Paste or edit the ID list below. Separate with commas, spaces, or
        newlines. <strong>Save</strong> replaces your saved list with exactly
        what's in the box.
      </p>
      <textarea
        v-model="editText"
        class="exp-field"
        rows="6"
        placeholder="Paste or edit IDs here…"
      />
      <div class="exp-diff-summary">
        <template v-if="editDirty">
          <span v-if="editAdds.length > 0" class="diff-add-ink">
            +{{ editAdds.length }}
          </span>
          <span v-if="editDels.length > 0" class="diff-del-ink">
            −{{ editDels.length }}
          </span>
          <span class="exp-muted">vs saved</span>
        </template>
        <template v-else>
          <span class="exp-muted">No changes vs saved.</span>
        </template>
      </div>
      <ul v-if="editDirty" class="diff-list diff-list-compact">
        <li
          v-for="row in editDiff"
          v-show="row.kind !== 'same'"
          :key="row.kind + ':' + row.id"
          class="diff-row"
          :class="'diff-' + row.kind"
        >
          <span class="diff-sign" aria-hidden="true">{{
            row.kind === "add" ? "+" : "−"
          }}</span>
          <span class="diff-body">
            <router-link
              class="diff-title"
              :to="{ name: 'paper', params: { id: row.id } }"
              >{{ row.title }}</router-link
            >
            <span class="diff-id">#{{ row.id }}</span>
          </span>
        </li>
      </ul>
      <div class="exp-actions-row">
        <button
          class="btn"
          :disabled="!editDirty"
          :class="{ disabled: !editDirty }"
          @click="resetEdit"
        >
          Reset
        </button>
        <button
          class="btn primary"
          :disabled="!editDirty"
          :class="{ disabled: !editDirty }"
          @click="saveEdit"
        >
          Save
        </button>
      </div>
    </details>
  </div>
</template>
