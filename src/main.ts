import './style.css';
import { Game } from './game/Game';
import { MultiplayerGame } from './multiplayer/MultiplayerGame';

const canvas  = document.getElementById('game-canvas') as HTMLCanvasElement;
const overlay = document.getElementById('ui-overlay') as HTMLDivElement;

if (!canvas || !overlay) {
  throw new Error('Canvas veya UI overlay bulunamadı');
}

let currentGame:   Game | null            = null;
let currentMpGame: MultiplayerGame | null = null;

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = window.innerWidth  * dpr;
  canvas.height = window.innerHeight * dpr;
  canvas.style.width  = window.innerWidth  + 'px';
  canvas.style.height = window.innerHeight + 'px';
  if (currentGame)   currentGame.resize(canvas.width, canvas.height, dpr);
  if (currentMpGame) currentMpGame.resize(canvas.width, canvas.height, dpr);
}

function startSinglePlayer() {
  if (currentMpGame) {
    currentMpGame.stop();
    currentMpGame = null;
  }
  currentGame = new Game(canvas, overlay);
  resize();
  currentGame.start();
}

function startMultiplayer() {
  if (currentGame) {
    currentGame.stop();
    currentGame = null;
  }
  currentMpGame = new MultiplayerGame(canvas, overlay, () => startSinglePlayer());
  resize();
  currentMpGame.start();
}

window.addEventListener('resize', resize);

// ScreenManager'daki "Çok Oyunculu" butonu bu event'i tetikler
document.addEventListener('chroma:startMultiplayer', () => startMultiplayer());

startSinglePlayer();
