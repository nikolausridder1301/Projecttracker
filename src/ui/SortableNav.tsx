import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Building2,
  CheckSquare,
  GripVertical,
  Handshake,
  Hourglass,
  LayoutGrid,
  Link2,
  NotebookPen,
  Sparkles,
  Sun,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useRef } from "react";
import { NavLink } from "react-router-dom";
import { useStore } from "../data/store";
import { moveItem, orderNav } from "../logic/nav";

// Hauptmenü mit Drag-and-Drop-Sortierung. Die Reihenfolge wird in app_meta
// gespeichert und gilt damit für alle Projekte und Geräte.

/** Zeitpunkt des letzten Drag-Endes – modulweit, damit der Klick-Handler ihn sicher sieht. */
const dragState: { endedAt: number; release?: () => void } = { endedAt: 0 };

interface NavItem {
  key: string;
  to: string;
  label: string;
  icon: LucideIcon;
}

/** Alle Menüpunkte in Standard-Reihenfolge; der Anbieter-Bereich nur, wenn das Projekt einen hat. */
function allNavItems(vendorName: string | null): NavItem[] {
  return [
    { key: "today", to: "/", label: "Heute", icon: Sun },
    { key: "progress", to: "/fortschritt", label: "Fortschritt", icon: LayoutGrid },
    { key: "tasks", to: "/aufgaben", label: "Aufgaben", icon: CheckSquare },
    { key: "waiting", to: "/delegiert", label: "Delegiert", icon: Hourglass },
    { key: "meeting", to: "/meeting", label: "Meeting", icon: Handshake },
    { key: "notes", to: "/notizen", label: "Notizen", icon: NotebookPen },
    { key: "vendor", to: "/anbieter", label: vendorName ?? "Anbieter", icon: Sparkles },
    { key: "links", to: "/links", label: "Links", icon: Link2 },
    { key: "people", to: "/personen", label: "Personen", icon: Users },
    { key: "companies", to: "/firmen", label: "Firmen", icon: Building2 },
  ];
}

export function SortableNav({ vendorName, todayCount }: { vendorName: string | null; todayCount: number }) {
  const { db, update, insert } = useStore();
  const meta = db.app_meta[0];
  const saved = meta?.nav_order ?? [];
  // Volle Liste (inkl. evtl. ausgeblendetem Anbieter), damit dessen Platz erhalten bleibt
  const full = orderNav(allNavItems(vendorName), saved);
  const visible = vendorName ? full : full.filter((i) => i.key !== "vendor");

  const sensors = useSensors(
    // Erst ab 6 px Bewegung ziehen – ein normaler Klick bleibt ein Klick
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // dnd-kit stoppt nach dem Ziehen nur die Weitergabe des Klicks, nicht die
  // Standardaktion – der Browser würde dem Link sonst trotzdem folgen.
  // Daher den direkt folgenden Klick ganz vorne (window, Capture) verwerfen.
  const onDragStart = () => {
    const swallow = (ev: MouseEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    window.addEventListener("click", swallow, { capture: true, once: true });
    dragState.release = () => window.removeEventListener("click", swallow, { capture: true });
  };
  const finishDrag = () => {
    dragState.endedAt = Date.now();
    const release = dragState.release;
    setTimeout(() => release?.(), 300);
  };
  const onDragEnd = (e: DragEndEvent) => {
    finishDrag();
    if (!e.over || e.active.id === e.over.id) return;
    const keys = full.map((i) => i.key);
    const next = moveItem(keys, keys.indexOf(String(e.active.id)), keys.indexOf(String(e.over.id)));
    if (meta) void update("app_meta", meta.id, { nav_order: next }).catch(() => {});
    else void insert("app_meta", [{ last_export_at: null, nav_order: next }]).catch(() => {});
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={finishDrag}
    >
      <SortableContext items={visible.map((i) => i.key)} strategy={verticalListSortingStrategy}>
        <nav aria-label="Hauptmenü – Reihenfolge per Ziehen änderbar">
          {visible.map((n) => (
            <SortableNavItem key={n.key} item={n} count={n.key === "today" ? todayCount : 0} />
          ))}
        </nav>
      </SortableContext>
    </DndContext>
  );
}

function SortableNavItem({ item, count }: { item: NavItem; count: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  const downAt = useRef<{ x: number; y: number } | null>(null);
  const Icon = item.icon;
  return (
    <NavLink
      ref={setNodeRef}
      to={item.to}
      end={item.to === "/"}
      className={`nav-item sortable${isDragging ? " dragging" : ""}`}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      // Rolle „Link“ behalten (dnd-kit setzt sonst role=button)
      role="link"
      aria-roledescription="verschiebbarer Menüpunkt"
      onPointerDownCapture={(e) => {
        downAt.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        // Klick, der aus einem Ziehen entsteht (Maus bewegt oder Drag gerade beendet),
        // wechselt nicht die Seite – React Router navigiert nicht bei defaultPrevented.
        const d = downAt.current;
        const moved = d !== null && e.detail > 0 && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 5;
        if (moved || isDragging || Date.now() - dragState.endedAt < 400) e.preventDefault();
        downAt.current = null;
      }}
    >
      <Icon size={18} className="nav-icon" aria-hidden />
      <span className="grow">{item.label}</span>
      {count > 0 && <span className="nav-count">{count}</span>}
      <GripVertical size={14} className="nav-grip" aria-hidden />
    </NavLink>
  );
}
