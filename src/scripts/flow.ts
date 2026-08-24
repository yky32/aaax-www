import * as THREE from "three";

type NodeDef = {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  z: number;
  accent?: boolean;
};

const NODES: NodeDef[] = [
  { id: "user", label: "Browser", sub: "user / SPA", x: -3.2, y: 0.35, z: 0 },
  { id: "aaax", label: "AAAX", sub: "Spring Boot AS", x: 0, y: 0.55, z: 0, accent: true },
  { id: "app", label: "Your app", sub: "resource server", x: 3.2, y: 0.35, z: 0 },
  { id: "mesh", label: "Your mesh", sub: "Kafka · webhook", x: 0, y: -1.65, z: 0.4 },
];

const EDGES: { from: string; to: string; kind: "login" | "event"; label: string }[] = [
  { from: "user", to: "aaax", kind: "login", label: "login / authorize" },
  { from: "aaax", to: "app", kind: "login", label: "OIDC JWT" },
  { from: "aaax", to: "mesh", kind: "event", label: "identity events" },
];

const COPY: Record<string, string> = {
  user: "Browser hits hosted /sign-in or starts OAuth (PKCE).",
  aaax: "Spring Authorization Server: session, MFA, tokens, JWKS.",
  app: "Your API validates JWT — AAAX is the issuer, not the business app.",
  mesh: "CloudEvents → Kafka or HMAC webhook. You send SMS/email.",
  default: "Drag to orbit · scroll to zoom · click a box for the hop.",
};

function roundedBox(w: number, h: number, d: number, color: number, opacity = 1) {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.55,
    metalness: 0.05,
    transparent: opacity < 1,
    opacity,
  });
  return new THREE.Mesh(geo, mat);
}

function makeLabel(text: string, sub: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#1a1814";
  ctx.font = "600 42px IBM Plex Sans, system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 256, 110);
  ctx.fillStyle = "#6b6560";
  ctx.font = "500 28px IBM Plex Mono, monospace";
  ctx.fillText(sub, 256, 160);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.4, 1.2, 1);
  return sprite;
}

