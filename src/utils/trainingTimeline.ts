import type { TimelineItem } from "../api/types";

export const TRAINING_TYPES = {
  FIXED_POINT: { label: "定点", color: "#67d7b0" },
  MULTIBALL: { label: "多球", color: "#b49aff" },
  SERVE_RECEIVE: { label: "发接发", color: "#f4bd70" },
  UNCLASSIFIED: { label: "未分类", color: "#8fa9c6" },
} as const;
export type TrainingType = keyof typeof TRAINING_TYPES;
export interface TrainingEntry {
  item: TimelineItem;
  kind: "training" | "gap";
  trainingType: TrainingType;
  ordinal: number;
  chapterId: string | null;
}
export interface TrainingChapter {
  id: string;
  number: number;
  start_ms: number;
  end_ms: number;
  trainingType: TrainingType;
  entries: TrainingEntry[];
}

function trainingType(item: TimelineItem, parent?: TimelineItem): TrainingType {
  // Optional reviewed/classified label contract. RALLY is not evidence of a
  // fixed-point drill, so no training type is inferred from activity labels.
  const value = item.attributes.training_type ?? parent?.attributes.training_type;
  return typeof value === "string" && Object.hasOwn(TRAINING_TYPES, value)
    ? value as TrainingType : "UNCLASSIFIED";
}

export function buildTrainingNavigation(items: TimelineItem[]) {
  const byId = new Map(items.map(item => [item.item_id, item]));
  const rallyParents = new Set(items.filter(item => item.type === "RALLY").map(item => item.parent_id));
  let ordinal = 0;
  const entries: TrainingEntry[] = [...items]
    .filter(item => item.type === "RALLY" || (item.parent_id === null && !rallyParents.has(item.item_id)))
    .filter(item => item.end_ms > item.start_ms)
    .sort((a, b) => a.start_ms - b.start_ms || a.end_ms - b.end_ms)
    .map(item => {
      const training = item.type === "RALLY" || item.type === "RALLY_LIKE";
      return { item, kind: training ? "training" : "gap", ordinal: training ? ++ordinal : 0,
        trainingType: trainingType(item, byId.get(item.parent_id ?? "")), chapterId: null };
    });
  const chapters: TrainingChapter[] = [];
  for (const entry of entries.filter(entry => entry.kind === "training")) {
    let chapter = chapters.at(-1);
    // Navigation grouping only: original rally boundaries and labels are intact.
    if (!chapter || entry.item.start_ms - chapter.end_ms >= 30_000 || chapter.trainingType !== entry.trainingType) {
      chapter = { id: entry.item.item_id, number: chapters.length + 1,
        start_ms: entry.item.start_ms, end_ms: entry.item.end_ms,
        trainingType: entry.trainingType, entries: [] };
      chapters.push(chapter);
    }
    chapter.end_ms = Math.max(chapter.end_ms, entry.item.end_ms);
    chapter.entries.push(entry);
    entry.chapterId = chapter.id;
  }
  return { entries, chapters };
}

export function entryTitle(entry: TrainingEntry) {
  if (entry.kind === "training") return `回合 ${String(entry.ordinal).padStart(2, "0")}`;
  return ({ BALL_PICKUP: "捡球", BREAK: "休息", INSTRUCTION: "讲解" } as Record<string, string>)[entry.item.type] ?? "未标记片段";
}

// While a virtual clip is playing, its pre/post-roll belongs to that selection.
export function adjacentTrainingEntries(entries: TrainingEntry[], currentMs: number, activeItemId: string | null) {
  const training = entries.filter(entry => entry.kind === "training");
  const activeIndex = training.findIndex(entry => entry.item.item_id === activeItemId);
  const currentIndex = activeIndex >= 0 ? activeIndex : training.findIndex(entry =>
    entry.item.start_ms <= currentMs && currentMs < entry.item.end_ms);
  if (currentIndex >= 0) {
    return { previous: training[currentIndex - 1], next: training[currentIndex + 1] };
  }
  return {
    previous: training.findLast(entry => entry.item.end_ms <= currentMs),
    next: training.find(entry => entry.item.start_ms > currentMs),
  };
}
