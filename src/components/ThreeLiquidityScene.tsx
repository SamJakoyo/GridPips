import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { ChevronDown, ChevronUp, RotateCcw, X } from 'lucide-react';

interface ThreeLiquiditySceneProps {
  onExit: () => void;
}

type CameraPresetKey = 'overview' | 'vault' | 'fvg' | 'top';
type SessionPresetKey = 'newyork' | 'london' | 'asian';

const CAMERA_PRESETS: Record<
  CameraPresetKey,
  { label: string; pos: [number, number, number]; target: [number, number, number] }
> = {
  overview: { label: 'Overview', pos: [9.5, 6.2, 11.2], target: [0, 1.8, 0] },
  vault: { label: 'Order Block Core', pos: [4.2, 2.9, 5.1], target: [0, 2.0, 0] },
  fvg: { label: 'FVG Imbalance', pos: [-5.6, 3.6, 4.8], target: [0, 2.1, 0] },
  top: { label: 'Liquidity Map', pos: [0.01, 14.5, 2.8], target: [0, 0.5, 0] },
};

const SESSION_PALETTES: Record<
  SessionPresetKey,
  { label: string; bgHex: number; keyHex: number; skyHex: number; accentHex: number }
> = {
  newyork: {
    label: 'NY Killzone',
    bgHex: 0x0b101b,
    keyHex: 0xffe9c8,
    skyHex: 0x6ea8fe,
    accentHex: 0x38bdf8,
  },
  london: {
    label: 'London Open',
    bgHex: 0x0e141f,
    keyHex: 0xfff3de,
    skyHex: 0x5eead4,
    accentHex: 0x10b981,
  },
  asian: {
    label: 'Asian Range',
    bgHex: 0x10111d,
    keyHex: 0xffdfba,
    skyHex: 0xa5b4fc,
    accentHex: 0xf59e0b,
  },
};

// Module-scoped reusable math helpers (zero GC inside animation loop)
const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _tmpVec = new THREE.Vector3();
const _tmpMat = new THREE.Matrix4();
const _tmpQuat = new THREE.Quaternion();
const _tmpScale = new THREE.Vector3();
const _tmpColor = new THREE.Color();
const _bgColor = new THREE.Color();
const _keyColor = new THREE.Color();
const _skyColor = new THREE.Color();

