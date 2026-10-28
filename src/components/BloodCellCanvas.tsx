import React, { useEffect, useRef } from 'react';

interface BloodCellCanvasProps {
  reducedMotionOverride?: boolean;
}

interface CellEntity {
  x: number;
  y: number;
  z: number; // 0.25 (far) .. 1.0 (near)
  radius: number;
  rotation: number;
  rotationSpeed: number;
  tiltPhase: number;
  tiltSpeed: number;
  vx: number;
  vy: number;
  spriteIndex: number;
  opacity: number;
}

interface MicroParticle {
  x: number;
  y: number;
  z: number;
  size: number;
  vx: number;
  vy: number;
  alpha: number;
}

/**
 * Pre-renders realistic 3D-shaded biconcave red blood cell sprites at varying
 * depth-of-field blur levels so the 60fps loop remains lightweight and silky smooth.
 */
function createErythrocyteSprite(blurPx: number, tintVariant: number): HTMLCanvasElement {
  const size = 180;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d');
  if (!ctx) return off;

  const cx = size / 2;
  const cy = size / 2;
  const rx = 56;
  const ry = 42;

  if (blurPx > 0) {
    ctx.filter = `blur(${blurPx}px)`;
  }

  // Outer 3D torus body gradient
  const bodyGrad = ctx.createRadialGradient(
    cx - rx * 0.28,
    cy - ry * 0.3,
    rx * 0.08,
    cx,
    cy,
    rx * 1.08
  );

  if (tintVariant === 0) {
    bodyGrad.addColorStop(0, 'rgba(248, 113, 113, 0.92)');
    bodyGrad.addColorStop(0.32, 'rgba(205, 32, 44, 0.90)');
    bodyGrad.addColorStop(0.72, 'rgba(118, 15, 31, 0.88)');
    bodyGrad.addColorStop(1, 'rgba(42, 6, 15, 0.72)');
  } else {
    bodyGrad.addColorStop(0, 'rgba(239, 68, 68, 0.86)');
    bodyGrad.addColorStop(0.36, 'rgba(175, 24, 38, 0.86)');
    bodyGrad.addColorStop(0.76, 'rgba(92, 11, 25, 0.84)');
    bodyGrad.addColorStop(1, 'rgba(30, 5, 12, 0.65)');
  }

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Biconcave central dimple depression
  const dimpleGrad = ctx.createRadialGradient(
    cx + rx * 0.06,
    cy + ry * 0.08,
    2,
    cx,
    cy,
    rx * 0.58
  );
  dimpleGrad.addColorStop(0, 'rgba(34, 4, 11, 0.88)');
  dimpleGrad.addColorStop(0.55, 'rgba(84, 11, 22, 0.52)');
  dimpleGrad.addColorStop(1, 'rgba(185, 28, 28, 0)');

  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.56, ry * 0.52, 0, 0, Math.PI * 2);
  ctx.fillStyle = dimpleGrad;
  ctx.fill();

  // Inner torus ridge specular sheen
  ctx.beginPath();
  ctx.ellipse(cx - rx * 0.06, cy - ry * 0.08, rx * 0.74, ry * 0.68, 0, Math.PI * 1.08, Math.PI * 1.88);
  ctx.strokeStyle = 'rgba(254, 202, 202, 0.28)';
  ctx.lineWidth = 3.2;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Subtle rim reflection on bottom-right edge
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx * 0.96, ry * 0.95, 0, 0.15, Math.PI * 0.78);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.11)';
  ctx.lineWidth = 1.4;
  ctx.stroke();

  ctx.restore();
  return off;
}

