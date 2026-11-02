import { apiRequest } from './client';
export type Point2 = [number, number];
export type Frame = [number, number | null, number | null];
export type Point3 = [number, number, number];
export type Phase = 'SERVE' | 'RECEIVE' | 'RALLY' | 'UNKNOWN';
export interface LandingReview { rally_id: string; time_ms: number; phase: Phase; status: 'CONFIRMED' | 'REJECTED' }
export interface TableCalibration {id:string;corners:Point2[];start_ms:number;end_ms:number}
export interface Review { version: number; timeline_version: number; analysis_artifact_id?:string|null; stale: boolean; calibrations?:TableCalibration[]; corners: Point2[] | null; calibration_start_ms: number; calibration_end_ms: number; reviews: LandingReview[] }
export interface Placement extends Omit<LandingReview, 'status'> { table_xy: Point2 | null; image_xy: Point2 | null; side: string; lateral: string; depth: string; status: 'CONFIRMED' | 'REJECTED' | 'CANDIDATE'; basis?: string; quality?: {judged?: boolean; seen?: boolean; depth_known?: boolean; lateral_known?: boolean} }
export interface PosePerson { player_id?: string; position: 'NEAR' | 'FAR' | 'UNKNOWN'; world: (Point3 | null)[]; image: (Point2 | null)[]; angles: Record<string, number | null>; interpolated?: boolean; quality?: {hidden?: boolean; arm_repair?: number} }
export interface Pose { coordinate_space?: string; image_space?: string; joint_schema?: string; unit?: string; fps: number; bones: [number,number][]; frames: {time_ms: number;coordinate_space?:string;calibration_id?:string|null; people: PosePerson[]}[]; limitations: string[] }
export interface Ball3D { coordinate_space: 'TABLE_METERS_Z_UP'; unit: 'm';provider?:string; segments: {start_ms: number; end_ms: number; frames: [number,number,number,number][]; fit?: string; status: string;quality?:Record<string,unknown>}[]; gaps: {start_ms:number;end_ms:number;reason?:string}[];limitations?:string[];summary?:{reconstructed_ms:number;calibrated_rally_ms:number;recording_duration_ms:number;segments:number;accepted_bounces:number} }
export type MeshCoordinateSpace='TABLE_METERS_Z_UP'|'HIP_RELATIVE_MODEL_3D';
export interface MeshChunk {id:string;player_id:string;start_ms:number;end_ms:number;source_start_ms?:number;source_end_ms?:number;times_ms:number[];valid:boolean[];url:string;encoding:'int16-mm'|'float32-m';byte_length:number;sha256?:string;coordinate_space?:MeshCoordinateSpace;axes?:string}
export interface ReplayMesh {version:1;provider:'NLF_SMPL';coordinate_space:MeshCoordinateSpace|'PER_CHUNK';unit:'m';vertex_count:number;fps:number;topology:{faces_url:string;index_type:'uint16'|'uint32';parts_url?:string};chunks:MeshChunk[];limitations:string[]}
export interface Stroke { id: string; source_rally_id: string; ordinal: number; contact_ms: number; start_ms:number;end_ms:number; actor:string; phase:Phase; spin:string; status:string }
export interface PhaseGrid { sample_count: number; grid: number[][];unknown_count?:number }
export interface Statistics { candidate_count: number; confirmed_count: number; all_placements?:PhaseGrid; unclassified_count?:number; unknown_count?:number; phases: Record<Exclude<Phase,'UNKNOWN'>, PhaseGrid>; coordinate_note: string; model_estimates?: {sample_count?:number; candidate_count?:number;unknown_count?:number;excluded_count?:number;all_placements?:PhaseGrid;unclassified_count?:number; phases: Record<Exclude<Phase,'UNKNOWN'>, PhaseGrid>} }
export interface Biomechanics {stroke_id:string;source_rally_id:string;player_id:string;contact_ms:number;start_ms:number;end_ms:number;status:string;summary:string;phases:{start_ms:number;end_ms:number;keyframe_ms:number;label:string;cue:string}[];quality:{effective_fps:number;order_reliable:boolean;energy_reliable:boolean};provenance:{provider:string;model:string;requires_coach_review:boolean}}
export interface Replay {
  video_id: string; rally_id: string; timeline_version: number; evidence_available: boolean;
  start_ms: number; end_ms: number; rally_start_ms: number; rally_end_ms: number; next_start_ms: number | null;
  frames: Frame[]; pose: Pose | null; placements: Placement[]; review: Review; statistics: Statistics;
  ball_3d?: Ball3D | null; strokes?: Stroke[]; capabilities?: Record<string,string>; provenance?: Record<string,unknown>;
  mesh?:ReplayMesh|null;
  biomechanics?:Biomechanics[];
  contacts: {time_ms: number; ordinal: number; visual_supported: boolean; audio_supported: boolean}[];
  coverage: number | null; sample_count: number; observed_count: number; limitations: string[];
}
export type ReplayEngine='local'|'pingpong3d'|'nlf';
export interface ReplayAnalysis {id?:string;state:'NONE'|'QUEUED'|'RUNNING'|'READY'|'PARTIAL_READY'|'FAILED'|'STALE';engine?:ReplayEngine;error_code?:string|null;available_engines:ReplayEngine[];nlf?:{configured:boolean;available:boolean;status:'READY'|'UNAVAILABLE';missing:string[]}}
export interface AnalysisPlayerInfo {hand:'left'|'right';kit:'red'|'green'|'blue'|'yellow'|'white'|'black'}
const analysisKeys=new Map<string,string>();
export const replayApi = {
  analysis: (video:string,version:number) => apiRequest<ReplayAnalysis>(`/videos/${video}/replay-analysis?timeline_version=${version}`),
  analyze: async(video:string,version:number,engine:ReplayEngine,players?:AnalysisPlayerInfo[]) => {
    const signature=JSON.stringify([video,version,engine,players]),key=analysisKeys.get(signature)??crypto.randomUUID();analysisKeys.set(signature,key);
    const result=await apiRequest<ReplayAnalysis>(`/videos/${video}/replay-analysis`,{method:'POST',body:{timeline_version:version,engine,...(players?{players}:{})},headers:{'Idempotency-Key':key}});
    analysisKeys.delete(signature);return result;
  },
  get: (video: string, rally: string, version: number, start: number) => apiRequest<Replay>(`/videos/${video}/rallies/${rally}/replay?timeline_version=${version}&start_ms=${start}`),
  statistics: (video: string, version: number) => apiRequest<Statistics>(`/videos/${video}/replay-statistics?timeline_version=${version}`),
  save: (video: string, review: Review, calibrations:TableCalibration[], reviews: LandingReview[]) => apiRequest<Review>(`/videos/${video}/replay-review`, {method:'PUT',body:{base_version:review.version,timeline_version:review.timeline_version,analysis_artifact_id:review.analysis_artifact_id??null,calibrations,reviews,fixed_camera:true}}),
};
