'use client';
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  ArrowUpRight,
  MessageSquare,
  MousePointer2,
  Check,
} from 'lucide-react';
import { projectFleet, type FleetWorker } from '@/lib/agent-fleet';
import type { Feedback } from '@/lib/feedback';
import '@/app/admin/factory-scene.css';
import '@/app/admin/factory-assets.css';
import '@/app/admin/factory-intake-asset.css';
import '@/app/admin/factory-cutouts.css';
import { FactoryCutoutDefs } from './factory-cutout-defs';

type Fleet = ReturnType<typeof projectFleet>;
type Actions = {
  feedback: (feedback: Feedback) => void;
  worker: (worker: FleetWorker, index: number) => void;
  signals: () => void;
  findings: () => void;
  improvements: () => void;
  rewards: () => void;
};
const amount = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
const faces = ['top', 'bottom', 'front', 'back', 'left', 'right'];

function Solid({
  className = '',
  x,
  y,
  z = 0,
  width,
  depth,
  height,
}: {
  className?: string;
  x: number;
  y: number;
  z?: number;
  width: number;
  depth: number;
  height: number;
}) {
  return (
    <span
      className={`fx-solid ${className}`}
      style={
        {
          '--x': `${x}px`,
          '--y': `${y}px`,
          '--z': `${z}px`,
          '--w': `${width}px`,
          '--d': `${depth}px`,
          '--h': `${height}px`,
        } as CSSProperties
      }
      aria-hidden="true"
    >
      {faces.map((face) => (
        <span className={`fx-face fx-${face}`} key={face} />
      ))}
    </span>
  );
}
function Label({
  x,
  y,
  step,
  title,
  detail,
  onClick,
  z = 72,
}: {
  x: number;
  y: number;
  z?: number;
  step: string;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <div
      className="fx-label-anchor"
      data-step={step}
      style={{ left: x, top: y, transform: `translateZ(${z}px)` }}
    >
      <button className="fx-label" onClick={onClick}>
        <span className="fx-step">{step}</span>
        <strong>{title}</strong>
        <ArrowUpRight size={13} />
        <small>{detail}</small>
      </button>
    </div>
  );
}
function Machine({
  x,
  y,
  width,
  depth,
  className,
  label,
  onClick,
  children,
}: {
  x: number;
  y: number;
  width: number;
  depth: number;
  className: string;
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      className={`fx-machine ${className}`}
      style={{ left: x, top: y, width, height: depth }}
      onClick={onClick}
      aria-label={label}
    >
      {children}
    </button>
  );
}