export const BloodCellCanvas: React.FC<BloodCellCanvasProps> = ({
  reducedMotionOverride = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let prefersReduced = mediaQuery.matches || reducedMotionOverride;

    const handleMotionChange = (e: MediaQueryListEvent) => {
      prefersReduced = e.matches || reducedMotionOverride;
    };
    mediaQuery.addEventListener('change', handleMotionChange);

    // Pre-bake 3 depth-of-field sprite layers (sharp mid, soft background, deep bokeh)
    const sprites = [
      createErythrocyteSprite(0.6, 0), // Crisp mid-foreground cell
      createErythrocyteSprite(3.2, 1), // Mid-depth cell passing behind glass
      createErythrocyteSprite(7.5, 1), // Deep background out-of-focus cell
    ];

    let width = window.innerWidth;
    let height = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // Scale cell count gracefully for mobile vs desktop so scene stays spacious & fast
    const cellCount = width < 768 ? 11 : 18;
    const particleCount = width < 768 ? 22 : 38;

    const cells: CellEntity[] = Array.from({ length: cellCount }, (_, idx) => {
      const depthTier = idx % 3; // 0 = deep, 1 = mid, 2 = near
      const z =
        depthTier === 0
          ? 0.28 + Math.random() * 0.2
          : depthTier === 1
            ? 0.52 + Math.random() * 0.22
            : 0.78 + Math.random() * 0.22;

      return {
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        radius: 38 + z * 68,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.0028,
        tiltPhase: Math.random() * Math.PI * 2,
        tiltSpeed: 0.004 + Math.random() * 0.004,
        vx: (0.08 + Math.random() * 0.16) * (Math.random() > 0.3 ? 1 : -1) * z,
        vy: (-0.06 - Math.random() * 0.12) * z,
        spriteIndex: depthTier === 0 ? 2 : depthTier === 1 ? 1 : 0,
        opacity: depthTier === 0 ? 0.24 : depthTier === 1 ? 0.36 : 0.46,
      };
    }).sort((a, b) => a.z - b.z);

    const particles: MicroParticle[] = Array.from({ length: particleCount }, () => {
      const z = 0.3 + Math.random() * 0.7;
      return {
        x: Math.random() * width,
        y: Math.random() * height,
        z,
        size: 0.8 + z * 1.5,
        vx: (Math.random() - 0.4) * 0.14 * z,
        vy: (-0.05 - Math.random() * 0.1) * z,
        alpha: 0.12 + Math.random() * 0.26,
      };
    });

    let targetMouseX = 0;
    let targetMouseY = 0;
    let smoothMouseX = 0;
    let smoothMouseY = 0;

    const onPointerMove = (e: MouseEvent) => {
      if (prefersReduced) return;
      targetMouseX = (e.clientX / width - 0.5) * 28;
      targetMouseY = (e.clientY / height - 0.5) * 20;
    };

    window.addEventListener('resize', resize);
    window.addEventListener('mousemove', onPointerMove, { passive: true });

    let rafId = 0;

    const renderFrame = () => {
      ctx.clearRect(0, 0, width, height);

      smoothMouseX += (targetMouseX - smoothMouseX) * 0.035;
      smoothMouseY += (targetMouseY - smoothMouseY) * 0.035;

      // Subtle drifting plasma particles
      for (const p of particles) {
        if (!prefersReduced) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < -20) p.x = width + 20;
          if (p.x > width + 20) p.x = -20;
          if (p.y < -20) p.y = height + 20;
          if (p.y > height + 20) p.y = -20;
        }

        const px = p.x + smoothMouseX * p.z * 0.5;
        const py = p.y + smoothMouseY * p.z * 0.5;

        ctx.beginPath();
        ctx.arc(px, py, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(248, 205, 212, ${p.alpha})`;
        ctx.fill();
      }

      // 3D-shaded floating red blood cells
      for (const cell of cells) {
        if (!prefersReduced) {
          cell.x += cell.vx;
          cell.y += cell.vy;
          cell.rotation += cell.rotationSpeed;
          cell.tiltPhase += cell.tiltSpeed;

          const pad = cell.radius * 1.4;
          if (cell.x < -pad) cell.x = width + pad;
          if (cell.x > width + pad) cell.x = -pad;
          if (cell.y < -pad) cell.y = height + pad;
          if (cell.y > height + pad) cell.y = -pad;
        }

        const drawX = cell.x - smoothMouseX * cell.z;
        const drawY = cell.y - smoothMouseY * cell.z;
        const foreshortenY = 0.72 + Math.sin(cell.tiltPhase) * 0.2;

        ctx.save();
        ctx.globalAlpha = cell.opacity;
        ctx.translate(drawX, drawY);
        ctx.rotate(cell.rotation);
        ctx.scale(1, foreshortenY);
        const sprite = sprites[cell.spriteIndex];
        ctx.drawImage(
          sprite,
          -cell.radius,
          -cell.radius,
          cell.radius * 2,
          cell.radius * 2
        );
        ctx.restore();
      }

      if (!prefersReduced) {
        rafId = requestAnimationFrame(renderFrame);
      }
    };

    renderFrame();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      window.removeEventListener('mousemove', onPointerMove);
      mediaQuery.removeEventListener('change', handleMotionChange);
    };
  }, [reducedMotionOverride]);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0 overflow-hidden"
      aria-hidden="true"
    >
      {/* Deep Obsidian, Midnight Navy & Subtle Dark Burgundy Atmospheric Lighting */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(76, 11, 26, 0.34) 0%, rgba(12, 17, 32, 0.65) 45%, #06070B 100%)',
        }}
      />
      <div
        className="absolute -top-40 right-[-10%] w-[680px] h-[680px] rounded-full opacity-35 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(153, 27, 27, 0.26) 0%, rgba(15, 23, 42, 0.08) 65%, transparent 100%)',
        }}
      />
      <div
        className="absolute bottom-[-18%] left-[12%] w-[620px] h-[620px] rounded-full opacity-30 blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(20, 30, 58, 0.55) 0%, rgba(69, 10, 20, 0.18) 60%, transparent 100%)',
        }}
      />
      <canvas ref={canvasRef} className="absolute inset-0" />
      {/* Subtle Vignette Scrim to Guarantee WCAG AA Contrast */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 50%, transparent 45%, rgba(4, 5, 9, 0.62) 100%)',
        }}
      />
    </div>
  );
};
