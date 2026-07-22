export async function copyText(value: string): Promise<void> {
  if (!value || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return;
  }
  await navigator.clipboard.writeText(value);
}
