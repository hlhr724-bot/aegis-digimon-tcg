import { useSyncExternalStore } from "react";
import { fieldReferenceStore } from "@/design/fieldReference/fieldReferenceStore";

function getFieldReferenceVisible(): boolean {
  return fieldReferenceStore.visible;
}

function subscribeFieldReferenceVisible(listener: () => void): () => void {
  fieldReferenceStore.listeners.add(listener);
  return () => fieldReferenceStore.listeners.delete(listener);
}

export function useFieldReferenceVisible(): boolean {
  return useSyncExternalStore(subscribeFieldReferenceVisible, getFieldReferenceVisible, () => false);
}
