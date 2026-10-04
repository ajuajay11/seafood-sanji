import * as THREE from "three";

// Renders the Zoro runner as a 2.5D scene: the hand-drawn sprites stand in a lit 3D world with a
// shader sea, swaying grass, contact shadows and distance haze. Game logic stays in "game units"
// (the old 1000×420 canvas pixels); this module maps them into world space. The view is always
// VIEW_W game units wide; its height follows the canvas, so a taller screen shows more sky and grass.

/** Game pixels per world unit. */
const U = 100;
const VIEW_W = 1000, VIEW_H = 420;
/** Half the horizontal field of view, fixed so VIEW_W game units always span the canvas width. */
const HALF_FOV_X = Math.atan(Math.tan((28 / 2) * (Math.PI / 180)) * (VIEW_W / VIEW_H));
const SEA_LEVEL = -0.12;
const SHORE_Z = -1;

export type SceneAssets = { grass: HTMLImageElement; ships: HTMLImageElement };
/** A character pose; `x` is the sprite's centre and all sizes are in game pixels. */
export type SceneSprite = { image: HTMLImageElement; x: number; width: number; height: number; lift: number };
/** Text pinned above the ground; `x` in game pixels, `y` in pixels above the ground line. */
export type SceneLabel = { text: string; x: number; y: number; color: string; size: number };
export type SceneFrame = {
  scroll: number; swell: number; sprites: SceneSprite[]; labels: SceneLabel[];
  caption: string; won: boolean; door: number; closedTitle: string; closedSub: string;
  /** 0–1: how deep into Diable Jambe slow motion the frame is; draws a burning vignette. */
  slowMo: number;
};

const SKY_COLOR = "#e7eee9";

const seaVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  float swell(vec2 p) {
    return sin(p.x * 0.9 + uTime * 1.1) * 0.05
         + sin(p.y * 1.4 - uTime * 0.8 + p.x * 0.35) * 0.04
         + sin((p.x * 0.6 + p.y) * 2.3 + uTime * 1.7) * 0.015;
  }
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    float e = 0.06;
    vec2 p = world.xz;
    vec3 n = normalize(vec3(swell(p - vec2(e, 0.0)) - swell(p + vec2(e, 0.0)), 2.0 * e,
                            swell(p - vec2(0.0, e)) - swell(p + vec2(0.0, e))));
    world.y += swell(p);
    vWorld = world.xyz;
    vNormal = n;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const seaFragment = /* glsl */ `
  uniform float uTime;
  uniform vec3 uDeep;
  uniform vec3 uShallow;
  uniform vec3 uSky;
  uniform vec3 uSunDir;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uShore;
  varying vec3 vWorld;
  varying vec3 vNormal;
  void main() {
    vec3 view = normalize(cameraPosition - vWorld);
    vec3 n = normalize(vNormal);
    float fresnel = pow(1.0 - max(dot(n, view), 0.0), 5.0) * 0.55;
    vec3 color = mix(uShallow, uDeep, smoothstep(uShore, uShore - 9.0, vWorld.z));
    color = mix(color, uSky, fresnel);
    vec3 halfway = normalize(uSunDir + view);
    color += vec3(1.0, 0.95, 0.85) * pow(max(dot(n, halfway), 0.0), 420.0) * 0.9;
    // Lapping foam where the sea meets the shore.
    float edge = smoothstep(uShore - 0.9, uShore, vWorld.z);
    float lap = 0.5 + 0.5 * sin(vWorld.x * 3.1 + uTime * 1.3 + sin(vWorld.x * 1.7) * 1.5);
    color = mix(color, vec3(0.97, 0.98, 1.0), edge * smoothstep(0.35, 0.9, lap + edge * 0.4) * 0.85);
    float fog = smoothstep(uFogNear, uFogFar, length(cameraPosition - vWorld));
    gl_FragColor = vec4(mix(color, uFogColor, fog), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const bladeVertex = /* glsl */ `
  attribute vec3 aBlade; // x, z, height
  attribute float aPhase;
  uniform float uCamX;
  uniform float uTime;
  varying float vTip;
  varying float vDistance;
  varying float vShade;
  void main() {
    float x = uCamX + mod(aBlade.x - uCamX + 12.0, 24.0) - 12.0;
    float tip = position.y;
    float sway = sin(uTime * 1.6 + aPhase + x * 0.8) * 0.3 * tip * tip;
    vec4 world = vec4(x + position.x + sway * aBlade.z, tip * aBlade.z, aBlade.y + sway * 0.2 * aBlade.z, 1.0);
    vTip = tip;
    vShade = fract(aPhase * 7.13);
    vDistance = length(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const bladeFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uTip;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  varying float vTip;
  varying float vDistance;
  varying float vShade;
  void main() {
    vec3 color = mix(uBase, uTip, vTip) * (0.8 + vShade * 0.35);
    gl_FragColor = vec4(mix(color, uFogColor, smoothstep(uFogNear, uFogFar, vDistance)), 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

const wrap = (value: number, span: number) => ((value % span) + span) % span;

export function createGameScene(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(SKY_COLOR, 18, 75);
  const camera = new THREE.PerspectiveCamera(28, VIEW_W / VIEW_H, 0.1, 120);

  // Sky: soft blue overhead fading into a warm, hazy horizon with a low sun glow.
  const skyCanvas = document.createElement("canvas");
  skyCanvas.width = 512; skyCanvas.height = 256;
  const sky = skyCanvas.getContext("2d")!;
  const skyGradient = sky.createLinearGradient(0, 0, 0, 256);
  skyGradient.addColorStop(0, "#86b9d8"); skyGradient.addColorStop(0.28, "#bcd9e6");
  skyGradient.addColorStop(0.4, SKY_COLOR); skyGradient.addColorStop(1, SKY_COLOR);
  sky.fillStyle = skyGradient; sky.fillRect(0, 0, 512, 256);
  const glow = sky.createRadialGradient(400, 92, 0, 400, 92, 150);
  glow.addColorStop(0, "rgba(255, 244, 214, 0.95)"); glow.addColorStop(0.15, "rgba(255, 236, 196, 0.55)"); glow.addColorStop(1, "rgba(255, 236, 196, 0)");
  sky.fillStyle = glow; sky.fillRect(0, 0, 512, 256);
  const skyTexture = new THREE.CanvasTexture(skyCanvas);
  skyTexture.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTexture;

  scene.add(new THREE.HemisphereLight("#dff1ff", "#4f6b33", 1.4));
  const sun = new THREE.DirectionalLight("#fff1d6", 2.4);
  scene.add(sun, sun.target);
  // The glint on the water comes from the low sun in the sky glow, out over the sea.
  const sunDirection = new THREE.Vector3(0.45, 0.22, -1).normalize();

  // Sea: a dense plane displaced by a few travelling sines, shaded with fresnel sky reflection,
  // a sun glint and shoreline foam. It follows the camera; the waves are fixed in world space.
  const seaGeometry = new THREE.PlaneGeometry(90, 64, 220, 140);
  seaGeometry.rotateX(-Math.PI / 2);
  const fog = scene.fog as THREE.Fog;
  const seaMaterial = new THREE.ShaderMaterial({
    vertexShader: seaVertex, fragmentShader: seaFragment,
    uniforms: {
      uTime: { value: 0 }, uShore: { value: SHORE_Z },
      uDeep: { value: new THREE.Color("#0b4f73") }, uShallow: { value: new THREE.Color("#2f93b5") },
      uSky: { value: new THREE.Color("#a9d3e4") }, uSunDir: { value: sunDirection },
      uFogColor: { value: fog.color }, uFogNear: { value: fog.near }, uFogFar: { value: fog.far },
    },
  });
  const sea = new THREE.Mesh(seaGeometry, seaMaterial);
  sea.position.set(0, SEA_LEVEL, SHORE_Z - 32);
  scene.add(sea);

  // Distant islands, washed out by haze.
  const islandMaterial = new THREE.MeshStandardMaterial({ color: "#5f8a64", roughness: 1 });
  const islandGeometry = new THREE.SphereGeometry(1, 32, 16);
  const islands = [-26, -6, 13, 34].map((x, index) => {
    const island = new THREE.Mesh(islandGeometry, islandMaterial);
    island.scale.set(3 + index * 0.9, 0.8 + (index % 2) * 0.6, 1.5);
    island.userData.baseX = x;
    island.position.set(x, SEA_LEVEL - 0.2, -36 - index * 2.5);
    scene.add(island);
    return island;
  });

  // Sand along the waterline, then the grass bank the fight happens on.
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(80, 0.6), new THREE.MeshStandardMaterial({ color: "#e6d3a3", roughness: 1 }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(0, -0.02, SHORE_Z - 0.15);
  scene.add(sand);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: "#5c9a2e", roughness: 0.95 });
  // Deep enough to run under the camera (z 8.5), so a tall view never sees past its front edge.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 12), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, SHORE_Z + 6);
  scene.add(ground);

  // Thousands of individual grass blades, swaying, wrapped around the camera as it scrolls.
  const BLADES = 9000;
  const bladeGeometry = new THREE.InstancedBufferGeometry();
  bladeGeometry.setAttribute("position", new THREE.Float32BufferAttribute([-0.022, 0, 0, 0.022, 0, 0, 0, 1, 0], 3));
  const bladeData = new Float32Array(BLADES * 3), bladePhase = new Float32Array(BLADES);
  for (let i = 0; i < BLADES; i++) {
    const z = SHORE_Z + 0.1 + Math.pow(Math.random(), 1.3) * 3.6;
    bladeData.set([Math.random() * 24 - 12, z, 0.05 + Math.random() * 0.08], i * 3);
    bladePhase[i] = Math.random() * Math.PI * 2;
  }
  bladeGeometry.setAttribute("aBlade", new THREE.InstancedBufferAttribute(bladeData, 3));
  bladeGeometry.setAttribute("aPhase", new THREE.InstancedBufferAttribute(bladePhase, 1));
  bladeGeometry.instanceCount = BLADES;
  const bladeMaterial = new THREE.ShaderMaterial({
    vertexShader: bladeVertex, fragmentShader: bladeFragment, side: THREE.DoubleSide,
    uniforms: {
      uCamX: { value: 0 }, uTime: { value: 0 },
      uBase: { value: new THREE.Color("#244a14") }, uTip: { value: new THREE.Color("#9ccf4a") },
      uFogColor: { value: fog.color }, uFogNear: { value: fog.near }, uFogFar: { value: fog.far },
    },
  });
  const blades = new THREE.Mesh(bladeGeometry, bladeMaterial);
  blades.frustumCulled = false;
  scene.add(blades);

  // Sprites: unlit, alpha-tested planes so the hand-drawn art keeps its original colours.
  const textures = new Map<HTMLImageElement | HTMLCanvasElement, THREE.Texture>();
  const textureFor = (image: HTMLImageElement | HTMLCanvasElement) => {
    let texture = textures.get(image);
    if (!texture) {
      texture = image instanceof HTMLCanvasElement ? new THREE.CanvasTexture(image) : new THREE.Texture(image);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      texture.needsUpdate = true;
      textures.set(image, texture);
    }
    return texture;
  };
  const spriteGeometry = new THREE.PlaneGeometry(1, 1);
  spriteGeometry.translate(0, 0.5, 0); // origin at the feet
  // Soft contact shadow on the grass under each character; it shrinks and fades as they jump.
  const blobCanvas = document.createElement("canvas");
  blobCanvas.width = blobCanvas.height = 128;
  const blobContext = blobCanvas.getContext("2d")!;
  const blobGradient = blobContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  blobGradient.addColorStop(0, "rgba(16, 32, 8, 0.6)"); blobGradient.addColorStop(0.55, "rgba(16, 32, 8, 0.3)"); blobGradient.addColorStop(1, "rgba(16, 32, 8, 0)");
  blobContext.fillStyle = blobGradient; blobContext.fillRect(0, 0, 128, 128);
  const blobMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(blobCanvas), transparent: true, depthWrite: false });
  const blobGeometry = new THREE.PlaneGeometry(1, 1);
  blobGeometry.rotateX(-Math.PI / 2);
  type Character = { sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; blob: THREE.Mesh };
  const makeCharacter = (): Character => {
    const sprite = new THREE.Mesh(spriteGeometry, new THREE.MeshBasicMaterial({ alphaTest: 0.5, toneMapped: false, side: THREE.DoubleSide }));
    const blob = new THREE.Mesh(blobGeometry, blobMaterial);
    blob.renderOrder = 1; // over the grass blades
    sprite.visible = blob.visible = false;
    scene.add(sprite, blob);
    return { sprite, blob };
  };
  const characters: Character[] = [];

  // The two ships, cropped out of ships.png once it has decoded.
  type Ship = { mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>; wake: THREE.Mesh; baseX: number; z: number; phase: number };
  // A soft dark pool on the water under each hull, so the ships sit on the sea instead of hovering.
  const wakeCanvas = document.createElement("canvas");
  wakeCanvas.width = wakeCanvas.height = 128;
  const wakeContext = wakeCanvas.getContext("2d")!;
  const wakeGradient = wakeContext.createRadialGradient(64, 64, 0, 64, 64, 64);
  wakeGradient.addColorStop(0, "rgba(4, 30, 46, 0.55)"); wakeGradient.addColorStop(0.6, "rgba(4, 30, 46, 0.25)"); wakeGradient.addColorStop(1, "rgba(4, 30, 46, 0)");
  wakeContext.fillStyle = wakeGradient; wakeContext.fillRect(0, 0, 128, 128);
  const wakeMaterial = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(wakeCanvas), transparent: true, depthWrite: false });
  const wakeGeometry = new THREE.PlaneGeometry(1, 1);
  wakeGeometry.rotateX(-Math.PI / 2);
  const ships: Ship[] = [];

  let ready = false;
  const setAssets = ({ grass, ships: sheet }: SceneAssets) => {
    // The flat, mottled upper part of grass.jpg makes a soft turf texture.
    const turfCanvas = document.createElement("canvas");
    turfCanvas.width = 1024; turfCanvas.height = 512;
    turfCanvas.getContext("2d")!.drawImage(grass, 0, 120, grass.naturalWidth, 960, 0, 0, 1024, 512);
    const turf = textureFor(turfCanvas);
    turf.wrapS = turf.wrapT = THREE.MirroredRepeatWrapping;
    turf.repeat.set(60 / 5, 12 / 2.5);
    groundMaterial.map = turf;
    groundMaterial.color.set("#ffffff");
    groundMaterial.needsUpdate = true;
    for (const [rect, height, baseX, z, phase] of [
      [[154, 150, 362, 440], 1.75, -1.2, -7.5, 0],
      [[892, 138, 418, 467], 2.2, 3.4, -11.5, 2.1],
    ] as const) {
      const [sx, sy, sw, sh] = rect;
      const crop = document.createElement("canvas");
      crop.width = sw; crop.height = sh;
      crop.getContext("2d")!.drawImage(sheet, sx, sy, sw, sh, 0, 0, sw, sh);
      const mesh = new THREE.Mesh(spriteGeometry, new THREE.MeshBasicMaterial({ map: textureFor(crop), alphaTest: 0.5, toneMapped: false, fog: true }));
      mesh.scale.set(height * (sw / sh), height, 1);
      const wake = new THREE.Mesh(wakeGeometry, wakeMaterial);
      wake.scale.set(height * (sw / sh) * 1.1, 1, 0.9);
      scene.add(mesh, wake);
      ships.push({ mesh, wake, baseX, z, phase });
    }
    ready = true;
  };

  const overlayContext = overlay.getContext("2d")!;
  const project = new THREE.Vector3();
  /** Height of the view in game units (VIEW_H at the original 1000×420 ratio). */
  let viewH = VIEW_H;
  const resize = () => {
    const cssWidth = Math.max(1, canvas.parentElement?.clientWidth ?? VIEW_W);
    const cssHeight = Math.max(1, canvas.parentElement?.clientHeight ?? VIEW_H);
    viewH = VIEW_W * (cssHeight / cssWidth);
    camera.aspect = cssWidth / cssHeight;
    camera.fov = 2 * Math.atan(Math.tan(HALF_FOV_X) / camera.aspect) * (180 / Math.PI);
    camera.updateProjectionMatrix();
    renderer.setSize(cssWidth, cssHeight, false);
    const ratio = Math.min(window.devicePixelRatio, 2);
    overlay.width = Math.round(cssWidth * ratio); overlay.height = Math.round(cssHeight * ratio);
  };
  resize();
  const observer = new ResizeObserver(resize);
  if (canvas.parentElement) observer.observe(canvas.parentElement);

  const render = (frame: SceneFrame) => {
    const camX = frame.scroll / U;
    const toWorldX = (x: number) => camX + (x - VIEW_W / 2) / U;
    camera.position.set(camX, 1.6, 8.5);
    camera.lookAt(camX, 1.1, 0);
    // Key light from behind and to the left; it shades the turf and islands.
    sun.position.set(camX - 5, 7, -4);
    sun.target.position.set(camX, 0, 0);
    sea.position.x = camX;
    sand.position.x = camX;
    ground.position.x = camX;
    if (groundMaterial.map) groundMaterial.map.offset.x = camX / 5;
    seaMaterial.uniforms.uTime.value = frame.swell;
    bladeMaterial.uniforms.uTime.value = frame.swell;
    bladeMaterial.uniforms.uCamX.value = camX;
    for (const island of islands) island.position.x = camX + wrap(island.userData.baseX - camX * 0.98 + 36, 72) - 36;
    for (const ship of ships) {
      const bob = Math.sin(frame.swell * 1.3 + ship.phase);
      ship.mesh.position.set(camX + wrap(ship.baseX - camX + 15, 30) - 15, SEA_LEVEL - 0.1 + bob * 0.04, ship.z);
      ship.mesh.rotation.z = Math.sin(frame.swell * 0.9 + ship.phase) * 0.025;
      ship.wake.position.set(ship.mesh.position.x, SEA_LEVEL + 0.06, ship.z + 0.05);
    }

    frame.sprites.forEach((sprite, index) => {
      const character = characters[index] ?? (characters[index] = makeCharacter());
      const { sprite: mesh, blob } = character;
      if (!ready) { mesh.visible = blob.visible = false; return; }
      const texture = textureFor(sprite.image);
      if (mesh.material.map !== texture) { mesh.material.map = texture; mesh.material.needsUpdate = true; }
      mesh.scale.set(sprite.width / U, sprite.height / U, 1);
      mesh.position.set(toWorldX(sprite.x), sprite.lift / U, index * 0.002);
      const air = 1 / (1 + sprite.lift / 60);
      blob.scale.set(0.9 * air, 1, 0.32 * air);
      blob.position.set(mesh.position.x, 0.07, 0.05);
      mesh.visible = blob.visible = true;
    });
    for (let index = frame.sprites.length; index < characters.length; index++) characters[index].sprite.visible = characters[index].blob.visible = false;

    renderer.render(scene, camera);
    drawOverlay(frame, toWorldX);
  };

  const drawOverlay = (frame: SceneFrame, toWorldX: (x: number) => number) => {
    const c = overlayContext;
    c.setTransform(overlay.width / VIEW_W, 0, 0, overlay.width / VIEW_W, 0, 0);
    c.clearRect(0, 0, VIEW_W, viewH);
    if (frame.slowMo > 0.01) {
      // Slow motion: the edges smoulder in Diable Jambe orange and the middle stays clear.
      const edge = c.createRadialGradient(VIEW_W / 2, viewH * 0.6, viewH * 0.35, VIEW_W / 2, viewH * 0.6, VIEW_W * 0.75);
      edge.addColorStop(0, "rgba(255, 90, 31, 0)");
      edge.addColorStop(1, `rgba(179, 32, 14, ${0.6 * frame.slowMo})`);
      c.fillStyle = edge; c.fillRect(0, 0, VIEW_W, viewH);
    }
    c.fillStyle = "#1c2b33"; c.font = "bold 23px sans-serif";
    // Below the HUD that the page overlays across the top of the stage.
    c.fillText(frame.caption, 30, 130);
    c.textAlign = "center"; c.lineJoin = "round";
    for (const label of frame.labels) {
      project.set(toWorldX(label.x), label.y / U, 0).project(camera);
      const x = ((project.x + 1) / 2) * VIEW_W, y = ((1 - project.y) / 2) * viewH;
      c.font = `bold ${label.size}px sans-serif`;
      c.strokeStyle = "rgba(255, 255, 255, 0.85)"; c.lineWidth = 4; c.strokeText(label.text, x, y);
      c.fillStyle = label.color; c.fillText(label.text, x, y);
    }
    c.textAlign = "start";
    if (!frame.won) return;
    // Sanji's had enough: the kitchen's double doors swing in from both sides and slam shut.
    const t = 1 - Math.pow(1 - frame.door, 3), width = 500 * t;
    c.lineWidth = 5; c.strokeStyle = "#000";
    for (const [x, knob] of [[0, width - 30], [1000 - width, 1000 - width + 30]]) {
      c.fillStyle = "#9a6232"; c.fillRect(x, 0, width, viewH); c.strokeRect(x, 0, width, viewH);
      c.fillStyle = "#00000022";
      for (let plank = x + 60; plank < x + width; plank += 60) c.fillRect(plank, 0, 4, viewH);
      c.fillStyle = "#f3c63f"; c.beginPath(); c.arc(knob, viewH * 0.52, 11, 0, Math.PI * 2); c.fill(); c.stroke();
    }
    c.textAlign = "center";
    if (frame.door >= 1) {
      c.fillStyle = "#fdfbf7"; c.fillRect(330, 70, 340, 110); c.strokeRect(330, 70, 340, 110);
      c.fillStyle = "#000";
      c.font = "bold 30px sans-serif"; c.fillText(frame.closedTitle, 500, 115);
      c.font = "bold 18px sans-serif"; c.fillText(frame.closedSub, 500, 155);
    } else if (frame.door > 0.75) { c.fillStyle = "#ff6584"; c.font = "bold 64px sans-serif"; c.fillText("SLAM!", 500, 120); }
    c.textAlign = "start";
  };

  const dispose = () => {
    observer.disconnect();
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of [object.material].flat()) material.dispose();
      }
    });
    for (const texture of textures.values()) texture.dispose();
    skyTexture.dispose();
    renderer.dispose();
  };

  return { setAssets, render, dispose };
}
