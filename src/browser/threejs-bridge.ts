/**
 * Injectable Three.js / WebGL Browser Bridge for Playwright automation.
 * This code is injected into the target browser page via Playwright's `browser_evaluate`.
 */
export function getBridgeScript(): string {
  return `(() => {
  if (window.__WORLD_MODEL_BRIDGE) return window.__WORLD_MODEL_BRIDGE;

  const bridge = {
    version: '0.1.0',

    /**
     * Locate the active Three.js scene object on the page.
     */
    findScene: function() {
      if (window.scene && (window.scene.isScene || window.scene.children)) return window.scene;
      if (window.__scene) return window.__scene;
      if (window.__THREE_SCENE__) return window.__THREE_SCENE__;
      
      // Search window properties
      for (const key in window) {
        try {
          const val = window[key];
          if (val && typeof val === 'object' && val.isScene) {
            return val;
          }
        } catch (e) {}
      }
      return null;
    },

    /**
     * Locate the active Three.js camera on the page.
     */
    findCamera: function() {
      if (window.camera && (window.camera.isCamera || window.camera.isPerspectiveCamera)) return window.camera;
      if (window.__camera) return window.__camera;
      if (window.__THREE_CAMERA__) return window.__THREE_CAMERA__;

      const scene = this.findScene();
      if (scene) {
        let foundCam = null;
        scene.traverse((obj) => {
          if (obj.isCamera && !foundCam) foundCam = obj;
        });
        if (foundCam) return foundCam;
      }
      return null;
    },

    /**
     * Extract active camera pose and parameters.
     */
    extractCamera: function() {
      const camera = this.findCamera();
      if (!camera) {
        return {
          position: { x: 0, y: 10, z: 20 },
          orientation: { pitch: 0, yaw: 0, roll: 0 },
          fov_degrees: 60,
          near: 0.1,
          far: 1000,
          projection_type: 'perspective'
        };
      }

      // Euler angles (radians to degrees)
      const euler = (window.THREE && camera.rotation) ? camera.rotation : { x: 0, y: 0, z: 0 };
      const pitch = Math.round((euler.x * 180 / Math.PI) * 10) / 10;
      const yaw = Math.round((euler.y * 180 / Math.PI) * 10) / 10;
      const roll = Math.round((euler.z * 180 / Math.PI) * 10) / 10;

      return {
        position: {
          x: Math.round(camera.position.x * 100) / 100,
          y: Math.round(camera.position.y * 100) / 100,
          z: Math.round(camera.position.z * 100) / 100,
        },
        orientation: { pitch, yaw, roll },
        fov_degrees: camera.fov || 60,
        near: camera.near || 0.1,
        far: camera.far || 1000,
        projection_type: camera.isOrthographicCamera ? 'orthographic' : 'perspective'
      };
    },

    /**
     * Extract entire scene entities into world-model observation detections format.
     */
    extractScene: function() {
      const scene = this.findScene();
      const cameraData = this.extractCamera();
      const detections = [];

      if (scene) {
        const THREE = window.THREE;
        scene.traverse((obj) => {
          if (!obj.isMesh && !obj.userData?.entity_type && !obj.name) return;
          if (obj.type === 'GridHelper' || obj.type === 'LineSegments' || obj.type === 'AxesHelper') return;

          let width = 1, height = 1, depth = 1;
          if (THREE && obj.geometry) {
            if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
            const bbox = obj.geometry.boundingBox;
            if (bbox) {
              const scale = obj.scale || { x: 1, y: 1, z: 1 };
              width = (bbox.max.x - bbox.min.x) * (scale.x || 1);
              height = (bbox.max.y - bbox.min.y) * (scale.y || 1);
              depth = (bbox.max.z - bbox.min.z) * (scale.z || 1);
            }
          }

          const worldPos = { x: 0, y: 0, z: 0 };
          if (obj.getWorldPosition && THREE) {
            const v = new THREE.Vector3();
            obj.getWorldPosition(v);
            worldPos.x = Math.round(v.x * 100) / 100;
            worldPos.y = Math.round(v.y * 100) / 100;
            worldPos.z = Math.round(v.z * 100) / 100;
          } else if (obj.position) {
            worldPos.x = Math.round(obj.position.x * 100) / 100;
            worldPos.y = Math.round(obj.position.y * 100) / 100;
            worldPos.z = Math.round(obj.position.z * 100) / 100;
          }

          const label = obj.name || obj.userData?.name || ('object_' + obj.id);
          const className = obj.userData?.entity_type || (label.includes('player') || label.includes('agent') ? 'agent' : label.includes('obstacle') || label.includes('wall') ? 'obstacle' : 'object');

          detections.push({
            label: label,
            class_name: className,
            estimated_position: worldPos,
            bounding_box: {
              width: Math.max(0.1, Math.round(width * 100) / 100),
              height: Math.max(0.1, Math.round(height * 100) / 100),
              depth: Math.max(0.1, Math.round(depth * 100) / 100)
            },
            confidence: 1.0,
            attributes: {
              uuid: obj.uuid,
              visible: obj.visible !== false,
              mesh_type: obj.type,
              userData: obj.userData || {}
            }
          });
        });
      }

      return {
        observer_pose: {
          position: cameraData.position,
          orientation: cameraData.orientation
        },
        field_of_view: {
          fov_horizontal: cameraData.fov_degrees,
          fov_vertical: cameraData.fov_degrees
        },
        detections: detections
      };
    },

    /**
     * Simulates a timed keyboard press (keydown -> delay -> keyup).
     */
    simulateKeyHold: async function(code, durationMs) {
      const target = document.activeElement || document.body;
      const key = code.replace('Key', '').replace('Arrow', '');
      
      const downEvt = new KeyboardEvent('keydown', {
        code: code,
        key: key,
        keyCode: code === 'KeyW' ? 87 : code === 'KeyS' ? 83 : code === 'KeyA' ? 65 : code === 'KeyD' ? 68 : code === 'Space' ? 32 : 0,
        which: code === 'KeyW' ? 87 : code === 'KeyS' ? 83 : code === 'KeyA' ? 65 : code === 'KeyD' ? 68 : code === 'Space' ? 32 : 0,
        bubbles: true,
        cancelable: true
      });
      target.dispatchEvent(downEvt);

      await new Promise((resolve) => setTimeout(resolve, durationMs || 100));

      const upEvt = new KeyboardEvent('keyup', {
        code: code,
        key: key,
        keyCode: downEvt.keyCode,
        which: downEvt.which,
        bubbles: true,
        cancelable: true
      });
      target.dispatchEvent(upEvt);
    }
  };

  window.__WORLD_MODEL_BRIDGE = bridge;
  return bridge;
})()`;
}
