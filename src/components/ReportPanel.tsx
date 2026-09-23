import { Link } from "react-router-dom";
import type { AnalysisReport, ReportFinding } from "../api/types";
import { FINDING_CATEGORY_LABELS } from "../utils/labels";
import { formatMs } from "../utils/format";

function unwrap<T>(structured: Record<string, unknown>, key: string): T | undefined {
  const raw = structured[key];
  if (raw === null || raw === undefined) return undefined;
  if (typeof raw === "object" && !Array.isArray(raw) && "value" in (raw as Record<string, unknown>)) {
    return (raw as { value: T }).value;
  }
  return raw as T;
}

function metricsSource(structured: Record<string, unknown>): Record<string, unknown> {
  const nested = structured["metrics"];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return structured;
}

const MAX_EVIDENCE_CHIPS = 8;

interface ReportPanelProps {
  playerId?: string;
  report: AnalysisReport | null;
  unavailable: boolean;
  stale: boolean;
  onSeek: (seconds: number) => void;
}

export default function ReportPanel({ report, unavailable, stale, onSeek, playerId }: ReportPanelProps) {
  if (!report) {
    return unavailable ? (
      <section className="card report-panel">
        <h3>报告</h3>
        <p className="muted">报告尚未生成，指标计算完成后会自动展示。</p>
      </section>
    ) : null;
  }

  const structured = metricsSource(report.structured ?? {});
  const validMs = unwrap<number>(structured, "valid_duration_ms");
  const rallyCount = unwrap<number>(structured, "rally_count");
  const rallyDur = unwrap<{ mean?: number; p50?: number; max?: number }>(
    structured,
    "rally_duration_ms",
  );
  const hitsPer = unwrap<{ mean?: number; max?: number }>(structured, "hits_per_rally");
  const dist = unwrap<Record<string, number>>(structured, "rally_length_distribution");

  const cards: { label: string; value: string }[] = [];
  if (typeof validMs === "number") cards.push({ label: "有效训练时长", value: formatMs(validMs) });
  if (typeof rallyCount === "number") cards.push({ label: "回合数", value: String(rallyCount) });
  if (rallyDur && typeof rallyDur.mean === "number") {
    cards.push({ label: "平均回合时长", value: formatMs(rallyDur.mean) });
  }
  if (rallyDur && typeof rallyDur.max === "number") {
    cards.push({ label: "最长回合", value: formatMs(rallyDur.max) });
  }
  if (hitsPer && typeof hitsPer.mean === "number") {
    cards.push({ label: "每回合击球均值", value: hitsPer.mean.toFixed(1) });
  }


  const distEntries = dist ? Object.entries(dist) : [];
  const distMax = distEntries.reduce((m, [, v]) => Math.max(m, v), 0);
  const findings = (report.findings ?? []).filter(f => !["COVERAGE", "RALLY_LENGTH", "ACTIVITY_MIX"].includes(f.category) && f.state !== "INTERNAL");

  return (
    <section className="card report-panel">
      <div className="report-header">
        <h3>报告</h3>
        <span className="report-version">时间线 v{report.timeline_version}</span>
      </div>
      <div className="video-list-toolbar"><Link to={`/training?video=${report.video_id}${playerId ? `&player=${playerId}` : ""}`}>从报告制定训练计划 →</Link>{!playerId && <Link to={`/coaching?video=${report.video_id}`}>请教练评审 →</Link>}</div>
      {stale && <div className="banner banner-warn">指标正在重算，稍后自动刷新…</div>}
      {cards.length > 0 && (
        <div className="metric-cards">
          {cards.map((c) => (
            <div key={c.label} className="metric-card">
              <div className="metric-value">{c.value}</div>
              <div className="metric-label">{c.label}</div>
            </div>
          ))}
        </div>
      )}
      {distEntries.length > 0 && (
        <div className="hist-block">
          <h4>回合长度分布</h4>
          <div className="hist">
            {distEntries.map(([bucket, count]) => (
              <div key={bucket} className="hist-row">
                <span className="hist-label">{bucket}</span>
                <span className="hist-track">
                  <span
                    className="hist-fill"
                    style={{
                      width:
                        count > 0 && distMax > 0
                          ? `${Math.max(2, (count / distMax) * 100)}%`
                          : "0%",
                    }}
                  />
                </span>
                <span className="hist-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {findings.length > 0 && (
        <div className="findings-block">
          <h4>训练发现</h4>
          <div className="findings">
            {findings.map((f) => (
              <FindingCard key={f.id} finding={f} onSeek={onSeek} />
            ))}
          </div>
        </div>
      )}
      {cards.length === 0 && distEntries.length === 0 && findings.length === 0 && (
        <p className="muted">报告内容为空。</p>
      )}
    </section>
  );
}

function FindingCard({
  finding,
  onSeek,
}: {
  finding: ReportFinding;
  onSeek: (seconds: number) => void;
}) {
  const low = finding.state === "LOW_EVIDENCE";
  const category = FINDING_CATEGORY_LABELS[finding.category] ?? finding.category;
  const intervals = finding.evidence_intervals ?? [];
  const limitations = finding.limitations ?? [];
  const shownIntervals = intervals.slice(0, MAX_EVIDENCE_CHIPS);
  const hiddenCount = intervals.length - shownIntervals.length;
  return (
    <div className={`finding${low ? " finding-low" : ""}`}>
      <div className="finding-head">
        <span className="finding-category">{category}</span>
        <span className="finding-samples">样本 {finding.sample_count}</span>
        {low && <span className="finding-flag">证据不足</span>}
      </div>
      <p className="finding-obs">{finding.observation}</p>
      {intervals.length > 0 && (
        <div className="finding-evidence">
          {shownIntervals.map(([s, e], i) => (
            <button
              key={`${s}-${e}-${i}`}
              type="button"
              className="evidence-chip"
              onClick={() => onSeek(s / 1000)}
            >
              {formatMs(s)}–{formatMs(e)}
            </button>
          ))}
          {hiddenCount > 0 && <span className="evidence-more">等 {intervals.length} 条证据</span>}
        </div>
      )}
      {limitations.length > 0 && (
        <ul className="finding-limits">
          {limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
