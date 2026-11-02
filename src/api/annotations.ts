export interface TrainingAction {
  hand: "FOREHAND" | "BACKHAND" | "UNSPECIFIED";
  stroke: string;
  incoming_spin: "TOPSPIN" | "BACKSPIN" | "SIDESPIN" | "NO_SPIN" | "UNKNOWN";
  movement: string;
}
export interface TrainingAnnotation {
  id: string;
  start_ms: number;
  end_ms: number;
  title: string;
  feeding: "RALLY" | "MULTIBALL" | "SERVE_RECEIVE" | "OTHER";
  movement: "FIXED" | "TWO_POINT" | "MOVING" | "UNSPECIFIED";
  target: "NEAR" | "FAR" | "LEFT" | "RIGHT" | "UNSPECIFIED";
  actions: TrainingAction[];
  notes: string;
}
export interface TrainingAnnotations {
  video_id: string;
  version: number;
  segments: TrainingAnnotation[];
  updated_by: string | null;
}
