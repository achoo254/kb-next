/**
 * The 3D Universe of board C09 (React Three Fiber), loaded lazily by the Universe screen once the 2D scene is on
 * screen. It draws what the 2D scene draws, at the same places and in the same colours: the three orbits with their
 * bloom and the crystals' colours, the guides and spokes, the dots running on the orbits, the orb and the crystals as
 * sprites of their own art. The orbits are tilted towards the viewer, so dots and rings pass behind the orb and in
 * front of it. The camera is the board's (orthographic, 1440×900): the HTML labels and links stay on top, in place.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { SCENE_CENTRE, SCENE_DOTS, SCENE_GUIDES, SCENE_ORBITS } from '../layout/universe-scene';
import type { OrbitDot } from '../ui/orbit-field';
import { cssToken } from '../ui/css-token';
import { FpsGuard } from './fps-guard';
import { type Ellipse, arcTable, depthAt, floatOffset, lapProgress, parseEllipse, pointAtProgress, pointOn, tintWeight } from './orbit-geometry';
import type { Fallback2dReason } from './three-support';

/** A crystal of the scene: its art as the 2D scene draws it (source and CSS filter), centre, and orbit colour. */
export interface CrystalSprite {
  key: string;
  src: string;
  /** The computed CSS `filter` of the 2D art (hue, glow), applied when the texture is drawn. */
  filter: string;
  cx: number;
  cy: number;
  /** The colour the orbits take near it (a CSS colour). */
  tint: string;
  /** `performance.now()` at which its 2D float started (its own time 0), so the sprite bobs with the HTML label. */
  floatOrigin: number;
}

/** `performance.now()` at which the 2D dots and the orb's turn started, so the 3D scene goes on from where they are. */
export interface SceneClock {
  dots: number;
  orb: number;
}

export interface Universe3dLayerProps {
  crystals: readonly CrystalSprite[];
  orb: { src: string; filter: string };
  clock: SceneClock;
  /** The crystal under the pointer or focus (it grows like the 2D hover). */
  hovered: string | null;
  /** The first 3D frame is on screen. */
  onReady: () => void;
  /** The scene cannot keep up or lost its GPU: go back to 2D for good. */
  onFallback: (reason: Fallback2dReason) => void;
  /** The latest measured frame rate, about four times a second. */
  onFps?: (fps: number) => void;
}

const WIDTH = 1440;
const HEIGHT = 900;
/** The 140px crystal draws its art 168px wide (inset -14px); the glow of its filter needs room around it. */
const CRYSTAL_ART = 168;
const CRYSTAL_PAD = 32;
const ORB_SIZE = 340;
const ORB_PAD = 24;
const TINT_RADIUS = 125;
const SEGMENTS = 360;

type Stop = readonly [number, `--${string}`, number];
/** The gradients of the orbit strokes (orbit-field.tsx): horizontal for two rings, vertical for the wide one. */
const H_STOPS: readonly Stop[] = [
  [0, '--violet-700', 0.15],
  [0.2, '--violet-600', 0.6],
  [0.45, '--violet-400', 0.95],
  [0.6, '--violet-300', 1],
  [0.85, '--indigo-400', 0.85],
  [1, '--indigo-500', 0.4],
];
const V_STOPS: readonly Stop[] = [
  [0, '--violet-500', 0.55],
  [0.5, '--violet-300', 0.95],
  [1, '--violet-400', 0.7],
];
const DOT_TONES: Record<OrbitDot['tone'], readonly [`--${string}`, `--${string}`]> = {
  sky: ['--sky-50', '--sky-300'],
  violet: ['--violet-100', '--violet-400'],
  lavender: ['--violet-50', '--violet-300'],
  cyan: ['--cyan-100', '--cyan-400'],
};

function tokenColour(name: `--${string}`): THREE.Color {
  return new THREE.Color(cssToken(name) || 'white');
}

