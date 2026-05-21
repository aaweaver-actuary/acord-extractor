import { useMemo } from "react";

import type { FieldPreview, FieldTemplate, PdfPageInfo } from "../types";
import { useAnnotationStore } from "./useAnnotationStore";

export function useSortedFieldList(): FieldTemplate[] {
  const savedFields = useAnnotationStore((state) => state.savedFields);

  return useMemo(
    () => [...savedFields].sort((left, right) => left.page - right.page),
    [savedFields],
  );
}

export function useVisibleSavedFields(): FieldTemplate[] {
  const currentPage = useAnnotationStore((state) => state.currentPage);
  const draftField = useAnnotationStore((state) => state.draftField);
  const savedFields = useAnnotationStore((state) => state.savedFields);

  return useMemo(
    () =>
      savedFields.filter(
        (field) => field.page === currentPage && field.id !== draftField?.id,
      ),
    [currentPage, draftField?.id, savedFields],
  );
}

export function useSelectedPreview(): FieldPreview | null {
  const draftPreview = useAnnotationStore((state) => state.draftPreview);
  const previewByFieldId = useAnnotationStore(
    (state) => state.previewByFieldId,
  );
  const selectedFieldId = useAnnotationStore((state) => state.selectedFieldId);

  return useMemo(() => {
    if (draftPreview) {
      return draftPreview;
    }
    if (!selectedFieldId) {
      return null;
    }

    return previewByFieldId[selectedFieldId] ?? null;
  }, [draftPreview, previewByFieldId, selectedFieldId]);
}

export function useCurrentPageSize(): PdfPageInfo | undefined {
  const pdfInfo = useAnnotationStore((state) => state.pdfInfo);
  const currentPage = useAnnotationStore((state) => state.currentPage);

  return pdfInfo?.pages[currentPage - 1];
}

export function useCanSaveDraft(): boolean {
  const draftField = useAnnotationStore((state) => state.draftField);

  return Boolean(draftField);
}

export function useHasLoadedDocument(): boolean {
  const pdfInfo = useAnnotationStore((state) => state.pdfInfo);

  return Boolean(pdfInfo);
}
