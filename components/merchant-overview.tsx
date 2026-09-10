'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pause, Play, X } from 'lucide-react';
import type { AdminOverviewRecord } from '@/lib/admin-overview-data';
import '@/app/admin/overview.css';
import { MerchantDirection } from './merchant-direction';

const SIGNALS_PER_PAGE = 6;
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
}: {
  record: AdminOverviewRecord;
  playing: boolean;
  controls?: boolean;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (playing) video.current?.play().catch(() => {});
    else video.current?.pause();
  }, [playing, record.replayUrl]);
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

export function MerchantOverview({
  records,
  totalSignals,
}: {
  records: AdminOverviewRecord[];
  totalSignals: number;
}) {
  const [selectedId, setSelectedId] = useState(records[0]?.feedback.id);
  const [signalPage, setSignalPage] = useState(0);
  const [replayPage, setReplayPage] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [inspecting, setInspecting] = useState<AdminOverviewRecord | null>(
    null,
  );
  const selected = records.find((record) => record.feedback.id === selectedId);
  const replays = records.filter((record) => record.replayUrl);
  const selectSignal = (record: AdminOverviewRecord) => {
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
          <span className="mo-brand-mark">
            b<span>•</span>
          </span>
          <span className="mo-brand-text">
            Boosted USA <small>Merchant workspace</small>
          </span>
        </a>
        <div className="mo-header-meta">
          <span className="mo-demo-pill">
            <i /> Demo workspace
          </span>
          <a
            className="mo-store-link"
            href="/store"
            target="_blank"
            rel="noreferrer"
          >
            View store
          </a>
        </div>
      </header>
      <MerchantDirection />
      <div className="mo-workspace">
        <section
          className="mo-panel mo-signals"
          aria-labelledby="signals-title"
        >
          <div className="mo-panel-head">
            <div>
              <span className="mo-kicker">01 / LISTEN</span>
              <h2 id="signals-title">Shopper signals</h2>
            </div>
          </div>
          <div className="mo-scope-note">
            <strong>Filtered by goal &amp; strategy</strong>
            <span>Higher AOV · Sell compatible parts</span>
            <small>{records.length} matching signals / {totalSignals} total</small>
          </div>
          <div className="mo-signals-list">
            {records
              .slice(
                signalPage * SIGNALS_PER_PAGE,
                (signalPage + 1) * SIGNALS_PER_PAGE,
              )
              .map((record) => (
                <button
                  className={`mo-signal ${record.feedback.id === selectedId ? 'is-selected' : ''}`}
                  key={record.feedback.id}
                  onClick={() => selectSignal(record)}
                  aria-pressed={record.feedback.id === selectedId}
                >
                  <span className="mo-signal-top">
                    <strong>{record.shortId}</strong>
                    <span>{record.strategyMatch}</span>
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
          <Pagination
            page={signalPage}
            size={SIGNALS_PER_PAGE}
            count={records.length}
            onChange={setSignalPage}
            label="signals"
          />
        </section>
        <section className="mo-panel mo-fleet" aria-labelledby="fleet-title">
          <div className="mo-panel-head">
            <div>
              <span className="mo-kicker">02 / INVESTIGATE</span>
              <h2 id="fleet-title">Computer-use fleet</h2>
            </div>
            <button
              className="mo-play-control"
              aria-label={
                playing ? 'Pause replay previews' : 'Play replay previews'
              }
              onClick={() => setPlaying((value) => !value)}
            >
              {playing ? <Pause size={14} /> : <Play size={14} />}
              {playing ? 'Pause' : 'Play'}
            </button>
          </div>
          <div className="mo-fleet-intro">
            <span>
              <i /> Recorded browser replays
            </span>
            <small>Select a session to look closer</small>
          </div>
          <div className="mo-replay-grid">
            {replays
              .slice(
                replayPage * REPLAYS_PER_PAGE,
                (replayPage + 1) * REPLAYS_PER_PAGE,
              )
              .map((record) => (
                <button
                  className={`mo-replay ${selectedId === record.feedback.id ? 'is-selected' : ''}`}
                  key={record.feedback.id}
                  onClick={() => {
                    setSelectedId(record.feedback.id);
                    setSignalPage(
                      Math.floor(
                        records.findIndex(
                          (item) => item.feedback.id === record.feedback.id,
                        ) / SIGNALS_PER_PAGE,
                      ),
                    );
                    setInspecting(record);
                  }}
                  aria-label={`Open replay ${record.shortId}`}
                >
                  <span className="mo-replay-screen">
                    <Replay record={record} playing={playing && !inspecting} />
                  </span>
                  <span className="mo-replay-caption">
                    <strong>{record.shortId}</strong>
                    <span>{record.feedback.journey.viewport}</span>
                  </span>
                </button>
              ))}
          </div>
          <Pagination
            page={replayPage}
            size={REPLAYS_PER_PAGE}
            count={replays.length}
            onChange={setReplayPage}
            label="replays"
          />
        </section>
        <aside className="mo-outcomes">
          <section
            className="mo-panel mo-outcome-card"
            aria-labelledby="diagnosis-title"
          >
            <div className="mo-panel-head">
              <div>
                <span className="mo-kicker">03 / IMPROVE</span>
                <h2 id="diagnosis-title">Diagnosis & improvement</h2>
              </div>
            </div>
            <div className="mo-outcome-body">
              <h3>Analysis pending</h3>
              <p>No diagnosis or proposal has been generated yet.</p>
              <div className="mo-result-fields">
                <div>
                  <span>Diagnosis</span>
                  <small>—</small>
                </div>
                <div>
                  <span>Proposed improvement</span>
                  <small>—</small>
                </div>
                <div>
                  <span>Expected impact</span>
                  <small>—</small>
                </div>
              </div>
            </div>
            <div className="mo-outcome-foot">
              {selected ? `${selected.shortId} selected` : 'No signal selected'}
              <span>Analysis pending</span>
            </div>
          </section>
          <section
            className="mo-panel mo-value-card"
            aria-labelledby="value-title"
          >
            <div className="mo-panel-head">
              <div>
                <span className="mo-kicker">04 / SHARE</span>
                <h2 id="value-title">Value shared back</h2>
              </div>
            </div>
            <h3>Rewards pending</h3>
            <p>Allocation follows the improvement’s validated impact.</p>
          </section>
        </aside>
      </div>
      <footer className="mo-footer">
        <span>Demo feedback & recorded journeys</span>
      </footer>
      {inspecting && (
        <Inspection record={inspecting} onClose={() => setInspecting(null)} />
      )}
    </main>
  );
}
