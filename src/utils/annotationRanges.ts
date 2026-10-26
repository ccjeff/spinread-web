import type { TrainingAnnotation } from "../api/annotations";

// Replace only the selected region; keep annotated material outside it intact.
export function replaceAnnotationRange(segments: TrainingAnnotation[], replacement: TrainingAnnotation, editingId?: string): TrainingAnnotation[] {
  const result: TrainingAnnotation[] = [];
  for (const segment of segments) {
    if (segment.id === editingId) continue;
    if (segment.end_ms <= replacement.start_ms || segment.start_ms >= replacement.end_ms) {
      result.push(segment);
      continue;
    }
    if (segment.start_ms < replacement.start_ms) {
      result.push({...segment, end_ms: replacement.start_ms});
    }
    if (segment.end_ms > replacement.end_ms) {
      result.push({...segment, id: crypto.randomUUID(), start_ms: replacement.end_ms});
    }
  }
  result.push(replacement);
  return result.sort((a, b) => a.start_ms - b.start_ms);
}

export function parseTime(text: string): number | null {
  if (!/^\d+:\d{2}(\.\d{1,3})?$/.test(text.trim())) return null;
  const [minutes, seconds] = text.trim().split(":").map(Number);
  return seconds < 60 ? Math.round((minutes * 60 + seconds) * 1000) : null;
}
export function editableTime(ms: number): string {
  return `${Math.floor(ms / 60000)}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
}
