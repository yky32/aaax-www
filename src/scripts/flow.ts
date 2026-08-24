import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";

type Role = "edge" | "core" | "out";

type NodeDef = {
  id: string;
  step: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  z: number;
  role: Role;
  /** label screen offset in local 3D space */
  lx: number;
  ly: number;
  lz: number;
};

/** Wider spacing so cards never sit on top of each other */
const NODES: NodeDef[] = [
  {
    id: "user",
    step: "1",
    label: "Browser",
    sub: "sign-in · PKCE",
    x: -4.1,
    y: 0.85,
    z: 0.3,
    role: "edge",
    lx: -1.55,
    ly: 0.55,
    lz: 0.9,
  },
  {
    id: "aaax",
    step: "2",
    label: "AAAX",
    sub: "Spring Boot AS",
    x: 0,
    y: 1.55,
    z: -0.15,
    role: "core",
    lx: 0,
    ly: 1.55,
    lz: 0,
  },
  {
    id: "app",
    step: "3",
    label: "Your app",
    sub: "JWT · API",
    x: 4.1,
    y: 0.85,
    z: 0.3,
    role: "edge",
    lx: 1.55,
    ly: 0.55,
    lz: 0.9,
  },
  {
    id: "mesh",
    step: "4",
    label: "Your mesh",
    sub: "Kafka · webhook",
    x: 0,
    y: -2.15,
    z: 0.9,
    role: "out",
    lx: 0,
    ly: -1.15,
    lz: 0.4,
  },
];

type EdgeDef = {
  from: string;
  to: string;
  kind: "login" | "token" | "event";
  label: string;
  /** where along curve 0–1 to put the badge */
  labelT: number;
  lift: number;
};

const EDGES: EdgeDef[] = [
  { from: "user", to: "aaax", kind: "login", label: "login", labelT: 0.42, lift: 0.55 },
  { from: "aaax", to: "app", kind: "token", label: "OIDC JWT", labelT: 0.58, lift: 0.55 },
  { from: "aaax", to: "mesh", kind: "event", label: "events", labelT: 0.55, lift: 0.25 },
];

const COPY: Record<string, string> = {
  user: "User opens /sign-in or starts OAuth (PKCE).",
  aaax: "Spring Authorization Server — session, MFA, tokens, JWKS.",
  app: "Your API validates the JWT. Business logic stays here.",
  mesh: "CloudEvents → Kafka or HMAC webhook. You send SMS/email.",
  default: "Drag to look · scroll zoom · click a node",
};

const C = {
  ink: 0x1a1814,
  paper: 0xfffcf7,
  paperDeep: 0xefe8db,
  accent: 0xc45c26,
  accentSoft: 0xe8a57a,
};

function disposeObject(obj: THREE.Object3D) {
  obj.traverse((child) => {
    const m = child as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = m.material as THREE.Material | THREE.Material[] | undefined;
    if (!mat) return;
    for (const x of Array.isArray(mat) ? mat : [mat]) x.dispose();
  });
}

function makeNodeLabel(n: NodeDef) {
  const el = document.createElement("div");
  el.className = `flow-tag flow-tag--${n.role}`;
  el.innerHTML = `
    <span class="flow-tag__step">${n.step}</span>
    <span class="flow-tag__body">
      <span class="flow-tag__title">${n.label}</span>
      <span class="flow-tag__sub">${n.sub}</span>
    </span>
  `;
  const obj = new CSS2DObject(el);
  obj.position.set(n.lx, n.ly, n.lz);
  obj.center.set(n.role === "edge" && n.x < 0 ? 1 : n.role === "edge" && n.x > 0 ? 0 : 0.5, 0.5);
  return obj;
}

function makeEdgeBadge(text: string, kind: EdgeDef["kind"]) {
  const el = document.createElement("div");
  el.className = `flow-badge flow-badge--${kind}`;
  el.textContent = text;
  return new CSS2DObject(el);
}

