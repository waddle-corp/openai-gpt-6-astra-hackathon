# Coding agent (step ④: Astra builds and validates the improvement)

The improvement this agent shipped is the compatibility experience on the storefront: open http://localhost:3000/store/products/gtr-series-2-bamboo-at after `npm run dev`. See the repository [README](../../README.md) for the full URL list.

Takes the `ImprovementOpportunity` produced by step ③ (`agents/feedback-agent/synthesize.ts`) and turns it into a reviewed, validated change to the storefront code.

## Flow

1. `startBuild(opportunity)` creates `work/<id>` as a git worktree on branch `astra/<id>` from the live checkout's HEAD (`workspace.ts`). `work/` is git-ignored and `node_modules` is symlinked, so the live checkout is never edited.
2. A dev server for that worktree starts on a free port from 3200, and a headless Chrome is launched over the DevTools Protocol (`browser.ts`, no Playwright).
3. `runAgent` (`agent.ts`) drives `gpt-6-astra` through the Responses API with function tools (`list_files`, `read_file`, `search`, `write_file`, `run_checks`, `open_page`, `page_eval`, `finish`) plus the `computer` tool. `computer_call` actions are executed on the page and answered with `computer_call_output` screenshots, following the computer-use guide. Writes are limited to `app/store/**` and `components/**` (never `components/ui/**` or `app/admin/**`). Navigation is pinned to the worktree origin and checkout is blocked.
4. The change is committed on the build branch, then `npm test`, `npm run lint`, `npm run typecheck`, `npm run build` run in the worktree (`validate`). Screenshots of the review path are captured at the desktop viewport (1280) from both the live storefront and the worktree. Mobile is out of scope for now (`REVIEW_VIEWPORTS` in `build.ts`, and the prompt tells Astra the same).
5. The merchant reviews on `/tmp/build` and decides: **publish** (merge `--no-ff` into the live checkout's current branch, then remove the worktree), **reject** (remove worktree and branch), **request change** (rerun the agent in the same worktree with the note), or **draft** (keep the branch, stop the preview). Nothing is auto-published and nothing leaves the local repo.

## Processes

API routes run inside workerd (Cloudflare Vite plugin), which cannot spawn git, npm, or Chrome. The agent therefore runs in a separate Node process:

```sh
npm run agent:runner      # http://127.0.0.1:3100, reads OPENAI_API_KEY from .env
npm run dev               # storefront + /tmp/build + /api/build proxy
```

`app/api/build` (`POST` start, `GET` list) and `app/api/build/[id]` (`GET` status, `POST` decision) proxy to the runner (`lib/runner-proxy.ts`, `ASTRA_RUNNER_URL` to override). Build state is persisted under `work/builds/*.json`; an in-flight build is marked failed if the runner restarts.

## Without an API key

`npm test` runs `scripts/check-coding-agent.mjs`: fixture evidence is verbatim, the tool schemas are strict, model output parsing, computer-action mapping and the origin guard, the worktree lifecycle (create, write guard, commit, merge, remove) in a throwaway repo, and a headless Chrome smoke test (skipped when no Chrome is installed). Only `runAgent` needs the key.

`fixtures.ts` holds `sampleOpportunity`, a captured step ③ result (compatible-parts section on product pages) so a build can start from `/tmp/build` without rerunning the feedback agent.

## 3D fidelity loop (`fidelity.ts`, `scripts/refine-3d.mjs`)

`npm run agent:refine-3d` (needs `OPENAI_API_KEY` and Blender) asks `gpt-6-astra` to compare product photos with a headless Blender render of the parametric part module (`scripts/3d/street_wheel.py`), edit the module, re-render, and repeat until it calls `finish`. Renders land in `work/renders/`; the GLB is rebuilt at the end. The loop is generic over `FidelityTask` (module file, reference photos, render function), so other parts can be refined the same way.
