import type { TrainingAnnotation } from "../api/annotations";
import type { TimelineItem } from "../api/types";

export const TRAINING_TYPES = {
  FIXED_POINT: { label: "定点", color: "#67d7b0" },
  MULTIBALL: { label: "多球", color: "#b49aff" },
  SERVE_RECEIVE: { label: "发接发", color: "#f4bd70" },
  RALLY: { label: "对练", color: "#77b8ed" },
  OTHER: { label: "其他", color: "#c3a28d" },
  UNCLASSIFIED: { label: "未分类", color: "#8fa9c6" },
} as const;
export type TrainingType = keyof typeof TRAINING_TYPES;
export interface TrainingEntry {
  item: TimelineItem;
  kind: "training" | "gap";
  trainingType: TrainingType;
  ordinal: number;
  trainingTitle?: string;
  chapterId: string | null;
}
export interface TrainingChapter {
  id: string;
  number: number;
  start_ms: number;
  end_ms: number;
  trainingType: TrainingType;
  entries: TrainingEntry[];
  annotation?: TrainingAnnotation;
}

function trainingType(item: TimelineItem, parent?: TimelineItem): TrainingType {
  // Optional reviewed/classified label contract. RALLY is not evidence of a
  // fixed-point drill, so no training type is inferred from activity labels.
  const value = item.attributes.training_type ?? parent?.attributes.training_type;
  return typeof value === "string" && Object.hasOwn(TRAINING_TYPES, value)
    ? value as TrainingType : "UNCLASSIFIED";
}

export function buildTrainingNavigation(items: TimelineItem[], annotations: TrainingAnnotation[] = []) {
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
  if (!annotations.length) return { entries, chapters };
  // Human chapters are video-time ranges and survive regenerated rally IDs.
  const ordered = [...annotations].sort((a, b) => a.start_ms - b.start_ms);
  const merged: TrainingChapter[] = [];
  for (const chapter of chapters) {
    let cursor = chapter.start_ms;
    for (const annotation of ordered) {
      if (annotation.end_ms <= cursor || annotation.start_ms >= chapter.end_ms) continue;
      if (annotation.start_ms > cursor) merged.push({...chapter, id: `${chapter.id}:${cursor}`, start_ms: cursor, end_ms: annotation.start_ms, entries: []});
      cursor = Math.max(cursor, annotation.end_ms);
    }
    if (cursor < chapter.end_ms) merged.push({...chapter, id: `${chapter.id}:${cursor}`, start_ms: cursor, entries: []});
  }
  for (const annotation of ordered) {
    const type: TrainingType = annotation.feeding === "MULTIBALL" ? "MULTIBALL"
      : annotation.feeding === "SERVE_RECEIVE" ? "SERVE_RECEIVE"
      : annotation.movement === "FIXED" ? "FIXED_POINT" : annotation.feeding === "RALLY" ? "RALLY" : "OTHER";
    merged.push({id: annotation.id, number: 0, start_ms: annotation.start_ms, end_ms: annotation.end_ms,
      trainingType: type, entries: [], annotation});
  }
  merged.sort((a, b) => a.start_ms - b.start_ms);
  merged.forEach((chapter, index) => {chapter.number = index + 1;});
  for (const entry of entries) {
    if (entry.kind !== "training") continue;
    // A boundary may cross a rally: show it once in the chapter with most overlap.
    let destination: TrainingChapter | undefined;
    let best = 0;
    for (const chapter of merged) {
      const overlap = Math.min(entry.item.end_ms, chapter.end_ms) - Math.max(entry.item.start_ms, chapter.start_ms);
      if (overlap > best || overlap === best && overlap > 0 && chapter.annotation) {best = overlap; destination = chapter;}
    }
    entry.chapterId = destination?.id ?? null;
    if (destination) {
      destination.entries.push(entry);
      if (destination.annotation) {entry.trainingType = destination.trainingType; entry.trainingTitle = destination.annotation.title;}
    }
  }
  return {entries, chapters: merged};
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
