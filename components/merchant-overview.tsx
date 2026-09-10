'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Check, Play, X } from 'lucide-react';
import type { AdminOverviewRecord } from '@/lib/admin-overview-data';
import '@/app/admin/overview.css';
import { MerchantDirection } from './merchant-direction';
import { AudienceTab } from './audience-tab';

import {
  analysisSchedule,
  analysisProgress,
  DEMO_ANALYSIS_MS,
} from '@/lib/demo-analysis';

const REPLAYS_PER_PAGE = 12;
function Pagination({
  page,
  size,
  count,
  onChange,
  label,
}: {
  page: number;
  size: number;
  count: number;
  onChange: (value: number) => void;
  label: string;
}) {
  return (
    <div className="mo-pagination">
      <span>
        {count ? page * size + 1 : 0}–{Math.min((page + 1) * size, count)}{' '}
        <span className="mo-muted">of {count}</span>
      </span>
      <div>
        <button
          aria-label={`Previous ${label}`}
          disabled={page === 0}
          onClick={() => onChange(page - 1)}
        >
          <ChevronLeft size={16} />
        </button>
        <button
          aria-label={`Next ${label}`}
          disabled={(page + 1) * size >= count}
          onClick={() => onChange(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function Replay({
  record,
  playing,
  controls = false,
  runId = 0,
}: {
  record: AdminOverviewRecord;
  playing: boolean;
  controls?: boolean;
  runId?: number;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (video.current) video.current.currentTime = 0;
  }, [runId, record.replayUrl]);
  useEffect(() => {
    if (playing) video.current?.play().catch(() => {});
    else video.current?.pause();
  }, [playing, record.replayUrl, runId]);
  if (!record.replayUrl || failed)
    return (
      <span className="mo-video-unavailable">
        <span>Replay unavailable</span>
      </span>
    );
  return (
    <video
      ref={video}
      src={record.replayUrl}
      autoPlay={playing}
      muted
      loop
      playsInline
      controls={controls}
      preload="metadata"
      onError={() => setFailed(true)}
      aria-label={`Recorded journey for ${record.shortId}`}
    />
  );
}

function Inspection({
  record,
  onClose,
}: {
  record: AdminOverviewRecord;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const { feedback } = record;
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="mo-dialog"
      aria-labelledby="replay-dialog-title"
      onCancel={onClose}
      closedby="any"
      onClose={onClose}
    >
      <div className="mo-dialog-head">
        <div>
          <span className="mo-kicker">RECORDED JOURNEY · {record.shortId}</span>
          <h2 id="replay-dialog-title">
            {feedback.context.selectedPage?.title || 'Shopper journey'}
          </h2>
        </div>
        <button aria-label="Close replay" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      <div className="mo-dialog-content">
        <div className="mo-dialog-video">
          <Replay record={record} playing controls />
        </div>
        <aside>
          <span className="mo-kicker">SHOPPER SIGNAL</span>
          <blockquote className="mo-dialog-quote">
            “
            {feedback.feedback.message ||
              feedback.feedback.summary ||
              'Feedback submitted through the questionnaire.'}
            ”
          </blockquote>
          <div className="mo-detail-row">
            <span>Source</span>
            <strong>Synthetic demo fixture</strong>
          </div>
          <div className="mo-detail-row">
            <span>Viewport</span>
            <strong>{feedback.journey.viewport}</strong>
          </div>
          <div className="mo-detail-row">
            <span>Journey</span>
            <strong>{feedback.journey.events.length} recorded steps</strong>
          </div>
          {record.strategyMatch && (
            <div className="mo-detail-row">
              <span>Strategy fit</span>
              <strong>{record.strategyMatch}</strong>
            </div>
          )}
          <div className="mo-detail-row">
            <span>Analysis</span>
            <strong>Awaiting agent output</strong>
          </div>
          <p className="mo-muted">
            This video replays a bundled shopper journey. It is not a live
            computer-use session or proof that the issue was reproduced.
          </p>
          {feedback.context.selectedPage && (
            <a
              className="mo-store-link"
              href={feedback.context.selectedPage.path}
              target="_blank"
              rel="noreferrer"
            >
              Open product page
            </a>
          )}
        </aside>
      </div>
    </dialog>
  );
}

type ComparisonVersion = 'before' | 'after';
const COMPARISON_PATH = '/store/products/gtr-series-2-bamboo-at';
function comparisonUrl(version: ComparisonVersion) {
  if (version === 'after') return `${COMPARISON_PATH}#compatible-parts-heading`;
  return `http://localhost:3002${COMPARISON_PATH}`;
}
function ImprovementComparison({
  version,
  onVersion,
  onClose,
}: {
  version: ComparisonVersion;
  onVersion: (value: ComparisonVersion) => void;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="mo-comparison-dialog"
      aria-labelledby="comparison-title"
      onCancel={onClose}
      onClose={onClose}
      closedby="any"
    >
      <header className="mo-comparison-header">
        <div>
          <h2 id="comparison-title">Compatible parts</h2>
          <p>Evolve GTR Series 2 Bamboo Street</p>
        </div>
        <div className="mo-comparison-tabs">
          {(['before', 'after'] as const).map((item) => (
            <button
              key={item}
              aria-pressed={version === item}
              onClick={() => onVersion(item)}
            >
              {item === 'before' ? 'As-is' : 'To-be'}
            </button>
          ))}
        </div>
        <a href={comparisonUrl(version)} target="_blank" rel="noreferrer">
          Open store ↗
        </a>
        <button aria-label="Close comparison" onClick={onClose}>
          <X size={20} />
        </button>
      </header>
      <iframe
        key={version}
        src={comparisonUrl(version)}
        title={`${version === 'before' ? 'As-is' : 'To-be'} storefront comparison`}
      />
    </dialog>
  );
}

export function MerchantOverview({
  records,
  totalSignals,
}: {
  records: AdminOverviewRecord[];
  totalSignals: number;
}) {
  const [comparison, setComparison] = useState<ComparisonVersion | null>(null);
  const [view, setView] = useState<'merchant' | 'user'>('merchant');
  const [storeOpened, setStoreOpened] = useState(false);
  const [selectedId, setSelectedId] = useState(records[0]?.feedback.id);
  const [replayPage, setReplayPage] = useState(0);
  const [run, setRun] = useState<{
    id: number;
    deadlines: Record<string, number>;
  }>({ id: 0, deadlines: {} });
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!run.id) return;
    const started = performance.now();
    const timer = window.setInterval(() => {
      const next = Math.min(DEMO_ANALYSIS_MS, performance.now() - started);
      setElapsed(next);
      if (next === DEMO_ANALYSIS_MS) window.clearInterval(timer);
    }, 50);
    return () => window.clearInterval(timer);
  }, [run.id]);
  const [inspecting, setInspecting] = useState<AdminOverviewRecord | null>(
    null,
  );
  const replays = records.filter(
    (record) => record.strategyMatch && record.replayUrl,
  );
  const completed = Object.entries(run.deadlines)
    .filter(([, deadline]) => elapsed >= deadline)
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => replays.find((record) => record.feedback.id === id))
    .filter((record): record is AdminOverviewRecord => Boolean(record));
  const selectSignal = (record: AdminOverviewRecord) => {
    if (!record.strategyMatch) {
      setInspecting(record);
      return;
    }
    setSelectedId(record.feedback.id);
    const index = replays.findIndex(
      (item) => item.feedback.id === record.feedback.id,
    );
    if (index >= 0) setReplayPage(Math.floor(index / REPLAYS_PER_PAGE));
  };
  return (
    <main className="mo-app">
      <header className="mo-header">
        <a className="mo-brand" href="/admin">
          <span className="mo-brand-text">Gentoo</span>
        </a>
        <nav className="mo-view-tabs" aria-label="Workspace view">
          <AudienceTab
            audience="merchant"
            active={view === 'merchant'}
            onSelect={() => setView('merchant')}
          />
          <AudienceTab
            audience="user"
            active={view === 'user'}
            onSelect={() => {
              setStoreOpened(true);
              setView('user');
            }}
          />
        </nav>
      </header>
      <div className="mo-merchant-view" hidden={view !== 'merchant'}>
        <MerchantDirection />
        <div className="mo-workspace">
          <section
            className="mo-panel mo-signals"
            aria-labelledby="signals-title"
          >
            <div className="mo-panel-head">
              <div>
                <h2 id="signals-title">
                  <small className="mo-step-number">01</small>Shopper signals
                </h2>
              </div>
            </div>
            <div className="mo-scope-note">
              <span>
                {records.filter((record) => record.strategyMatch).length} of{' '}
                {totalSignals} match your strategy
              </span>
            </div>
            <div className="mo-signals-list">
              {records.map((record) => (
                <button
                  className={`mo-signal ${record.strategyMatch ? 'is-matched' : 'is-out-of-scope'} ${record.feedback.id === selectedId ? 'is-selected' : ''}`}
                  key={record.feedback.id}
                  disabled={!record.strategyMatch}
                  onClick={() => selectSignal(record)}
                  aria-pressed={record.feedback.id === selectedId}
                >
                  <span className="mo-signal-top">
                    <strong>{record.shortId}</strong>
                    <span>{record.strategyMatch || 'Outside strategy'}</span>
                  </span>
                  <p className="mo-signal-copy">
                    {record.feedback.feedback.message ||
                      record.feedback.feedback.summary ||
                      record.feedback.feedback.responses
                        .map((item) => item.answer)
                        .join(' · ')}
                  </p>
                </button>
              ))}
            </div>
          </section>
          <section className="mo-panel mo-fleet" aria-labelledby="fleet-title">
            <div className="mo-panel-head">
              <div>
                <h2 id="fleet-title">
                  <small className="mo-step-number">02</small>Computer-use fleet
                </h2>
              </div>
              <button
                className="mo-play-control"
                aria-label="Play eight-second demo analysis"
                onClick={() => {
                  setElapsed(0);
                  setRun((previous) => ({
                    id: previous.id + 1,
                    deadlines: analysisSchedule(
                      replays.map((record) => record.feedback.id),
                    ),
                  }));
                }}
              >
                <Play size={14} /> Play
              </button>
            </div>
            <div className="mo-fleet-split">
              <div className="mo-fleet-previews">
                <div className="mo-fleet-intro">
                  <span>
                    <i /> Computer-use analysis
                  </span>
                </div>
                <div className="mo-replay-grid">
                  {replays
                    .slice(
                      replayPage * REPLAYS_PER_PAGE,
                      (replayPage + 1) * REPLAYS_PER_PAGE,
                    )
                    .map((record) => {
                      const progress = analysisProgress(
                        elapsed,
                        run.deadlines[record.feedback.id],
                      );
                      const done = progress === 100;
                      return (
                        <button
                          className={`mo-replay ${selectedId === record.feedback.id ? 'is-selected' : ''}`}
                          key={record.feedback.id}
                          onClick={() => {
                            setSelectedId(record.feedback.id);
                            setInspecting(record);
                          }}
                          aria-label={`Open replay ${record.shortId}`}
                        >
                          <span className="mo-replay-screen">
                            <Replay
                              record={record}
                              playing={
                                run.id > 0 &&
                                !done &&
                                view === 'merchant' &&
                                !inspecting
                              }
                              runId={run.id}
                            />
                            <span
                              className={`mo-analysis-status ${done ? 'is-done' : ''}`}
                            >
                              {done ? (
                                <>
                                  <Check size={12} /> Done
                                </>
                              ) : run.id ? (
                                `Analyzing ${progress}%`
                              ) : (
                                'Ready · 0%'
                              )}
                            </span>
                            <progress
                              className="mo-analysis-track"
                              aria-label={`Demo analysis ${record.shortId}`}
                              max={100}
                              value={progress}
                            />
                          </span>
                          <span className="mo-replay-caption">
                            <strong>{record.shortId}</strong>
                            <span>{record.feedback.journey.viewport}</span>
                          </span>
                        </button>
                      );
                    })}
                </div>
                <Pagination
                  page={replayPage}
                  size={REPLAYS_PER_PAGE}
                  count={replays.length}
                  onChange={setReplayPage}
                  label="replays"
                />
              </div>
              <section
                className="mo-analysis-feed"
                aria-labelledby="analysis-feed-title"
              >
                <div className="mo-analysis-feed-head">
                  <h3 id="analysis-feed-title">Journey analysis</h3>
                  <span>
                    {completed.length} / {replays.length} complete
                  </span>
                </div>
                <p className="mo-analysis-feed-note">
                  Saved findings linked to each journey
                </p>
                {!completed.length && (
                  <p className="mo-analysis-empty">
                    {run.id
                      ? 'Analyzing journeys. Findings will appear here as each session finishes.'
                      : 'Press Play to start. Completed analyses will collect here.'}
                  </p>
                )}
                <div className="mo-analysis-results">
                  {completed.map((record) => (
                    <button
                      className="mo-analysis-result mo-analysis-result-compact"
                      key={`${run.id}-${record.feedback.id}`}
                      title={
                        record.analysis?.title || 'Journey ready for review'
                      }
                      onClick={() => {
                        setSelectedId(record.feedback.id);
                        setInspecting(record);
                      }}
                    >
                      <span>{record.shortId}</span>
                      <strong>
                        {record.analysis?.title || 'Journey ready for review'}
                      </strong>
                      <Check size={13} aria-label="Done" />
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </section>
          <aside className="mo-outcomes">
            <section
              className="mo-panel mo-outcome-card"
              aria-labelledby="diagnosis-title"
            >
              <div className="mo-panel-head">
                <div>
                  <h2 id="diagnosis-title">
                    <small className="mo-step-number">03</small>Recommended
                    improvements
                  </h2>
                </div>
              </div>
              <div className="mo-improvement-previews">
                {(['before', 'after'] as const).map((version) => (
                  <section className="mo-improvement-preview" key={version}>
                    <h3>{version === 'before' ? 'As-is' : 'To-be'}</h3>
                    <button
                      className="mo-comparison-card"
                      onClick={() => setComparison(version)}
                      aria-label={`Open ${version === 'before' ? 'As-is' : 'To-be'} storefront`}
                    >
                      <span
                        className="mo-comparison-thumbnail"
                        aria-hidden="true"
                      >
                        <iframe
                          src={comparisonUrl(version)}
                          title={`${version} thumbnail`}
                          tabIndex={-1}
                          loading="lazy"
                        />
                      </span>
                      <span className="mo-comparison-card-label">
                        {version === 'before'
                          ? 'Original product page'
                          : 'Compatible parts & 3D preview'}{' '}
                        <span>↗</span>
                      </span>
                    </button>
                  </section>
                ))}
              </div>
            </section>
            <section
              className="mo-panel mo-value-card"
              aria-labelledby="value-title"
            >
              <div className="mo-panel-head">
                <div>
                  <h2 id="value-title">
                    <small className="mo-step-number">04</small>Expected Impact
                    &amp; Rewards
                  </h2>
                </div>
              </div>
              <h3>Rewards pending</h3>
              <p>Allocation follows the improvement’s validated impact.</p>
            </section>
          </aside>
        </div>
      </div>
      {storeOpened && (
        <iframe
          className="mo-user-store"
          src="/store"
          title="User storefront"
          hidden={view !== 'user'}
        />
      )}
      {comparison && (
        <ImprovementComparison
          version={comparison}
          onVersion={setComparison}
          onClose={() => setComparison(null)}
        />
      )}
      {inspecting && (
        <Inspection record={inspecting} onClose={() => setInspecting(null)} />
      )}
    </main>
  );
}
