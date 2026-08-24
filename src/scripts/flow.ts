import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

type NodeDef = {
  id: string;
  step: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  z: number;
  role: "edge" | "core" | "out";
};

const NODES: NodeDef[] = [
  { id: "user", step: "1", label: "Browser", sub: "sign-in · PKCE", x: -3.4, y: 0.9, z: 0.2, role: "edge" },
  { id: "aaax", step: "2", label: "AAAX", sub: "Spring Boot AS", x: 0, y: 1.15, z: 0, role: "core" },
  { id: "app", step: "3", label: "Your app", sub: "JWT · API", x: 3.4, y: 0.9, z: 0.2, role: "edge" },
  { id: "mesh", step: "⚡", label: "Your mesh", sub: "Kafka · webhook", x: 0, y: -1.55, z: 0.55, role: "out" },
];

type EdgeDef = {
  from: string;
  to: string;
  kind: "login" | "token" | "event";
  label: string;
  midY?: number;
};

const EDGES: EdgeDef[] = [
  { from: "user", to: "aaax", kind: "login", label: "login", midY: 1.55 },
  { from: "aaax", to: "app", kind: "token", label: "OIDC JWT", midY: 1.55 },
  { from: "aaax", to: "mesh", kind: "event", label: "events", midY: -0.15 },
];

const COPY: Record<string, string> = {
  user: "User opens /sign-in or starts OAuth (PKCE). Session begins in the browser.",
  aaax: "Spring Authorization Server — password/OTP/MFA, issues tokens, serves JWKS.",
  app: "Your resource server validates the JWT. Business logic stays in your app.",
  mesh: "Identity Event Bus fires CloudEvents. Your notify stack sends SMS/email.",
  default: "Drag to look around · scroll zoom · click a node",
};

const C = {
  ink: 0x1a1814,
  paper: 0xfffcf7,
  paperDeep: 0xf0ebe1,
  cream: 0xf6f3ec,
  accent: 0xc45c26,
  accentSoft: 0xe8a57a,
  line: 0xc9c0b0,
  muted: 0x6b6560,
};

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material;
    if (!mat) return;
    const mats = Array.isArray(mat) ? mat : [mat];
    for (const x of mats) {
      const map = (x as THREE.MeshStandardMaterial).map;
      if (map) map.dispose();
      x.dispose();
    }
  });
}

function makeCardLabel(step: string, title: string, sub: string, accent: boolean) {
  const w = 640;
  const h = 280;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;

  // soft shadow plate
  ctx.fillStyle = "rgba(26,24,20,0.08)";
  roundRect(ctx, 28, 36, w - 56, h - 64, 28);
  ctx.fill();

  // card
  ctx.fillStyle = accent ? "#c45c26" : "#fffcf7";
  roundRect(ctx, 24, 24, w - 48, h - 56, 26);
  ctx.fill();
  ctx.strokeStyle = accent ? "#a34a1c" : "#ddd6c8";
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 24, w - 48, h - 56, 26);
  ctx.stroke();

  // step chip
  ctx.fillStyle = accent ? "rgba(255,250,245,0.2)" : "#f0ebe1";
  roundRect(ctx, 48, 52, 72, 48, 14);
  ctx.fill();
  ctx.fillStyle = accent ? "#fffaf5" : "#c45c26";
  ctx.font = "600 28px IBM Plex Mono, ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(step, 84, 76);

  ctx.textAlign = "left";
  ctx.fillStyle = accent ? "#fffaf5" : "#1a1814";
  ctx.font = "600 44px IBM Plex Sans, system-ui, sans-serif";
  ctx.fillText(title, 140, 78);

  ctx.fillStyle = accent ? "rgba(255,250,245,0.85)" : "#6b6560";
  ctx.font = "500 28px IBM Plex Mono, ui-monospace, monospace";
  ctx.fillText(sub, 52, 160);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: true, depthWrite: false }),
  );
  sprite.scale.set(2.55, 1.12, 1);
  return sprite;
}