/** Colour and opacity of a gradient at `t` (0–1). */
function gradientAt(stops: readonly Stop[], t: number): { colour: THREE.Color; alpha: number } {
  const clamped = Math.min(1, Math.max(0, t));
  const upper = stops.findIndex(([offset]) => offset >= clamped);
  const hi = stops[Math.max(0, upper)] ?? stops[stops.length - 1];
  const lo = stops[Math.max(0, upper - 1)] ?? hi;
  if (!hi || !lo) return { colour: new THREE.Color('white'), alpha: 1 };
  const span = hi[0] - lo[0];
  const k = span > 0 ? (clamped - lo[0]) / span : 0;
  return { colour: tokenColour(lo[1]).lerp(tokenColour(hi[1]), k), alpha: lo[2] + (hi[2] - lo[2]) * k };
}

const RIBBON_VERTEX = /* glsl */ `
  attribute vec4 rgba;
  attribute float side;
  varying vec4 vColour;
  varying float vSide;
  void main() {
    vColour = rgba;
    vSide = side;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const RIBBON_FRAGMENT = /* glsl */ `
  uniform float falloff;
  uniform float opacity;
  varying vec4 vColour;
  varying float vSide;
  void main() {
    float edge = pow(1.0 - abs(vSide), falloff);
    gl_FragColor = vec4(vColour.rgb, vColour.a * edge * opacity);
  }
`;

function ribbonMaterial(falloff: number, opacity: number, additive: boolean): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: RIBBON_VERTEX,
    fragmentShader: RIBBON_FRAGMENT,
    uniforms: { falloff: { value: falloff }, opacity: { value: opacity } },
    transparent: true,
    depthWrite: false,
    // the board's y axis points down, so the bands face away from the camera: draw both faces
    side: THREE.DoubleSide,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

interface RibbonPoint {
  x: number;
  y: number;
  z: number;
  colour: THREE.Color;
  alpha: number;
}

/** A band of `width` px along the points (board coordinates, y down), coloured per point. */
function ribbonGeometry(points: readonly RibbonPoint[], width: number, closed: boolean): THREE.BufferGeometry {
  const count = points.length;
  const positions = new Float32Array(count * 2 * 3);
  const colours = new Float32Array(count * 2 * 4);
  const sides = new Float32Array(count * 2);
  points.forEach((point, i) => {
    const prev = points[closed ? (i - 1 + count) % count : Math.max(0, i - 1)] ?? point;
    const next = points[closed ? (i + 1) % count : Math.min(count - 1, i + 1)] ?? point;
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const length = Math.hypot(tx, ty) || 1;
    const nx = (-ty / length) * (width / 2);
    const ny = (tx / length) * (width / 2);
    [1, -1].forEach((side, s) => {
      const v = i * 2 + s;
      positions.set([point.x + nx * side, -(point.y + ny * side), point.z], v * 3);
      colours.set([point.colour.r, point.colour.g, point.colour.b, point.alpha], v * 4);
      sides[v] = side;
    });
  });
  const indices: number[] = [];
  const segments = closed ? count : count - 1;
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    const b = ((i + 1) % count) * 2;
    indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('rgba', new THREE.BufferAttribute(colours, 4));
  geometry.setAttribute('side', new THREE.BufferAttribute(sides, 1));
  geometry.setIndex(indices);
  return geometry;
}

/** Mixes the crystals' colours into an orbit point near them, as the 2D masks do. */
function tinted(base: { colour: THREE.Color; alpha: number }, x: number, y: number, tints: readonly { cx: number; cy: number; colour: THREE.Color }[]): { colour: THREE.Color; alpha: number } {
  let colour = base.colour;
  let alpha = base.alpha;
  for (const tint of tints) {
    const w = tintWeight(Math.hypot(x - tint.cx, y - tint.cy), TINT_RADIUS);
    if (w <= 0) continue;
    colour = colour.clone().lerp(tint.colour, w);
    alpha = Math.max(alpha, w);
  }
  return { colour, alpha };
}

function orbitPoints(ellipse: Ellipse, colourAt: (x: number, y: number) => { colour: THREE.Color; alpha: number }): RibbonPoint[] {
  return Array.from({ length: SEGMENTS }, (_, i) => {
    const { x, y } = pointOn(ellipse, (i / SEGMENTS) * 2 * Math.PI);
    return { x, y, z: depthAt(y, SCENE_CENTRE.y), ...colourAt(x, y) };
  });
}

/** A soft round glow (the dots' box-shadow, the orb's bloom) drawn once into a texture. */
function glowTexture(core: THREE.Color, glow: THREE.Color, coreShare: number): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, `#${core.getHexString()}`);
    gradient.addColorStop(coreShare, `#${core.getHexString()}`);
    gradient.addColorStop(Math.min(1, coreShare + 0.08), `#${glow.getHexString()}`);
    gradient.addColorStop(1, `#${glow.getHexString()}00`);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** An image drawn through the CSS filter of its 2D twin, with room for the glow, as a texture. */
