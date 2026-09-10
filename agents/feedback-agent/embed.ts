import { embeddingsCreate } from '../shared/openai.ts';
import type { FeedbackRecord } from './fixtures.ts';

export type FeedbackPoint = { id: string; x: number; y: number; z: number };

// ponytail: PCA by power iteration with deflation; 20 x 1536 needs nothing heavier.
export function pca3(vectors: number[][]): [number, number, number][] {
  const n = vectors.length;
  const d = vectors[0]?.length ?? 0;
  const mean = Array.from(
    { length: d },
    (_, j) => vectors.reduce((sum, v) => sum + v[j], 0) / n,
  );
  const rows = vectors.map((v) => v.map((value, j) => value - mean[j]));
  const coords: [number, number, number][] = rows.map(() => [0, 0, 0]);
  let x = rows.map((row) => [...row]);
  for (let k = 0; k < 3; k++) {
    let axis = Array.from({ length: d }, (_, j) => Math.sin(j + k + 1));
    for (let iteration = 0; iteration < 40; iteration++) {
      const scores = x.map((row) =>
        row.reduce((sum, value, j) => sum + value * axis[j], 0),
      );
      const next = Array.from({ length: d }, (_, j) =>
        scores.reduce((sum, score, i) => sum + score * x[i][j], 0),
      );
      const norm = Math.hypot(...next) || 1;
      axis = next.map((value) => value / norm);
    }
    const scores = x.map((row) =>
      row.reduce((sum, value, j) => sum + value * axis[j], 0),
    );
    const scale = Math.max(...scores.map(Math.abs)) || 1;
    scores.forEach((score, i) => (coords[i][k] = score / scale));
    x = x.map((row, i) => row.map((value, j) => value - scores[i] * axis[j]));
  }
  return coords;
}

export async function embedFeedback(
  records: FeedbackRecord[],
): Promise<FeedbackPoint[]> {
  const vectors = await embeddingsCreate(
    records.map((record) => record.message),
  );
  return pca3(vectors).map(([x, y, z], i) => ({
    id: records[i].id ?? String(i),
    x,
    y,
    z,
  }));
}