function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 14, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.25)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createFloorGridTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#0d1422';
  ctx.fillRect(0, 0, 512, 512);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 512; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i, 512);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, i);
    ctx.lineTo(512, i);
    ctx.stroke();
  }

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.26)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, 510, 510);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(16, 16);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function buildVaultCoreGroup(isSoftwareGl: boolean): {
  group: THREE.Group;
  layers: { ringOuter: THREE.Mesh; ringInner: THREE.Mesh; glassShell: THREE.Mesh; cap: THREE.Mesh };
} {
  const group = new THREE.Group();

  // 1. Stepped beveled plinth (bottom sits flush at y = 0)
  const baseShape = new THREE.Shape();
  const r = 1.9;
  baseShape.moveTo(-r, -r);
  baseShape.lineTo(r, -r);
  baseShape.lineTo(r, r);
  baseShape.lineTo(-r, r);
  baseShape.closePath();

  const plinthGeo = new THREE.ExtrudeGeometry(baseShape, {
    depth: 0.34,
    bevelEnabled: true,
    bevelThickness: 0.06,
    bevelSize: 0.06,
    bevelSegments: 3,
  });
  plinthGeo.rotateX(-Math.PI / 2);
  plinthGeo.translate(0, 0.06, 0);
  const plinthMat = new THREE.MeshStandardMaterial({
    color: 0x161f31,
    roughness: 0.62,
    metalness: 0.35,
  });
  const plinth = new THREE.Mesh(plinthGeo, plinthMat);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  group.add(plinth);

  // 2. Lathe pedestal collar
  const collarPoints = [
    new THREE.Vector2(1.45, 0.4),
    new THREE.Vector2(1.5, 0.56),
    new THREE.Vector2(1.22, 0.66),
    new THREE.Vector2(1.18, 0.72),
  ];
  const collarGeo = new THREE.LatheGeometry(collarPoints, 36);
  const brushedSteelMat = new THREE.MeshPhysicalMaterial({
    color: 0x94a3b8,
    metalness: 0.92,
    roughness: 0.18,
    anisotropy: 0.75,
    clearcoat: 0.25,
  });
  const collar = new THREE.Mesh(collarGeo, brushedSteelMat);
  collar.castShadow = true;
  collar.receiveShadow = true;
  group.add(collar);

  // 3. Central Liquidity Crystal Core (anodized gold)
  const coreGeo = new THREE.OctahedronGeometry(0.68, 1);
  const goldMat = new THREE.MeshPhysicalMaterial({
    color: 0xf59e0b,
    metalness: 0.94,
    roughness: 0.16,
    anisotropy: 0.8,
    emissive: 0x78350f,
    emissiveIntensity: 0.35,
  });
  const core = new THREE.Mesh(coreGeo, goldMat);
  core.position.y = 2.05;
  core.castShadow = true;
  group.add(core);

  // 4. Outer & Inner Gyroscopic Liquidity Rings
  const ringMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    metalness: 0.88,
    roughness: 0.2,
    emissive: 0x0284c7,
    emissiveIntensity: 0.25,
  });
  const ringOuter = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.045, 16, 64), ringMat);
  ringOuter.position.y = 2.05;
  ringOuter.castShadow = true;
  group.add(ringOuter);

  const ringInner = new THREE.Mesh(new THREE.TorusGeometry(0.92, 0.035, 16, 56), goldMat);
  ringInner.position.y = 2.05;
  ringInner.rotation.x = Math.PI / 3;
  group.add(ringInner);

  // 5. Four Corner Structural Pillars
  const pillarGeo = new THREE.CylinderGeometry(0.06, 0.08, 2.75, 16);
  const pillarOffsets: [number, number][] = [
    [-1.25, -1.25],
    [1.25, -1.25],
    [1.25, 1.25],
    [-1.25, 1.25],
  ];
  for (const [px, pz] of pillarOffsets) {
    const pillar = new THREE.Mesh(pillarGeo, brushedSteelMat);
    pillar.position.set(px, 1.78, pz);
    pillar.castShadow = true;
    group.add(pillar);
  }

  // 6. Optical Glass Containment Cylinder
  const glassGeo = new THREE.CylinderGeometry(1.25, 1.25, 2.35, 36, 1, true);
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0xe0f2fe,
    metalness: 0.05,
    roughness: 0.08,
    transmission: isSoftwareGl ? 0 : 0.88,
    transparent: true,
    opacity: isSoftwareGl ? 0.28 : 1,
    ior: 1.52,
    thickness: 0.8,
    clearcoat: 1.0,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const glassShell = new THREE.Mesh(glassGeo, glassMat);
  glassShell.position.y = 1.92;
  glassShell.renderOrder = 4;
  group.add(glassShell);

  // 7. Crown Cap Assembly
  const capGeo = new THREE.CylinderGeometry(1.05, 1.38, 0.22, 32);
  const capMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    metalness: 0.5,
    roughness: 0.55,
  });
  const cap = new THREE.Mesh(capGeo, capMat);
  cap.position.y = 3.22;
  cap.castShadow = true;
  group.add(cap);

  return { group, layers: { ringOuter, ringInner, glassShell, cap } };
}

function buildCandleMonolith(
  x: number,
  z: number,
  height: number,
  bullish: boolean
): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, 0, z);

  // 1. Ground pad (y = 0.03)
  const pad = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.06, 0.86),
    new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72, metalness: 0.2 })
  );
  pad.position.y = 0.03;
  pad.receiveShadow = true;
  g.add(pad);

  // 2. Central Wick Spindle
  const wickH = height + 0.85;
  const wick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, wickH, 12),
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.25, metalness: 0.85 })
  );
  wick.position.y = wickH / 2 + 0.06;
  wick.castShadow = true;
  g.add(wick);

  // 3. Beveled Candlestick Body
  const w = 0.26;
  const bodyShape = new THREE.Shape();
  bodyShape.moveTo(-w, -w);
  bodyShape.lineTo(w, -w);
  bodyShape.lineTo(w, w);
  bodyShape.lineTo(-w, w);
  bodyShape.closePath();

  const bodyGeo = new THREE.ExtrudeGeometry(bodyShape, {
    depth: height,
    bevelEnabled: true,
    bevelSize: 0.03,
    bevelThickness: 0.03,
    bevelSegments: 2,
  });
  bodyGeo.rotateX(-Math.PI / 2);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bullish ? 0x10b981 : 0xf43f5e,
    roughness: 0.28,
    metalness: 0.35,
    clearcoat: 0.65,
  });
  const body = new THREE.Mesh(bodyGeo, bodyMat);
  body.position.y = 0.38;
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);

  // 4. FVG Imbalance Collar Trim
  const collar = new THREE.Mesh(
    new THREE.BoxGeometry(0.68, 0.08, 0.68),
    new THREE.MeshStandardMaterial({
      color: bullish ? 0x34d399 : 0xfb7185,
      emissive: bullish ? 0x059669 : 0xbe123c,
      emissiveIntensity: 0.4,
      roughness: 0.4,
      metalness: 0.7,
    })
  );
  collar.position.y = 0.38 + height * 0.5;
  g.add(collar);

  return g;
}