async function filteredTexture(src: string, filter: string, size: number, pad: number): Promise<THREE.CanvasTexture> {
  const image = new Image();
  image.decoding = 'async';
  image.src = src;
  await image.decode();
  const scale = Math.min(2, window.devicePixelRatio || 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round((size + pad * 2) * scale);
  canvas.height = canvas.width;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2D canvas');
  ctx.filter = filter && filter !== 'none' ? filter : 'none';
  ctx.drawImage(image, pad * scale, pad * scale, size * scale, size * scale);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function Orbits({ crystals }: { crystals: readonly CrystalSprite[] }): ReactNode {
  const meshes = useMemo(() => {
    const tints = crystals.map((crystal) => ({ cx: crystal.cx, cy: crystal.cy, colour: new THREE.Color(crystal.tint) }));
    const bloomBase = tokenColour('--violet-500');
    const list: { geometry: THREE.BufferGeometry; material: THREE.ShaderMaterial }[] = [];
    SCENE_ORBITS.forEach((orbit) => {
      const ellipse = parseEllipse(orbit.d);
      const vertical = orbit.gradient === 'v';
      const stroke = orbitPoints(ellipse, (x, y) =>
        tinted(vertical ? gradientAt(V_STOPS, (y - 90) / 510) : gradientAt(H_STOPS, (x - 260) / 880), x, y, tints),
      );
      const bloom = orbitPoints(ellipse, (x, y) => tinted({ colour: bloomBase, alpha: 0.5 }, x, y, tints));
      list.push({ geometry: ribbonGeometry(bloom, 12, true), material: ribbonMaterial(1.6, 0.75, true) });
      list.push({ geometry: ribbonGeometry(stroke, (orbit.width ?? 1.6) + 1.2, true), material: ribbonMaterial(0.8, 1, false) });
    });
    const guideColour = tokenColour('--violet-400');
    SCENE_GUIDES.forEach((d) => {
      const points = orbitPoints(parseEllipse(d), () => ({ colour: guideColour, alpha: 0.4 }));
      // a faint line where the 2D scene draws a dotted one
      list.push({ geometry: ribbonGeometry(points, 1.4, true), material: ribbonMaterial(1, 0.35, false) });
    });
    const spoke = tokenColour('--violet-400');
    crystals.forEach((crystal) => {
      const mid = { x: (SCENE_CENTRE.x + crystal.cx) / 2, y: (SCENE_CENTRE.y + crystal.cy) / 2 };
      const points: RibbonPoint[] = [
        { x: SCENE_CENTRE.x, y: SCENE_CENTRE.y, z: -1, colour: spoke, alpha: 0.05 },
        { x: mid.x, y: mid.y, z: -1, colour: spoke, alpha: 0.4 },
        { x: crystal.cx, y: crystal.cy, z: -1, colour: spoke, alpha: 0.08 },
      ];
      list.push({ geometry: ribbonGeometry(points, 1.4, false), material: ribbonMaterial(0.5, 1, false) });
    });
    return list;
  }, [crystals]);

  useEffect(
    () => () => {
      meshes.forEach(({ geometry, material }) => {
        geometry.dispose();
        material.dispose();
      });
    },
    [meshes],
  );

  return (
    <>
      {meshes.map(({ geometry, material }, index) => (
        <mesh key={index} geometry={geometry} material={material} renderOrder={1} />
      ))}
    </>
  );
}

function Dots({ origin }: { origin: number }): ReactNode {
  const tables = useMemo(() => SCENE_ORBITS.map((orbit) => arcTable(parseEllipse(orbit.d))), []);
  const textures = useMemo(() => {
    const entries = Object.entries(DOT_TONES).map(([tone, [core, glow]]) => [tone, glowTexture(tokenColour(core), tokenColour(glow), 0.16)] as const);
    return new Map(entries);
  }, []);
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);

  useFrame(() => {
    const seconds = (performance.now() - origin) / 1000;
    SCENE_DOTS.forEach((dot, index) => {
      const sprite = sprites.current[index];
      const table = tables[dot.orbit];
      if (!sprite || !table) return;
      const { x, y } = pointAtProgress(table, lapProgress(seconds, dot.duration, dot.delay, dot.reverse));
      sprite.position.set(x, -y, depthAt(y, SCENE_CENTRE.y) + 2);
    });
  });

  return (
    <>
      {SCENE_DOTS.map((dot, index) => (
        <sprite
          key={index}
          ref={(sprite) => {
            sprites.current[index] = sprite;
          }}
          scale={[dot.size * 5, dot.size * 5, 1]}
          renderOrder={2}
        >
          <spriteMaterial map={textures.get(dot.tone) ?? null} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
        </sprite>
      ))}
    </>
  );
}

function Orb({ texture, origin }: { texture: THREE.Texture; origin: number }): ReactNode {
  const material = useRef<THREE.SpriteMaterial>(null);
  const bloom = useRef<THREE.SpriteMaterial>(null);
  const bloomTexture = useMemo(() => glowTexture(tokenColour('--violet-600'), tokenColour('--violet-600'), 0), []);
  useEffect(() => () => bloomTexture.dispose(), [bloomTexture]);
  useFrame(() => {
    const seconds = (performance.now() - origin) / 1000;
    // the 2D orb turns once in 120 s (clockwise) and breathes every 5 s
    if (material.current) material.current.rotation = -(seconds / 120) * 2 * Math.PI;
    if (bloom.current) bloom.current.opacity = 0.42 + 0.18 * Math.sin((seconds / 5) * 2 * Math.PI);
  });
  const size = ORB_SIZE + ORB_PAD * 2;
  return (
    <>
      <sprite position={[SCENE_CENTRE.x, -SCENE_CENTRE.y, -30]} scale={[520, 520, 1]} renderOrder={0}>
        <spriteMaterial ref={bloom} map={bloomTexture} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      {/* writes depth where it is opaque, so the far side of the orbits passes behind it */}
      <sprite position={[SCENE_CENTRE.x, -SCENE_CENTRE.y, 0]} scale={[size, size, 1]} renderOrder={0}>
        <spriteMaterial ref={material} map={texture} transparent alphaTest={0.35} />
      </sprite>
    </>
  );
}

function Crystals({ crystals, textures, hovered }: { crystals: readonly CrystalSprite[]; textures: readonly THREE.Texture[]; hovered: string | null }): ReactNode {
  const sprites = useRef<(THREE.Sprite | null)[]>([]);
  useFrame((_, delta) => {
    const now = performance.now();
    crystals.forEach((crystal, index) => {
      const sprite = sprites.current[index];
      if (!sprite) return;
      // bobs with the HTML label above it (same 6 s float, same start)
      sprite.position.y = -(crystal.cy + floatOffset(now - crystal.floatOrigin));
      const target = (CRYSTAL_ART + CRYSTAL_PAD * 2) * (crystal.key === hovered ? 1.08 : 1);
      const next = THREE.MathUtils.damp(sprite.scale.x, target, 12, delta);
      sprite.scale.set(next, next, 1);
    });
  });
  const size = CRYSTAL_ART + CRYSTAL_PAD * 2;
  return (
    <>
      {crystals.map((crystal, index) => (
        <sprite
          key={crystal.key}
          ref={(sprite) => {
            sprites.current[index] = sprite;
          }}
          position={[crystal.cx, -crystal.cy, 400]}
          scale={[size, size, 1]}
          renderOrder={5}
        >
          <spriteMaterial map={textures[index] ?? null} transparent depthTest={false} depthWrite={false} />
        </sprite>
      ))}
    </>
  );
}

/** Watches the frame rate, reports the first frame, and gives up on a slow device or a lost GPU. */
function Watch({ onReady, onFallback, onFps }: Pick<Universe3dLayerProps, 'onReady' | 'onFallback' | 'onFps'>): ReactNode {
  const guard = useMemo(() => new FpsGuard(), []);
  const frames = useRef(0);
  const done = useRef(false);
  const lastReport = useRef(0);
  const gl = useThree((state) => state.gl);

  useEffect(() => {
    const canvas = gl.domElement;
    const lost = (event: Event): void => {
      event.preventDefault();
      if (done.current) return;
      done.current = true;
      onFallback('context-lost');
    };
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onFallback]);

  useFrame(() => {
    if (done.current) return;
    const now = performance.now();
    frames.current += 1;
    // useFrame runs before the frame is drawn: the first one is on screen when the second starts
    if (frames.current === 2) onReady();
    if (guard.frame(now) === 'low') {
      done.current = true;
      onFallback('fps');
      return;
    }
    if (onFps && guard.fps > 0 && now - lastReport.current > 250) {
      lastReport.current = now;
      onFps(guard.fps);
    }
  });
  return null;
}

/** The 3D layer: loads the art, then renders until it hands back to 2D. Sized and placed like the 2D scene. */
export default function Universe3dLayer({ crystals, orb, clock, hovered, onReady, onFallback, onFps }: Universe3dLayerProps): ReactNode {
  const [art, setArt] = useState<{ orb: THREE.Texture; crystals: THREE.Texture[] } | null>(null);

  useEffect(() => {
    let live = true;
    let loaded: THREE.Texture[] = [];
    Promise.all([
      filteredTexture(orb.src, orb.filter, ORB_SIZE, ORB_PAD),
      ...crystals.map((crystal) => filteredTexture(crystal.src, crystal.filter, CRYSTAL_ART, CRYSTAL_PAD)),
    ])
      .then(([orbTexture, ...crystalTextures]) => {
        loaded = [orbTexture, ...crystalTextures];
        if (!live) {
          loaded.forEach((texture) => texture.dispose());
          return;
        }
        setArt({ orb: orbTexture, crystals: crystalTextures });
      })
      .catch(() => live && onFallback('load-failed'));
    return () => {
      live = false;
      loaded.forEach((texture) => texture.dispose());
    };
  }, [crystals, orb, onFallback]);

  if (!art) return null;
  return (
    <Canvas
      orthographic
      // the board's own pixels: x right, y up from the bottom edge; no lookAt (a rotation is given)
      camera={{ position: [WIDTH / 2, -HEIGHT / 2, 1000], rotation: [0, 0, 0], zoom: 1, near: 1, far: 3000 }}
      dpr={[1, 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      style={{ width: WIDTH, height: HEIGHT }}
      aria-hidden="true"
    >
      <Orbits crystals={crystals} />
      <Dots origin={clock.dots} />
      <Orb texture={art.orb} origin={clock.orb} />
      <Crystals crystals={crystals} textures={art.crystals} hovered={hovered} />
      <Watch onReady={onReady} onFallback={onFallback} onFps={onFps} />
    </Canvas>
  );
}
