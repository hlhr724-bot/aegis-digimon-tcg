import { FIELD_REFERENCE_STORAGE_KEY, fieldReferenceStore } from "@/design/fieldReference/fieldReferenceStore";

export function setFieldReferenceVisible(visible: boolean): void {
  if (fieldReferenceStore.visible === visible) {
    return;
  }
  fieldReferenceStore.visible = visible;
  try {
    localStorage.setItem(FIELD_REFERENCE_STORAGE_KEY, String(visible));
  } catch {}
  for (const listener of fieldReferenceStore.listeners) {
    listener();
  }
}
