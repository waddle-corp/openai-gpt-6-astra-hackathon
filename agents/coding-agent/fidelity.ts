// Astra fidelity loop: compare a Blender render against product photos, edit the
// parametric module, re-render, repeat. Same Responses API contract as agent.ts, but
// the images travel as `input_image` parts on a user message next to the tool outputs.
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, relative, resolve } from 'node:path';
import { responsesCreate } from '../shared/openai.ts';
import { pendingCalls, type Json } from './agent.ts';
import { run } from './workspace.ts';

export type FidelityEvent = { at: string; kind: 'message' | 'tool' | 'render' | 'error'; text: string };

export type FidelityTask = {
  root: string;
  /** The one file Astra may edit. */
  moduleFile: string;
  /** Product photos, repo-relative. */
  references: string[];
  subject: string;
  /** Render angles this part supports; the first is the hero view. */
  angles?: string[];
  /** Produces a PNG for the current module state; returns the file path. */
  render: (angle: string) => Promise<{ ok: boolean; file: string; log: string }>;
  log: (event: FidelityEvent) => void;
  maxTurns?: number;
};

const MODEL = 'gpt-6-astra';

const fn = (name: string, description: string, properties: Record<string, unknown>) => ({
  type: 'function',
  name,
  description,
  strict: true,
  parameters: { type: 'object', additionalProperties: false, properties, required: Object.keys(properties) },
});

const toolsFor = (angles: string[]) => [
  fn('read_module', 'Read the parametric Blender module you are refining.', {}),
  fn('write_module', 'Replace the whole module.', { content: { type: 'string' } }),
  fn('edit_module', 'Replace one exact occurrence of `find` with `replace` in the module.', { find: { type: 'string' }, replace: { type: 'string' } }),
  (angles: string[]) => fn('render', 'Rebuild the model from the module and render it. The image comes back with the result.', {
    angle: { type: 'string', enum: angles },
  }),
  fn('finish', 'Stop when the render is a faithful match at product-card size. Summarise what changed and what still differs.', {
    summary: { type: 'string' },
  }),
].map((tool) => (typeof tool === 'function' ? tool(angles) : tool));

