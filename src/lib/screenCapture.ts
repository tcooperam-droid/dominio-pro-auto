import html2canvas from "html2canvas";

export async function captureVisibleScreen(): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const canvas = await html2canvas(document.body, {
    logging: false,
    useCORS: true,
    backgroundColor: null,
    scale: Math.min(window.devicePixelRatio || 1, 2),
  });
  return canvas.toDataURL("image/png", 0.86);
}