export function AgentFactoryScene({
  fleet,
  actions,
}: {
  fleet: Fleet;
  actions: Actions;
}) {
  const canvas = useRef<HTMLElement>(null);
  const [layout, setLayout] = useState({ scale: 0.84, depth: 760, columns: 4 });
  const [hovered, setHovered] = useState<{
    reportId: string;
    workerId?: string;
  } | null>(null);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width < 100 || height < 100) return;
      const widthScale = Math.min((width - 40) / 1260, 1.8);
      const depth = Math.max(
        600,
        Math.min(
          1090,
          (height - 96) / widthScale / Math.cos((38 * Math.PI) / 180),
        ),
      );
      setLayout({
        scale: Math.min(
          widthScale,
          (height - 62) / (depth * Math.cos((38 * Math.PI) / 180)),
        ),
        depth,
        columns: height / width > 0.7 ? 3 : 4,
      });
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  const { depth, columns } = layout;
  const reports = [...fleet.feedback]
    .sort((a, b) => Number(a.sample) - Number(b.sample))
    .slice(0, 4);
  const findings = fleet.runs.filter((item) => item.snapshot.finding);
  const supported = findings.filter(
    (item) => item.snapshot.event?.status === 'completed',
  );
  const improvement = fleet.runs.find((item) => item.snapshot.proposal)
    ?.snapshot.proposal;
  const reward = fleet.runs.find((item) => item.snapshot.reward)?.snapshot
    .reward;
  const running = fleet.workers.filter(
    (worker) => worker.status === 'running',
  ).length;
  const pending = fleet.feedback.filter((item) => !item.sample).length;
  const focusedWorker = fleet.workers.find(
    (worker) => worker.id === hovered?.workerId,
  );
  const focusedReport = fleet.feedback.find(
    (report) => report.id === hovered?.reportId,
  );
  const peek = focusedWorker
    ? `${focusedWorker.feedbackId} · ${focusedWorker.label} · ${focusedWorker.status}`
    : focusedReport
      ? `${focusedReport.persona.split(' · ')[0]} · ${focusedReport.title}`
      : 'Follow the work. Select a signal, browser, or station to inspect.';
  const rows = Math.max(1, Math.ceil(fleet.workers.length / columns));
  const rowGap = columns === 3 ? 158 : 133;
  const bankHeight = (rows - 1) * rowGap + 102;
  const bankY = (depth - bankHeight) / 2 - 22;
  const intakeY = depth / 2 - 126;
  const inspectY = bankY + 32;
  const assemblyY = Math.max(inspectY + 255, depth * 0.61);
  const rewardY = depth - 150;
  const workerWidth = (514 - (columns - 1) * 16) / columns;
  const rowPorts = Array.from(
    { length: rows },
    (_, row) => bankY + row * rowGap + 73,
  );
  const paths = [
    `M 333 ${intakeY + 44} H 366 M 333 ${intakeY + 208} H 366`,
    `M 366 ${Math.min(rowPorts[0], intakeY + 44)} V ${Math.max(rowPorts[rows - 1], intakeY + 208)}`,
    ...rowPorts.map((y) => `M 366 ${y} H 404 M 924 ${y} H 938`),
    `M 938 ${Math.min(rowPorts[0], inspectY + 50)} V ${Math.max(rowPorts[rows - 1], inspectY + 50)}`,
    `M 938 ${inspectY + 50} H 1005`,
    `M 1198 ${inspectY + 50} H 1228 Q 1238 ${inspectY + 50} 1238 ${inspectY + 60} V ${assemblyY + 35} Q 1238 ${assemblyY + 45} 1228 ${assemblyY + 45} H 1210`,
    `M 1000 ${assemblyY + 45} H 970 Q 960 ${assemblyY + 45} 960 ${assemblyY + 55} V ${rewardY + 54} Q 960 ${rewardY + 64} 950 ${rewardY + 64} H 815`,
    `M 555 ${rewardY + 64} H 350 Q 340 ${rewardY + 64} 340 ${rewardY + 54} V ${intakeY + 280} Q 340 ${intakeY + 270} 330 ${intakeY + 270}`,
  ];
  return (
    <section
      ref={canvas}
      className="factory-canvas"
      aria-label="Agent system map"
    >
      <FactoryCutoutDefs />
      <div
        className={`factory-world ${columns === 3 ? 'is-tall' : ''}`}
        style={
          {
            '--scene-scale': layout.scale,
            '--world-depth': `${depth}px`,
          } as CSSProperties
        }
      >
        <div className="fx-floor-edge" />
        <div className="fx-floor" />
        <svg
          className="fx-routes"
          viewBox={`0 0 1260 ${depth}`}
          aria-hidden="true"
        >
          {paths.map((path, index) => (
            <g key={index}>
              <path className="fx-route-shadow" d={path} />
              <path className="fx-route-track" d={path} />
              <path className="fx-route-line" d={path} />
              <path
                className="fx-route-packets"
                d={path}
                style={{ animationDelay: `${index * -0.6}s` }}
              />
            </g>
          ))}
        </svg>

        <section
          className="fx-intake"
          aria-label="Shopper feedback signals"
          style={{ left: 35, top: intakeY }}
        >
          <span className="fx-intake-asset" aria-hidden="true">
            <svg viewBox="65 250 1140 760" preserveAspectRatio="none">
              <image
                href="/factory/conveyors.png"
                width="1254"
                height="1254"
                clipPath="url(#factory-conveyors-cutout)"
              />
            </svg>
          </span>
          {reports.map((report, index) => {
            const entry = fleet.runs.find((item) =>
              item.run.feedback.some((feedback) => feedback.id === report.id),
            );
            const blocked =
              entry?.snapshot.event?.status === 'blocked' ||
              entry?.snapshot.event?.status === 'failed';
            const status = !report.sample
              ? 'Awaiting backend'
              : blocked
                ? 'Needs context'
                : entry?.snapshot.reward
                  ? 'Reward linked'
                  : !entry?.snapshot.event ||
                      entry.snapshot.event.stage === 'feedback'
                    ? 'Queued'
                    : 'Investigating';
            return (
              <button
                className={`fx-signal ${hovered?.reportId === report.id ? 'is-linked' : ''} ${!report.sample ? 'is-pending' : ''}`}
                key={report.id}
                style={{
                  left: 12 + (index % 2) * 143,
                  top: 18 + Math.floor(index / 2) * 164,
                }}
                onClick={() => actions.feedback(report)}
                onMouseEnter={() => setHovered({ reportId: report.id })}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered({ reportId: report.id })}
                onBlur={() => setHovered(null)}
                aria-label={`Inspect ${report.id}: ${report.title}`}
              >
                <span className="fx-signal-edge" />
                <span className="fx-signal-face">
                  <span className="fx-signal-meta">
                    <span className="fx-avatar">{report.persona[0]}</span>
                    <b>{report.persona.split(' · ')[0]}</b>
                    <MessageSquare size={12} />
                  </span>
                  <strong>{report.title}</strong>
                  <span
                    className={`fx-signal-status ${blocked || !report.sample ? 'is-amber' : ''}`}
                  >
                    <i />
                    {status}
                  </span>
                </span>
              </button>
            );
          })}
        </section>
        <Label
          x={184}
          y={intakeY - 27}
          z={120}
          step="01"
          title="Shopper signals"
          detail={`${fleet.feedback.length} reports${pending ? ` · ${pending} waiting for backend` : ' with shopping context'}`}
          onClick={actions.signals}
        />

        <section
          className="fx-compute"
          aria-label="Parallel browser workers"
          style={{ left: 404, top: bankY }}
        >
          {Array.from({ length: rows }, (_, row) => (
            <div
              className="fx-browser-row"
              key={row}
              style={{ top: row * rowGap }}
            >
              <Solid
                className="fx-bank-base"
                x={0}
                y={0}
                width={520}
                depth={102}
                height={17}
              />
              <Solid
                className="fx-bank-spine"
                x={7}
                y={6}
                z={17}
                width={506}
                depth={7}
                height={9}
              />
              <span
                className="fx-row-indicator"
                style={{ '--row': row } as CSSProperties}
              >
                <i />
                <i />
                <i />
              </span>
            </div>
          ))}
          {fleet.workers.map((worker, index) => (
            <button
              className={`fx-workstation is-${worker.status} ${hovered?.reportId === worker.feedbackId ? 'is-linked' : ''}`}
              key={worker.id}
              style={
                {
                  left: 8 + (index % columns) * (workerWidth + 16),
                  top: 12 + Math.floor(index / columns) * rowGap,
                  '--monitor-width': `${workerWidth - 2}px`,
                  '--monitor-height': `${(workerWidth - 2) * 0.66}px`,
                  '--worker': index,
                  '--progress': `${worker.progress * 100}%`,
                } as CSSProperties
              }
              onClick={() => actions.worker(worker, index + 1)}
              onMouseEnter={() =>
                setHovered({ reportId: worker.feedbackId, workerId: worker.id })
              }
              onMouseLeave={() => setHovered(null)}
              onFocus={() =>
                setHovered({ reportId: worker.feedbackId, workerId: worker.id })
              }
              onBlur={() => setHovered(null)}
              aria-label={`Inspect worker ${String(index + 1).padStart(2, '0')}: ${worker.label}`}
            >
              <span className="fx-monitor-shadow" />
              <span className="fx-monitor-base" />
              <span className="fx-monitor-stem" />
              <span className="fx-monitor">
                <span className="fx-monitor-chrome">
                  <i />
                  <span>CU / {String(index + 1).padStart(2, '0')}</span>
                  <b>
                    {worker.status === 'completed' ? <Check size={8} /> : '···'}
                  </b>
                </span>
                <span className="fx-monitor-page">
                  {worker.referenceImage ? (
                    <img src={worker.referenceImage} alt="" />
                  ) : (
                    <span className="fx-schematic">
                      <i />
                      <span>
                        <b />
                        <span>
                          <i />
                          <i />
                          <i />
                          <em />
                        </span>
                      </span>
                    </span>
                  )}
                  <MousePointer2
                    size={11}
                    className="fx-cursor"
                    fill="currentColor"
                  />
                  <span className="fx-scan" />
                </span>
                <span className="fx-monitor-footer">
                  <span>{worker.feedbackId}</span>
                  <i />
                  {worker.status}
                </span>
                <span className="fx-monitor-progress" />
              </span>
            </button>
          ))}
        </section>
        <Label
          x={666}
          y={bankY - (columns === 3 ? 85 : 65)}
          z={150}
          step="02"
          title="Computer-use fleet"
          detail={`${running} investigating · ${fleet.workers.length} parallel browsers`}
          onClick={() =>
            fleet.workers[0] && actions.worker(fleet.workers[0], 1)
          }
        />

        <Machine
          x={980}
          y={inspectY}
          width={260}
          depth={132}
          className={`fx-inspection fx-scanner-asset ${findings.length ? 'has-result' : ''}`}
          label="Inspect findings"
          onClick={actions.findings}
        >
          <span className="fx-scanner-visual">
            <svg viewBox="0 210 1254 840" role="presentation" aria-hidden="true">
              <image href="/factory/scanner.png" width="1254" height="1254" />
            </svg>
            <span className="fx-scanner-result">
              <i />
              <b>{String(findings.length).padStart(2, '0')}</b> FINDINGS
            </span>
          </span>
        </Machine>
        <Label
          x={1110}
          y={inspectY - 52}
          z={150}
          step="03"
          title="Evidence & diagnosis"
          detail={
            findings.length
              ? `${supported.length} supported · ${findings.length - supported.length} unresolved`
              : 'Waiting for browser evidence'
          }
          onClick={actions.findings}
        />

        <Machine
          x={970}
          y={assemblyY}
          width={270}
          depth={150}
          className={`fx-assembly fx-assembly-asset ${improvement ? 'has-result' : ''}`}
          label="Inspect improvements"
          onClick={actions.improvements}
        >
          <span className="fx-assembly-visual">
            <svg viewBox="20 115 1220 990" aria-hidden="true">
              <image className="fx-asset-assembly" href="/factory/assembly.png" width="1254" height="1254" />
            </svg>
            <span className="fx-asset-readout"><i />{improvement ? 'PROPOSAL READY' : 'AWAITING EVIDENCE'}</span>
          </span>
        </Machine>
        <Label
          x={1113}
          y={assemblyY + 206}
          step="04"
          title="Improvements"
          detail={
            improvement
              ? `Proposed · +${amount(improvement.expectedProfit)} / 30 days estimated`
              : 'Waiting for a supported finding'
          }
          onClick={actions.improvements}
        />

        <Machine
          x={520}
          y={rewardY}
          width={330}
          depth={120}
          className={`fx-distribution fx-rewards-asset ${reward ? 'has-result' : ''}`}
          label="Inspect shopper rewards"
          onClick={actions.rewards}
        >
          <span className="fx-rewards-visual">
            <svg viewBox="55 90 1440 795" aria-hidden="true">
              <image className="fx-asset-rewards" href="/factory/rewards.png" width="1536" height="1024" />
            </svg>
            <span className="fx-pool-value"><small>SAMPLE POOL</small><strong>{reward ? amount(reward.poolCents / 100) : '—'}</strong></span>
            <span className="fx-payout-values">
              {[0, 1].map(index => <span key={index}>{reward?.allocations[index]?.persona.split(' · ')[0] || 'Shopper'}<b>{reward?.allocations[index] ? amount(reward.allocations[index].cents / 100) : '—'}</b></span>)}
            </span>
          </span>
        </Machine>
        <Label
          x={683}
          y={depth - 4}
          step="05"
          title="Value shared back"
          detail={
            reward
              ? `Simulated pool · ${reward.status}`
              : 'Rewards follow validated improvements'
          }
          onClick={actions.rewards}
        />
      </div>
      <div className="fx-scene-caption">
        <span className="fx-peek-dot" />
        <span>{peek}</span>
      </div>
    </section>
  );
}
