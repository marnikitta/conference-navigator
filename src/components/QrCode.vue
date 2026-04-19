<script setup lang="ts">
import { computed } from "vue";
import QRCode from "qrcode";

const props = withDefaults(
  defineProps<{
    value: string;
    size?: number;
    /** Quiet-zone in modules. QR spec requires 4 for reliable scanning. */
    margin?: number;
    /** Corner radius in module units (0..0.5). */
    radius?: number;
  }>(),
  { size: 240, margin: 4, radius: 0.4 },
);

type Matrix = { size: number; get(x: number, y: number): 0 | 1 };

const qr = computed<Matrix | null>(() => {
  if (!props.value) return null;
  const ec =
    props.value.length > 300 ? "L" : props.value.length > 120 ? "M" : "H";
  const obj = QRCode.create(props.value, { errorCorrectionLevel: ec });
  return obj.modules as Matrix;
});

// City-block rendering: every dark module emits a 1×1 square path whose
// corners are rounded only when BOTH orthogonal neighbors at that corner are
// light. So adjacent dark modules share a straight edge (no gap between
// them) and each connected region ends up with rounded outer corners while
// its interior stays crisp — exactly the look you'd get from a block plan.
const path = computed<string>(() => {
  const m = qr.value;
  if (!m) return "";
  const n = m.size;
  const r = Math.min(0.5, Math.max(0, props.radius));
  const pad = props.margin;
  const dark = (x: number, y: number) =>
    x >= 0 && x < n && y >= 0 && y < n && m.get(x, y) === 1;
  let d = "";
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (!dark(x, y)) continue;
      const X = x + pad;
      const Y = y + pad;
      const hasN = dark(x, y - 1);
      const hasS = dark(x, y + 1);
      const hasE = dark(x + 1, y);
      const hasW = dark(x - 1, y);
      const rNW = !hasN && !hasW ? r : 0;
      const rNE = !hasN && !hasE ? r : 0;
      const rSE = !hasS && !hasE ? r : 0;
      const rSW = !hasS && !hasW ? r : 0;
      d += `M${X + rNW},${Y}`;
      d += `H${X + 1 - rNE}`;
      if (rNE) d += `A${rNE},${rNE} 0 0 1 ${X + 1},${Y + rNE}`;
      d += `V${Y + 1 - rSE}`;
      if (rSE) d += `A${rSE},${rSE} 0 0 1 ${X + 1 - rSE},${Y + 1}`;
      d += `H${X + rSW}`;
      if (rSW) d += `A${rSW},${rSW} 0 0 1 ${X},${Y + 1 - rSW}`;
      d += `V${Y + rNW}`;
      if (rNW) d += `A${rNW},${rNW} 0 0 1 ${X + rNW},${Y}`;
      d += "Z";
    }
  }
  return d;
});

const viewBox = computed(() => {
  const m = qr.value;
  if (!m) return "0 0 0 0";
  const w = m.size + props.margin * 2;
  return `0 0 ${w} ${w}`;
});

const bgSize = computed(() => {
  const m = qr.value;
  return m ? m.size + props.margin * 2 : 0;
});
</script>

<template>
  <svg
    v-if="qr"
    class="qr-svg"
    :viewBox="viewBox"
    :width="size"
    :height="size"
    xmlns="http://www.w3.org/2000/svg"
    shape-rendering="geometricPrecision"
    role="img"
    aria-label="QR code for share link"
  >
    <rect
      class="qr-bg"
      x="0"
      y="0"
      :width="bgSize"
      :height="bgSize"
      rx="3"
      ry="3"
    />
    <path class="qr-modules" :d="path" fill-rule="evenodd" />
  </svg>
</template>
