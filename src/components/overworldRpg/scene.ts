import Phaser from 'phaser';
import { BUILDINGS, CHARACTERS, ENTITIES, REGIONS, TILE, WORLD_HEIGHT, WORLD_WIDTH, tileAt } from './content';
import type { BattleUnit, Point, RpgState, SceneBridge, WorldEntity } from './types';

const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
const BATTLE_WIDTH = 960;
const BATTLE_HEIGHT = 600;
const hash = (x: number, y: number, salt = 0) => {
  const value = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453;
  return value - Math.floor(value);
};
const cssColor = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
const keyFor = (id: string) => `rpg:character:${id}`;

interface ActorView {
  root: Phaser.GameObjects.Container;
  image: Phaser.GameObjects.Image;
  shadow: Phaser.GameObjects.Ellipse;
  ring: Phaser.GameObjects.Ellipse;
  hp?: Phaser.GameObjects.Rectangle;
  label?: Phaser.GameObjects.Text;
  last: Point;
  size: number;
}
interface EntityView {
  entity: WorldEntity;
  root: Phaser.GameObjects.Container;
  marker: Phaser.GameObjects.Text;
  actor?: ActorView;
}

/** Phaser owns only disposable pictures. All rules and movement live in the engine. */
export default class RpgScene extends Phaser.Scene {
  private readonly bridge: SceneBridge;
  private worldLayer!: Phaser.GameObjects.Layer;
  private battleLayer!: Phaser.GameObjects.Layer;
  private water!: Phaser.GameObjects.Graphics;
  private atmosphere!: Phaser.GameObjects.Graphics;
  private battleEffects!: Phaser.GameObjects.Graphics;
  private arenaGround!: Phaser.GameObjects.Image;
  private arenaProps: { image: Phaser.GameObjects.Image; point: Point }[] = [];
  private portraitBattle = false;
  private renderedBattle: RpgState['battle'] = null;
  private destination!: Phaser.GameObjects.Graphics;
  private player!: ActorView;
  private followers = new Map<string, ActorView>();
  private fighters = new Map<string, ActorView>();
  private entities: EntityView[] = [];
  private effectLabels = new Map<number, Phaser.GameObjects.Text>();
  private worldProps: Phaser.GameObjects.Image[] = [];
  private lastMode = '';
  private destinationPoint: Point | null = null;
  private destinationTime = 0;
  private previousPlayer: Point = { x: 0, y: 0 };
  private trail: Point[] = [];

  constructor(bridge: SceneBridge) {
    super({ key: 'OverworldRpg' });
    this.bridge = bridge;
  }

  public battleViewSnapshot() {
    if (!this.battleLayer?.visible) return [];
    return Array.from(this.fighters.entries(), ([uid, view]) => ({
      uid,
      characterId: view.image.texture.key.replace('rpg:character:', ''),
      textureKey: view.image.texture.key,
      label: view.label?.text ?? '',
      angle: view.image.angle,
    }));
  }

  preload() {
    Object.values(CHARACTERS).forEach(character => {
      const portrait = character.id === 'rift-tyrant' ? character.portrait : character.portrait.replace('/portraits/', '/portraits/minimal/');
      if (!this.textures.exists(keyFor(character.id))) this.load.image(keyFor(character.id), portrait);
    });
  }

