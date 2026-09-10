'use client';

import { useEffect, useRef, useState } from 'react';
import type { FeedbackPoint } from '@/agents/feedback-agent/embed.ts';

export type MapGroup = { index: number; title: string; priority: number };

type Props = {
  points: FeedbackPoint[];
  groups: Map<string, MapGroup>; // feedbackId -> Astra opportunity; absent = unjudged or set aside
  judged: boolean; // prioritization has arrived: grouped points become stars, the rest stay dim
  selected: Set<string>;
  labels: Map<string, string>;
  onToggle: (id: string) => void;
  onHover?: (id?: string) => void;
};

export function groupColor(index: number, alpha = 1) {
  return `hsla(${(index * 47 + 150) % 360} 70% 62% / ${alpha})`;
}

const TILT = 0.42;
const FOCAL = 3.2;
const BATCH_GAP_MS = 650;
const RISE_MS = 700;

// ponytail: points arrive 2-5 at a time; a re-run after judging makes the stars light up batch by batch.
function scheduleArrivals(ids: string[], born: Map<string, number>) {
  born.clear();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let at = 0;
  for (let index = 0; index < ids.length;) {
    const batch = ids.slice(index, index + 2 + Math.floor(Math.random() * 4));
    timers.push(
      setTimeout(
        () => batch.forEach((id) => born.set(id, performance.now())),
        at,
      ),
    );
    index += batch.length;
    at += BATCH_GAP_MS;
  }
  return () => timers.forEach(clearTimeout);
}