function makeEdgeLabel(text: string, kind: EdgeDef["kind"]) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 96;
  const ctx = canvas.getContext("2d")!;
  const bg = kind === "event" ? "#c45c26" : "#1a1814";
  ctx.fillStyle = bg;
  roundRect(ctx, 16, 20, 288, 56, 18);
  ctx.fill();
  ctx.fillStyle = "#fffaf5";
  ctx.font = "600 26px IBM Plex Mono, ui-monospace, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 160, 48);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }),
  );
  sprite.scale.set(1.35, 0.4, 1);
  return sprite;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function nodeBody(role: NodeDef["role"]) {
  const g = new THREE.Group();
  const isCore = role === "core";
  const isOut = role === "out";

  const w = isCore ? 1.55 : 1.35;
  const h = isCore ? 1.05 : 0.9;
  const d = isCore ? 1.15 : 0.95;

  const geo = new RoundedBoxGeometry(w, h, d, 4, 0.12);
  const mat = new THREE.MeshStandardMaterial({
    color: isCore ? C.accent : isOut ? 0x2a261f : C.ink,
    roughness: isCore ? 0.42 : 0.55,
    metalness: isCore ? 0.12 : 0.04,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);

  // paper cap
  const cap = new THREE.Mesh(
    new RoundedBoxGeometry(w * 0.92, 0.08, d * 0.88, 2, 0.04),
    new THREE.MeshStandardMaterial({ color: C.paper, roughness: 0.85, metalness: 0 }),
  );
  cap.position.y = h / 2 + 0.02;
  g.add(cap);

  // ring for core
  if (isCore) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.05, 0.03, 12, 48),
      new THREE.MeshStandardMaterial({
        color: C.accentSoft,
        emissive: C.accent,
        emissiveIntensity: 0.25,
        roughness: 0.35,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.15;
    g.add(ring);
  }

  return { group: g, hit: mesh, height: h };
}

export function initAaaxFlow(root: HTMLElement) {
  const canvas = root.querySelector("canvas") as HTMLCanvasElement | null;
  const hint = root.querySelector(".hint") as HTMLElement | null;
  if (!canvas) return () => {};

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xf6f3ec, 10, 22);

  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 80);
  let distance = 9.2;
  let rotY = 0.42;
  let rotX = 0.32;
  let targetRotY = rotY;
  let targetRotX = rotX;

  // lights
  scene.add(new THREE.AmbientLight(0xfff8ef, 0.95));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(5, 8, 4);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 24;
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc45c26, 0.35);
  rim.position.set(-4, 3, -2);
  scene.add(rim);
  const hemi = new THREE.HemisphereLight(0xfffaf3, 0xd9d0c0, 0.45);
  scene.add(hemi);

  // stage plate
  const plate = new THREE.Mesh(
    new RoundedBoxGeometry(11.5, 0.12, 7.2, 2, 0.08),
    new THREE.MeshStandardMaterial({ color: C.paperDeep, roughness: 0.92, metalness: 0 }),
  );
  plate.position.y = -2.15;
  plate.receiveShadow = true;
  scene.add(plate);

  const grid = new THREE.GridHelper(10, 10, 0xd9d2c3, 0xe5dfd3);
  grid.position.y = -2.08;
  const gMat = grid.material as THREE.Material | THREE.Material[];
  if (Array.isArray(gMat)) gMat.forEach((m) => ((m as THREE.Material).transparent = true));
  else {
    gMat.transparent = true;
    (gMat as THREE.Material & { opacity: number }).opacity = 0.55;
  }
  scene.add(grid);

  const world = new THREE.Group();
  scene.add(world);

  const nodeMap = new Map<string, { root: THREE.Group; baseY: number; hit: THREE.Object3D }>();

  for (const n of NODES) {
    const rootG = new THREE.Group();
    const { group: body, hit, height } = nodeBody(n.role);
    hit.userData = { id: n.id };
    body.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).userData = { id: n.id };
    });
    rootG.add(body);

    const label = makeCardLabel(n.step, n.label, n.sub, n.role === "core");
    label.position.y = height / 2 + 0.95;
    rootG.add(label);

    rootG.position.set(n.x, n.y, n.z);
    world.add(rootG);
    nodeMap.set(n.id, { root: rootG, baseY: n.y, hit });
  }

  type Pulse = {
    mesh: THREE.Mesh;
    curve: THREE.CubicBezierCurve3;
    t: number;
    speed: number;
  };
  const pulses: Pulse[] = [];

  const anchor = (id: string) => {
    const n = NODES.find((x) => x.id === id)!;
    return new THREE.Vector3(n.x, n.y + 0.15, n.z);
  };

  for (const e of EDGES) {
    const a = anchor(e.from);
    const b = anchor(e.to);
    const mid = a.clone().lerp(b, 0.5);
    mid.y = e.midY ?? (a.y + b.y) / 2 + 0.6;
    // pull event curve forward a bit
    if (e.kind === "event") mid.z += 0.35;

    const c1 = a.clone().lerp(mid, 0.55);
    const c2 = b.clone().lerp(mid, 0.55);
    const curve = new THREE.CubicBezierCurve3(a, c1, c2, b);

    const color = e.kind === "event" ? C.accent : C.ink;
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 48, e.kind === "event" ? 0.034 : 0.028, 10, false),
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.15,
        emissive: color,
        emissiveIntensity: e.kind === "event" ? 0.12 : 0.04,
      }),
    );
    tube.castShadow = true;
    world.add(tube);

    // soft outer sheath
    const sheath = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 32, e.kind === "event" ? 0.07 : 0.055, 8, false),
      new THREE.MeshBasicMaterial({
        color: e.kind === "event" ? C.accentSoft : 0x8a8478,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
      }),
    );
    world.add(sheath);

    const edgeLabel = makeEdgeLabel(e.label, e.kind);
    const lp = curve.getPoint(0.5);
    edgeLabel.position.copy(lp);
    edgeLabel.position.y += 0.28;
    world.add(edgeLabel);

    for (let i = 0; i < (e.kind === "event" ? 2 : 2); i++) {
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(e.kind === "event" ? 0.09 : 0.075, 16, 16),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.55,
          roughness: 0.25,
        }),
      );
      world.add(pulse);
      pulses.push({
        mesh: pulse,
        curve,
        t: i * 0.5,
        speed: e.kind === "event" ? 0.22 : 0.18,
      });
    }
  }

  // interaction
  let dragging = false;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;
  let selected: string | null = null;

  const setHint = (id: string | null) => {
    if (!hint) return;
    if (!id) {
      hint.textContent = COPY.default;
      return;
    }
    const n = NODES.find((x) => x.id === id);
    hint.innerHTML = `<strong>${n?.label ?? id}</strong> — ${COPY[id] ?? ""}`;
  };
  setHint(null);

  const setSize = () => {
    const w = root.clientWidth;
    const h = root.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  setSize();

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  const pick = (cx: number, cy: number) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((cx - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((cy - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits: THREE.Object3D[] = [];
    world.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData?.id) hits.push(o);
    });
    return raycaster.intersectObjects(hits, false)[0]?.object.userData?.id as string | undefined;
  };

  canvas.style.cursor = "grab";
  canvas.addEventListener("pointerdown", (ev) => {
    dragging = true;
    downX = lastX = ev.clientX;
    downY = lastY = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
    canvas.style.cursor = "grabbing";
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (!dragging) return;
    targetRotY += (ev.clientX - lastX) * 0.0045;
    targetRotX += (ev.clientY - lastY) * 0.0035;
    targetRotX = THREE.MathUtils.clamp(targetRotX, 0.12, 0.55);
    lastX = ev.clientX;
    lastY = ev.clientY;
  });
  canvas.addEventListener("pointerup", (ev) => {
    dragging = false;
    canvas.style.cursor = "grab";
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) < 8) {
      selected = pick(ev.clientX, ev.clientY) ?? null;
      setHint(selected);
      for (const [id, n] of nodeMap) {
        n.root.scale.setScalar(id === selected ? 1.07 : 1);
      }
    }
  });
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      distance = THREE.MathUtils.clamp(distance + ev.deltaY * 0.008, 6.5, 12.5);
    },
    { passive: false },
  );

  const ro = new ResizeObserver(setSize);
  ro.observe(root);

  let raf = 0;
  const clock = new THREE.Clock();

  const placeCamera = () => {
    const cy = Math.cos(rotX);
    camera.position.set(
      Math.sin(rotY) * distance * cy,
      2.1 + Math.sin(rotX) * distance * 0.55,
      Math.cos(rotY) * distance * cy,
    );
    camera.lookAt(0, 0.1, 0);
  };

  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    rotY += (targetRotY - rotY) * 0.09;
    rotX += (targetRotX - rotX) * 0.09;
    if (!dragging) targetRotY += 0.0009;
    placeCamera();

    for (const n of NODES) {
      const entry = nodeMap.get(n.id);
      if (!entry) continue;
      entry.root.position.y = entry.baseY + Math.sin(t * 1.1 + n.x * 0.4) * 0.05;
    }

    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      const phase = (t * p.speed + i * 0.37) % 1;
      const pt = p.curve.getPoint(phase);
      p.mesh.position.copy(pt);
      p.mesh.position.y += 0.02;
      p.mesh.scale.setScalar(0.85 + 0.25 * Math.sin(phase * Math.PI));
    }

    renderer.render(scene, camera);
  };
  animate();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    disposeObject(scene);
    renderer.dispose();
  };
}
