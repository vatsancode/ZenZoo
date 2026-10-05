// EAN-13 barcodes: drawing one as SVG, and printing a small label that has it.

const L = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const G = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const R = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
// Which of the six left-hand digits use the "G" set, chosen by the first digit.
const PARITY = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

const QUIET = 9;
const BAR_HEIGHT = 60;
const GUARD_EXTRA = 6;

export function isEan13(code: string): boolean {
  return /^\d{13}$/.test(code);
}

function modules(code: string): string {
  const digits = [...code].map(Number);
  const parity = PARITY[digits[0] ?? 0] ?? "LLLLLL";
  const left = digits
    .slice(1, 7)
    .map((digit, index) => (parity[index] === "G" ? G : L)[digit] ?? "")
    .join("");
  const right = digits
    .slice(7)
    .map((digit) => R[digit] ?? "")
    .join("");
  return `101${left}01010${right}101`;
}

/** SVG markup for the barcode, bars in black on white so it scans when printed. */
export function ean13Svg(code: string): string {
  if (!isEan13(code)) return "";
  const bits = modules(code);
  const guards = new Set([0, 1, 2, 45, 46, 47, 48, 49, 92, 93, 94]);
  const width = bits.length + QUIET * 2;
  const bars = [...bits]
    .map((bit, index) =>
      bit === "1"
        ? `<rect x="${QUIET + index}" y="0" width="1" height="${
            BAR_HEIGHT + (guards.has(index) ? GUARD_EXTRA : 0)
          }"/>`
        : "",
    )
    .join("");
  const textY = BAR_HEIGHT + GUARD_EXTRA + 11;
  const text = (x: number, value: string) =>
    `<text x="${x}" y="${textY}" text-anchor="middle" font-family="monospace" font-size="11" letter-spacing="2.4">${value}</text>`;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${textY + 3}" width="100%" role="img" aria-label="Barcode ${code}">` +
    `<rect width="100%" height="100%" fill="#fff"/><g fill="#000">${bars}</g><g fill="#000">` +
    text(QUIET - 4, code.slice(0, 1)) +
    text(QUIET + 3 + 21, code.slice(1, 7)) +
    text(QUIET + 50 + 21, code.slice(7)) +
    `</g></svg>`
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

export interface LabelDetails {
  title: string;
  barcode: string;
  batchNo: string;
  price: string;
}

/** Opens the browser's print dialog with one label: name, barcode and price. */
export function printBarcodeLabel(label: LabelDetails): void {
  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(frame);

  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }

  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>Label ${escapeHtml(label.barcode)}</title>
<style>
  @page { margin: 8mm; }
  body { margin: 0; font-family: system-ui, sans-serif; color: #000; }
  .label { width: 62mm; padding: 4mm; border: 1px solid #000; box-sizing: border-box; }
  .name { font-size: 11pt; font-weight: 600; line-height: 1.25; }
  .meta { display: flex; justify-content: space-between; font-size: 9pt; margin: 1.5mm 0 2mm; }
  svg { display: block; }
</style></head><body>
<div class="label">
  <div class="name">${escapeHtml(label.title)}</div>
  <div class="meta"><span>Batch ${escapeHtml(label.batchNo)}</span><strong>${escapeHtml(label.price)}</strong></div>
  ${ean13Svg(label.barcode)}
</div></body></html>`);
  doc.close();

  const cleanup = () => setTimeout(() => frame.remove(), 500);
  win.addEventListener("afterprint", cleanup);
  // Give the label a moment to lay out before the dialog opens.
  setTimeout(() => {
    win.focus();
    win.print();
    // Some browsers don't fire afterprint for a hidden frame.
    setTimeout(() => frame.remove(), 60_000);
  }, 150);
}