export const dataUrl = (file: string) => {
  const mime = extname(file) === '.png' ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${readFileSync(file).toString('base64')}`;
};

function instructions(task: FidelityTask) {
  return [
    `You are Astra refining a procedural Blender model of "${task.subject}" so it looks like the real product in the photos.`,
    'You get the product photos first, then a render of the current model. Compare them like a product photographer: silhouette and proportions, face profile (flat/dished, edge rounding), core size and depth, printed graphics (position, size, count), colour and finish.',
    `Fix differences by editing ${task.moduleFile}. Prefer editing values in SPEC; change geometry code only when the shape needs a new feature. Keep the module importable (it is used by scripts/build-3d.py) and keep the function signature build(x, y, z, tag, mats=None, outward=1).`,
    'After every edit call render to see the result. State the remaining differences each time. Stop with finish when the render would pass for the product on a store card, or when further edits stop improving it.',
    'Be decisive: one or two focused edits per turn, then render.',
  ].join('\n');
}

export async function runFidelity(task: FidelityTask) {
  const maxTurns = task.maxTurns ?? 16;
  const modulePath = resolve(task.root, task.moduleFile);
  const angles = task.angles ?? ['front', 'side'];
  const tools = toolsFor(angles);
  const log = (kind: FidelityEvent['kind'], text: string) => task.log({ at: new Date().toISOString(), kind, text });
  const request = (extra: Record<string, unknown>) =>
    responsesCreate({ model: MODEL, reasoning: { effort: 'medium' }, tools, truncation: 'auto', ...extra });

  const first = await task.render(angles[0]);
  log('render', first.ok ? `initial render ${relative(task.root, first.file)}` : `initial render failed: ${first.log.slice(-800)}`);
  const content: Json[] = [
    { type: 'input_text', text: `Product photos of ${task.subject}:` },
    ...task.references.map((file) => ({ type: 'input_image', image_url: dataUrl(resolve(task.root, file)), detail: 'high' })),
    { type: 'input_text', text: `Current render of the model (${angles[0]} view). Other angles you can request: ${angles.join(', ')}.` },
    ...(first.ok ? [{ type: 'input_image', image_url: dataUrl(first.file), detail: 'high' }] : [{ type: 'input_text', text: `Render failed:\n${first.log.slice(-1500)}` }]),
    { type: 'input_text', text: `Module source:\n\n${readFileSync(modulePath, 'utf8')}` },
  ];
  let response = await request({ instructions: instructions(task), input: [{ role: 'user', content }] });

  for (let turn = 1; turn <= maxTurns; turn++) {
    const { messages, calls } = pendingCalls(response);
    messages.forEach((text) => log('message', text));
    const outputs: Json[] = [];
    const images: Json[] = [];
    let finished: string | undefined;
    for (const call of calls) {
      if (call.type !== 'function_call') continue;
      const args: Json = JSON.parse(call.arguments || '{}');
      let output = '';
      try {
        switch (call.name) {
          case 'read_module':
            output = readFileSync(modulePath, 'utf8');
            break;
          case 'write_module':
            writeFileSync(modulePath, args.content);
            output = `Wrote ${task.moduleFile} (${args.content.length} chars).`;
            log('tool', 'write_module');
            break;
          case 'edit_module': {
            const text = readFileSync(modulePath, 'utf8');
            const count = text.split(args.find).length - 1;
            if (count !== 1) output = `Error: \`find\` matches ${count} times; it must match exactly once.`;
            else {
              writeFileSync(modulePath, text.replace(args.find, () => args.replace));
              output = 'Edited.';
            }
            log('tool', `edit_module ${String(args.find).slice(0, 80).replace(/\n/g, ' ')}`);
            break;
          }
          case 'render': {
            const result = await task.render(angles.includes(args.angle) ? args.angle : angles[0]);
            log('render', result.ok ? `render ${args.angle} ok` : `render failed: ${result.log.slice(-600)}`);
            output = result.ok ? `Rendered ${args.angle}. The image follows.` : `Render failed:\n${result.log.slice(-2000)}`;
            if (result.ok) images.push({ role: 'user', content: [{ type: 'input_image', image_url: dataUrl(result.file), detail: 'high' }] });
            break;
          }
          case 'finish':
            finished = String(args.summary ?? '');
            output = 'Done.';
            break;
          default:
            output = `Unknown tool ${call.name}.`;
        }
      } catch (error) {
        output = `Error: ${error instanceof Error ? error.message : String(error)}`;
        log('error', output);
      }
      outputs.push({ type: 'function_call_output', call_id: call.call_id, output });
    }
    // All tool outputs first, then the render images as a user message.
    const input: Json[] = [...outputs, ...images];
    if (finished !== undefined) {
      log('message', `finish: ${finished}`);
      return { summary: finished, turns: turn };
    }
    if (!calls.length) input.push({ role: 'user', content: 'Continue: edit the module and render, or call finish.' });
    const left = maxTurns - turn;
    if (left <= 3) input.push({ role: 'user', content: `${left} turns left. Wrap up and call finish.` });
    response = await request({ previous_response_id: response.id, input, ...(left <= 1 ? { tool_choice: { type: 'function', name: 'finish' } } : {}) });
  }
  const forced = pendingCalls(response).calls.find((call) => call.name === 'finish');
  const summary = forced ? String((JSON.parse(forced.arguments || '{}') as Json).summary ?? '') : 'Turn budget exhausted.';
  log('message', `finish (forced): ${summary}`);
  return { summary, turns: maxTurns };
}

/** Blender headless render helper for scripts/3d/render_wheel.py. */
export function blenderRender(root: string, script: string, outFile: string, angle: string) {
  const blender = process.env.BLENDER_PATH || '/Applications/Blender.app/Contents/MacOS/Blender';
  return run(root, blender, ['-b', '-P', script, '--', outFile, angle], { timeoutMs: 4 * 60_000 }).then((result) => ({
    ok: result.ok && result.output.includes('RENDERED'),
    file: outFile,
    log: result.output,
  }));
}
