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
};

/**
 * Compact diamond layout — all labels sit ABOVE nodes (CSS2D),
 * so nothing clips at left/right stage edges.
 */
const NODES: NodeDef[] = [
  { id: "user", step: "1", label: "Browser", sub: "sign-in · PKCE", x: -2.65, y: 0.55, z: 0.15, role: "edge" },
  { id: "aaax", step: "2", label: "AAAX", sub: "Spring Boot AS", x: 0, y: 1.25, z: 0, role: "core" },
  { id: "app", step: "3", label: "Your app", sub: "JWT · API", x: 2.65, y: 0.55, z: 0.15, role: "edge" },
  { id: "mesh", step: "4", label: "Your stack", sub: "Kafka off · webhooks", x: 0, y: -1.45, z: 0.35, role: "out" },
];

type EdgeDef = {
  from: string;
  to: string;
  kind: "login" | "token" | "event";
  label: string;
  labelT: number;
  lift: number;
};

const EDGES: EdgeDef[] = [
  { from: "user", to: "aaax", kind: "login", label: "login", labelT: 0.45, lift: 0.45 },
  { from: "aaax", to: "app", kind: "token", label: "OIDC JWT", labelT: 0.55, lift: 0.45 },
  { from: "aaax", to: "mesh", kind: "event", label: "events", labelT: 0.48, lift: 0.2 },
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

/** Label always above the box, centered — stays inside the frame */
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
  // anchor at bottom-center of the HTML box → sits cleanly on top of mesh
  obj.center.set(0.5, 1);
  obj.position.set(0, 0.95, 0);
  return obj;
}

function makeEdgeBadge(text: string, kind: EdgeDef["kind"]) {
  const el = document.createElement("div");
  el.className = `flow-badge flow-badge--${kind}`;
  el.textContent = text;
  const obj = new CSS2DObject(el);
  obj.center.set(0.5, 0.5);
  return obj;
}

function nodeBody(role: Role) {
  const g = new THREE.Group();
  const isCore = role === "core";
  const w = isCore ? 1.2 : 1.05;
  const h = isCore ? 0.88 : 0.78;
  const d = isCore ? 0.98 : 0.82;

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
    new RoundedBoxGeometry(w * 0.9, 0.06, d * 0.86, 2, 0.03),
    new THREE.MeshStandardMaterial({ color: C.paper, roughness: 0.88, metalness: 0 }),
  );
  cap.position.y = h / 2 + 0.02;
  g.add(cap);

  if (isCore) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.85, 0.022, 10, 40),
      new THREE.MeshStandardMaterial({
        color: C.accentSoft,
        emissive: C.accent,
        emissiveIntensity: 0.2,
        roughness: 0.4,
      }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.1;
    g.add(ring);
  }

  return { group: g, hit: mesh };
}

export function initAaaxFlow(root: HTMLElement) {
  const canvas = root.querySelector("canvas") as HTMLCanvasElement | null;
  const hint = root.querySelector(".hint") as HTMLElement | null;
  if (!canvas) return () => {};

  root.querySelectorAll(".flow-css2d").forEach((n) => n.remove());

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.domElement.className = "flow-css2d";
  Object.assign(labelRenderer.domElement.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    overflow: "visible",
  });
  root.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 80);

  // Frontal-ish diagram angle — readable, labels stay on-screen
  let distance = 9.6;
  let rotY = 0.28;
  let rotX = 0.36;
  let targetRotY = rotY;
  let targetRotX = rotX;

  scene.add(new THREE.AmbientLight(0xfff8ef, 1.05));
  const key = new THREE.DirectionalLight(0xffffff, 0.95);
  key.position.set(3.5, 8, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -8;
  key.shadow.camera.right = 8;
  key.shadow.camera.top = 8;
  key.shadow.camera.bottom = -8;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc45c26, 0.25);
  rim.position.set(-4, 3, -2);
  scene.add(rim);
  scene.add(new THREE.HemisphereLight(0xfffaf3, 0xd9d0c0, 0.4));

  const plate = new THREE.Mesh(
    new RoundedBoxGeometry(10.5, 0.1, 7.2, 2, 0.06),
    new THREE.MeshStandardMaterial({ color: C.paperDeep, roughness: 0.93, metalness: 0 }),
  );
  plate.position.y = -2.35;
  plate.receiveShadow = true;
  scene.add(plate);

  const grid = new THREE.GridHelper(10, 10, 0xd9d2c3, 0xe8e1d4);
  grid.position.y = -2.28;
  const gm = grid.material as THREE.Material;
  gm.transparent = true;
  (gm as THREE.Material & { opacity: number }).opacity = 0.4;
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
    return new THREE.Vector3(n.x, n.y + 0.08, n.z);
  };

  for (const e of EDGES) {
    const a = anchor(e.from);
    const b = anchor(e.to);
    const mid = a.clone().lerp(b, 0.5);
    if (e.kind === "event") {
      mid.y = (a.y + b.y) * 0.5;
      mid.z += 0.35;
    } else {
      mid.y = Math.max(a.y, b.y) + e.lift;
    }
    const curve = new THREE.CubicBezierCurve3(a, a.clone().lerp(mid, 0.55), b.clone().lerp(mid, 0.55), b);
    const color = e.kind === "event" ? C.accent : C.ink;

    world.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 48, e.kind === "event" ? 0.03 : 0.024, 10, false),
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.35,
          metalness: 0.1,
          emissive: color,
          emissiveIntensity: e.kind === "event" ? 0.1 : 0.03,
        }),
      ),
    );
    world.add(
      new THREE.Mesh(
        new THREE.TubeGeometry(curve, 32, 0.055, 8, false),
        new THREE.MeshBasicMaterial({
          color: e.kind === "event" ? C.accentSoft : 0x9a9284,
          transparent: true,
          opacity: 0.14,
          depthWrite: false,
        }),
      ),
    );

    const badge = makeEdgeBadge(e.label, e.kind);
    const bp = curve.getPoint(e.labelT);
    badge.position.copy(bp);
    // keep badges slightly above the tube, inward (not past stage edges)
    badge.position.y += 0.28;
    if (e.kind === "event") badge.position.x = 0.55;
    world.add(badge);

    for (let i = 0; i < 2; i++) {
      const pulse = new THREE.Mesh(
        new THREE.SphereGeometry(0.065, 14, 14),
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
    targetRotY += (ev.clientX - lastX) * 0.0035;
    targetRotX += (ev.clientY - lastY) * 0.003;
    // tight clamp — keep diagram readable, labels on canvas
    targetRotY = THREE.MathUtils.clamp(targetRotY, 0.05, 0.55);
    targetRotX = THREE.MathUtils.clamp(targetRotX, 0.25, 0.48);
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
      distance = THREE.MathUtils.clamp(distance + ev.deltaY * 0.007, 8, 12);
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
    rotY += (targetRotY - rotY) * 0.12;
    rotX += (targetRotX - rotX) * 0.12;

    const cy = Math.cos(rotX);
    camera.position.set(
      Math.sin(rotY) * distance * cy,
      2.35 + Math.sin(rotX) * distance * 0.42,
      Math.cos(rotY) * distance * cy,
    );
    camera.lookAt(0, 0.15, 0.1);

    // no bob — stable labels
    for (const n of NODES) {
      const entry = nodeMap.get(n.id);
      if (entry) entry.root.position.y = entry.baseY;
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
