// Barcode reader for the usage record page. Bundled to public/scan.js and
// loaded only when someone taps a Scan button.
import { BrowserMultiFormatReader } from "@zxing/browser";
import { BarcodeFormat, DecodeHintType } from "@zxing/library";

const hints = new Map();
hints.set(DecodeHintType.POSSIBLE_FORMATS, [
  BarcodeFormat.DATA_MATRIX, BarcodeFormat.CODE_128, BarcodeFormat.QR_CODE,
  BarcodeFormat.CODE_39, BarcodeFormat.EAN_13, BarcodeFormat.UPC_A, BarcodeFormat.ITF,
]);
hints.set(DecodeHintType.ASSUME_GS1, true); // keep GS1 field separators in Code 128
hints.set(DecodeHintType.TRY_HARDER, true);

const reader = () => new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });

window.AuleaScan = {
  // Live camera scan into <video>; calls onText once per decoded barcode.
  async start(video, onText) {
    const controls = await reader().decodeFromConstraints(
      { audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } },
      video,
      (result) => { if (result) onText(result.getText()); },
    );
    return controls;
  },
  // Decode a still photo (better for tiny Data Matrix codes).
  async decodeFile(file) {
    const url = URL.createObjectURL(file);
    try {
      return (await reader().decodeFromImageUrl(url)).getText();
    } finally {
      URL.revokeObjectURL(url);
    }
  },
};
