export const FIELD_REFERENCE_STORAGE_KEY = "aegis.field.show-references";

function readFieldReferenceVisibility(): boolean {
  try {
    return localStorage.getItem(FIELD_REFERENCE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

export const fieldReferenceStore = {
  visible: readFieldReferenceVisibility(),
  listeners: new Set<() => void>(),
};
