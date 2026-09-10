# Agent execution viewer boundary

`lib/agent-run.ts` defines the event payload consumed by `/admin`. The viewer presents events; the backend owns investigation, decisions, estimates, approval locks and payout idempotency. It never runs those operations through presentation controls.

The bundled sample is an illustrative recording assembled from sanitized code data. Its product image is `kind: "reference"`, not a computer-use screenshot. Playback advances through recorded `elapsedMs` values. New shopper submissions appear immediately as received and blocked awaiting an agent connection; they do not inherit sample findings or rewards. These submissions use `source: "pending"`. Reserve `source: "live"` for runs with events actually delivered by the backend.

## Event delivery

Each event includes `runId`, `sequence` (nonnegative integer), `elapsedMs` (nonnegative integer), `stage`, `status`, `title` and `summary`. Stages are `feedback`, `reproduce`, `diagnose`, `propose`, `reward`; execution statuses are `running`, `completed`, `blocked`, `failed`. Optional `artifact`, `finding`, `proposal` and `reward` objects carry results. The TypeScript type is the complete field contract.

`status` describes that event's step, not the entire run. For example, a completed feedback step can be followed by a running reproduction step. Present this as the latest step status; do not infer whole-run completion merely from a `completed` event or from the last event currently received.

Pass each untrusted payload through `decodeAgentEvent`, then `appendEvent`. Delivery must have increasing sequence numbers and nondecreasing elapsed time within one run. Gaps are allowed. An identical retry of an already received sequence is ignored; conflicting duplicates, mixed runs and previously unseen late events throw. On reconnect, obtain an ordered snapshot rather than dropping a rejected event. The decoder removes unknown fields, checks numeric ranges and reward totals, and restricts evidence URLs to same-origin absolute paths. No external credentials or transport are configured here.

Use `projectEvent(events, selectedIndex)` to show the last event and latest artifact, finding, proposal and reward available at that point. The index is inclusive; `-1` shows no results. This prevents later findings or receipts from leaking into earlier playback steps.

## Backend responsibilities

Findings distinguish `Reproduced`, `Observation supported`, `Could not reproduce` and `Needs more evidence`. Failure to reproduce does not disprove a report. Keep observed evidence separate from the root-cause hypothesis and its confidence.

Forecast percentages use familiar display units: `baseline: 4` means 4%, `lift: 0.4` means +0.4 percentage points, `margin: 40` means 40%. Scenarios and `expectedProfit` are backend outputs, in dollars. For the initial 30-day horizon, profit is affected sessions × absolute conversion lift × AOV × contribution margin. Forecasts remain unmeasured estimates; feedback-funded demo orders are excluded from paid conversion and revenue.

The sample scenarios include no measured benefit in the low case: 0 percentage-point lift and $0 contribution profit. Base assumes +0.4 percentage points and $3,200; high assumes +0.8 percentage points and $6,400.

One improvement owns one bounty pool. `poolCents` and allocation `cents` are integer cents; contributor weights are reward policy rather than measured causal shares. The backend must lock proposal version, forecast, pool and allocations at approval and use a stable payout idempotency key. The fixture keeps those values constant through proposed → approved → paid and emits the simulated receipt `SIM-delivery-v1`. Replaying it causes no payment or business-state mutation.

There is intentionally no chosen polling, streaming or browser-execution runtime. Connect the backend transport to this boundary when its interface is available. Keep service credentials and computer-use execution on the server.

## Sample fleet overview

`projectFleet(feedback, elapsedMs)` adds a bird's-eye illustration: all shopper inputs, one projected entry per unique run ID, and up to 12 reference-task windows drawn from sample reports. The delivery reports share one run and one reward pool. Windows are three illustrative tasks per sample report (inspect page, follow journey, compare context); their images are provided shopper-moment references, never invented browser screenshots. Worker activity is an animation, not live computer use.

`components/agent-factory-scene.tsx` presents that projection as a connected factory with an intake tray, browser workbenches, evidence scanner, improvement assembly and reward trays. The scene exposes presentation callbacks for focused inspection; `components/feedback-admin.tsx` supplies the paginated details and pauses playback while they are open. The intake tray displays four reports at most, while its signals label opens all retained reports. Station geometry is illustrative and is not an additional backend execution state.

Sample runs are staggered and loop every 36 seconds. Their `snapshot` contains only events reached at the supplied time; render the overview from that snapshot rather than reading future events from `run.events`. Unstarted sample runs have index `-1` and no projected event. New real submissions remain visible as pending, never acquire sample workers, and never progress or loop. An opening time of 28 seconds shows the delivery run's simulated reward while three variant tasks work in parallel. Workers stop at the first completed, blocked, or failed reproduction event; a blocked investigation never keeps animating as active computer use.
