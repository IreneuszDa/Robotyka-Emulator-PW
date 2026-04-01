// ============================================================
// Three.js Scene Manager — Wireframe 3D Viewport
// ============================================================
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneManager {
  constructor(canvas) {
    this.canvas = canvas;
    this.objects = new Map();  // name → THREE.Group
    this.robotGroups = new Map();  // robot name → { links: Map<linkName, Group>, base: Group }

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a18);

    // Camera — Z-up convention (robotics standard)
    this.camera = new THREE.PerspectiveCamera(50, 1, 1, 50000);
    this.camera.up.set(0, 0, 1); // Z is up
    this.camera.position.set(600, -800, 400);
    this.camera.lookAt(0, 0, 150);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // Controls
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.target.set(0, 0, 150);
    this.controls.update();

    // Helpers
    this.gridHelper = null;
    this.axesHelper = null;
    this.axisLabels = [];
    this._createHelpers();

    // Lights (subtle for wireframe visibility)
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    const directional = new THREE.DirectionalLight(0xccddff, 0.3);
    directional.position.set(500, -600, 800);
    this.scene.add(directional);
    this.scene.add(ambient);

    // Resize handling
    this._resize();
    window.addEventListener('resize', () => this._resize());

    // Start render loop
    this._animate();
  }

  _createHelpers() {
    // Grid — lies on XY plane (Z-up convention)
    this.gridHelper = new THREE.GridHelper(2000, 40, 0x1a1a40, 0x111130);
    this.gridHelper.rotation.x = Math.PI / 2; // rotate from XZ plane to XY plane
    this.scene.add(this.gridHelper);

    // Axes
    this.axesHelper = new THREE.AxesHelper(300);
    this.scene.add(this.axesHelper);

    // Axis labels using sprites
    this._createAxisLabel('X', new THREE.Vector3(320, 0, 0), 0xff4444);
    this._createAxisLabel('Y', new THREE.Vector3(0, 320, 0), 0x44ff44);
    this._createAxisLabel('Z', new THREE.Vector3(0, 0, 320), 0x4444ff);
  }

  _createAxisLabel(text, position, color) {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#' + color.toString(16).padStart(6, '0');
    ctx.font = 'bold 48px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 32, 32);

    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.position.copy(position);
    sprite.scale.set(40, 40, 1);
    this.scene.add(sprite);
    this.axisLabels.push(sprite);
  }

  _resize() {
    const container = this.canvas.parentElement;
    if (!container) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  _animate() {
    requestAnimationFrame(() => this._animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // --- Public API ---

  clearScene() {
    // Remove user objects but keep helpers and lights
    const toRemove = [];
    this.scene.traverse((child) => {
      if (child === this.scene) return;
      if (child === this.gridHelper) return;
      if (child === this.axesHelper) return;
      if (this.axisLabels.includes(child)) return;
      if (child.isLight) return;
      // Check if child is a direct child of scene and not a helper
      if (child.parent === this.scene && !child.isLight) {
        toRemove.push(child);
      }
    });
    for (const obj of toRemove) {
      this.scene.remove(obj);
    }
    this.objects.clear();
    this.robotGroups.clear();
  }

  addWireframeGroup(name, group, color = 0x00e676) {
    // Apply wireframe material to all meshes in group
    group.traverse((child) => {
      if (child.isMesh) {
        child.material = new THREE.MeshBasicMaterial({
          color: color,
          wireframe: true,
          transparent: true,
          opacity: 0.85
        });
      }
    });
    this.objects.set(name, group);
    this.scene.add(group);
  }

  removeObject(name) {
    const obj = this.objects.get(name);
    if (obj) {
      this.scene.remove(obj);
      this.objects.delete(name);
    }
  }

  // Add a robot with named links
  addRobot(robotName, linksMap, baseGroup) {
    // linksMap: Map<string, THREE.Group>
    if (baseGroup) {
      this.scene.add(baseGroup);
    }
    this.robotGroups.set(robotName, { links: linksMap, base: baseGroup });
  }

  // Get an object group for manipulation
  getObject(name) {
    return this.objects.get(name) || null;
  }

  getRobot(name) {
    return this.robotGroups.get(name) || null;
  }

  // Camera presets
  resetView() {
    this.camera.position.set(600, -800, 400);
    this.controls.target.set(0, 0, 150);
    this.controls.update();
  }

  setViewFront() {
    // Looking along -Y axis (front view in Z-up)
    this.camera.position.set(0, -1000, 200);
    this.controls.target.set(0, 0, 200);
    this.controls.update();
  }

  setViewSide() {
    // Looking along -X axis (side view in Z-up)
    this.camera.position.set(1000, 0, 200);
    this.controls.target.set(0, 0, 200);
    this.controls.update();
  }

  setViewTop() {
    // Looking down Z axis (top view in Z-up)
    this.camera.position.set(0, -0.01, 1200);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  // Toggle helpers
  toggleGrid(visible) {
    if (this.gridHelper) this.gridHelper.visible = visible;
  }

  toggleAxes(visible) {
    if (this.axesHelper) this.axesHelper.visible = visible;
    this.axisLabels.forEach(s => s.visible = visible);
  }

  toggleLabels(visible) {
    this.axisLabels.forEach(s => s.visible = visible);
  }

  // Get camera info (for status bar)
  getCameraInfo() {
    const p = this.camera.position;
    const zoom = Math.round(1000 / this.camera.position.distanceTo(this.controls.target) * 100);
    return {
      x: Math.round(p.x),
      y: Math.round(p.y),
      z: Math.round(p.z),
      zoom: zoom
    };
  }
}