  create() {
    this.cameras.main.setBackgroundColor('#263e37');
    this.worldLayer = this.add.layer();
    this.battleLayer = this.add.layer().setVisible(false);
    this.makeTerrain();
    this.makePropTextures();
    this.makeWorld();
    this.makeArena();
    this.player = this.createActor('biscuit_sui', 70, this.worldLayer, 0xf6d286);
    this.player.ring.setStrokeStyle(2, 0xf6d286, 0.8);
    this.player.label = this.add.text(0, 16, '你', { fontFamily: FONT, fontSize: '11px', color: '#fff5d0', stroke: '#22332e', strokeThickness: 4 }).setOrigin(0.5);
    this.player.root.add(this.player.label);
    this.destination = this.add.graphics().setDepth(20);
    this.worldLayer.add(this.destination);
    this.previousPlayer = { ...this.bridge.getState().player };
    this.resetTrail(this.bridge.getState());
    this.input.on('pointerdown', this.onPointerDown, this);
    this.scale.on('resize', this.resizeView, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.resizeView, this);
      this.input.off('pointerdown', this.onPointerDown, this);
      this.followers.clear();
      this.fighters.clear();
      this.effectLabels.clear();
    });
    this.resizeView();
  }

  private canvasTexture(key: string, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void) {
    if (this.textures.exists(key)) return;
    const texture = this.textures.createCanvas(key, width, height);
    if (!texture) return;
    draw(texture.getContext());
    texture.refresh();
  }

  private makeTerrain() {
    this.canvasTexture('rpg:terrain', WORLD_WIDTH, WORLD_HEIGHT, context => {
      for (let ty = 0; ty < WORLD_HEIGHT / TILE; ty++) {
        for (let tx = 0; tx < WORLD_WIDTH / TILE; tx++) {
          const tile = tileAt(tx, ty);
          const x = tx * TILE;
          const y = ty * TILE;
          const east = tx > 28;
          const colors: Record<string, string> = {
            grass: east ? '#687d62' : '#81996c',
forest: '#526e52',
path: '#c2b48a',
            water: '#477d7b',
bridge: '#967551',
mountain: '#657168',
town: '#b8b292',
ruins: '#7d8375',
          };
          context.fillStyle = colors[tile] || colors.grass;
          context.fillRect(x, y, TILE, TILE);
          context.fillStyle = `rgba(255,245,190,${hash(tx, ty) * 0.04})`;
          context.fillRect(x, y, TILE, TILE);
          if (tile === 'water') {
            context.fillStyle = '#63978a';
            if (tileAt(tx - 1, ty) !== 'water' && tileAt(tx - 1, ty) !== 'bridge') context.fillRect(x, y, 7, TILE);
            if (tileAt(tx + 1, ty) !== 'water' && tileAt(tx + 1, ty) !== 'bridge') context.fillRect(x + TILE - 7, y, 7, TILE);
          } else if (tile === 'bridge') {
            context.fillStyle = '#514e3d';
            context.fillRect(x, y + 2, TILE, 5);
            context.fillRect(x, y + TILE - 7, TILE, 5);
            for (let i = 0; i < 6; i++) {
              context.fillStyle = i % 2 ? '#b49566' : '#a2865b';
              context.fillRect(x + i * 8 + 1, y + 8, 6, TILE - 17);
            }
          } else if (tile === 'path' || tile === 'town' || tile === 'ruins') {
            for (let i = 0; i < 7; i++) {
              const px = x + hash(tx, ty, i + 4) * 40;
              const py = y + hash(tx, ty, i + 20) * 40;
              context.fillStyle = tile === 'ruins' ? 'rgba(185,193,165,.16)' : 'rgba(246,231,187,.22)';
              context.fillRect(px, py, 7 + hash(tx, ty, i + 10) * 10, 3 + hash(tx, ty, i + 11) * 4);
              context.fillStyle = 'rgba(67,72,49,.12)';
              context.fillRect(px, py + 6, 10, 1);
            }
          } else {
            for (let i = 0; i < 12; i++) {
              const px = x + hash(tx, ty, i + 1) * TILE;
              const py = y + hash(tx, ty, i + 14) * TILE;
              context.fillStyle = i % 3 ? 'rgba(194,206,143,.22)' : 'rgba(32,58,43,.12)';
              context.fillRect(px, py, 1.5, 3 + hash(tx, ty, i) * 3);
              if (hash(tx, ty, i + 31) > 0.985 && tile === 'grass') {
                context.fillStyle = '#e8d9a0';
                context.fillRect(px - 1, py - 2, 3, 3);
              }
            }
          }
        }
      }
    });
    this.worldLayer.add(this.add.image(0, 0, 'rpg:terrain').setOrigin(0).setDepth(-50));
  }

  private makePropTextures() {
    ['pine', 'round', 'gold'].forEach((kind, index) => {
      this.canvasTexture(`rpg:tree:${kind}`, 152, 184, c => {
        c.fillStyle = 'rgba(24,43,35,.22)';
        c.beginPath(); c.ellipse(84, 159, 57, 18, -0.1, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#5e5841'; c.fillRect(70, 80, 13, 77);
        c.fillStyle = '#857756'; c.fillRect(77, 101, 4, 52);
        const palettes = [['#254d43', '#345d49', '#487557', '#658763'], ['#355a42', '#4c704a', '#64874f', '#83a061'], ['#6e7143', '#929052', '#b1a965', '#c6b87a']];
        const [, , lit, highlight] = palettes[index];
        if (kind === 'pine') {
          for (let level = 3; level >= 0; level--) {
            const y = 26 + level * 27;
            c.fillStyle = palettes[index][level === 3 ? 0 : 1];
            c.beginPath(); c.moveTo(76, y - 23); c.lineTo(26 - level * 3, y + 44); c.lineTo(128 + level * 3, y + 44); c.closePath(); c.fill();
            c.fillStyle = lit;
            c.beginPath(); c.moveTo(76, y - 20); c.lineTo(40 - level * 2, y + 30); c.lineTo(78, y + 23); c.closePath(); c.fill();
          }
        } else {
          for (let i = 0; i < 30; i++) {
            const angle = hash(i, index, 2) * Math.PI * 2;
            const r = Math.sqrt(hash(i, index, 3)) * 44;
            const x = 76 + Math.cos(angle) * r;
            const y = 83 + Math.sin(angle) * r * 0.8;
            c.fillStyle = palettes[index][Math.max(0, Math.min(3, Math.floor((105 - y) / 22)))];
            c.beginPath(); c.ellipse(x, y, 21 + hash(i, 9) * 10, 19 + hash(i, 5) * 9, 0, 0, Math.PI * 2); c.fill();
          }
          c.fillStyle = highlight;
          for (let i = 0; i < 18; i++) c.fillRect(40 + hash(i, 17) * 63, 44 + hash(i, 23) * 38, 5, 2);
        }
      });
    });
    this.canvasTexture('rpg:rock', 160, 144, c => {
      c.fillStyle = 'rgba(31,46,37,.23)'; c.beginPath(); c.ellipse(84, 119, 68, 19, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#68776d'; c.beginPath(); c.moveTo(14, 109); c.lineTo(47, 27); c.lineTo(92, 12); c.lineTo(127, 56); c.lineTo(148, 116); c.closePath(); c.fill();
      c.fillStyle = '#8b9787'; c.beginPath(); c.moveTo(14, 109); c.lineTo(47, 27); c.lineTo(92, 12); c.lineTo(68, 73); c.lineTo(80, 111); c.closePath(); c.fill();
      c.fillStyle = '#a6afa0'; c.beginPath(); c.moveTo(47, 27); c.lineTo(92, 12); c.lineTo(76, 47); c.lineTo(61, 39); c.closePath(); c.fill();
      c.strokeStyle = '#53665b'; c.lineWidth = 3; c.beginPath(); c.moveTo(92, 13); c.lineTo(103, 79); c.lineTo(125, 109); c.stroke();
      c.fillStyle = '#516b50'; c.fillRect(27, 111, 37, 8); c.fillRect(94, 114, 32, 6);
    });
    this.canvasTexture('rpg:camp', 110, 92, c => {
      c.fillStyle = 'rgba(30,42,31,.23)'; c.beginPath(); c.ellipse(51, 72, 48, 16, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#d0b58a'; c.beginPath(); c.moveTo(17, 63); c.lineTo(42, 9); c.lineTo(87, 18); c.lineTo(106, 68); c.closePath(); c.fill();
      c.fillStyle = '#e4cc9a'; c.beginPath(); c.moveTo(42, 9); c.lineTo(6, 66); c.lineTo(68, 72); c.closePath(); c.fill();
      c.fillStyle = '#4f5b49'; c.beginPath(); c.moveTo(40, 27); c.lineTo(24, 67); c.lineTo(53, 70); c.closePath(); c.fill();
      c.strokeStyle = '#776044'; c.lineWidth = 2; c.beginPath(); c.moveTo(42, 9); c.lineTo(68, 72); c.moveTo(87, 18); c.lineTo(106, 68); c.stroke();
    });
    this.canvasTexture('rpg:chest', 60, 52, c => {
      c.fillStyle = 'rgba(30,42,31,.25)'; c.beginPath(); c.ellipse(31, 43, 26, 8, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#70482f'; c.fillRect(7, 20, 44, 23); c.fillStyle = '#c59b55'; c.fillRect(7, 12, 44, 14);
      c.strokeStyle = '#624b31'; c.lineWidth = 3; c.strokeRect(7, 12, 44, 31);
      c.fillStyle = '#e6c57a'; c.fillRect(13, 12, 5, 31); c.fillRect(41, 12, 5, 31); c.fillRect(26, 24, 9, 10);
    });
  }

  private buildingTexture(index: number) {
    const b = BUILDINGS[index];
    const width = b.w + 60;
    const height = b.h + 110;
    const key = `rpg:building:${index}`;
    this.canvasTexture(key, width, height, c => {
      const shrine = b.kind === 'shrine';
      const gate = b.kind === 'gate';
      const bottom = height - 17;
      c.fillStyle = 'rgba(25,41,34,.23)'; c.beginPath(); c.ellipse(width / 2 + 9, bottom - 5, width / 2 - 14, 26, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#9b9a7d'; c.fillRect(20, bottom - 14, width - 40, 17);
      if (!gate) {
        c.fillStyle = shrine ? '#acaa88' : '#d6c8a0'; c.fillRect(32, 78, width - 64, bottom - 84);
        c.fillStyle = '#73795f'; c.fillRect(32, 80, width - 64, 11);
        c.fillStyle = '#4c5040'; c.fillRect(width / 2 - 16, bottom - 53, 32, 42);
        c.fillStyle = '#7d6245'; c.fillRect(width / 2 - 11, bottom - 49, 21, 38);
        [-1, 1].forEach(side => {
          const x = width / 2 + side * (width / 2 - 62) - 12;
          c.fillStyle = '#685f44'; c.fillRect(x - 3, bottom - 56, 30, 29);
          c.fillStyle = '#e8c987'; c.fillRect(x, bottom - 53, 24, 23);
          c.fillStyle = '#776944'; c.fillRect(x + 10, bottom - 53, 3, 23); c.fillRect(x, bottom - 43, 24, 3);
        });
        c.fillStyle = '#998c69'; c.fillRect(28, bottom - 17, width - 56, 6);
      } else {
        c.fillStyle = '#a67c56'; c.fillRect(36, 67, 15, bottom - 72); c.fillRect(width - 51, 67, 15, bottom - 72);
        c.fillStyle = '#d5b17c'; c.fillRect(37, 70, 4, bottom - 76); c.fillRect(width - 50, 70, 4, bottom - 76);
        c.fillStyle = '#e0ccb0'; c.fillRect(28, bottom - 24, 32, 14); c.fillRect(width - 60, bottom - 24, 32, 14);
      }
      c.fillStyle = shrine || gate ? '#355d57' : '#637866';
      c.beginPath(); c.moveTo(4, 88); c.lineTo(35, 58); c.lineTo(width / 2, 29); c.lineTo(width - 35, 58); c.lineTo(width - 4, 88); c.lineTo(width - 19, 94); c.lineTo(width / 2, 69); c.lineTo(19, 94); c.closePath(); c.fill();
      c.strokeStyle = shrine || gate ? '#749183' : '#94a18a'; c.lineWidth = 2;
      for (let row = 0; row < 4; row++) {
        c.beginPath(); c.moveTo(18 + row * 9, 87 - row * 9); c.lineTo(width / 2, 64 - row * 10); c.lineTo(width - 18 - row * 9, 87 - row * 9); c.stroke();
      }
      c.strokeStyle = '#c2b98d'; c.lineWidth = 4; c.beginPath(); c.moveTo(5, 87); c.lineTo(width / 2, 64); c.lineTo(width - 5, 87); c.stroke();
      if (shrine || gate) {
        c.fillStyle = '#354c42'; c.fillRect(width / 2 - 24, 80, 48, 20);
        c.strokeStyle = '#d4bc77'; c.lineWidth = 1; c.strokeRect(width / 2 - 24, 80, 48, 20);
        c.fillStyle = '#eadba7'; c.font = `12px ${FONT}`; c.textAlign = 'center'; c.fillText(shrine ? '听 风' : '山 海', width / 2, 94);
      }
    });
    return { key, width, height };
  }

  private makeWorld() {
    this.water = this.add.graphics().setDepth(-40);
    this.worldLayer.add(this.water);
    for (let ty = 1; ty < WORLD_HEIGHT / TILE - 1; ty++) {
      for (let tx = 1; tx < WORLD_WIDTH / TILE - 1; tx++) {
        const tile = tileAt(tx, ty);
        const density = tile === 'forest' ? 0.37 : tile === 'mountain' ? 0.36 : tile === 'grass' ? 0.055 : 0;
        if (hash(tx, ty, 77) >= density) continue;
        const x = (tx + 0.25 + hash(tx, ty, 3) * 0.5) * TILE;
        const y = (ty + 0.3 + hash(tx, ty, 5) * 0.4) * TILE;
        if (ENTITIES.some(entity => Math.hypot(entity.x - x, entity.y - y) < 85)) continue;
        if (BUILDINGS.some(b => x > b.x - 70 && x < b.x + b.w + 70 && y > b.y - 70 && y < b.y + b.h + 95)) continue;
        const texture = tile === 'mountain' ? 'rpg:rock' : `rpg:tree:${ty > 23 ? 'gold' : tx > 29 ? 'pine' : 'round'}`;
        const image = this.add.image(x, y, texture).setOrigin(0.5, 0.87).setScale(0.65 + hash(tx, ty, 10) * 0.28).setDepth(y);
        this.worldLayer.add(image);
        this.worldProps.push(image);
      }
    }
    BUILDINGS.forEach((building, index) => {
      const texture = this.buildingTexture(index);
      const image = this.add.image(building.x + building.w / 2, building.y + building.h + 17, texture.key).setOrigin(0.5, 1).setDepth(building.y + building.h);
      this.worldLayer.add(image);
      this.worldProps.push(image);
    });
    REGIONS.forEach(region => {
      const label = this.add.text(region.x, region.y - 160, region.name, {
        fontFamily: '"Noto Serif SC", "SimSun", serif',
fontSize: '29px',
color: '#efe6bf',
stroke: '#465a42',
strokeThickness: 3,
        letterSpacing: 7,
      }).setOrigin(0.5).setAlpha(0.72).setDepth(-5);
      const subtitle = this.add.text(region.x, region.y - 124, region.subtitle, { fontFamily: FONT, fontSize: '10px', color: '#e6e3bb', letterSpacing: 3 }).setOrigin(0.5).setAlpha(0.75).setDepth(-5);
      this.worldLayer.add([label, subtitle]);
    });
    ENTITIES.forEach(entity => this.makeEntity(entity));
    this.atmosphere = this.add.graphics().setDepth(5000);
    this.worldLayer.add(this.atmosphere);
  }

  private makeEntity(entity: WorldEntity) {
    const color = entity.kind === 'encounter' ? 0xe79774 : entity.kind === 'npc' ? 0xf3d99b : 0xa9d5ae;
    const characterId = entity.characterId || (entity.kind === 'encounter' ? entity.enemies?.[0] : undefined);
    let actor: ActorView | undefined;
    let root: Phaser.GameObjects.Container;
    if (characterId && CHARACTERS[characterId]) {
      actor = this.createActor(characterId, entity.id === 'rift_tyrant' ? 104 : 73, this.worldLayer, color);
      root = actor.root;
    } else {
      root = this.add.container(entity.x, entity.y);
      if (entity.kind === 'camp') root.add(this.add.image(-23, -8, 'rpg:camp').setOrigin(0.5, 0.8).setScale(0.75));
      if (entity.kind === 'chest') root.add(this.add.image(0, -6, 'rpg:chest').setOrigin(0.5, 0.8));
      if (entity.kind === 'portal') {
        root.add(this.add.ellipse(0, -34, 66, 82, 0x8cb1ae, 0.18).setStrokeStyle(4, 0xc7dfca, 0.8));
        root.add(this.add.ellipse(0, -34, 46, 66, 0xdce9bd, 0.12).setStrokeStyle(1, 0xf3e2a9, 0.7));
      }
      this.worldLayer.add(root);
    }
    root.setPosition(entity.x, entity.y).setDepth(entity.y + 1);
    const label = this.add.text(0, -91, entity.name, { fontFamily: FONT, fontSize: '12px', color: cssColor(color), backgroundColor: '#273c34b8', padding: { x: 7, y: 4 } }).setOrigin(0.5);
    const marker = this.add.text(0, -115, entity.kind === 'encounter' ? '◆' : entity.kind === 'npc' ? '!' : entity.kind === 'camp' ? '♧' : '✧', { fontFamily: FONT, fontSize: '18px', color: cssColor(color), stroke: '#304a3a', strokeThickness: 3 }).setOrigin(0.5);
    if (entity.kind === 'chest' || entity.kind === 'camp') { label.y = -72; marker.y = -94; }
    root.add([label, marker]);
    this.entities.push({ entity, root, marker, actor });
  }

  private createActor(id: string, size: number, layer: Phaser.GameObjects.Layer, color: number): ActorView {
    const root = this.add.container(0, 0);
    const shadow = this.add.ellipse(0, 1, size * 0.62, size * 0.2, 0x152e27, 0.33);
    const ring = this.add.ellipse(0, 1, size * 0.7, size * 0.24, color, 0.055).setStrokeStyle(1.4, color, 0.55);
    const image = this.add.image(0, -1, this.textures.exists(keyFor(id)) ? keyFor(id) : '__MISSING').setOrigin(0.5, 0.95);
    image.setScale(Math.min(size / image.width, size / image.height));
    root.add([shadow, ring, image]);
    layer.add(root);
    return { root, image, shadow, ring, last: { x: 0, y: 0 }, size };
  }

  private makeArena() {
    this.canvasTexture('rpg:arena', BATTLE_WIDTH, BATTLE_HEIGHT, c => {
      const gradient = c.createLinearGradient(0, 0, 0, BATTLE_HEIGHT);
      gradient.addColorStop(0, '#526c59'); gradient.addColorStop(1, '#7c8865');
      c.fillStyle = gradient; c.fillRect(0, 0, BATTLE_WIDTH, BATTLE_HEIGHT);
      c.fillStyle = '#8e9677'; c.beginPath(); c.ellipse(480, 315, 400, 231, 0, 0, Math.PI * 2); c.fill();
      for (let y = 60; y < 555; y += 43) {
        for (let x = 38; x < 925; x += 55) {
          c.fillStyle = `rgba(210,207,169,${0.03 + hash(x, y) * 0.13})`;
          c.fillRect(x + (Math.floor(y / 43) % 2) * 20, y, 49, 36);
          c.strokeStyle = 'rgba(48,67,48,.09)'; c.lineWidth = 1; c.strokeRect(x + (Math.floor(y / 43) % 2) * 20, y, 49, 36);
        }
      }
      c.strokeStyle = 'rgba(226,216,164,.28)'; c.lineWidth = 2;
      c.beginPath(); c.ellipse(480, 315, 338, 186, 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(480, 315, 321, 176, 0, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgba(226,216,164,.14)';
      c.beginPath(); c.moveTo(480, 135); c.lineTo(480, 494); c.stroke();
      for (let i = 0; i < 400; i++) {
        const x = hash(i, 2) * BATTLE_WIDTH;
        const y = hash(i, 5) * BATTLE_HEIGHT;
        c.fillStyle = i % 3 ? 'rgba(217,207,152,.23)' : 'rgba(44,66,42,.23)'; c.fillRect(x, y, 2, 3);
      }
      const shade = c.createRadialGradient(480, 300, 220, 480, 300, 560);
      shade.addColorStop(0, 'rgba(26,47,37,0)'); shade.addColorStop(1, 'rgba(26,47,37,.58)'); c.fillStyle = shade; c.fillRect(0, 0, BATTLE_WIDTH, BATTLE_HEIGHT);
    });
    this.arenaGround = this.add.image(0, 0, 'rpg:arena').setOrigin(0).setDepth(-50);
    this.battleLayer.add(this.arenaGround);
    [[28, 163], [916, 167], [26, 582], [930, 594], [155, 73], [830, 57]].forEach(([x, y], i) => {
      const image = this.add.image(x, y, i % 2 ? 'rpg:tree:pine' : 'rpg:tree:round').setOrigin(0.5, 0.87).setScale(0.9).setDepth(y);
      this.battleLayer.add(image);
      this.arenaProps.push({ image, point: { x, y } });
    });
    this.battleEffects = this.add.graphics().setDepth(2000);
    this.battleLayer.add(this.battleEffects);
  }

  private onPointerDown(pointer: Phaser.Input.Pointer) {
    const state = this.bridge.getState();
    if (state.paused || (state.mode !== 'explore' && state.mode !== 'battle')) return;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    if (state.mode === 'battle') {
      const target = this.portraitBattle ? { x: point.y, y: BATTLE_HEIGHT - point.x } : point;
      if (state.manual) this.bridge.moveTarget({ x: Phaser.Math.Clamp(target.x, 30, 930), y: Phaser.Math.Clamp(target.y, 55, 560) });
      return;
    }
    const clicked = this.entities.filter(view => view.root.visible).find(view => Math.abs(view.entity.x - point.x) < 43 && point.y > view.entity.y - 100 && point.y < view.entity.y + 24);
    if (clicked) {
      this.bridge.interact(clicked.entity.id);
      return;
    }
    this.destinationPoint = { x: point.x, y: point.y };
    this.destinationTime = this.time.now;
    this.bridge.moveTarget(this.destinationPoint);
  }

  private resizeView() {
    const state = this.bridge.getState();
    const camera = this.cameras.main;
    const { width } = this.scale;
    const { height } = this.scale;
    const portrait = width < 600 && height > width;
    if (portrait !== this.portraitBattle) {
      this.portraitBattle = portrait;
      this.fighters.forEach(view => view.root.destroy());
      this.fighters.clear();
      this.effectLabels.forEach(label => label.destroy());
      this.effectLabels.clear();
    }
    const battle = state.mode === 'battle' || (state.mode === 'result' && !!state.battle);
    if (battle) {
      camera.removeBounds();
      if (portrait) {
        camera.setZoom(Math.min((width - 18) / 620, Math.max(280, height - 285) / 1010));
        camera.centerOn(BATTLE_HEIGHT / 2, BATTLE_WIDTH / 2 + 45);
      } else {
        camera.setZoom(Math.min((width - 20) / 1000, Math.max(220, height - 220) / 630));
        camera.centerOn(BATTLE_WIDTH / 2, BATTLE_HEIGHT / 2 + 4);
      }
      this.arenaGround.setPosition(portrait ? BATTLE_HEIGHT : 0, 0).setAngle(portrait ? 90 : 0);
      this.arenaProps.forEach(prop => {
        const point = this.battlePoint(prop.point);
        prop.image.setPosition(point.x, point.y).setDepth(point.y);
      });
    } else {
      camera.setZoom(width < 600 ? 1.03 : 1.08);
      camera.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
      camera.centerOn(state.player.x, state.player.y);
    }
  }

  private syncActor(view: ActorView, point: Point, time: number, facing?: number) {
    const moved = Math.hypot(point.x - view.last.x, point.y - view.last.y) > 0.1;
    const dx = point.x - view.last.x;
    view.root.setPosition(point.x, point.y).setDepth(point.y + 1);
    const step = moved ? Math.sin(time / 80 + view.size) : Math.sin(time / 450 + view.size) * 0.2;
    view.image.setY(-1 - (moved ? Math.abs(step) * 4 : step * 2)).setAngle(moved ? step * 4 : 0);
    if (facing !== undefined || Math.abs(dx) > 0.1) view.image.setFlipX(facing !== undefined ? facing < 0 : dx < 0);
    view.shadow.setScale(1 - Math.abs(step) * 0.03, 1);
    view.last = { x: point.x, y: point.y };
  }

  update(time: number) {
    if (!this.worldLayer) return;
    const state = this.bridge.getState();
    const battle = state.mode === 'battle' || (state.mode === 'result' && !!state.battle);
    if (this.lastMode !== state.mode) {
      this.worldLayer.setVisible(!battle);
      this.battleLayer.setVisible(battle);
      this.resizeView();
      this.lastMode = state.mode;
    }
    if (battle) this.syncBattle(state, time);
    else this.syncWorld(state, time);
  }

  private syncWorld(state: RpgState, time: number) {
    this.syncActor(this.player, state.player, time, state.facing);
    const distance = Math.hypot(state.player.x - this.previousPlayer.x, state.player.y - this.previousPlayer.y);
    if (distance > 2) {
      if (distance > 180) this.resetTrail(state);
      this.trail.unshift({ ...state.player });
      this.trail.length = Math.min(100, this.trail.length);
      this.previousPlayer = { ...state.player };
    }
    const active = state.active.filter(id => id !== 'biscuit_sui');
    this.followers.forEach((view, id) => { if (!active.includes(id)) { view.root.destroy(); this.followers.delete(id); } });
    active.forEach((id, index) => {
      let view = this.followers.get(id);
      if (!view) { view = this.createActor(id, 66, this.worldLayer, 0xbcd49d); this.followers.set(id, view); }
      const target = this.trail[Math.min(this.trail.length - 1, (index + 1) * 24)] || state.player;
      this.syncActor(view, target, time + index * 170);
    });
    const camera = this.cameras.main;
    const centerX = camera.scrollX + camera.width / 2;
    const centerY = camera.scrollY + camera.height / 2;
    camera.centerOn(Phaser.Math.Linear(centerX, state.player.x, 0.085), Phaser.Math.Linear(centerY, state.player.y - 12, 0.085));
    this.entities.forEach(view => {
      const { entity } = view;
      const gone = (entity.kind === 'encounter' && state.completed.includes(entity.id)) || (entity.kind === 'chest' && state.opened.includes(entity.id)) || (entity.kind === 'npc' && state.party.some(member => member.id === entity.characterId));
      view.root.setVisible(!gone);
      if (gone) return;
      if (view.actor) this.syncActor(view.actor, entity, time + entity.x * 7);
      view.marker.setY((entity.kind === 'camp' || entity.kind === 'chest' ? -94 : -115) + Math.sin(time / 430 + entity.x) * 3);
      const near = Math.hypot(entity.x - state.player.x, entity.y - state.player.y) < 112;
      view.marker.setAlpha(near ? 1 : 0.7);
      if (view.actor) view.actor.ring.setStrokeStyle(near ? 2.5 : 1.4, entity.kind === 'encounter' ? 0xe79774 : 0xf3d99b, near ? 1 : 0.4);
    });
    this.worldProps.forEach(prop => {
      const coversPlayer = Math.abs(prop.x - state.player.x) < prop.displayWidth * 0.4 && prop.y > state.player.y && prop.y - state.player.y < prop.displayHeight * 0.72;
      prop.setAlpha(coversPlayer ? 0.47 : 1);
    });
    this.drawWorldAtmosphere(time, state);
  }

  private drawWorldAtmosphere(time: number, state: RpgState) {
    this.water.clear();
    this.water.lineStyle(1.5, 0xa3c2a9, 0.34);
    for (let i = 0; i < 100; i++) {
      const x = 26 * TILE + 12 + hash(i, 66) * (3 * TILE - 24);
      const y = (hash(i, 72) * WORLD_HEIGHT + time * 0.011) % WORLD_HEIGHT;
      if (tileAt(Math.floor(x / TILE), Math.floor(y / TILE)) !== 'water') continue;
      const length = 5 + hash(i, 87) * 19;
      this.water.lineBetween(x, y, x + length, y);
    }
    this.atmosphere.clear();
    this.entities.forEach(({ entity, root }) => {
      if (!root.visible) return;
      if (entity.kind === 'camp') {
        const x = entity.x + 26; const y = entity.y + 6;
        this.atmosphere.fillStyle(0xffd689, 0.035); this.atmosphere.fillCircle(x, y - 5, 38 + Math.sin(time / 370) * 3);
        this.atmosphere.lineStyle(3, 0x756446, 0.9); this.atmosphere.lineBetween(x - 8, y + 3, x + 8, y - 4); this.atmosphere.lineBetween(x - 7, y - 4, x + 8, y + 3);
        this.atmosphere.fillStyle(0xe9a457, 0.9); this.atmosphere.fillTriangle(x - 6, y, x + Math.sin(time / 80) * 3, y - 18, x + 6, y);
        this.atmosphere.fillStyle(0xffe1a1, 0.95); this.atmosphere.fillTriangle(x - 3, y, x, y - 10, x + 4, y);
      }
      if (entity.kind === 'portal') {
        this.atmosphere.lineStyle(1.5, 0xf0dfaa, 0.45 + Math.sin(time / 600) * 0.2);
        this.atmosphere.strokeEllipse(entity.x, entity.y - 34, 82 + Math.sin(time / 530) * 6, 99);
      }
    });
    for (let i = 0; i < 26; i++) {
      const x = state.player.x - 650 + hash(i, 17) * 1300 + Math.sin(time / 4000 + i) * 18;
      const y = state.player.y - 450 + hash(i, 21) * 900 + Math.cos(time / 3000 + i) * 10;
      this.atmosphere.fillStyle(0xf8e3a4, 0.22 + Math.sin(time / 750 + i) * 0.16);
      this.atmosphere.fillCircle(x, y, 1.3);
    }
    this.destination.clear();
    if (this.destinationPoint && time - this.destinationTime < 1400) {
      const progress = (time - this.destinationTime) / 1400;
      this.destination.lineStyle(2, 0xffe1a2, 1 - progress);
      this.destination.strokeEllipse(this.destinationPoint.x, this.destinationPoint.y, 23 + progress * 14, 11 + progress * 7);
      this.destination.lineBetween(this.destinationPoint.x - 4, this.destinationPoint.y, this.destinationPoint.x + 4, this.destinationPoint.y);
    }
  }

  private syncBattle(state: RpgState, time: number) {
    const { battle } = state;
    if (!battle) return;
    if (this.renderedBattle !== battle) {
      this.fighters.forEach(view => view.root.destroy());
      this.fighters.clear();
      this.effectLabels.forEach(label => label.destroy());
      this.effectLabels.clear();
      this.battleEffects.clear();
      this.renderedBattle = battle;
    }
    const liveIds = battle.units.map(unit => unit.uid);
    this.fighters.forEach((view, id) => { if (!liveIds.includes(id)) { view.root.destroy(); this.fighters.delete(id); } });
    battle.units.forEach(unit => {
      let view = this.fighters.get(unit.uid);
      if (!view) {
        view = this.createBattleActor(unit);
        this.fighters.set(unit.uid, view);
      }
      const previousX = view.last.x;
      const point = this.battlePoint(unit);
      this.syncActor(view, point, time + unit.maxHp);
      if (Math.abs(previousX - point.x) < 0.1) view.image.setFlipX(unit.side === 'enemy');
      view.root.setAlpha(unit.hp > 0 ? 1 : 0.24);
      if (unit.hp <= 0) view.image.setAngle(unit.side === 'enemy' ? 75 : -75).setY(10);
      if (unit.flash > 0 && unit.hp > 0) {
        view.image.setTint(0xffeec6).setTintMode(Phaser.TintModes.FILL);
      } else view.image.clearTint();
      if (view.hp) view.hp.width = 62 * Math.max(0, unit.hp / unit.maxHp);
      view.ring.setStrokeStyle(1.5, unit.side === 'ally' ? 0xb4dfa5 : 0xeaa48b, unit.hp > 0 ? 0.8 : 0);
    });
    this.battleEffects.clear();
    const effectIds = battle.effects.map(effect => effect.id);
    this.effectLabels.forEach((label, id) => { if (!effectIds.includes(id)) { label.destroy(); this.effectLabels.delete(id); } });
    battle.effects.forEach(effect => {
      const point = this.battlePoint(effect);
      let label = this.effectLabels.get(effect.id);
      if (!label) {
        label = this.add.text(point.x, point.y - 87, effect.text, { fontFamily: FONT, fontSize: this.portraitBattle ? (effect.kind === 'skill' ? '22px' : '28px') : (effect.kind === 'skill' ? '15px' : '19px'), fontStyle: 'bold', color: cssColor(effect.color), stroke: '#263c32', strokeThickness: 4 }).setOrigin(0.5).setDepth(2200);
        this.battleLayer.add(label);
        this.effectLabels.set(effect.id, label);
      }
      label.setPosition(point.x, point.y - 90 - (1 - Math.min(1, effect.life)) * 29).setAlpha(Math.min(1, effect.life * 2));
      if (effect.kind === 'skill' || effect.kind === 'heal') {
        const radius = 23 + (1 - Math.min(1, effect.life)) * 55;
        this.battleEffects.lineStyle(2, effect.color, Math.min(0.7, effect.life));
        this.battleEffects.strokeEllipse(point.x, point.y, radius * 2, radius);
        if (effect.targetX !== undefined && effect.targetY !== undefined) {
          this.battleEffects.lineStyle(3, effect.color, Math.min(0.6, effect.life));
          const target = this.battlePoint({ x: effect.targetX, y: effect.targetY });
          this.battleEffects.lineBetween(point.x, point.y - 30, target.x, target.y - 30);
        }
      } else {
        this.battleEffects.lineStyle(2, effect.color, Math.min(1, effect.life * 2));
        this.battleEffects.lineBetween(point.x - 8, point.y - 40, point.x + 9, point.y - 61);
      }
    });
  }

  private createBattleActor(unit: BattleUnit) {
    const size = unit.characterId.includes('tyrant') ? 117 : this.portraitBattle ? 108 : 84;
    const view = this.createActor(unit.characterId, size, this.battleLayer, unit.side === 'ally' ? 0xa8d394 : 0xe2a082);
    view.root.setName(`rpg-fighter:${unit.uid}`).setData('characterId', unit.characterId).setData('unitUid', unit.uid);
    const back = this.add.rectangle(0, 14, 66, 8, 0x233e31).setStrokeStyle(1, 0xe0d4a7, 0.25);
    view.hp = this.add.rectangle(-31, 14, 62, 4, unit.side === 'ally' ? 0xc1dd93 : 0xde866f).setOrigin(0, 0.5);
    view.label = this.add.text(0, 32, unit.name, { fontFamily: FONT, fontSize: this.portraitBattle ? '18px' : '12px', color: '#f4e7bf', stroke: '#334c39', strokeThickness: 4 }).setOrigin(0.5);
    view.root.add([back, view.hp, view.label]);
    return view;
  }

  private battlePoint(point: Point): Point {
    return this.portraitBattle ? { x: BATTLE_HEIGHT - point.y, y: point.x } : point;
  }

  private resetTrail(state: RpgState) {
    this.trail = Array.from({ length: 100 }, (_, index) => ({ x: state.player.x - state.facing * index * 2.8, y: state.player.y }));
  }
}
