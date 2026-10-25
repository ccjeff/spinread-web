import type {Ball3D, Frame, Point2, Point3} from '../api/replay.ts';

export function nearestIndex(times: number[], time: number, tolerance: number): number {
  let lo=0,hi=times.length;
  while(lo<hi){const mid=(lo+hi)>>>1;if(times[mid]<time)lo=mid+1;else hi=mid;}
  const candidates=[lo-1,lo].filter(i=>i>=0&&i<times.length);
  const i=candidates.sort((a,b)=>Math.abs(times[a]-time)-Math.abs(times[b]-time))[0];
  return i!==undefined&&Math.abs(times[i]-time)<=tolerance?i:-1;
}

export function observedTrail(frames: Frame[], time: number): Point2[] {
  const i=nearestIndex(frames.map(f=>f[0]),time,60);
  if(i<0||frames[i][1]===null)return [];
  const points: Point2[]=[];
  for(let j=i;j>=0&&frames[j][0]>=time-350;j--){
    const f=frames[j];
    if(f[1]===null||f[2]===null||(j<i&&frames[j+1][0]-f[0]>120))break;
    points.unshift([f[1],f[2]]);
  }
  return points;
}

export function projectJoint(point: [number,number,number], yaw: number): Point2 {
  const a=yaw*Math.PI/180;
  return [160+(point[0]*Math.cos(a)+point[2]*Math.sin(a))*160,160+point[1]*160];
}

/** Court axes: x is table length, y is width, z is up; all lengths in metres. */
export function projectCourt(point: Point3, yaw: number): Point2 {
  const a=yaw*Math.PI/180, [x,y,z]=point;
  return [160+(y*Math.cos(a)-x*Math.sin(a))*39, 215+(x*Math.cos(a)+y*Math.sin(a))*22-z*64];
}

/** Display interpolation stays within one fitted flight; never cross a missing segment. */
export function ballAt(data: Ball3D | null | undefined, time: number): {point: Point3; trail: Point3[]; fit?: string} | null {
  if (!data || data.coordinate_space !== 'TABLE_METERS_Z_UP' || data.unit !== 'm' || data.gaps.some(g=>time>=g.start_ms&&time<=g.end_ms)) return null;
  const segment=data.segments.find(s=>time>=s.start_ms&&time<=s.end_ms);
  if(!segment) return null;
  const frames=segment.frames;
  const i=frames.findIndex(f=>f[0]>=time);
  if(i<0) return null;
  const after=frames[i],before=frames[Math.max(0,i-1)];
  if(time<before[0]||time>after[0]||after[0]-before[0]>150) return null;
  const alpha=after[0]===before[0]?0:(time-before[0])/(after[0]-before[0]);
  const point:Point3=[1,2,3].map(k=>before[k]+(after[k]-before[k])*alpha) as Point3;
  if(!point.every(Number.isFinite)) return null;
  const trail:Point3[]=[];
  for(let j=Math.max(0,i-1);j>=0&&frames[j][0]>=time-350;j--){
    if((j<i-1&&frames[j+1][0]-frames[j][0]>150)||data.gaps.some(g=>g.start_ms<=time&&g.end_ms>=frames[j][0]))break;
    trail.unshift(frames[j].slice(1) as Point3);
  }
  trail.push(point);
  return {point,trail,fit:segment.fit};
}

export function imagePoint(point:Point2,width:number,height:number,imageSpace?:string):Point2 {
  if(imageSpace==='NORMALIZED_IMAGE')return [point[0]*width,point[1]*height];
  const size=Math.max(width,height);
  return [point[0]*size-(size-width)/2,point[1]*size-(size-height)/2];
}
