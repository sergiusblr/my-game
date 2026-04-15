import React, { useEffect, useRef, useState } from 'react';
import Matter from 'matter-js';
import { RiceColor, SortingMode, InitialLayout } from '../types';

interface GameCanvasProps {
  onGrainSorted?: (color: RiceColor) => void;
  sortingMode: SortingMode;
  initialGrainCount: number;
  initialLayout: InitialLayout;
}

const RICE_COLORS: Record<RiceColor, string> = {
  white: '#f8f9fa',
  black: '#212529',
  yellow: '#ffec99',
};

const RICE_STROKES: Record<RiceColor, string> = {
  white: '#dee2e6',
  black: '#000000',
  yellow: '#fcc419',
};

const GameCanvas: React.FC<GameCanvasProps> = ({ onGrainSorted, sortingMode, initialGrainCount, initialLayout }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Matter.Engine | null>(null);
  const mouseConstraintRef = useRef<Matter.MouseConstraint | null>(null);
  const grainsRef = useRef<Matter.Body[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

  useEffect(() => {
    if (!engineRef.current || !canvasRef.current) return;

    if (sortingMode === 'manual') {
      const mouse = Matter.Mouse.create(canvasRef.current);
      const mouseConstraint = Matter.MouseConstraint.create(engineRef.current, {
        mouse: mouse,
        constraint: {
          stiffness: 0.2,
          render: { visible: false }
        }
      });
      mouseConstraintRef.current = mouseConstraint;
      Matter.Composite.add(engineRef.current.world, mouseConstraint);
    } else {
      if (mouseConstraintRef.current) {
        Matter.Composite.remove(engineRef.current.world, mouseConstraintRef.current);
        mouseConstraintRef.current = null;
      }
    }
  }, [sortingMode]);

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0) return;

    const engine = Matter.Engine.create({
      gravity: { x: 0, y: 0 },
    });
    engineRef.current = engine;

    const runner = Matter.Runner.create();
    Matter.Runner.run(runner, engine);

    const thickness = 100;
    const walls = [
      Matter.Bodies.rectangle(dimensions.width / 2, -thickness / 2, dimensions.width, thickness, { isStatic: true }),
      Matter.Bodies.rectangle(dimensions.width / 2, dimensions.height + thickness / 2, dimensions.width, thickness, { isStatic: true }),
      Matter.Bodies.rectangle(-thickness / 2, dimensions.height / 2, thickness, dimensions.height, { isStatic: true }),
      Matter.Bodies.rectangle(dimensions.width + thickness / 2, dimensions.height / 2, thickness, dimensions.height, { isStatic: true }),
    ];
    Matter.Composite.add(engine.world, walls);

    const grainCount = initialGrainCount;
    const centerX = dimensions.width / 2;
    const centerY = dimensions.height / 2;

    const spawnGrain = () => {
      const colorKeys = Object.keys(RICE_COLORS) as RiceColor[];
      const color = colorKeys[Math.floor(Math.random() * colorKeys.length)];
      
      let x, y;
      if (initialLayout === 'pile') {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.pow(Math.random(), 1.5) * 120;
        x = centerX + Math.cos(angle) * radius;
        y = centerY + Math.sin(angle) * radius;
      } else {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.pow(Math.random(), 0.5) * 180;
        x = centerX + Math.cos(angle) * radius;
        y = centerY + Math.sin(angle) * radius;
      }
      
      const w = 12 + Math.random() * 5;
      let h = 6 + Math.random() * 3;
      if (color === 'black') {
        h *= 0.8; // 20% thinner
      }
      const chamferRadius = h / 2;

      const grain = Matter.Bodies.rectangle(x, y, w, h, {
        chamfer: { radius: chamferRadius },
        friction: 0.2,
        restitution: 0.1,
        frictionAir: 0.08,
      });
      
      (grain as any).riceColor = color;
      (grain as any).isSorted = false;
      (grain as any).z = Math.random();
      (grain as any).grainWidth = w;
      (grain as any).grainHeight = h;
      (grain as any).chamferRadius = chamferRadius;
      
      Matter.Body.setAngle(grain, Math.random() * Math.PI);
      return grain;
    };

    if (initialLayout === 'pile') {
      // Pouring effect
      let spawned = 0;
      const batchSize = 5;
      const interval = setInterval(() => {
        const batch: Matter.Body[] = [];
        for (let i = 0; i < batchSize && spawned < grainCount; i++) {
          batch.push(spawnGrain());
          spawned++;
        }
        Matter.Composite.add(engine.world, batch);
        if (spawned >= grainCount) clearInterval(interval);
      }, 30);
    } else {
      const allGrains: Matter.Body[] = [];
      for (let i = 0; i < grainCount; i++) {
        allGrains.push(spawnGrain());
      }
      Matter.Composite.add(engine.world, allGrains);
    }

    // Rendering loop
    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    const render = () => {
      ctx.clearRect(0, 0, dimensions.width, dimensions.height);

      drawTargetAreas(ctx, dimensions);
      drawRipples(ctx);

      const bodies = Matter.Composite.allBodies(engine.world);
      
      // Update Z-physics (simulated height)
      bodies.forEach((body) => {
        if (body.isStatic) return;
        
        const b = body as any;
        if (!b.z) b.z = 0;
        if (!b.vz) b.vz = 0;

        // Target Z logic
        let targetZ = 0;
        if (b.isSorting) {
          // Fall to surface before moving
          targetZ = 0;
          if (b.z < 0.05) {
            b.hasReachedSurface = true;
          }
        } else {
          // Find "floor" - the highest grain underneath this one
          let highestUnder = -0.1;
          for (let other of bodies) {
            if (other === body || other.isStatic || (other as any).isSorting) continue;
            
            const dx = body.position.x - other.position.x;
            const dy = body.position.y - other.position.y;
            const distSq = dx * dx + dy * dy;
            
            if (distSq < 150 && (other as any).z < b.z) {
              highestUnder = Math.max(highestUnder, (other as any).z);
            }
          }
          targetZ = Math.max(0, highestUnder + 0.1);
        }

        // Apply Z-gravity and smoothing
        const az = (targetZ - b.z) * 0.1;
        b.vz = b.vz * 0.8 + az;
        b.z += b.vz;
        
        // Clamp Z
        if (b.z < 0) {
          b.z = 0;
          b.vz = 0;
        }
      });

      // Sort bodies by Z for visual layering
      const sortedBodies = [...bodies].sort((a, b) => {
        if (a.isStatic) return -1;
        if (b.isStatic) return 1;
        return ((a as any).z || 0) - ((b as any).z || 0);
      });

      sortedBodies.forEach((body) => {
        if (body.isStatic) return;

        if ((body as any).isSorting && (body as any).hasReachedSurface) {
          const target = (body as any).sortTarget;
          const dx = target.x - body.position.x;
          const dy = target.y - body.position.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance > 5) {
            // Gentle pull towards target
            const forceMagnitude = 0.0006 * body.mass;
            Matter.Body.applyForce(body, body.position, {
              x: (dx / distance) * forceMagnitude,
              y: (dy / distance) * forceMagnitude,
            });
            // Add some damping to prevent orbiting
            Matter.Body.setVelocity(body, {
              x: body.velocity.x * 0.94,
              y: body.velocity.y * 0.94,
            });
          } else {
            (body as any).isSorting = false;
            (body as any).hasReachedSurface = false;
          }
        }

        const { x, y } = body.position;
        const angle = body.angle;
        const color = (body as any).riceColor as RiceColor;

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;

        const w = (body as any).grainWidth || 14;
        const h = (body as any).grainHeight || 7;
        const r = (body as any).chamferRadius || 3.5;
        const z = (body as any).z || 0;
        
        // Adjust scale and shadow based on Z to simulate height
        const scale = 1 + z * 0.1;
        ctx.scale(scale, scale);

        const gradient = ctx.createLinearGradient(-w/2, -h/2, w/2, h/2);
        gradient.addColorStop(0, RICE_COLORS[color]);
        gradient.addColorStop(1, adjustColor(RICE_COLORS[color], -10));

        ctx.shadowColor = `rgba(0, 0, 0, ${0.1 + z * 0.1})`;
        ctx.shadowBlur = 4 + z * 4;
        ctx.shadowOffsetY = 2 + z * 3;

        ctx.beginPath();
        ctx.roundRect(-w / 2, -h / 2, w, h, r);
        ctx.fillStyle = gradient;
        ctx.fill();
        
        ctx.strokeStyle = RICE_STROKES[color];
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Subtle highlight
        ctx.beginPath();
        ctx.ellipse(-w/4, -h/4, w/6, h/6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
        ctx.fill();

        ctx.restore();
      });

      animationId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationId);
      Matter.Engine.clear(engine);
      Matter.Runner.stop(runner);
    };
  }, [dimensions]);

  const adjustColor = (hex: string, amt: number) => {
    let usePound = false;
    if (hex[0] === "#") {
      hex = hex.slice(1);
      usePound = true;
    }
    const num = parseInt(hex, 16);
    let r = (num >> 16) + amt;
    if (r > 255) r = 255; else if (r < 0) r = 0;
    let b = ((num >> 8) & 0x00FF) + amt;
    if (b > 255) b = 255; else if (b < 0) b = 0;
    let g = (num & 0x0000FF) + amt;
    if (g > 255) g = 255; else if (g < 0) g = 0;
    return (usePound ? "#" : "") + (g | (b << 8) | (r << 16)).toString(16).padStart(6, '0');
  };

  const drawTargetAreas = (ctx: CanvasRenderingContext2D, dim: { width: number; height: number }) => {
    const areas = [
      { color: 'white', x: dim.width * 0.2, y: dim.height * 0.2, fill: 'rgba(248, 249, 250, 0.4)' },
      { color: 'black', x: dim.width * 0.8, y: dim.height * 0.2, fill: 'rgba(33, 37, 41, 0.1)' },
      { color: 'yellow', x: dim.width * 0.5, y: dim.height * 0.8, fill: 'rgba(255, 236, 153, 0.4)' },
    ];

    areas.forEach((area) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(area.x, area.y, 60, 0, Math.PI * 2);
      ctx.fillStyle = area.fill;
      ctx.fill();
      ctx.setLineDash([5, 5]);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.stroke();
      ctx.restore();
    });
  };

  const drawRipples = (ctx: CanvasRenderingContext2D) => {
    const now = performance.now();
    // Use a ref or functional update to avoid stale ripples in the render loop
    // Actually, since this is called inside the render loop which is inside useEffect,
    // we should manage ripples carefully.
    
    ripples.forEach(ripple => {
      const age = now - ripple.id;
      if (age > 1000) return;
      
      const progress = age / 1000;
      const radius = progress * 100;
      const opacity = 1 - progress;

      ctx.save();
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(0, 0, 0, ${opacity * 0.1})`;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    });
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!engineRef.current || !canvasRef.current) return;
    if (sortingMode === 'manual') return;

    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    setRipples(prev => [...prev.filter(r => performance.now() - r.id < 1000), { x: mouseX, y: mouseY, id: performance.now() }]);

    // Find the grain under the click
    const bodies = Matter.Composite.allBodies(engineRef.current.world);
    const clickedGrain = bodies
      .filter(body => !body.isStatic && !(body as any).isSorting)
      .find(body => Matter.Bounds.contains(body.bounds, { x: mouseX, y: mouseY }));

    if (clickedGrain) {
      const color = (clickedGrain as any).riceColor as RiceColor;
      const targets: Record<RiceColor, { x: number; y: number }> = {
        white: { x: dimensions.width * 0.2, y: dimensions.height * 0.2 },
        black: { x: dimensions.width * 0.8, y: dimensions.height * 0.2 },
        yellow: { x: dimensions.width * 0.5, y: dimensions.height * 0.8 },
      };
      const target = targets[color];
      
      // Check if already in target area (within 80px radius)
      const dx = clickedGrain.position.x - target.x;
      const dy = clickedGrain.position.y - target.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist > 80) {
        sortGrain(clickedGrain, target);
      }
    }
  };

  const sortGrain = (grain: Matter.Body, target: { x: number; y: number }) => {
    const color = (grain as any).riceColor as RiceColor;
    
    // Add some randomness to the target pile so they don't all stack on one point
    const finalX = target.x + (Math.random() - 0.5) * 80;
    const finalY = target.y + (Math.random() - 0.5) * 80;

    (grain as any).isSorting = true;
    (grain as any).hasReachedSurface = false;
    (grain as any).sortTarget = { x: finalX, y: finalY };

    // If already on surface, mark it
    if ((grain as any).z < 0.1) {
      (grain as any).hasReachedSurface = true;
    }

    // Initial little "kick" to start moving
    const dx = finalX - grain.position.x;
    const dy = finalY - grain.position.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    Matter.Body.setVelocity(grain, {
      x: (dx / dist) * 5,
      y: (dy / dist) * 5,
    });

    if (onGrainSorted) onGrainSorted(color);
  };

  return (
    <canvas
      ref={canvasRef}
      width={dimensions.width}
      height={dimensions.height}
      onClick={handleCanvasClick}
      className="cursor-pointer"
    />
  );
};

export default GameCanvas;
