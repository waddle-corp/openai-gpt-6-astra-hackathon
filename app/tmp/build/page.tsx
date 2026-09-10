'use client';

import { useEffect, useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { ImprovementOpportunity } from '@/agents/feedback-agent/synthesize.ts';
import { sampleOpportunity } from '@/agents/coding-agent/fixtures.ts';
import type { Build, Decision } from '@/agents/coding-agent/build.ts';
import '../feedback/feedback.css';
import './build.css';

type BuildSummary = Omit<Build, 'diff' | 'screenshots' | 'events'> & { eventCount: number };

const STATUS_COPY: Record<Build['status'], string> = {
  building: 'Astra is building in an isolated worktree',
  validating: 'Running test, lint, typecheck, build',
  review: 'Ready for your decision',
  draft: 'Saved as draft (branch kept)',
  published: 'Published: merged into the local branch',
  rejected: 'Rejected: branch discarded',
  failed: 'Failed',
};

async function api<T>(path: string, init?: RequestInit): Promise<{ payload?: T; error?: string }> {
  try {
    const response = await fetch(path, init);
    const payload = (await response.json()) as T & { error?: string };
    return payload.error ? { error: payload.error } : { payload };
  } catch {
    return { error: 'The build API could not be reached.' };
  }
}

export default function BuildLab() {
  const [source, setSource] = useState<'sample' | 'json'>('sample');
  const [json, setJson] = useState('');
  const [builds, setBuilds] = useState<BuildSummary[]>([]);
  const [selected, setSelected] = useState<string>();
  const [build, setBuild] = useState<Build>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const status = build?.status;

  useEffect(() => {
    void api<{ builds: BuildSummary[] }>('/api/build').then(({ payload }) => payload && setBuilds(payload.builds));
  }, []);

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const load = async () => {
      const { payload, error: message } = await api<{ build: Build }>(`/api/build/${selected}`);
      if (cancelled) return;
      if (payload) setBuild(payload.build);
      if (message) setError(message);
    };
    void load();
    const polling = !status || status === 'building' || status === 'validating';
    const timer = polling ? setInterval(load, 3000) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [selected, status]);

  async function refreshList() {
    const { payload } = await api<{ builds: BuildSummary[] }>('/api/build');
    if (payload) setBuilds(payload.builds);
  }

  async function start(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    let opportunity: ImprovementOpportunity = sampleOpportunity;
    if (source === 'json') {
      try {
        const parsed = JSON.parse(json) as { opportunity?: ImprovementOpportunity } & ImprovementOpportunity;
        opportunity = parsed.opportunity ?? parsed;
      } catch {
        setError('Paste the JSON returned by /api/feedback/synthesize.');
        return;
      }
    }
    setBusy(true);
    const { payload, error: message } = await api<{ build: BuildSummary }>('/api/build', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opportunity, liveOrigin: window.location.origin }),
    });
    setBusy(false);
    if (message) setError(message);
    if (payload) {
      setBuild(undefined);
      setSelected(payload.build.id);
      void refreshList();
    }
  }

  async function decide(decision: Decision) {
    if (!build) return;
    setError(undefined);
    setBusy(true);
    const { payload, error: message } = await api<{ build: BuildSummary }>(`/api/build/${build.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision, note: decision === 'request_change' ? note : undefined }),
    });
    setBusy(false);
    if (message) setError(message);
    if (payload) {
      setBuild({ ...build, ...payload.build });
      setNote('');
      void refreshList();
    }
  }

  const active = build && (build.status === 'building' || build.status === 'validating');
  const checksOk = build?.checks.length === 4 && build.checks.every((check) => check.ok);

  return (
    <main className="feedback-lab">
      <div className="feedback-frame">
        <header className="feedback-header">
          <a className="back-link" href="/tmp/feedback/collective">← Collective feedback</a>
          <span className="lab-mark">Astra / build lab</span>
        </header>

        <section className="feedback-intro">
          <div>
            <p className="section-index">Step 04 / build and validate</p>
            <h1>Astra builds the improvement. You decide what ships.</h1>
          </div>
          <p className="intro-copy">
            Each build runs in its own git worktree with its own dev server and headless browser, reviewed at the desktop viewport. Nothing touches the live storefront until you publish.
          </p>
        </section>

        <div className="process-rail" aria-label="Build process">
          <ProcessStep number="01" title="Build" active={build?.status === 'building'} done={Boolean(build && build.status !== 'building')} />
          <span className="rail-line" />
          <ProcessStep number="02" title="Validate" active={build?.status === 'validating'} done={Boolean(build?.checks.length)} />
          <span className="rail-line" />
          <ProcessStep number="03" title="Review" active={build?.status === 'review'} done={Boolean(build && ['published', 'rejected', 'draft'].includes(build.status))} />
          <span className="rail-line" />
          <ProcessStep number="04" title="Decision" active={false} done={Boolean(build && ['published', 'rejected'].includes(build.status))} />
        </div>

        <form className="feedback-form" onSubmit={start}>
          <div className="form-heading">
            <div>
              <span className="field-kicker">Input</span>
              <h2>Improvement opportunity</h2>
            </div>
          </div>
          <label className="url-label" htmlFor="source">Source</label>
          <select id="source" value={source} onChange={(event) => setSource(event.target.value as 'sample' | 'json')}>
            <option value="sample">Sample: {sampleOpportunity.title}</option>
            <option value="json">Paste the opportunity JSON from step 03</option>
          </select>
          {source === 'json' ? (
            <textarea aria-label="Opportunity JSON" value={json} onChange={(event) => setJson(event.target.value)} placeholder='{"opportunity": {"title": "...", "buildBrief": "..."}}' />
          ) : (
            <p className="result-summary">{sampleOpportunity.opportunity}</p>
          )}
          <div className="form-footer">
            <label className="url-label" htmlFor="existing">Or open a build</label>
            <select id="existing" value={selected ?? ''} onChange={(event) => setSelected(event.target.value || undefined)}>
              <option value="">—</option>
              {builds.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.status} · {item.opportunity.title}
                </option>
              ))}
            </select>
            <button disabled={busy} type="submit">{busy ? 'Starting' : 'Build with Astra'}</button>
          </div>
        </form>

        {error ? <div className="agent-error" role="alert">{error}</div> : null}

        {build ? (
          <section className="triage-result build-review" aria-live="polite">
            <div className="result-topline">
              <div>
                <span className="field-kicker">Build {build.id}</span>
                <h2>{build.opportunity.title}</h2>
              </div>
              <div className="computer-status">
                <span className={`status-dot ${active ? 'is-live' : ''}`} />
                <div>
                  <strong>{STATUS_COPY[build.status]}</strong>
                  <p>Branch {build.branch}{build.mergedCommit ? ` → ${build.mergedCommit}` : ''}</p>
                </div>
              </div>
            </div>
            {build.error ? <div className="agent-error" role="alert">{build.error}</div> : null}

            <div className="compare-grid">
              <Experience title="Original experience" shots={build.screenshots.original} href={`${build.liveOrigin}${build.reviewPath}`} />
              <Experience title="Implemented result" shots={build.screenshots.result} href={build.previewOrigin ? `${build.previewOrigin}${build.reviewPath}` : undefined} />
            </div>

            <div className="result-columns">
              <div>
                <h3>Shopper evidence</h3>
                <ul className="evidence-list">
                  {build.opportunity.evidence.map((item) => (
                    <li key={`${item.feedbackId}-${item.quote}`}>
                      <span className="field-kicker">{item.feedbackId} · {item.role}</span>
                      “{item.quote}”
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3>Reasoning</h3>
                <p><strong>Problem.</strong> {build.opportunity.underlyingProblem}</p>
                <p><strong>Opportunity.</strong> {build.opportunity.opportunity}</p>
                {build.summary ? <p><strong>Astra.</strong> {build.summary}</p> : null}
                <details>
                  <summary>Agent log ({build.events.length})</summary>
                  <ol className="event-log">
                    {build.events.map((event, index) => (
                      <li key={index} className={`event-${event.kind}`}><span>{event.kind}</span>{event.text}</li>
                    ))}
                  </ol>
                </details>
              </div>
            </div>

            <div className="next-step">
              <span className="field-kicker">Validation</span>
              {build.checks.length ? (
                <ul className="check-list">
                  {build.checks.map((check) => (
                    <li key={check.command} className={check.ok ? 'is-ok' : 'is-failed'}>
                      <strong>{check.command}</strong> {check.ok ? 'passed' : 'failed'} · {(check.ms / 1000).toFixed(1)}s
                      {!check.ok ? <pre>{check.output}</pre> : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>{active ? 'Pending.' : 'No checks recorded.'}</p>
              )}
              {build.changedFiles.length ? (
                <details>
                  <summary>Diff · {build.changedFiles.join(', ')}</summary>
                  <pre className="diff">{build.diff}</pre>
                </details>
              ) : null}
            </div>

            {['review', 'draft', 'failed'].includes(build.status) ? (
              <div className="decision-bar">
                <button disabled={busy || !checksOk || build.status === 'failed'} onClick={() => decide('publish')} type="button" className="is-primary">
                  Publish (merge locally)
                </button>
                <button disabled={busy} onClick={() => decide('reject')} type="button">Reject (discard branch)</button>
                <button disabled={busy || build.status === 'draft'} onClick={() => decide('draft')} type="button">Leave as draft</button>
                <div className="change-request">
                  <input aria-label="Change request" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ask Astra for a change…" />
                  <button disabled={busy || !note.trim()} onClick={() => decide('request_change')} type="button">Request change</button>
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

function ProcessStep({ number, title, active, done }: { number: string; title: string; active: boolean; done: boolean }) {
  return <div className={`process-step ${active ? 'is-active' : ''} ${done ? 'is-done' : ''}`}><span>{number}</span><strong>{title}</strong></div>;
}

function Experience({ title, shots, href }: { title: string; shots: Build['screenshots']['original']; href?: string }) {
  return (
    <div className="experience">
      <h3>{title}{href ? <> · <a href={href} target="_blank" rel="noreferrer">open</a></> : null}</h3>
      {shots.desktop || shots.mobile ? (
        <div className="shots">
          {shots.desktop ? <img src={shots.desktop} alt={`${title}, desktop`} className="shot-desktop" /> : null}
          {shots.mobile ? <img src={shots.mobile} alt={`${title}, mobile`} className="shot-mobile" /> : null}
        </div>
      ) : (
        <p className="empty-list">No screenshots yet.</p>
      )}
    </div>
  );
}
