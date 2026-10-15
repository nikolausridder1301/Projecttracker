import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Id } from "../data/types";

// Globale Oberflächen-Zustände: offenes Aufgaben-Panel, Schnellerfassung,
// Suche und der "Kontext" (Firma/Thema der aktuellen Ansicht), den neue
// Einträge übernehmen (SPEC 6.5).

export type CaptureType = "task" | "note" | "link";

export interface CapturePrefill {
  type?: CaptureType;
  title?: string;
  companyId?: Id;
  topicId?: Id;
  sourceNoteId?: Id;
  attachTo?: { taskId?: Id; noteId?: Id };
}

export interface CaptureContext {
  companyId?: Id;
  topicId?: Id;
}

interface UiValue {
  openTaskId: Id | null;
  openTask(id: Id | null): void;
  capture: CapturePrefill | null;
  openCapture(prefill?: CapturePrefill): void;
  closeCapture(): void;
  searchOpen: boolean;
  setSearchOpen(v: boolean): void;
  context: CaptureContext;
  setContext(c: CaptureContext): void;
}

const Ctx = createContext<UiValue | null>(null);

export function UiProvider({ children }: { children: ReactNode }) {
  const [openTaskId, openTask] = useState<Id | null>(null);
  const [capture, setCapture] = useState<CapturePrefill | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [context, setContext] = useState<CaptureContext>({});

  const value = useMemo<UiValue>(
    () => ({
      openTaskId,
      openTask,
      capture,
      openCapture: (p = {}) => setCapture(p),
      closeCapture: () => setCapture(null),
      searchOpen,
      setSearchOpen,
      context,
      setContext,
    }),
    [openTaskId, capture, searchOpen, context],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUi(): UiValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("UiProvider fehlt");
  return v;
}

/** Setzt den Erfassungs-Kontext, solange die Ansicht sichtbar ist. */
export function useCaptureContext(companyId?: Id, topicId?: Id) {
  const { setContext } = useUi();
  useEffect(() => {
    setContext({ companyId, topicId });
    return () => setContext({});
  }, [companyId, topicId, setContext]);
}