function nodeBody(role: Role) {
  const g = new THREE.Group();
  const isCore = role === "core";
  const w = isCore ? 1.35 : 1.15;
  const h = isCore ? 0.95 : 0.82;
  const d = isCore ? 1.05 : 0.88;

  const mesh = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 4, 0.1),
    new THREE.MeshStandardMaterial({
      color: isCore ? C.accent : role === "out" ? 0x2a261f : C.ink,
      roughness: isCore ? 0.4 : 0.55,
      metalness: isCore ? 0.1 : 0.03,
    }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  g.add(mesh);

  const cap = new THREE.Mesh(
    new RoundedBoxGeometry(w * 0.9, 0.07, d * 0.86, 2, 0.03),
    new THREE.MeshStandardMaterial({ color: C.paper, roughness: 0.88, metalness: 0 }),
  );
  cap.position.y = h / 2 + 0.02;
  cap.castShadow = true;
  g.add(cap);

  if (isCore) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.025, 10, 40),
      new THREE.MeshStandardMaterial({
        color: C.accentSoft,
        emissive: C.accent,
        emissiveIntensity: 0.2,
        roughness: 0.4,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.12;
    g.add(ring);
  }

  return { group: g, hit: mesh, height: h };
}

export function initAaaxFlow(root: HTMLElement) {
  const canvas = root.querySelector("canvas") as HTMLCanvasElement | null;
  const hint = root.querySelector(".hint") as HTMLElement | null;
  if (!canvas) return () => {};

  // clear any previous CSS2D layer
  root.querySelectorAll(".flow-css2d").forEach((n) => n.remove());

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "flow-css2d";
  labelRenderer.domElement.style.position = "absolute";
  labelRenderer.domElement.style.inset = "0";
  labelRenderer.domElement.style.pointerEvents = "none";
  root.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 80);

  // Prefer a stable diagram angle (less spin → less overlap)
  let distance = 11.2;
  let rotY = 0.38;
  let rotX = 0.4;
  let targetRotY = rotY;
  let targetRotX = rotX;

  scene.add(new THREE.AmbientLight(0xfff8ef, 1));
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(4, 9, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -10;
  key.shadow.camera.right = 10;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -10;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc45c26, 0.28);
  rim.position.set(-5, 3, -2);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xfffaf3, 0xd9d0c0, 0.4));

  const plate = new THREE.Mesh(
    new RoundedBoxGeometry(13, 0.1, 8.5, 2, 0.06),
    new THREE.MeshStandardMaterial({ color: C.paperDeep, roughness: 0.93, metalness: 0 }),
  );
  plate.position.y = -2.85;
  plate.receiveShadow = true;
  scene.add(plate);

  const grid = new THREE.GridHelper(12, 12, 0xd9d2c3, 0xe8e1d4);
  grid.position.y = -2.78;
  const gm = grid.material as THREE.Material;
  gm.transparent = true;
  (gm as THREE.Material & { opacity: number }).opacity = 0.45;
  scene.add(grid);

  const world = new THREE.Group();
  scene.add(world);

  const nodeMap = new Map<string, { root: THREE.Group; baseY: number }>();

  for (const n of NODES) {
    const rootG = new THREE.Group();
    const { group: body, hit } = nodeBody(n.role);
    body.traverse((c) => {
      if ((c as THREE.Mesh).isMesh) (c as THREE.Mesh).userData = { id: n.id };
    });
    hit.userData = { id: n.id };
    rootG.add(body);
    rootG.add(makeNodeLabel(n));
    rootG.position.set(n.x, n.y, n.z);
    world.add(rootG);
    nodeMap.set(n.id, { root: rootG, baseY: n.y });
  }

  type Pulse = { mesh: THREE.Mesh; curve: THREE.CubicBezierCurve3; speed: number; phase: number };
  const pulses: Pulse[] = [];

  const anchor = (id: string) => {
    const n = NODES.find((x) => x.id === id)!;
    return new THREE.Vector3(n.x, n.y + 0.1, n.z);
  };

  for (const e of EDGES) {
    const a = anchor(e.from);
    const b = anchor(e.to);
    const mid = a.clone().lerp(b, 0.5);
    if (e.kind === "event") {
      mid.y = (a.y + b.y) * 0.5 + 0.2;
      mid.z += 0.5;
    } else {
      mid.y = Math.max(a.y, b.y) + e.lift;
    }
    const c1 = a.clone().lerp(mid, 0.55);
    const c2 = b.clone().lerp(mid, 0.55);
    const curve = new THREE.CubicBezierCurve3(a, c1, c2, b);

    const color = e.kind === "event" ? C.accent : C.ink;
    world.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 56, e.kind === "event" ? 0.032 : 0.026, 10, false),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.35,
          metalness: 0.12,
          emissive: color,
          emissiveIntensity: e.kind === "event" ? 0.1 : 0.03,
        }),
      ),
    );
    world.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 40, 0.06, 8, false),
        new THREE.MeshBasicMaterial({
          color: e.kind === "event" ? C.accentSoft : 0x9a9284,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
        }),
      ),
    );

    const badge = makeEdgeBadge(e.label, e.kind);
    badge.position.copy(curve.getPoint(e.labelT));
    badge.position.y += 0.22;
    // nudge badges apart
    if (e.kind === "login") badge.position.x -= 0.15;
    if (e.kind === "token") badge.position.x += 0.15;
    if (e.kind === "event") badge.position.x += 0.85;
    world.add(badge);

    for (let i = 0; i < 2; i++) {
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.07, 14, 14),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.5,
          roughness: 0.25,
        }),
      );
      world.add(pulse);
      pulses.push({ mesh: pulse, curve, speed: e.kind === "event" ? 0.2 : 0.16, phase: i * 0.5 });
    }
  }

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
    labelRenderer.setSize(w, h);
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
    const meshes: THREE.Object3D[] = [];
    world.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData?.id) meshes.push(o);
    });
    return raycaster.intersectObjects(meshes, false)[0]?.object.userData?.id as string | undefined;
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
    targetRotY += (ev.clientX - lastX) * 0.004;
    targetRotX += (ev.clientY - lastY) * 0.0032;
    targetRotX = THREE.MathUtils.clamp(targetRotX, 0.22, 0.55);
    // limit yaw so diagram stays readable
    targetRotY = THREE.MathUtils.clamp(targetRotY, -0.15, 0.95);
    lastX = ev.clientX;
    lastY = ev.clientY;
  });
  canvas.addEventListener("pointerup", (ev) => {
    dragging = false;
    canvas.style.cursor = "grab";
    if (Math.hypot(ev.clientX - downX, ev.clientY - downY) < 8) {
      selected = pick(ev.clientX, ev.clientY) ?? null;
      setHint(selected);
      for (const [id, n] of nodeMap) n.root.scale.setScalar(id === selected ? 1.06 : 1);
    }
  });
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      distance = THREE.MathUtils.clamp(distance + ev.deltaY * 0.008, 8, 14);
    },
    { passive: false },
  );

  const ro = new ResizeObserver(setSize);
  ro.observe(root);

  let raf = 0;
  const clock = new THREE.Clock();

  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    rotY += (targetRotY - rotY) * 0.1;
    rotX += (targetRotX - rotX) * 0.1;
    // no auto-spin (was a big source of label chaos)

    const cy = Math.cos(rotX);
    camera.position.set(
      Math.sin(rotY) * distance * cy,
      2.6 + Math.sin(rotX) * distance * 0.5,
      Math.cos(rotY) * distance * cy,
    );
    camera.lookAt(0, 0.05, 0.15);

    // tiny bob only on boxes — labels stay parented, small motion OK
    for (const n of NODES) {
      const entry = nodeMap.get(n.id);
      if (entry) entry.root.position.y = entry.baseY + Math.sin(t * 0.9 + n.x * 0.2) * 0.025;
    }

    for (let i = 0; i < pulses.length; i++) {
      const p = pulses[i];
      const phase = (t * p.speed + p.phase) % 1;
      p.mesh.position.copy(p.curve.getPoint(phase));
      p.mesh.scale.setScalar(0.9 + 0.2 * Math.sin(phase * Math.PI));
    }

    renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
  };
  animate();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    labelRenderer.domElement.remove();
    disposeObject(scene);
    renderer.dispose();
  };
}
