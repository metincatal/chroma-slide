import './style.css';
import { Game } from './game/Game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const overlay = document.getElementById('ui-overlay') as HTMLDivElement;

if (!canvas || !overlay) {
  throw new Error('Canvas veya UI overlay bulunamadı');
}

const game = new Game(canvas, overlay);

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width = window.innerWidth + 'px';
  canvas.style.height = window.innerHeight + 'px';
  game.resize(canvas.width, canvas.height, dpr);
}

window.addEventListener('resize', resize);
resize();

game.start();
