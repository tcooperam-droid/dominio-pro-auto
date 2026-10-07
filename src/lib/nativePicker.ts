const NATIVE_PICKER_TYPES = new Set(["date", "time", "datetime-local"]);
const openedInputs = new WeakSet<HTMLInputElement>();

export function openNativePicker(input: HTMLInputElement, pointerType?: string) {
  if (!NATIVE_PICKER_TYPES.has(input.type) || input.disabled || input.readOnly) return;
  if (pointerType === "mouse") return;
  if (openedInputs.has(input)) return;

  try {
    openedInputs.add(input);
    input.showPicker?.();
    queueMicrotask(() => openedInputs.delete(input));
  } catch {
    openedInputs.delete(input);
    // Navegadores sem showPicker ou com picker já aberto usam o comportamento nativo.
  }
}
