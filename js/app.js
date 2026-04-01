// ============================================================
// ARLANG Robotics Emulator — Main Application
// ============================================================
import { Lexer } from './parser/lexer.js';
import { Parser } from './parser/parser.js';
import { Interpreter } from './interpreter/interpreter.js';
import { buildRobotFromAST } from './interpreter/robotBuilder.js';
import { SceneManager } from './viewer/scene.js';

// ── Demo robot code (from kodStart.rtf) ──
// Note: NEXT JOINT limits for rotational joints are in degrees (auto-converted)
const DEMO_CODE = `$********************
procedure base1
parameters w,h1,h2,alfa1,alfa2,h3
+cuboid(w,w,h1)
tz(h1)
+cone(w/2,w/2-h2*sin(alfa1),h2)
tz(h2)
+cylinder(w/2-h2*sin(alfa1),h3)
endproc
$********************
procedure kinematics
next joint(arm1,base,-150,150,0)
dh notation(0,0,30,t())
next joint(arm2,arm1,0,100,0)
dh notation(50,0,t(),0)
next joint(arm3,arm2,-180,180,0)
dh notation(0,0,50,t())
next joint(arm4,arm3,0,100,0)
dh notation(50,0,t(),0)
endproc
$********************
procedure geometry
tz(30)
+base1(80,30,30,10°,10°,50)
object(arm1)
+cone(10,1,30)
object(arm2)
+cone(8,1,24)
object(arm3)
+cone(6,1,18)
object(arm4)
+cone(4,1,12)
endproc
$********************
procedure mj
parameters t1,t2,t3,t4
dt1:=t1-tstart(arm1)
dt2:=t2-tstart(arm2)
dt3:=t3-tstart(arm3)
dt4:=t4-tstart(arm4)
repeat
 move(arm1,dt1*l())
 move(arm2,dt2*l())
 move(arm3,dt3*l())
 move(arm4,dt4*l())
until done()
endproc
$********************
procedure mp
parameters x,y,z,gamma
$ Inverse kinematics placeholder
call mj(x,y,z,gamma)
endproc`;

// ── 5-DOF Articulated Arm Robot ──
// Base (fixed) → Shoulder (rotation around Z) → Elbow1 → Elbow2 → Elbow3 → Wrist (rotation)
const DEMO_5DOF = `$ 5-DOF Articulated Arm Robot
$ Base rotation + 3 elbow joints + wrist rotation
$********************
procedure kinematics
$ Joint 1: Shoulder - rotation around vertical axis, alpha=-90 tilts Z horizontal for elbows
next joint(shoulder,base,-180,180,0)
dh notation(0,-90°,60,t())
$ Joint 2: Elbow 1 - pitch in vertical plane (Z is now horizontal)
next joint(elbow1,shoulder,-90,90,0)
dh notation(80,0,0,t())
$ Joint 3: Elbow 2 - pitch in vertical plane
next joint(elbow2,elbow1,-120,120,0)
dh notation(70,0,0,t())
$ Joint 4: Elbow 3 - pitch, alpha=-90 tilts axis for wrist rotation
next joint(elbow3,elbow2,-120,120,0)
dh notation(60,-90°,0,t())
$ Joint 5: Wrist - rotation around arm's own axis
next joint(wrist,elbow3,-360,360,0)
dh notation(0,0,30,t())
endproc
$********************
procedure geometry
$ Base - fixed platform
+cylinder(40,20)
tz(20)
+cone(40,30,10)
tz(10)
+cylinder(30,30)
$ Shoulder - rotating vertical cylinder
object(shoulder)
+cylinder(15,60)
$ Elbow 1 - first arm segment (cone along X via rotation)
object(elbow1)
ry(-90)
+cone(12,10,80)
$ Elbow 2 - second arm segment
object(elbow2)
ry(-90)
+cone(10,8,70)
$ Elbow 3 - third arm segment
object(elbow3)
ry(-90°)
+cone(8,6,60)
$ Wrist - gripper/tool
object(wrist:gripper)
+cylinder(6,10)
tz(10)
+cone(6,2,20)
endproc
$********************
procedure mj
parameters t1,t2,t3,t4,t5
dt1:=t1-tstart(shoulder)
dt2:=t2-tstart(elbow1)
dt3:=t3-tstart(elbow2)
dt4:=t4-tstart(elbow3)
dt5:=t5-tstart(wrist)
repeat
 move(shoulder,dt1*l())
 move(elbow1,dt2*l())
 move(elbow2,dt3*l())
 move(elbow3,dt4*l())
 move(wrist,dt5*l())
until done()
endproc`;

