// Astra refines a parametric Blender module against the product photos, then rebuilds the GLB.
// node --env-file-if-exists=.env --experimental-strip-types scripts/refine-3d.mjs [wheel|board] [maxTurns]
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { blenderRender, runFidelity } from '../agents/coding-agent/fidelity.ts';
import { run } from '../agents/coding-agent/workspace.ts';

const root = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
const photo = (name) => `public/media/products/${name}`;

const TARGETS = {
  wheel: {
    moduleFile: 'scripts/3d/street_wheel.py',
    renderScript: 'scripts/3d/render_wheel.py',
    subject: 'Evolve GTR Street Wheels (97mm, 76a), orange',
    references: [
      photo('aaf73a19d2ceda4d-Calikites-LastMilesSF-Evolve-GTR-Street-Wheels-97-Orange_4d2b3253-c1ae-44d2-9f08-2e683f535d68.jpg'),
      photo('799691ebce17255d-Calikites-LastMilesSF-Evolve-GTR-Street-Wheels-97-Black_9d815cd0-00b1-4ead-a3d9-cd1dc1f850c1.jpg'),
    ],
  },
  board: {
    moduleFile: 'scripts/3d/board.py',
    renderScript: 'scripts/3d/render_board.py',
    subject: 'Evolve GTR Series 2 Bamboo All Terrain electric skateboard: bamboo deck, black CNC trucks, belt-drive motors, 7 inch all-terrain wheels',
    references: [
      photo('735adee2d353c5fc-Calikites-LastMileSF-Evolve-Skateboards-Electric-Skateboard-GTR-Series-2-Bamboo-AT-01_f511355e-9507-49c1-a459-500de2c4580c.jpg'),
      photo('dd31b99b31b747ae-Calikites-LastMileSF-Evolve-Skateboards-Electric-Skateboard-GTR-Series-2-Bamboo-AT-02_fb139e6e-3fc7-4e26-b54a-522827f252e4.jpg'),
      photo('62da658e526a96f6-Calikites-LastMileSF-Evolve-Skateboards-Electric-Skateboard-GTR-Series-2-Bamboo-AT-03_a8962139-d4b4-420b-9492-d357af8b3547.jpg'),
      photo('62dbd43dd44f2fb5-Calikites-LastMileSF-Evolve-Skateboards-Electric-Skateboard-GTR-Series-2-Bamboo-AT-04_9e726aaf-090d-45b4-a214-6e78f4ca0708.jpg'),
    ],
    angles: ['front', 'side', 'top'],
  },
};

const name = process.argv[2] || 'wheel';
const target = TARGETS[name];
if (!target) throw new Error(`Unknown target ${name}. Use: ${Object.keys(TARGETS).join(', ')}`);

const outDir = `${root}/work/renders`;
mkdirSync(outDir, { recursive: true });
let shot = 0;

const result = await runFidelity({
  root,
  moduleFile: target.moduleFile,
  subject: target.subject,
  references: target.references,
  angles: target.angles,
  render: (angle) => blenderRender(root, target.renderScript, `${outDir}/${name}-${String(++shot).padStart(2, '0')}-${angle}.png`, angle),
  log: (event) => console.log(`[${event.kind}] ${event.text}`),
  maxTurns: Number(process.argv[3]) || 14,
});
console.log(`Fidelity loop finished after ${result.turns} turns: ${result.summary}`);

const blender = process.env.BLENDER_PATH || '/Applications/Blender.app/Contents/MacOS/Blender';
const build = await run(root, blender, ['-b', '-P', 'scripts/build-3d.py', '--', `${root}/public/media/3d/evolve-gtr.glb`], { timeoutMs: 6 * 60_000 });
console.log(build.ok ? build.output.split('\n').filter((line) => line.startsWith('WROTE')).join('\n') : `GLB rebuild failed:\n${build.output.slice(-1500)}`);