export function FeedbackMap({
  points,
  groups,
  judged,
  selected,
  labels,
  onToggle,
  onHover,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<string>();
  const hoveredRef = useRef<string | undefined>(undefined);
  const angle = useRef(0);
  const born = useRef(new Map<string, number>());

  useEffect(
    () =>
      scheduleArrivals(
        points.map((point) => point.id),
        born.current,
      ),
    [points, judged],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frame = 0;

    const draw = () => {
      const now = performance.now();
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = '#05080a';
      context.fillRect(0, 0, width, height);
      const nebula = context.createRadialGradient(
        width * 0.5,
        height * 0.45,
        0,
        width * 0.5,
        height * 0.45,
        Math.max(width, height) * 0.55,
      );
      nebula.addColorStop(0, 'rgba(72, 96, 84, 0.28)');
      nebula.addColorStop(1, 'rgba(72, 96, 84, 0)');
      context.fillStyle = nebula;
      context.fillRect(0, 0, width, height);
      angle.current += hoveredRef.current ? 0.0008 : 0.0035;
      const cos = Math.cos(angle.current);
      const sin = Math.sin(angle.current);
      const radiusX = width * 0.4;
      const radiusY = height * 0.4;
      const centerX = width / 2;
      const centerY = height / 2;

      const projected = points.flatMap((point, order) => {
        const bornAt = born.current.get(point.id);
        if (bornAt === undefined) return [];
        const t = Math.min(1, (now - bornAt) / RISE_MS);
        const rise = 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2); // ease-out-back
        const rx = point.x * cos + point.z * sin;
        const rz = -point.x * sin + point.z * cos;
        const ry = point.y * Math.cos(TILT) - rz * Math.sin(TILT);
        const depth = point.y * Math.sin(TILT) + rz * Math.cos(TILT);
        const scale = FOCAL / (FOCAL + depth);
        return [
          {
            id: point.id,
            order,
            sx: centerX + rx * radiusX * scale,
            sy: centerY - ry * radiusY * scale,
            scale,
            depth,
            rise: Math.max(0, rise),
            t,
          },
        ];
      });

      // Faint spokes from each star to its group centroid.
      const centroids = new Map<number, { x: number; y: number; n: number }>();
      for (const item of projected) {
        const group = groups.get(item.id);
        if (!group) continue;
        const centroid = centroids.get(group.index) ?? { x: 0, y: 0, n: 0 };
        centroids.set(group.index, {
          x: centroid.x + item.sx,
          y: centroid.y + item.sy,
          n: centroid.n + 1,
        });
      }
      context.lineWidth = 1;
      for (const item of projected) {
        const group = groups.get(item.id);
        const centroid = group && centroids.get(group.index);
        if (!group || !centroid || centroid.n < 2) continue;
        context.strokeStyle = groupColor(group.index, 0.18 * item.t);
        context.beginPath();
        context.moveTo(item.sx, item.sy);
        context.lineTo(centroid.x / centroid.n, centroid.y / centroid.n);
        context.stroke();
      }

      let nearest: { id: string; distance: number } | undefined;
      for (const item of [...projected].sort((a, b) => b.depth - a.depth)) {
        const group = groups.get(item.id);
        const star = judged && group;
        const twinkle = 0.85 + 0.15 * Math.sin(now / 420 + item.order * 1.7);
        const size =
          (star ? (3 + (group.priority / 100) * 6) * twinkle : 3.2) *
          item.scale *
          item.rise;
        const isSelected = selected.has(item.id);

        if (star) {
          const halo = context.createRadialGradient(
            item.sx,
            item.sy,
            0,
            item.sx,
            item.sy,
            size * 4.5,
          );
          halo.addColorStop(0, groupColor(group.index, 0.55 * item.t));
          halo.addColorStop(0.4, groupColor(group.index, 0.18 * item.t));
          halo.addColorStop(1, groupColor(group.index, 0));
          context.fillStyle = halo;
          context.beginPath();
          context.arc(item.sx, item.sy, size * 4.5, 0, Math.PI * 2);
          context.fill();
          context.fillStyle = `rgba(255, 250, 235, ${0.95 * item.t * twinkle})`;
        } else {
          context.fillStyle = `rgba(150, 165, 158, ${(judged ? 0.22 : 0.35) * item.t})`;
        }
        context.beginPath();
        context.arc(item.sx, item.sy, size, 0, Math.PI * 2);
        context.fill();

        if (isSelected || hoveredRef.current === item.id) {
          context.lineWidth = isSelected ? 1.5 : 1;
          context.strokeStyle = `rgba(255, 255, 255, ${isSelected ? 0.9 : 0.5})`;
          context.beginPath();
          context.arc(item.sx, item.sy, size + 5, 0, Math.PI * 2);
          context.stroke();
        }
        if (mouse.current) {
          const distance = Math.hypot(
            item.sx - mouse.current.x,
            item.sy - mouse.current.y,
          );
          if (distance < size + 9 && (!nearest || distance < nearest.distance))
            nearest = { id: item.id, distance };
        }
      }

      const nextHover = nearest?.id;
      if (nextHover !== hoveredRef.current) {
        hoveredRef.current = nextHover;
        setHovered(nextHover);
        onHover?.(nextHover);
      }
      if (nextHover) {
        const item = projected.find((candidate) => candidate.id === nextHover)!;
        const text = `${nextHover.replace('shopper-feedback-', '#')} · ${labels.get(nextHover) ?? ''}`;
        context.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
        const textWidth = context.measureText(text).width;
        const boxX = Math.min(
          Math.max(item.sx - textWidth / 2 - 8, 4),
          width - textWidth - 20,
        );
        const boxY = item.sy - 36 < 4 ? item.sy + 18 : item.sy - 36;
        context.fillStyle = 'rgba(243, 245, 239, 0.94)';
        context.fillRect(boxX, boxY, textWidth + 16, 22);
        context.fillStyle = '#15231e';
        context.fillText(text, boxX + 8, boxY + 15);
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [points, groups, judged, selected, labels, onHover]);

  return (
    <canvas
      aria-label="Feedback embedding map"
      className="feedback-map"
      onClick={() => hovered && onToggle(hovered)}
      onMouseLeave={() => (mouse.current = null)}
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        mouse.current = {
          x: event.clientX - rect.left,
          y: event.clientY - rect.top,
        };
      }}
      ref={canvasRef}
      style={{ cursor: hovered ? 'pointer' : 'default' }}
    />
  );
}