class App {
  constructor() {
    // State
    this.files = new Map();      // filename → content
    this.activeFile = null;
    this.activeTab = 'robot';
    this.currentRobot = null;
    this.interpreter = null;
    this.animationId = null;
    this.isSimulating = false;

    // Cache DOM elements
    this.els = {
      canvas: document.getElementById('viewport-canvas'),
      editor: document.getElementById('code-editor'),
      lineNumbers: document.getElementById('line-numbers'),
      console: document.getElementById('console-output'),
      fileSelector: document.getElementById('file-selector'),
      fileInput: document.getElementById('file-input'),
      projectName: document.getElementById('project-name'),
      statusIndicator: document.getElementById('status-indicator'),
      jointSliders: document.getElementById('joint-sliders'),
      infoCoords: document.getElementById('info-coords'),
      infoZoom: document.getElementById('info-zoom'),
      editorLine: document.getElementById('editor-line'),
      editorCol: document.getElementById('editor-col'),
      editorFileType: document.getElementById('editor-file-type'),
    };

    // Initialize scene
    this.scene = new SceneManager(this.els.canvas);

    // Initialize interpreter
    this.interpreter = new Interpreter((msg, type) => this._log(msg, type));

    // Bind events
    this._bindEvents();

    // Load demo
    this._loadDemo();

    this._log('ARLANG Robotics Emulator uruchomiony', 'success');
    this._log('Wczytano przykladowy robot — kliknij [Buduj] lub Ctrl+Enter', 'info');
  }

  // ── Event Binding ──