export const ThreeLiquidityScene: React.FC<ThreeLiquiditySceneProps> = ({ onExit }) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const [cameraPreset, setCameraPreset] = useState<CameraPresetKey>('overview');
  const [sessionPreset, setSessionPreset] = useState<SessionPresetKey>('newyork');
  const [explodeFactor, setExplodeFactor] = useState(0);
  const [autoOrbit, setAutoOrbit] = useState(true);
  const [dockOpen, setDockOpen] = useState(true);

  const cameraPresetRef = useRef<CameraPresetKey>('overview');
  const cameraTransitioningRef = useRef<boolean>(false);
  const sessionPresetRef = useRef<SessionPresetKey>('newyork');
  const explodeTargetRef = useRef<number>(0);
  const autoOrbitRef = useRef<boolean>(true);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
      if (e.key === 'h' || e.key === 'H') setDockOpen((prev) => !prev);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onExit]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // Detect Software WebGL cleanly
    const isSoftwareGl = (() => {
      const probe = document.createElement('canvas').getContext('webgl2');
      if (!probe) return true;
      const ext = probe.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : probe.RENDERER;
      const gpu = String(probe.getParameter(param));
      probe.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const initPalette = SESSION_PALETTES.newyork;
    scene.background = new THREE.Color(initPalette.bgHex);
    scene.fog = new THREE.FogExp2(initPalette.bgHex, 0.025);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnv = new RoomEnvironment();
    const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
    scene.environment = envTarget.texture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 140);
    camera.position.set(...CAMERA_PRESETS.overview.pos);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 4;
    controls.maxDistance = 26;
    controls.maxPolarAngle = Math.PI / 2 - 0.04;
    controls.target.set(...CAMERA_PRESETS.overview.target);
    controls.autoRotate = !isSoftwareGl && autoOrbitRef.current;
    controls.autoRotateSpeed = 0.7;

    controls.addEventListener('start', () => {
      cameraTransitioningRef.current = false;
    });

    // Studio 3-point lighting rig + Hemisphere fill
    const hemiLight = new THREE.HemisphereLight(initPalette.skyHex, 0x0f172a, 0.75);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(initPalette.keyHex, 2.4);
    keyLight.position.set(7.5, 11.5, 6.5);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -10;
    keyLight.shadow.camera.right = 10;
    keyLight.shadow.camera.top = 10;
    keyLight.shadow.camera.bottom = -10;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.1);
    rimLight.position.set(-8, 6, -7);
    scene.add(rimLight);

    if (!isSoftwareGl) {
      RectAreaLightUniformsLib.init();
      const softbox = new THREE.RectAreaLight(0xffffff, 2.5, 5, 2.5);
      softbox.position.set(0, 7.5, 5);
      softbox.lookAt(0, 1.8, 0);
      scene.add(softbox);
    }

    // Ground plane + procedural sharp grid + contact shadow
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const gridTex = createFloorGridTexture(maxAniso);
    const floorMat = new THREE.MeshStandardMaterial({
      map: gridTex,
      roughness: 0.78,
      metalness: 0.25,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const shadowTex = createContactShadowTexture();
    const contactShadow = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 5.6),
      new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.65 })
    );
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.02;
    scene.add(contactShadow);

    // Central Institutional Vault Core
    const { group: vaultGroup, layers: vaultLayers } = buildVaultCoreGroup(isSoftwareGl);
    scene.add(vaultGroup);

    // Procedural Candlestick Order-Block Monoliths around perimeter
    const candleSpecs: Array<{ x: number; z: number; h: number; bull: boolean }> = [
      { x: -4.2, z: -2.4, h: 1.8, bull: true },
      { x: -3.2, z: 2.1, h: 2.6, bull: true },
      { x: 3.4, z: 2.2, h: 2.1, bull: false },
      { x: 4.3, z: -2.0, h: 3.1, bull: true },
      { x: 0.4, z: -4.4, h: 2.4, bull: false },
      { x: -0.6, z: 4.5, h: 1.9, bull: true },
    ];
    const candleGroups: THREE.Group[] = [];
    for (const spec of candleSpecs) {
      const cg = buildCandleMonolith(spec.x, spec.z, spec.h, spec.bull);
      scene.add(cg);
      candleGroups.push(cg);
    }

    // Sweeping Liquidity Bridge Tubes
    const sweepCurve1 = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-4.2, 2.3, -2.4),
      new THREE.Vector3(-1.8, 3.8, -0.8),
      new THREE.Vector3(0, 3.5, 0),
      new THREE.Vector3(2.2, 3.9, -0.7),
      new THREE.Vector3(4.3, 3.4, -2.0),
    ]);
    const tubeGeo = new THREE.TubeGeometry(sweepCurve1, 48, 0.035, 8, false);
    const tubeMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.45,
      roughness: 0.25,
      metalness: 0.7,
    });
    const sweepTube = new THREE.Mesh(tubeGeo, tubeMat);
    scene.add(sweepTube);

    // InstancedMesh (>20 items) for Market Liquidity Lattice Nodes
    const nodeCount = 144;
    const nodeGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    const nodeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0.65,
    });
    const instancedNodes = new THREE.InstancedMesh(nodeGeo, nodeMat, nodeCount);
    let idx = 0;
    for (let gx = -5; gx <= 6; gx++) {
      for (let gz = -5; gz <= 6; gz++) {
        if (idx >= nodeCount) break;
        const dist = Math.hypot(gx, gz);
        const s = 0.85 + ((idx % 5) - 2) * 0.075;
        _tmpVec.set(gx * 1.15, dist < 2.5 ? 0.08 : 0.12, gz * 1.15);
        _tmpQuat.identity();
        _tmpScale.set(s, s, s);
        _tmpMat.compose(_tmpVec, _tmpQuat, _tmpScale);
        instancedNodes.setMatrixAt(idx, _tmpMat);
        _tmpColor.setHex((gx + gz) % 2 === 0 ? 0x38bdf8 : 0x64748b);
        instancedNodes.setColorAt(idx, _tmpColor);
        idx++;
      }
    }
    instancedNodes.instanceMatrix.needsUpdate = true;
    if (instancedNodes.instanceColor) instancedNodes.instanceColor.needsUpdate = true;
    instancedNodes.computeBoundingSphere();
    scene.add(instancedNodes);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let currentExplode = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      // Damped Exploded-View Layer Separation
      currentExplode = THREE.MathUtils.damp(currentExplode, explodeTargetRef.current, 6.5, delta);
      vaultLayers.glassShell.position.y = 1.92 + currentExplode * 0.85;
      vaultLayers.cap.position.y = 3.22 + currentExplode * 1.45;
      vaultLayers.ringOuter.position.y = 2.05 + currentExplode * 0.35;
      vaultLayers.ringInner.position.y = 2.05 - currentExplode * 0.25;

      // Gyroscopic rotation
      vaultLayers.ringOuter.rotation.y = elapsed * 0.42;
      vaultLayers.ringOuter.rotation.x = Math.sin(elapsed * 0.5) * 0.25;
      vaultLayers.ringInner.rotation.z = -elapsed * 0.58;

      // Damped Session Lighting Palette
      const pal = SESSION_PALETTES[sessionPresetRef.current];
      _bgColor.setHex(pal.bgHex);
      _keyColor.setHex(pal.keyHex);
      _skyColor.setHex(pal.skyHex);
      if (scene.background instanceof THREE.Color) {
        scene.background.lerp(_bgColor, 1 - Math.exp(-4 * delta));
      }
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.lerp(_bgColor, 1 - Math.exp(-4 * delta));
      }
      keyLight.color.lerp(_keyColor, 1 - Math.exp(-4 * delta));
      hemiLight.color.lerp(_skyColor, 1 - Math.exp(-4 * delta));

      // Damped Camera Preset Transition (cancelled on arrival or OrbitControls start)
      if (cameraTransitioningRef.current) {
        const preset = CAMERA_PRESETS[cameraPresetRef.current];
        _camTargetPos.set(...preset.pos);
        _camTargetLook.set(...preset.target);
        const factor = 1 - Math.exp(-5.2 * delta);
        camera.position.lerp(_camTargetPos, factor);
        controls.target.lerp(_camTargetLook, factor);
        if (camera.position.distanceTo(_camTargetPos) < 0.03) {
          cameraTransitioningRef.current = false;
        }
      }

      controls.autoRotate = !isSoftwareGl && autoOrbitRef.current && !cameraTransitioningRef.current;
      controls.update();
      renderer.render(scene, camera);

      if (isSoftwareGl) afterDraw(tick);
      else frameId = requestAnimationFrame(tick);
    }

    tick();

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('resize', handleResize);
      controls.dispose();
      envTarget.dispose();
      gridTex.dispose();
      shadowTex.dispose();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose());
          else obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  const handleSelectCamera = (preset: CameraPresetKey) => {
    setCameraPreset(preset);
    cameraPresetRef.current = preset;
    cameraTransitioningRef.current = true;
  };

  const handleSelectSession = (preset: SessionPresetKey) => {
    setSessionPreset(preset);
    sessionPresetRef.current = preset;
  };

  const handleExplodeChange = (val: number) => {
    setExplodeFactor(val);
    explodeTargetRef.current = val;
  };

  const handleToggleAutoOrbit = () => {
    setAutoOrbit((prev) => {
      const next = !prev;
      autoOrbitRef.current = next;
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0b101b] overflow-hidden select-none">
      {/* Dedicated WebGL Mount */}
      <div ref={mountRef} className="w-full h-full" />

      {/* Minimal Top-Left Header */}
      <div className="fixed top-4 left-4 right-4 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto bg-slate-950/90 border border-slate-800 rounded-xl px-4 py-2.5 text-white flex items-center gap-4">
          <div>
            <div className="text-xs font-bold tracking-tight">GRIDPIPs 3D Liquidity Lab</div>
            <div className="text-[11px] text-slate-400">
              {SESSION_PALETTES[sessionPreset].label} · Drag to orbit · Scroll to zoom
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onExit}
          className="pointer-events-auto px-3.5 py-2 bg-slate-950/90 border border-slate-700 text-white text-xs font-semibold rounded-xl hover:bg-slate-800 inline-flex items-center gap-1.5 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
          Exit 3D Lab
        </button>
      </div>

      {/* Collapsible Bottom Control Dock (Zero backdrop-filter over WebGL) */}
      <div
        className={`fixed left-1/2 -translate-x-1/2 transition-transform duration-300 w-[min(920px,94vw)] ${
          dockOpen ? 'bottom-5 translate-y-0' : 'bottom-5 translate-y-[calc(100%-24px)]'
        }`}
      >
        <div className="flex justify-center mb-1.5">
          <button
            type="button"
            onClick={() => setDockOpen((v) => !v)}
            className="px-3.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-[11px] font-semibold text-slate-200 hover:text-white inline-flex items-center gap-1 cursor-pointer"
          >
            {dockOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            {dockOpen ? 'Hide Controls (H)' : 'Show Controls (H)'}
          </button>
        </div>

        <div className="bg-slate-950/92 border border-slate-800 rounded-xl px-4 py-3 text-white flex flex-wrap items-center justify-between gap-4">
          {/* Camera Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {(Object.keys(CAMERA_PRESETS) as CameraPresetKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectCamera(key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  cameraPreset === key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {CAMERA_PRESETS[key].label}
              </button>
            ))}
          </div>

          {/* Explode Slider */}
          <div className="flex items-center gap-2.5">
            <span className="text-[11px] font-semibold text-slate-400">Explode Core</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={explodeFactor}
              onChange={(e) => handleExplodeChange(Number(e.target.value))}
              className="w-24 accent-blue-500 cursor-pointer"
            />
          </div>

          {/* Session Lighting */}
          <div className="flex items-center gap-1.5">
            {(Object.keys(SESSION_PALETTES) as SessionPresetKey[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => handleSelectSession(key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  sessionPreset === key
                    ? 'bg-slate-200 text-slate-950'
                    : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
                }`}
              >
                {SESSION_PALETTES[key].label}
              </button>
            ))}
          </div>

          {/* Auto-Orbit Toggle */}
          <button
            type="button"
            onClick={handleToggleAutoOrbit}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
              autoOrbit ? 'bg-emerald-600 text-white' : 'bg-slate-900 text-slate-300'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Orbit
          </button>
        </div>
      </div>
    </div>
  );
};
