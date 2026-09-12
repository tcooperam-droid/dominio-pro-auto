import html2canvas from "html2canvas";

export async function captureVisibleScreen(): Promise<string | null> {
  if (typeof document === "undefined") return null;
  const canvas = await html2canvas(document.body, {
    logging: false,
    useCORS: true,
    backgroundColor: null,
    scale: Math.min(window.devicePixelRatio || 1, 1.25),
  });
  // PNG de uma tela grande pode ultrapassar o limite de body da Vercel.
  // Mantemos a evidência visual, mas reduzimos a imagem para um payload seguro.
  const maxWidth = 1400;
  const targetWidth = Math.min(canvas.width, maxWidth);
  const targetHeight = Math.max(1, Math.round(canvas.height * (targetWidth / canvas.width)));
  const output = document.createElement("canvas");
  output.width = targetWidth;
  output.height = targetHeight;
  const context = output.getContext("2d");
  if (!context) return null;
  context.drawImage(canvas, 0, 0, targetWidth, targetHeight);
  return output.toDataURL("image/jpeg", 0.68);
}