  _bindEvents() {
    // Build button
    document.getElementById('btn-build')?.addEventListener('click', () => this._build());

    // Simulation controls
    document.getElementById('btn-simulate')?.addEventListener('click', () => this._startSimulation());
    document.getElementById('btn-stop')?.addEventListener('click', () => this._stopSimulation());
    document.getElementById('btn-step')?.addEventListener('click', () => this._stepSimulation());

    // Project buttons
    document.getElementById('btn-load')?.addEventListener('click', () => this.els.fileInput?.click());
    document.getElementById('btn-new')?.addEventListener('click', () => this._newProject());
    document.getElementById('btn-export')?.addEventListener('click', () => this._exportProject());

    // File input
    this.els.fileInput?.addEventListener('change', (e) => this._handleFileLoad(e));

    // View buttons
    document.getElementById('btn-reset-view')?.addEventListener('click', () => this.scene.resetView());
    document.getElementById('btn-view-front')?.addEventListener('click', () => this.scene.setViewFront());
    document.getElementById('btn-view-side')?.addEventListener('click', () => this.scene.setViewSide());
    document.getElementById('btn-view-top')?.addEventListener('click', () => this.scene.setViewTop());

    // View options
    document.getElementById('chk-grid')?.addEventListener('change', (e) => this.scene.toggleGrid(e.target.checked));
    document.getElementById('chk-axes')?.addEventListener('change', (e) => this.scene.toggleAxes(e.target.checked));
    document.getElementById('chk-labels')?.addEventListener('change', (e) => this.scene.toggleLabels(e.target.checked));

    // Tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => this._switchTab(btn.dataset.tab));
    });

    // File selector
    this.els.fileSelector?.addEventListener('change', () => {
      const filename = this.els.fileSelector.value;
      if (filename) this._openFile(filename);
    });

    // Add / Delete file buttons
    document.getElementById('btn-add-file')?.addEventListener('click', () => this._addFile());
    document.getElementById('btn-delete-file')?.addEventListener('click', () => this._deleteFile());

    // Editor events
    this.els.editor?.addEventListener('input', () => this._onEditorInput());
    this.els.editor?.addEventListener('scroll', () => this._syncLineNumbers());
    this.els.editor?.addEventListener('keydown', (e) => this._onEditorKeydown(e));
    this.els.editor?.addEventListener('click', () => this._updateEditorStatus());
    this.els.editor?.addEventListener('keyup', () => this._updateEditorStatus());

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        this._build();
      }
    });

    // Viewport info update
    setInterval(() => this._updateViewportInfo(), 500);
  }

  // ── Demo Loading ──

  _loadDemo() {
    this.files.clear();
    this.files.set('robot.rob', DEMO_CODE);
    this.files.set('arm5dof.rob', DEMO_5DOF);
    this.activeFile = null; // prevent _saveCurrentFile from overwriting
    this.activeTab = 'robot';
    this._updateFileSelector();
    this._updateTabs('robot');
    this.els.projectName.textContent = 'Demo — 4DOF Manipulator';

    // Directly set editor content
    this.activeFile = 'robot.rob';
    if (this.els.editor) this.els.editor.value = DEMO_CODE;
    if (this.els.fileSelector) this.els.fileSelector.value = 'robot.rob';
    if (this.els.editorFileType) this.els.editorFileType.textContent = '.ROB';
    this._updateLineNumbers();
    this._updateEditorStatus();

    // Auto-build after DOM settles
    setTimeout(() => this._build(), 500);
  }

  // ── Build Pipeline ──

  _build() {
    this._saveCurrentFile();
    this._clearConsole();
    this._setStatus('building', 'Budowanie...');

    const code = this.els.editor?.value || '';
    if (!code.trim()) {
      this._log('Brak kodu do zbudowania', 'warn');
      this._setStatus('idle', 'Gotowy');
      return;
    }

    try {
      // Step 1: Lex
      const lexer = new Lexer(code);
      const tokens = lexer.tokenize();
      this._log(`Lexer: ${tokens.length} tokenow`, 'info');

      // Step 2: Parse
      const parser = new Parser(tokens);
      const ast = parser.parse();

      if (ast.errors.length > 0) {
        for (const err of ast.errors) {
          this._log(`Blad parsera (linia ${err.line}): ${err.message}`, 'error');
        }
      }

      this._log(`Parser: ${ast.procedures.length} procedur`, 'info');

      // Step 3: Build robot
      this.interpreter = new Interpreter((msg, type) => this._log(msg, type));
      const result = buildRobotFromAST(ast, this.interpreter, 'ROBOT');

      if (result.error) {
        this._log('Blad budowania: ' + result.error, 'error');
        this._setStatus('error', 'Blad');
        return;
      }

      // Step 4: Add to scene
      this.scene.clearScene();
      this.currentRobot = result.robot;
      this.scene.scene.add(this.currentRobot.sceneGroup);

      // Step 5: Build joint sliders
      this._buildJointSliders();

      // Enable simulation buttons
      document.getElementById('btn-simulate').disabled = false;
      document.getElementById('btn-step').disabled = false;

      const jointCount = this.currentRobot.joints.size;
      this._log(`Zbudowano robota: ${jointCount} czlonow`, 'success');
      this._setStatus('idle', 'Gotowy');

    } catch (e) {
      this._log(`Blad krytyczny: ${e.message}`, 'error');
      console.error(e);
      this._setStatus('error', 'Blad');
    }
  }

  // ── Joint Sliders ──

  _buildJointSliders() {
    const container = this.els.jointSliders;
    if (!container || !this.currentRobot) return;
    container.innerHTML = '';

    const joints = this.currentRobot.getJointInfo();
    if (joints.length === 0) {
      container.innerHTML = '<p class="placeholder-text">Brak ruchomych czlonow</p>';
      return;
    }

    for (const j of joints) {
      const row = document.createElement('div');
      row.className = 'joint-slider-row';

      const label = document.createElement('label');
      label.textContent = j.name;
      label.title = j.name;

      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = j.min;
      slider.max = j.max;
      slider.value = j.value;
      slider.step = j.isRotational ? 0.01 : 0.1;

      const valueDisplay = document.createElement('span');
      valueDisplay.className = 'joint-value';
      valueDisplay.textContent = this._formatJointValue(j.value, j.isRotational);

      slider.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        this.currentRobot.setJointValue(j.name, val);
        this.currentRobot.updateKinematics();
        // Re-add to scene
        this.scene.clearScene();
        this.scene.scene.add(this.currentRobot.sceneGroup);
        valueDisplay.textContent = this._formatJointValue(val, j.isRotational);
      });

      row.appendChild(label);
      row.appendChild(slider);
      row.appendChild(valueDisplay);
      container.appendChild(row);
    }
  }

  _formatJointValue(value, isRotational) {
    if (isRotational) {
      return (value * 180 / Math.PI).toFixed(1) + '°';
    }
    return value.toFixed(1);
  }

  // ── Simulation ──

  _startSimulation() {
    if (!this.currentRobot) return;
    this.isSimulating = true;
    this._setStatus('running', 'Symulacja');
    document.getElementById('btn-simulate').disabled = true;
    document.getElementById('btn-stop').disabled = false;

    // Simple demo animation: oscillate joints
    let time = 0;
    const animate = () => {
      if (!this.isSimulating) return;
      time += 0.02;

      const joints = this.currentRobot.getJointInfo();
      for (let i = 0; i < joints.length; i++) {
        const j = joints[i];
        const range = j.max - j.min;
        const center = (j.max + j.min) / 2;
        const amplitude = range * 0.3;
        const value = center + amplitude * Math.sin(time + i * 1.2);
        this.currentRobot.setJointValue(j.name, value);
      }

      this.currentRobot.updateKinematics();
      this.scene.clearScene();
      this.scene.scene.add(this.currentRobot.sceneGroup);
      this._updateSliderValues();

      this.animationId = requestAnimationFrame(animate);
    };

    animate();
  }

  _stopSimulation() {
    this.isSimulating = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this._setStatus('idle', 'Gotowy');
    document.getElementById('btn-simulate').disabled = false;
    document.getElementById('btn-stop').disabled = true;
  }

  _stepSimulation() {
    // Single step: advance joints slightly
    if (!this.currentRobot) return;
    const joints = this.currentRobot.getJointInfo();
    for (const j of joints) {
      const step = j.isRotational ? 0.05 : 1;
      let newVal = j.value + step;
      if (newVal > j.max) newVal = j.min;
      this.currentRobot.setJointValue(j.name, newVal);
    }
    this.currentRobot.updateKinematics();
    this.scene.clearScene();
    this.scene.scene.add(this.currentRobot.sceneGroup);
    this._updateSliderValues();
  }

  _updateSliderValues() {
    const sliders = this.els.jointSliders?.querySelectorAll('.joint-slider-row');
    if (!sliders || !this.currentRobot) return;

    const joints = this.currentRobot.getJointInfo();
    sliders.forEach((row, i) => {
      if (i < joints.length) {
        const slider = row.querySelector('input[type="range"]');
        const valueDisplay = row.querySelector('.joint-value');
        if (slider) slider.value = joints[i].value;
        if (valueDisplay) {
          valueDisplay.textContent = this._formatJointValue(joints[i].value, joints[i].isRotational);
        }
      }
    });
  }

  // ── File Management ──

  _switchTab(tab) {
    this.activeTab = tab;
    this._updateTabs(tab);

    // Show relevant files for this tab
    const extensions = {
      'projekt': ['.lst'],
      'robot': ['.rob'],
      'otoczenie': ['.mod'],
      'program': ['.prg']
    };

    // If no file matches current tab, create one
    const exts = extensions[tab] || ['.rob'];
    let found = false;
    for (const [filename] of this.files) {
      const ext = this._getExt(filename);
      if (exts.includes(ext)) {
        this._openFile(filename);
        found = true;
        break;
      }
    }

    if (!found) {
      // Create a new file for this tab
      const defaultExt = exts[0];
      const defaultName = tab + defaultExt;
      if (!this.files.has(defaultName)) {
        this.files.set(defaultName, '$ ' + tab.charAt(0).toUpperCase() + tab.slice(1) + '\n');
      }
      this._updateFileSelector();
      this._openFile(defaultName);
    }
  }

  _updateTabs(activeTab) {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === activeTab);
    });
  }

  _openFile(filename) {
    this._saveCurrentFile();
    this.activeFile = filename;
    const content = this.files.get(filename) || '';
    if (this.els.editor) this.els.editor.value = content;
    if (this.els.fileSelector) this.els.fileSelector.value = filename;

    // Update file type display
    const ext = this._getExt(filename).toUpperCase();
    if (this.els.editorFileType) this.els.editorFileType.textContent = ext;

    this._updateLineNumbers();
    this._updateEditorStatus();
  }

  _saveCurrentFile() {
    if (this.activeFile && this.els.editor) {
      this.files.set(this.activeFile, this.els.editor.value);
    }
  }

  _updateFileSelector() {
    const sel = this.els.fileSelector;
    if (!sel) return;
    sel.innerHTML = '';

    for (const [filename] of this.files) {
      const opt = document.createElement('option');
      opt.value = filename;
      opt.textContent = filename;
      sel.appendChild(opt);
    }
  }

  _addFile() {
    const name = prompt('Nazwa nowego pliku (np. obiekt.mod):');
    if (!name) return;
    if (this.files.has(name)) {
      this._log(`Plik "${name}" juz istnieje`, 'warn');
      return;
    }
    this.files.set(name, `$ ${name}\n`);
    this._updateFileSelector();
    this._openFile(name);
    this._log(`Utworzono plik: ${name}`, 'info');
  }

  _deleteFile() {
    if (!this.activeFile) return;
    if (this.files.size <= 1) {
      this._log('Nie mozna usunac ostatniego pliku', 'warn');
      return;
    }
    if (!confirm(`Usunac plik "${this.activeFile}"?`)) return;
    this.files.delete(this.activeFile);
    this._updateFileSelector();
    const firstFile = this.files.keys().next().value;
    this._openFile(firstFile);
    this._log(`Usnieto plik: ${this.activeFile}`, 'info');
  }

  _handleFileLoad(event) {
    const fileList = event.target.files;
    if (!fileList || fileList.length === 0) return;

    for (const file of fileList) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target.result;
        this.files.set(file.name.toLowerCase(), content);
        this._updateFileSelector();
        this._openFile(file.name.toLowerCase());
        this._log(`Zaladowano: ${file.name}`, 'success');
      };
      reader.readAsText(file);
    }

    // Clear input so same file can be loaded again
    event.target.value = '';
  }

  _newProject() {
    if (!confirm('Utworzyc nowy projekt? Obecne dane zostana utracone.')) return;
    this.scene.clearScene();
    this.currentRobot = null;
    this.files.clear();
    this.files.set('robot.rob', DEMO_CODE);
    this._updateFileSelector();
    this._openFile('robot.rob');
    this.els.projectName.textContent = 'Nowy Projekt';
    this._clearConsole();
    this._buildJointSliders();
    this._log('Nowy projekt utworzony', 'info');
  }

  _exportProject() {
    this._saveCurrentFile();
    for (const [filename, content] of this.files) {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
    this._log('Eksportowano pliki projektu', 'success');
  }

  // ── Editor ──

  _onEditorInput() {
    this._updateLineNumbers();
    this._saveCurrentFile();
  }

  _onEditorKeydown(e) {
    // Tab key → insert spaces
    if (e.key === 'Tab') {
      e.preventDefault();
      const editor = this.els.editor;
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      this._onEditorInput();
    }
  }

  _updateLineNumbers() {
    const editor = this.els.editor;
    const lineNums = this.els.lineNumbers;
    if (!editor || !lineNums) return;

    const lines = editor.value.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) {
      html += i + '\n';
    }
    lineNums.textContent = html;
  }

  _syncLineNumbers() {
    if (this.els.lineNumbers && this.els.editor) {
      this.els.lineNumbers.scrollTop = this.els.editor.scrollTop;
    }
  }

  _updateEditorStatus() {
    const editor = this.els.editor;
    if (!editor) return;

    const pos = editor.selectionStart;
    const text = editor.value.substring(0, pos);
    const lines = text.split('\n');
    const line = lines.length;
    const col = lines[lines.length - 1].length + 1;

    if (this.els.editorLine) this.els.editorLine.textContent = `Ln ${line}`;
    if (this.els.editorCol) this.els.editorCol.textContent = `Col ${col}`;
  }

  // ── Console ──

  _log(message, type = 'info') {
    const el = this.els.console;
    if (!el) return;

    const line = document.createElement('span');
    line.className = `console-line console-${type}`;

    const timestamp = new Date().toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    line.textContent = `[${timestamp}] ${message}`;

    el.appendChild(line);
    el.appendChild(document.createTextNode('\n'));
    el.scrollTop = el.scrollHeight;
  }

  _clearConsole() {
    if (this.els.console) this.els.console.textContent = '';
  }

  // ── Status ──

  _setStatus(state, text) {
    const el = this.els.statusIndicator;
    if (!el) return;
    el.textContent = text;
    el.className = `status-${state === 'building' || state === 'running' ? 'running' : state === 'error' ? 'error' : 'idle'}`;
  }

  // ── Viewport Info ──

  _updateViewportInfo() {
    const info = this.scene.getCameraInfo();
    if (this.els.infoCoords) {
      this.els.infoCoords.textContent = `X: ${info.x}  Y: ${info.y}  Z: ${info.z}`;
    }
    if (this.els.infoZoom) {
      this.els.infoZoom.textContent = `Zoom: ${info.zoom}%`;
    }
  }

  // ── Utility ──

  _getExt(filename) {
    const dot = filename.lastIndexOf('.');
    return dot >= 0 ? filename.substring(dot).toLowerCase() : '';
  }
}

// ── Boot ──
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
