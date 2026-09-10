'use client';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  Globe,
  MousePointer2,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useDemo } from './feedback-state';
import { AgentFactoryScene } from './agent-factory-scene';
import { projectFleet, type FleetWorker } from '@/lib/agent-fleet';
import { initialState, type Feedback } from '@/lib/feedback';
import { DEMO_DURATION_MS, projectDemoTour } from '@/lib/demo-tour';

type Fleet = ReturnType<typeof projectFleet>;
type Page = { title: string; content: ReactNode };
type Detail = { title: string; pages: Page[]; wide?: boolean };
const usd = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);
const person = (feedback: Feedback) => feedback.persona.split(' · ')[0];
const time = (ms: number) =>
  `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

export default function FeedbackAdmin() {
  const { state, error } = useDemo();
  const [clock, setClock] = useState(28000);
  const [playing, setPlaying] = useState(true);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tourMs, setTourMs] = useState<number | null>(null);
  const tour = tourMs === null ? null : projectDemoTour(tourMs);
  const touring = tour !== null;
  const tourRunning = touring && playing && !tour.finished;
  const active = touring ? tourRunning : playing && !detail;
  useEffect(() => {
    if (!tourRunning) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      const delta = now - previous;
      previous = now;
      setTourMs((value) =>
        value === null ? null : Math.min(DEMO_DURATION_MS, value + delta),
      );
    }, 100);
    return () => clearInterval(timer);
  }, [tourRunning]);
  useEffect(() => {
    if (!active || touring) return;
    const timer = setInterval(() => setClock((value) => value + 250), 250);
    return () => clearInterval(timer);
  }, [active, touring]);
  const fleet = useMemo(
    () =>
      projectFleet(
        touring ? initialState.feedback : state.feedback,
        tour?.sampleMs ?? clock,
      ),
    [state.feedback, clock, touring, tour?.sampleMs],
  );
  const openDetail = (next: Detail) => {
    if (tour) {
      setClock(tour.sampleMs);
      setTourMs(null);
      setPlaying(false);
    }
    setDetail(next);
  };
  const startTour = () => {
    setDetail(null);
    setTourMs(0);
    setPlaying(true);
  };
  const exitTour = () => {
    if (tour) setClock(tour.sampleMs);
    setTourMs(null);
    setPlaying(false);
    setDetail(null);
  };
  let guidedDetail: Detail | null = null;
  if (tour?.showModal) {
    const report = initialState.feedback.find(
      (item) => item.sample && item.group === 'delivery',
    )!;
    const storyFleet = {
      ...fleet,
      runs: fleet.runs.filter((item) =>
        item.run.feedback.some((feedback) => feedback.id === report.id),
      ),
    };
    const worker = fleet.workers.find((item) => item.feedbackId === report.id)!;
    switch (tour.step) {
      case '01':
        guidedDetail = feedbackDetail(report);
        break;
      case '02':
        guidedDetail = workerDetail(
          worker,
          fleet,
          fleet.workers.indexOf(worker) + 1,
        );
        break;
      case '03':
        guidedDetail = findingsDetail(storyFleet);
        break;
      case '04':
        guidedDetail = improvementDetail(storyFleet);
        break;
      case '05':
        guidedDetail = rewardDetail(storyFleet);
        break;
    }
  }
  return (
    <div
      className={`av-app ${active ? '' : 'is-paused'}`}
      data-tour-step={tour?.step}
    >
      {error && <output className="av-error">{error}</output>}
      <main className="av-overview">
        <h1 className="av-sr-title">Agent factory</h1>
        <AgentFactoryScene
          fleet={fleet}
          actions={{
            feedback: (feedback) => openDetail(feedbackDetail(feedback)),
            worker: (worker, index) =>
              openDetail(workerDetail(worker, fleet, index)),
            signals: () =>
              openDetail({
                title: 'Shopper signals',
                pages: fleet.feedback.flatMap(
                  (feedback) => feedbackDetail(feedback).pages,
                ),
              }),
            findings: () => openDetail(findingsDetail(fleet)),
            improvements: () => openDetail(improvementDetail(fleet)),
            rewards: () => openDetail(rewardDetail(fleet)),
          }}
        />
        <footer className="av-transport">
          <div className="av-transport-controls">
            <button
              className="av-record-control"
              aria-pressed={tourRunning}
              aria-label={
                !touring || tour.finished
                  ? 'Play 60-second demo'
                  : playing
                    ? 'Pause demo'
                    : 'Resume demo'
              }
              title={
                !touring || tour.finished
                  ? 'Play 60-second demo'
                  : playing
                    ? 'Pause demo'
                    : 'Resume demo'
              }
              onClick={() =>
                !touring || tour.finished
                  ? startTour()
                  : setPlaying((value) => !value)
              }
            >
              <span className="av-record-dot" aria-hidden="true" />
            </button>
            <button
              aria-label="Restart simulation"
              onClick={() => {
                if (touring) startTour();
                else {
                  setClock(0);
                  setPlaying(true);
                }
              }}
            >
              <RotateCcw size={13} />
            </button>
            <span>
              {touring
                ? tour.finished
                  ? 'DEMO COMPLETE'
                  : active
                    ? 'SAMPLE DEMO'
                    : 'DEMO PAUSED'
                : active
                  ? 'SIMULATION RUNNING'
                  : 'SIMULATION PAUSED'}
            </span>
          </div>
          <label className="av-clock">
            <span>{time(tourMs ?? clock % fleet.cycleMs)}</span>
            <input
              type="range"
              aria-label="Simulation position"
              min="0"
              max={touring ? DEMO_DURATION_MS : fleet.cycleMs - 1}
              step="250"
              value={tourMs ?? clock % fleet.cycleMs}
              onChange={(event) => {
                const position = Number(event.target.value);
                if (touring) {
                  setTourMs(position);
                  return;
                }
                setClock(
                  (current) =>
                    Math.floor(current / fleet.cycleMs) * fleet.cycleMs +
                    position,
                );
              }}
            />
            <span>{touring ? '/ 01:00' : 'LOOP'}</span>
          </label>
          <a className="av-storefront-link" href="/store">
            Storefront <ArrowUpRight size={13} />
          </a>
        </footer>
      </main>
      {guidedDetail ? (
        <ZoomDetail
          key={tour!.step}
          detail={guidedDetail}
          onClose={exitTour}
          guided={{
            page: Math.min(tour!.page, guidedDetail.pages.length - 1),
            elapsedMs: tourMs!,
            playing,
            onToggle: () => setPlaying((value) => !value),
          }}
        />
      ) : (
        detail && <ZoomDetail detail={detail} onClose={() => setDetail(null)} />
      )}
    </div>
  );
}

function MiniBrowser({
  worker,
  large = false,
}: {
  worker: FleetWorker;
  large?: boolean;
}) {
  return (
    <span className={`av-mini-browser ${large ? 'is-large' : ''}`}>
      <span className="av-mini-url">
        <Globe size={8} />
        {worker.route}
      </span>
      <span className="av-mini-page">
        {worker.referenceImage ? (
          <img
            src={worker.referenceImage}
            alt={
              large
                ? 'Bundled storefront reference; simulated browser activity'
                : ''
            }
          />
        ) : (
          <span className="av-page-wireframe">
            <span className="av-wire-nav" />
            <span className="av-wire-product">
              <span />
              <span>
                <i />
                <i />
                <i />
                <b />
              </span>
            </span>
            <span className="av-wire-lines">
              <i />
              <i />
            </span>
          </span>
        )}
        <span className="av-scan-area" />
        <MousePointer2
          className="av-browser-cursor"
          size={large ? 23 : 12}
          fill="currentColor"
        />
      </span>
    </span>
  );
}

function feedbackDetail(feedback: Feedback): Detail {
  return {
    title: `${feedback.id} · ${person(feedback)}`,
    pages: [
      ...(feedback.comment.match(/[\s\S]{1,240}/g) || ['']).map(
        (comment, index) => ({
          title: `Shopper signal${index ? ` · ${index + 1}` : ''}`,
          content: (
            <>
              <h3>{feedback.title}</h3>
              <blockquote>“{comment}”</blockquote>
              <p className="av-detail-note">
                {feedback.sample
                  ? 'Sample shopper report'
                  : 'New submission · waiting for backend execution'}
              </p>
            </>
          ),
        }),
      ),
      ...feedback.moments.map((moment) => ({
        title: 'Shopping context',
        content: (
          <>
            <h3>{moment.label}</h3>
            <p>{moment.detail}</p>
            <code>{moment.route}</code>
            <p className="av-detail-note">
              Selected activity context. No payment or form values captured.
            </p>
          </>
        ),
      })),
    ],
  };
}

function workerDetail(
  worker: FleetWorker,
  fleet: Fleet,
  number: number,
): Detail {
  const item = fleet.runs.find((entry) => entry.run.id === worker.runId);
  return {
    title: `Browser ${String(number).padStart(2, '0')} · ${worker.label}`,
    wide: true,
    pages: [
      {
        title: `${worker.feedbackId} · ${worker.phase} · ${worker.status}`,
        content: (
          <div className="av-browser-zoom">
            <MiniBrowser worker={worker} large />
            <p className="av-detail-note">
              Simulated computer-use worker ·{' '}
              {worker.referenceImage
                ? 'bundled reference image'
                : 'schematic page preview'}
              . No live browser session is connected.
            </p>
          </div>
        ),
      },
      {
        title: 'Investigation context',
        content: (
          <>
            <h3>{item?.run.title}</h3>
            <p>
              {item?.snapshot.event?.summary ||
                'Waiting for this investigation to start.'}
            </p>
            <dl>
              <div>
                <dt>Page</dt>
                <dd>{worker.route}</dd>
              </div>
              <div>
                <dt>Task</dt>
                <dd>{worker.label}</dd>
              </div>
              <div>
                <dt>Worker status</dt>
                <dd>{worker.status}</dd>
              </div>
              <div>
                <dt>Latest investigation event</dt>
                <dd>{item?.snapshot.event?.status || 'queued'}</dd>
              </div>
            </dl>
          </>
        ),
      },
    ],
  };
}

function findingsDetail(fleet: Fleet): Detail {
  const pages = fleet.runs
    .filter((item) => item.snapshot.finding)
    .map((item) => {
      const finding = item.snapshot.finding!;
      return {
        title: item.run.feedback.map((f) => f.id).join(' + '),
        content: (
          <>
            <h3>{finding.verdict}</h3>
            <p>{finding.observation}</p>
            <h3>Root-cause hypothesis</h3>
            <p>{finding.hypothesis}</p>
            <p className="av-detail-note">{finding.confidence}</p>
          </>
        ),
      };
    });
  return {
    title: 'Findings',
    pages: pages.length
      ? pages
      : [
          {
            title: 'Awaiting evidence',
            content: (
              <>
                <h3>Investigations are in progress.</h3>
                <p>
                  Findings appear as each run emits evidence. Unresolved reports
                  remain open.
                </p>
              </>
            ),
          },
        ],
  };
}

function improvementDetail(fleet: Fleet): Detail {
  const pages = fleet.runs.flatMap((item) => {
    const proposal = item.snapshot.proposal;
    if (!proposal) return [];
    return [
      {
        title: 'Proposed improvement',
        content: (
          <>
            <h3>{proposal.title}</h3>
            <p>{proposal.change}</p>
            <h3>Acceptance check</h3>
            <p>{proposal.acceptance}</p>
            <p className="av-detail-note">
              Proposed system output. The storefront has not been changed.
            </p>
          </>
        ),
      },
      {
        title: 'Expected value · unmeasured estimate',
        content: (
          <>
            <div className="av-scenarios">
              {proposal.scenarios.map((scenario) => (
                <div key={scenario.label}>
                  <span>{scenario.label}</span>
                  <strong>{usd(scenario.profit)}</strong>
                  <small>+{scenario.lift} pp lift</small>
                </div>
              ))}
            </div>
            <dl className="av-assumptions">
              {[
                [
                  'Affected sessions',
                  proposal.forecast.sessions.toLocaleString(),
                ],
                ['Paid conversion', `${proposal.forecast.baseline}%`],
                ['Assumed lift', `${proposal.forecast.lift} pp`],
                ['AOV', usd(proposal.forecast.aov)],
                ['Contribution margin', `${proposal.forecast.margin}%`],
                [
                  'Reward share / cap',
                  `${proposal.forecast.rate}% / ${usd(proposal.forecast.cap)}`,
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <p className="av-detail-note">
              Sessions × absolute conversion lift × AOV × margin. Baseline is
              context. Feedback-funded orders are excluded from paid conversion
              and revenue.
            </p>
          </>
        ),
      },
    ];
  });
  return {
    title: 'Improvements',
    pages: pages.length
      ? pages
      : [
          {
            title: 'Awaiting a supported finding',
            content: (
              <>
                <h3>Evidence comes first.</h3>
                <p>
                  A proposed improvement and its forecast appear only after the
                  corresponding agent event.
                </p>
              </>
            ),
          },
        ],
  };
}

function rewardDetail(fleet: Fleet): Detail {
  const pages = fleet.runs.flatMap((item) => {
    const reward = item.snapshot.reward;
    if (!reward) return [];
    return [
      {
        title: `Reward ${reward.status}`,
        content: (
          <>
            <h3>
              {usd(reward.poolCents / 100)}{' '}
              {reward.status === 'paid' ? 'shared with' : 'allocated to'}{' '}
              contributing shoppers
            </h3>
            {reward.allocations.map((allocation) => (
              <div className="av-reward-detail" key={allocation.feedbackId}>
                <strong>
                  {allocation.persona} · {usd(allocation.cents / 100)}
                </strong>
                <p>{allocation.reason}</p>
              </div>
            ))}
            <p>
              One improvement, one reward pool. Allocation weights are policy
              choices, not measured causal shares.
            </p>
            <p className="av-detail-note">
              Simulated payout. No money moved.
              {reward.receipt && ` Receipt: ${reward.receipt}`}
            </p>
          </>
        ),
      },
    ];
  });
  return {
    title: 'Shopper rewards',
    pages: pages.length
      ? pages
      : [
          {
            title: 'Awaiting an improvement',
            content: (
              <>
                <h3>Value follows evidence.</h3>
                <p>
                  The system allocates a single reward pool to the shoppers
                  whose reports contributed to an improvement.
                </p>
              </>
            ),
          },
        ],
  };
}

function ZoomDetail({
  detail,
  onClose,
  guided,
}: {
  detail: Detail;
  onClose: () => void;
  guided?: {
    page: number;
    elapsedMs: number;
    playing: boolean;
    onToggle: () => void;
  };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [manualPage, setPage] = useState(0);
  const page = guided?.page ?? manualPage;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      closedby="any"
      className={`av-dialog ${detail.wide ? 'is-wide' : ''}`}
      aria-label={detail.title}
      onClose={onClose}
    >
      <header>
        <button onClick={() => dialog.current?.close()}>
          <ArrowLeft size={14} />
          {guided ? 'Exit demo' : 'Back to overview'}
        </button>
        {guided ? (
          <button
            onClick={guided.onToggle}
            aria-label={guided.playing ? 'Pause demo' : 'Resume demo'}
          >
            {guided.playing ? <Pause size={14} /> : <Play size={14} />}
            {time(guided.elapsedMs)} / 01:00
          </button>
        ) : (
          <span>FOCUSED VIEW</span>
        )}
      </header>
      <h2>{detail.title}</h2>
      <div className="av-dialog-section">
        <span>{detail.pages[page].title}</span>
        <small>
          {page + 1} / {detail.pages.length}
        </small>
      </div>
      <div className="av-dialog-content">{detail.pages[page].content}</div>
      {guided ? (
        <footer className="av-guided-footer">
          <span>Sample demo · continuing automatically</span>
          <progress
            aria-label="Demo progress"
            value={guided.elapsedMs}
            max={DEMO_DURATION_MS}
          />
        </footer>
      ) : (
        <footer>
          <button
            disabled={page === 0}
            onClick={() => setPage((value) => value - 1)}
          >
            <ChevronLeft size={14} />
            Previous
          </button>
          <button
            onClick={() =>
              page === detail.pages.length - 1
                ? dialog.current?.close()
                : setPage((value) => value + 1)
            }
          >
            {page === detail.pages.length - 1 ? 'Back to overview' : 'Next'}
            <ArrowRight size={14} />
          </button>
        </footer>
      )}
    </dialog>
  );
}
