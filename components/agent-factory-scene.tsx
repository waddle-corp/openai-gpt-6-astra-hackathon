'use client';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowUpRight, MousePointer2 } from 'lucide-react';
import { projectFleet, type FleetWorker } from '@/lib/agent-fleet';
import type { Feedback } from '@/lib/feedback';
import '@/app/admin/factory-scene.css';

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
  z,
  width,
  depth,
  height,
}: {
  className?: string;
  x: number;
  y: number;
  z: number;
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
  z = 105,
  step,
  title,
  detail,
  onClick,
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
      style={{ left: x, top: y, transform: `translateZ(${z}px)` }}
    >
      <button className="fx-label" onClick={onClick}>
        <span>{step}</span>
        <strong>{title}</strong>
        <ArrowUpRight size={12} />
        <small>{detail}</small>
      </button>
    </div>
  );
}

export function AgentFactoryScene({
  fleet,
  actions,
}: {
  fleet: Fleet;
  actions: Actions;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.72);
  const [hovered, setHovered] = useState<string | null>(null);
  const [peek, setPeek] = useState(
    'Select a signal, a browser, or a station to look inside.',
  );
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(
        Math.min(
          (entry.contentRect.width - 48) / 1200,
          (entry.contentRect.height - 72) / 510,
          1.6,
        ),
      ),
    );
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
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
  const pipes = [
    'M 216 425 H 260 Q 282 425 282 403 V 313 Q 282 291 304 291 H 345',
    'M 718 248 H 812 Q 835 248 835 225 V 194 H 874',
    'M 908 222 H 957 Q 977 222 977 242 V 378 Q 977 398 957 398 H 907',
    'M 824 428 H 785 Q 764 428 764 449 V 511 H 666',
    'M 593 540 H 286 Q 245 540 245 503 V 458 H 201',
  ];
  return (
    <section
      ref={canvas}
      className="factory-canvas"
      aria-label="Agent system map"
    >
      <div className="fx-canvas-caption">
        <span>THE SYSTEM, AT A GLANCE</span>
        <p>
          {fleet.feedback.length} shopper signals <i /> {fleet.workers.length}{' '}
          simulated browsers
        </p>
      </div>
      <div
        className="factory-world"
        style={
          {
            '--scene-scale': Math.max(0.15, scale),
            '--scene-offset': `${40 * scale}px`,
          } as CSSProperties
        }
      >
        <div className="fx-floor-edge" />
        <div className="fx-floor" />
        <div className="fx-floor-grid" />
        <svg className="fx-routes" viewBox="0 0 1060 620" aria-hidden="true">
          {pipes.map((path, index) => (
            <g key={path}>
              <path className="fx-route-shadow" d={path} />
              <path className="fx-route-track" d={path} />
              <path className="fx-route-line" d={path} />
              <path
                className="fx-route-packets"
                d={path}
                style={{ animationDelay: `${index * -0.8}s` }}
              />
            </g>
          ))}
        </svg>
        <div className="fx-zone-name fx-zone-input" aria-hidden="true">
          INTAKE / 01
        </div>
        <div className="fx-zone-name fx-zone-compute" aria-hidden="true">
          COMPUTE FIELD / 02
        </div>
        <div className="fx-zone-name fx-zone-output" aria-hidden="true">
          OUTPUT / 04
        </div>

        <section className="fx-intake" aria-label="Shopper feedback signals">
          <Solid
            className="fx-porcelain"
            x={90}
            y={336}
            z={0}
            width={146}
            depth={142}
            height={9}
          />
          <Solid
            className="fx-intake-back"
            x={91}
            y={334}
            z={9}
            width={144}
            depth={5}
            height={24}
          />
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
                ? 'More context needed'
                : entry?.snapshot.reward
                  ? 'Reward linked'
                  : entry?.snapshot.event?.stage === 'feedback' ||
                      !entry?.snapshot.event
                    ? 'Queued'
                    : 'Investigating';
            return (
              <button
                className={`fx-signal ${!report.sample ? 'is-pending' : ''}`}
                key={report.id}
                style={
                  {
                    left: 99 + (index % 2) * 66,
                    top: 347 + Math.floor(index / 2) * 62,
                    '--sheet-z': `${15 + index * 3}px`,
                  } as CSSProperties
                }
                onClick={() => actions.feedback(report)}
                onMouseEnter={() => {
                  setHovered(report.id);
                  setPeek(
                    `${report.persona.split(' · ')[0]} · ${report.title} · ${status}`,
                  );
                }}
                onMouseLeave={() => {
                  setHovered(null);
                  setPeek(
                    'Select a signal, a browser, or a station to look inside.',
                  );
                }}
                aria-label={`Inspect ${report.id}: ${report.title}`}
              >
                <span className="fx-sheet-back" />
                <span className="fx-sheet">
                  <span className="fx-sheet-header">
                    <b>{report.persona[0]}</b>
                    <small>{report.id}</small>
                  </span>
                  <strong>{report.persona.split(' · ')[0]}</strong>
                  <span className="fx-sheet-line" />
                  <span className="fx-sheet-line" />
                  <span className="fx-sheet-line" />
                  <span
                    className={`fx-sheet-status ${blocked || !report.sample ? 'is-amber' : ''}`}
                  />
                </span>
              </button>
            );
          })}
        </section>
        <Label
          x={121}
          y={600}
          z={67}
          step="01"
          title="Shopper signals"
          detail={`${fleet.feedback.length} reports${pending ? ` · ${pending} awaiting backend` : ' + shopping context'}`}
          onClick={actions.signals}
        />

        <section className="fx-compute" aria-label="Parallel browser workers">
          {[0, 1, 2].map((row) => (
            <Solid
              key={row}
              className="fx-bench"
              x={315}
              y={143 + row * 100}
              z={0}
              width={392}
              depth={79}
              height={8}
            />
          ))}
          {fleet.workers.map((worker, index) => (
            <button
              key={worker.id}
              className={`fx-workstation is-${worker.status} ${hovered === worker.feedbackId ? 'is-linked' : ''}`}
              style={
                {
                  left: 324 + (index % 4) * 95,
                  top: 148 + Math.floor(index / 4) * 100,
                  '--worker': index,
                  '--progress': `${worker.progress * 100}%`,
                } as CSSProperties
              }
              onClick={() => actions.worker(worker, index + 1)}
              onMouseEnter={() => {
                setHovered(worker.feedbackId);
                setPeek(
                  `Browser ${String(index + 1).padStart(2, '0')} · ${worker.feedbackId} · ${worker.label} · ${worker.status}`,
                );
              }}
              onMouseLeave={() => {
                setHovered(null);
                setPeek(
                  'Select a signal, a browser, or a station to look inside.',
                );
              }}
              aria-label={`Inspect worker ${String(index + 1).padStart(2, '0')}: ${worker.label}`}
            >
              <span className="fx-monitor-shadow" />
              <span className="fx-monitor-base" />
              <span className="fx-monitor-stem" />
              <span className="fx-monitor">
                <span className="fx-monitor-chrome">
                  <i />
                  <i />
                  <i />
                  <b>{String(index + 1).padStart(2, '0')}</b>
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
                    size={10}
                    className="fx-cursor"
                    fill="currentColor"
                  />
                  <span className="fx-scan" />
                </span>
                <span className="fx-monitor-footer">
                  <i />
                  {worker.feedbackId}
                  <span>{worker.status}</span>
                </span>
                <span className="fx-monitor-progress" />
              </span>
            </button>
          ))}
          <Solid
            className="fx-controller"
            x={460}
            y={447}
            z={0}
            width={102}
            depth={30}
            height={15}
          />
          <span className="fx-controller-leds" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
        </section>
        <Label
          x={488}
          y={123}
          z={133}
          step="02"
          title="Computer-use fleet"
          detail={`${running} investigating · ${fleet.workers.length} browser workers`}
          onClick={() =>
            fleet.workers[0] && actions.worker(fleet.workers[0], 1)
          }
        />

        <button
          style={{ left: 811, top: 128, width: 135, height: 102 }}
          className="fx-machine-hit fx-inspection"
          onClick={actions.findings}
          aria-label="Inspect findings"
          onMouseEnter={() =>
            setPeek(
              `${supported.length} supported · ${findings.length - supported.length} unresolved findings`,
            )
          }
        >
          <span className="fx-machine-model" style={{ left: -811, top: -128 }}>
            <Solid
              className="fx-porcelain"
              x={811}
              y={128}
              z={0}
              width={135}
              depth={102}
              height={12}
            />
            <Solid
              className="fx-inspector-leg"
              x={818}
              y={142}
              z={12}
              width={12}
              depth={68}
              height={65}
            />
            <Solid
              className="fx-inspector-leg"
              x={920}
              y={142}
              z={12}
              width={12}
              depth={68}
              height={65}
            />
            <Solid
              className="fx-inspector-roof"
              x={818}
              y={141}
              z={77}
              width={114}
              depth={69}
              height={8}
            />
            <span className="fx-inspector-glass" />
            <span className="fx-inspector-sheet">
              <i />
              <i />
              <i />
            </span>
            <span className="fx-inspector-beam" />
            <span className="fx-machine-badge">VERIFY</span>
          </span>
        </button>
        <Label
          x={869}
          y={103}
          z={122}
          step="03"
          title="Evidence & diagnosis"
          detail={
            findings.length
              ? `${supported.length} supported · ${findings.length - supported.length} unresolved`
              : 'Waiting for journey evidence'
          }
          onClick={actions.findings}
        />

        <button
          style={{ left: 821, top: 330, width: 128, height: 108 }}
          className={`fx-machine-hit fx-assembly ${improvement ? 'has-result' : ''}`}
          onClick={actions.improvements}
          aria-label="Inspect improvements"
          onMouseEnter={() =>
            setPeek(improvement?.title || 'Waiting for a supported finding')
          }
        >
          <span className="fx-machine-model" style={{ left: -821, top: -330 }}>
            <Solid
              className="fx-porcelain"
              x={821}
              y={330}
              z={0}
              width={128}
              depth={108}
              height={12}
            />
            <Solid
              className="fx-assembly-base"
              x={839}
              y={351}
              z={12}
              width={81}
              depth={60}
              height={11}
            />
            <Solid
              className="fx-assembly-arm"
              x={927}
              y={365}
              z={12}
              width={8}
              depth={9}
              height={64}
            />
            <Solid
              className="fx-assembly-arm-head"
              x={892}
              y={365}
              z={76}
              width={43}
              depth={9}
              height={8}
            />
            <span className="fx-build-sheet fx-build-back">
              <i />
              <i />
              <i />
            </span>
            <span className="fx-build-sheet fx-build-front">
              <span>STOREFRONT</span>
              <i />
              <i />
              <b>{improvement ? 'DELIVERY GUIDANCE' : 'AWAITING EVIDENCE'}</b>
            </span>
            <span className="fx-build-light" />
          </span>
        </button>
        <Label
          x={985}
          y={555}
          z={107}
          step="04"
          title="Improvements"
          detail={
            improvement
              ? `Proposed · +${amount(improvement.expectedProfit)} / 30 days estimated`
              : 'Evidence becomes a proposed change'
          }
          onClick={actions.improvements}
        />

        <button
          style={{ left: 587, top: 487, width: 138, height: 80 }}
          className={`fx-machine-hit fx-distribution ${reward ? 'has-result' : ''}`}
          onClick={actions.rewards}
          aria-label="Inspect shopper rewards"
          onMouseEnter={() =>
            setPeek(
              reward
                ? `${amount(reward.poolCents / 100)} simulated reward pool · ${reward.status}`
                : 'Awaiting an improvement',
            )
          }
        >
          <span className="fx-machine-model" style={{ left: -587, top: -487 }}>
            <Solid
              className="fx-porcelain"
              x={587}
              y={487}
              z={0}
              width={138}
              depth={80}
              height={12}
            />
            <Solid
              className="fx-distributor"
              x={594}
              y={494}
              z={12}
              width={33}
              depth={61}
              height={28}
            />
            {[0, 1].map((index) => (
              <span
                key={index}
                className="fx-payout-tray"
                style={{ left: 637 + index * 43, top: 502 }}
              >
                <span className="fx-tray-floor" />
                <span className="fx-tray-rim" />
                {reward && (
                  <span
                    className="fx-credit-token"
                    style={{ '--token': index } as CSSProperties}
                  >
                    <i />
                    <i />
                    <i />
                    <b>+</b>
                  </span>
                )}
                <small>
                  {reward?.allocations[index]?.persona.split(' · ')[0] ||
                    'SHOPPER'}
                </small>
              </span>
            ))}
            <span className="fx-distributor-display">
              {reward ? amount(reward.poolCents / 100) : '···'}
            </span>
          </span>
        </button>
        <Label
          x={671}
          y={692}
          z={60}
          step="05"
          title="Value shared back"
          detail={
            reward
              ? `${amount(reward.poolCents / 100)} simulated pool · ${reward.status}`
              : 'Rewards follow a supported improvement'
          }
          onClick={actions.rewards}
        />
        <span className="fx-return-caption" aria-hidden="true">
          ONE CONTINUOUS FEEDBACK LOOP
        </span>
      </div>
      <div className="fx-scene-caption">
        <span className="fx-peek-dot" />
        <span>{peek}</span>
        <span>
          CLICK TO EXPLORE <ArrowUpRight size={12} />
        </span>
      </div>
    </section>
  );
}