export function initAaaxFlow(root: HTMLElement) {
  const canvas = root.querySelector("canvas") as HTMLCanvasElement | null;
  const hint = root.querySelector(".hint") as HTMLElement | null;
  if (!canvas) return () => {};

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
  camera.position.set(0.2, 1.4, 8.2);

  const ambient = new THREE.AmbientLight(0xfff6eb, 1.15);
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(4, 6, 5);
  const fill = new THREE.DirectionalLight(0xc45c26, 0.25);
  fill.position.set(-3, 2, 2);
  scene.add(ambient, key, fill);

  // ground card
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 8),
    new THREE.MeshStandardMaterial({ color: 0xf3eee4, roughness: 0.95, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -2.35;
  scene.add(floor);

  const nodeMeshes = new Map<string, THREE.Object3D>();
  const group = new THREE.Group();
  scene.add(group);

  for (const n of NODES) {
    const g = new THREE.Group();
    const body = roundedBox(1.7, 0.95, 1.05, n.accent ? 0xc45c26 : 0x1a1814);
    body.position.y = 0.48;
    body.userData = { id: n.id };
    g.add(body);

    // top plate paper face
    const face = roundedBox(1.55, 0.06, 0.9, 0xfffcf7);
    face.position.y = 0.98;
    face.userData = { id: n.id };
    g.add(face);

    const label = makeLabel(n.label, n.sub);
    label.position.set(0, 1.55, 0);
    g.add(label);

    g.position.set(n.x, n.y, n.z);
    group.add(g);
    nodeMeshes.set(n.id, g);
  }

  // edges as tubes + pulse dots
  const pulses: { mesh: THREE.Mesh; a: THREE.Vector3; b: THREE.Vector3; speed: number; t: number; color: number }[] =
    [];

  const posOf = (id: string) => {
    const n = NODES.find((x) => x.id === id)!;
    return new THREE.Vector3(n.x, n.y + 0.5, n.z);
  };

  for (const e of EDGES) {
    const a = posOf(e.from);
    const b = posOf(e.to);
    const curve = new THREE.LineCurve3(a, b);
    const color = e.kind === "event" ? 0xc45c26 : 0x1a1814;
    const tube = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 20, e.kind === "event" ? 0.028 : 0.022, 6, false),
      new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1 }),
    );
    group.add(tube);

    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 12, 12),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 }),
    );
    group.add(pulse);
    pulses.push({
      mesh: pulse,
      a: a.clone(),
      b: b.clone(),
      speed: e.kind === "event" ? 0.35 : 0.28,
      t: Math.random(),
      color,
    });
  }

  // orbit controls light (manual)
  let dragging = false;
  let px = 0;
  let py = 0;
  let rotY = 0.15;
  let rotX = 0.18;
  let targetRotY = rotY;
  let targetRotX = rotX;
  let distance = 8.2;

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
  let selected: string | null = null;

  const setHint = (id: string | null) => {
    if (!hint) return;
    if (!id) {
      hint.innerHTML = COPY.default;
      return;
    }
    const n = NODES.find((x) => x.id === id);
    hint.innerHTML = `<strong>${n?.label ?? id}</strong> — ${COPY[id] ?? COPY.default}`;
  };
  setHint(null);

  const pick = (clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const meshes: THREE.Object3D[] = [];
    group.traverse((o) => {
      if ((o as THREE.Mesh).isMesh && o.userData?.id) meshes.push(o);
    });
    const hits = raycaster.intersectObjects(meshes, false);
    return hits[0]?.object.userData?.id as string | undefined;
  };

  const onPointerDown = (ev: PointerEvent) => {
    dragging = true;
    px = ev.clientX;
    py = ev.clientY;
    canvas.setPointerCapture(ev.pointerId);
  };
  const onPointerMove = (ev: PointerEvent) => {
    if (!dragging) return;
    const dx = ev.clientX - px;
    const dy = ev.clientY - py;
    px = ev.clientX;
    py = ev.clientY;
    targetRotY += dx * 0.005;
    targetRotX += dy * 0.004;
    targetRotX = Math.max(-0.35, Math.min(0.55, targetRotX));
  };
  const onPointerUp = (ev: PointerEvent) => {
    const moved = Math.hypot(ev.clientX - px, ev.clientY - py);
    dragging = false;
    // click select if little movement since last move — use down origin
  };
  let downX = 0;
  let downY = 0;
  canvas.addEventListener("pointerdown", (ev) => {
    downX = ev.clientX;
    downY = ev.clientY;
    onPointerDown(ev);
  });
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", (ev) => {
    dragging = false;
    const dist = Math.hypot(ev.clientX - downX, ev.clientY - downY);
    if (dist < 6) {
      const id = pick(ev.clientX, ev.clientY);
      selected = id ?? null;
      setHint(selected);
      // scale feedback
      for (const [nid, obj] of nodeMeshes) {
        const s = nid === selected ? 1.08 : 1;
        obj.scale.setScalar(s);
      }
    }
  });
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      distance = Math.max(5.5, Math.min(12, distance + ev.deltaY * 0.01));
    },
    { passive: false },
  );

  const ro = new ResizeObserver(() => setSize());
  ro.observe(root);

  let raf = 0;
  const clock = new THREE.Clock();
  const animate = () => {
    raf = requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    rotY += (targetRotY - rotY) * 0.08;
    rotX += (targetRotX - rotX) * 0.08;
    // idle drift
    if (!dragging) targetRotY += 0.0012;

    camera.position.x = Math.sin(rotY) * distance * Math.cos(rotX);
    camera.position.z = Math.cos(rotY) * distance * Math.cos(rotX);
    camera.position.y = 1.2 + Math.sin(rotX) * distance * 0.35;
    camera.lookAt(0, -0.2, 0);

    // gentle bob
    for (const n of NODES) {
      const g = nodeMeshes.get(n.id);
      if (g) g.position.y = n.y + Math.sin(t * 1.2 + n.x) * 0.04;
    }

    for (const p of pulses) {
      p.t = (p.t + p.speed * 0.016) % 1;
      p.mesh.position.lerpVectors(p.a, p.b, p.t);
      // follow node bob roughly
      p.mesh.position.y += Math.sin(t * 1.2) * 0.02;
    }

    renderer.render(scene, camera);
  };
  animate();

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    renderer.dispose();
  };
}
