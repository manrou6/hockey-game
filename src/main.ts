import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { CreateGround } from '@babylonjs/core/Meshes/Builders/groundBuilder';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { stencil: false, preserveDrawingBuffer: false }, true);
const scene = new Scene(engine);
scene.clearColor = new Color4(0.04, 0.11, 0.2, 1);
const camera = new ArcRotateCamera('cam', -Math.PI / 2, 1.0, 40, Vector3.Zero(), scene);
camera.attachControl(canvas, true);
new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
CreateGround('ground', { width: 40, height: 20 }, scene);
engine.runRenderLoop(() => scene.render());
window.addEventListener('resize', () => engine.resize());
