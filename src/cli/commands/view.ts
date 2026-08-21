import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { getDb, getProjectSlug, resolveProjectRoot } from '../../engine/db.js';
import { EntityStore } from '../../engine/entity-store.js';
import { SpatialGraph } from '../../engine/spatial-graph.js';
import { logger } from '../../utils/logger.js';


export function build3DViewerHtml(project: string, entities: any[], relations: any[]): string {
  const dataJson = JSON.stringify({ project, entities, relations });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Spatial World Model 3D Visualizer — ${project}</title>
  <script src="https://unpkg.com/three@0.160.0/build/three.min.js"></script>
  <script src="https://unpkg.com/three@0.160.0/examples/js/controls/OrbitControls.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #060913;
      --card-bg: rgba(14, 21, 38, 0.85);
      --border: rgba(255, 255, 255, 0.1);
      --text: #f8fafc;
      --text-muted: #94a3b8;
      --primary: #38bdf8;
      --accent: #a855f7;
      --success: #34d399;
      --warning: #fbbf24;
      --danger: #f87171;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: 'Inter', sans-serif;
      overflow: hidden;
      width: 100vw;
      height: 100vh;
    }
    #viewport {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      z-index: 1;
    }
    .hud {
      position: absolute;
      z-index: 10;
      pointer-events: none;
    }
    .hud * { pointer-events: auto; }
    .header {
      top: 1rem;
      left: 1rem;
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.75rem 1.25rem;
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    .header h1 {
      font-size: 1.1rem;
      font-weight: 700;
      background: linear-gradient(135deg, #38bdf8, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .badge {
      background: rgba(56, 189, 248, 0.15);
      color: var(--primary);
      border: 1px solid rgba(56, 189, 248, 0.3);
      padding: 0.2rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-family: 'JetBrains Mono', monospace;
    }
    .sidebar {
      top: 5rem;
      left: 1rem;
      bottom: 1rem;
      width: 320px;
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow-y: auto;
    }
    .entity-list {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      overflow-y: auto;
      flex: 1;
    }
    .entity-card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 0.6rem 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .entity-card:hover {
      border-color: var(--primary);
      background: rgba(56, 189, 248, 0.08);
    }
    .controls {
      position: absolute;
      bottom: 1rem;
      right: 1rem;
      background: var(--card-bg);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 0.75rem 1rem;
      font-size: 0.8rem;
      color: var(--text-muted);
      z-index: 10;
    }
  </style>
</head>
<body>
  <div id="viewport"></div>

  <div class="hud header">
    <h1>🌐 World Model 3D Visualizer</h1>
    <span class="badge">Project: ${project}</span>
    <span class="badge" id="entity-count">${entities.length} Entities</span>
  </div>

  <div class="hud sidebar">
    <h3>Entities &amp; Landmarks</h3>
    <input type="text" id="search" placeholder="Search entities..." style="width:100%; padding:0.4rem 0.6rem; border-radius:6px; background:rgba(0,0,0,0.4); border:1px solid var(--border); color:#fff; font-size:0.85rem;" oninput="filterEntities(this.value)">
    <div class="entity-list" id="entity-list"></div>
  </div>

  <div class="controls">
    <p>🖱️ <b>Rotate:</b> Left Click + Drag | <b>Pan:</b> Right Click + Drag | <b>Zoom:</b> Scroll</p>
  </div>

  <script>
    const data = ${dataJson};
    const container = document.getElementById('viewport');

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060913);
    scene.fog = new THREE.FogExp2(0x060913, 0.015);

    const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 15, 25);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    container.appendChild(renderer.domElement);

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // 2. Lighting & Grid
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x38bdf8, 1.2);
    dirLight.position.set(20, 40, 20);
    scene.add(dirLight);

    const gridHelper = new THREE.GridHelper(60, 60, 0x38bdf8, 0x1e293b);
    gridHelper.position.y = -0.01;
    scene.add(gridHelper);

    // 3. Color Map
    const typeColors = {
      agent: 0x38bdf8,
      obstacle: 0xf87171,
      container: 0xa855f7,
      surface: 0x64748b,
      landmark: 0xfbbf24,
      item: 0x34d399,
      waypoint: 0x06b6d4,
      object: 0x94a3b8
    };

    const meshMap = new Map();

    // 4. Render Entities
    data.entities.forEach(ent => {
      if (!ent.position) return;
      const w = (ent.bounding_box && ent.bounding_box.width) || 1;
      const h = (ent.bounding_box && ent.bounding_box.height) || 1;
      const d = (ent.bounding_box && ent.bounding_box.depth) || 1;

      const color = typeColors[ent.type] || 0x38bdf8;
      const geometry = new THREE.BoxGeometry(w, h, d);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.3,
        metalness: 0.2,
        transparent: true,
        opacity: ent.status === 'active' ? 0.85 : 0.4
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(ent.position.x, ent.position.y + h/2, ent.position.z);
      scene.add(mesh);

      // Wireframe outline
      const wireGeo = new THREE.EdgesGeometry(geometry);
      const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1.5 });
      const wireframe = new THREE.LineSegments(wireGeo, wireMat);
      mesh.add(wireframe);

      meshMap.set(ent.id, mesh);
    });

    // 5. Render Relation Lines
    data.relations.forEach(rel => {
      const srcMesh = meshMap.get(rel.source_id);
      const tgtMesh = meshMap.get(rel.target_id);
      if (srcMesh && tgtMesh) {
        const points = [srcMesh.position, tgtMesh.position];
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0xa855f7,
          dashSize: 0.5,
          gapSize: 0.3,
          linewidth: 2
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        scene.add(line);
      }
    });

    // 6. Populate Entity Sidebar
    const listContainer = document.getElementById('entity-list');
    function renderList(items) {
      listContainer.innerHTML = '';
      items.forEach(ent => {
        const div = document.createElement('div');
        div.className = 'entity-card';
        div.innerHTML = '<b>' + ent.name + '</b> <span class="badge" style="float:right;">' + ent.type + '</span><br><small style="color:var(--text-muted);">Pos: (' + (ent.position ? ent.position.x.toFixed(1) + ', ' + ent.position.y.toFixed(1) + ', ' + ent.position.z.toFixed(1) : 'none') + ')</small>';
        div.onclick = () => {
          const m = meshMap.get(ent.id);
          if (m) {
            controls.target.copy(m.position);
            camera.position.set(m.position.x, m.position.y + 5, m.position.z + 8);
          }
        };
        listContainer.appendChild(div);
      });
    }
    renderList(data.entities);

    window.filterEntities = (q) => {
      const filtered = data.entities.filter(e => e.name.toLowerCase().includes(q.toLowerCase()) || e.type.toLowerCase().includes(q.toLowerCase()));
      renderList(filtered);
    };

    // 7. Animation Loop
    function animate() {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
  </script>
</body>
</html>`;
}

export async function runView(args: string[] = []): Promise<void> {
  const isGameMode = args.includes('--game') || args.includes('-g');
  const root = resolveProjectRoot();
  const project = getProjectSlug(undefined, root);
  const db = getDb(project, root);

  const entities = EntityStore.listEntities(db, { project, limit: 1000 });
  const relations = SpatialGraph.getRelations(db, { project });

  const port = 8090;
  const viewerHtml = build3DViewerHtml(project, entities, relations);

  // Locate game-demo.html
  let gameHtml = '';
  const possibleGamePaths = [
    path.join(root, 'docs', 'game-demo.html'),
    path.join(process.cwd(), 'docs', 'game-demo.html'),
  ];
  for (const gp of possibleGamePaths) {
    if (fs.existsSync(gp)) {
      try {
        gameHtml = fs.readFileSync(gp, 'utf8');
        break;
      } catch (e) {}
    }
  }

  const server = http.createServer((req, res) => {
    const urlPath = (req.url || '/').split('?')[0];

    if (urlPath === '/game' && gameHtml) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(gameHtml);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(viewerHtml);
  });

  server.listen(port, '127.0.0.1', () => {
    const targetPath = isGameMode ? '/game' : '/';
    const url = `http://127.0.0.1:${port}${targetPath}`;
    console.log(`\n🚀 Spatial World Model 3D Visualizer running at: ${url}`);
    console.log(`🎮 Autonomous Playwright Game Arena available at: http://127.0.0.1:${port}/game\n`);
    console.log('Press Ctrl+C to stop the server.\n');

    // Auto-open browser
    const startCmd =
      process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
    exec(`${startCmd} ${url}`, (err) => {
      if (err) logger.debug(`Failed to auto-open browser: ${err.message}`);
    });
  });
}

