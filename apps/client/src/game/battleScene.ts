import {
  AnimatedSprite,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  type Texture,
  type Ticker,
} from 'pixi.js';
import type { UnitRef } from '@mistvale/engine';
import type { Floater, PlaybackView, VisualUnit } from './playback';
import { loadIdleFrames, loadPlaceholderTexture } from './sprites';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH, type Scene } from './stage';

/**
 * The battle stage.
 *
 * Draws whatever the playback view currently says. It holds no game state of its own and
 * makes no decisions — hand it a view, it renders that view. All the timing lives in the
 * playback engine, which is what keeps this file about pixels (docs/UI_UX_DESIGN.md §4).
 *
 * Formations stagger diagonally per side so four units never overlap, and each unit keeps
 * its idle loop running the whole fight, because a still battlefield reads as broken.
 */

const ELEMENT_TINT: Record<string, number> = {
  ember: 0xe5533d,
  tide: 0x3f8fd4,
  verdant: 0x57b35c,
  mist: 0xa06bd8,
};

const FLOATER_COLOUR: Record<Floater['kind'], number> = {
  damage: 0xe6dccb,
  heal: 0x57b35c,
  resist: 0x9c9382,
  shield: 0xc2764a,
  status: 0xe0a52e,
};

/**
 * Where a slot sits, staggered so the back rank reads behind the front.
 *
 * Exported because the DOM battlefield draws the same formation — a fight must look like the
 * same fight whether it is painted by WebGL or by the browser.
 */
export function slotPosition(side: 'ally' | 'enemy', slot: number): { x: number; y: number } {
  const baseY = 300;
  const step = 46;
  const depth = 34;
  const y = baseY + slot * step * 0.55;
  const inset = 190 + slot * depth;
  return { x: side === 'ally' ? inset : VIRTUAL_WIDTH - inset, y };
}

/**
 * Whatever is standing in the slot.
 *
 * Three shapes, in descending order of how much art survived: the unit's own idle loop, the
 * shared silhouette when its frames would not load, and a drawn figure when even that would
 * not. All three carry `tint` and `alpha`, which is all `updateUnit` asks of them.
 */
type UnitBody = AnimatedSprite | Sprite | Graphics;

interface UnitVisual {
  container: Container;
  sprite: UnitBody | null;
  /**
   * The colour the body sits at while alive.
   *
   * White for real art, which must not be recoloured, and the unit's element for a
   * silhouette, which has no colour of its own and is the only thing telling two sides of
   * faceless stand-ins apart.
   */
  baseTint: number;
  hpBar: Graphics;
  ring: Graphics;
  chips: Container;
  /** Frames of shake left, so a hit reads without a tween library. */
  shake: number;
  home: { x: number; y: number };
}

interface FloaterVisual {
  text: Text;
  life: number;
  drift: number;
}

const FLOATER_LIFE = 52;

/** How tall a stand-in stands: a champion's 88px art at ×2, so the two are interchangeable. */
const STAND_IN_HEIGHT = 176;

/**
 * The last resort — a figure drawn rather than loaded.
 *
 * Reached only when the theme's silhouette is unavailable too, which in practice means a
 * page whose stylesheet never arrived. It is deliberately crude: the job is to occupy the
 * slot so the fight has a shape, not to be looked at.
 */
function drawStandIn(): Graphics {
  const figure = new Graphics();
  const w = STAND_IN_HEIGHT * 0.42;
  figure.roundRect(-w / 2, -STAND_IN_HEIGHT * 0.72, w, STAND_IN_HEIGHT * 0.72, 6).fill(0xffffff);
  figure.circle(0, -STAND_IN_HEIGHT * 0.8, w * 0.32).fill(0xffffff);
  figure.alpha = 0.55;
  return figure;
}

export class BattleScene implements Scene {
  readonly root = new Container();

  private readonly backdrop = new Container();
  private readonly unitsLayer = new Container();
  private readonly floaterLayer = new Container();
  private readonly bannerLayer = new Container();

  private readonly units = new Map<string, UnitVisual>();

  /**
   * How many bodies are standing on the field right now.
   *
   * Read by the screen so it can tell a player that the battlefield could not be drawn,
   * rather than showing them a black rectangle and letting them work it out. Nothing about
   * the fight depends on it — this is the scene reporting on itself.
   */
  get drawn(): number {
    return this.units.size;
  }
  private readonly floaters = new Map<number, FloaterVisual>();
  private banner: { text: Text; life: number } | null = null;

  private mistOffset = 0;
  private readonly mist: Graphics;

  /** Base paths by unit, so a re-render does not reload textures. */
  private readonly artFor: (defKey: string) => string;

  constructor(artFor: (defKey: string) => string) {
    this.artFor = artFor;

    this.mist = new Graphics();
    this.backdrop.addChild(this.mist);
    this.root.addChild(this.backdrop, this.unitsLayer, this.floaterLayer, this.bannerLayer);
    this.drawBackdrop();
  }

  private drawBackdrop(): void {
    const ground = new Graphics();
    // A horizon band and a ground plate: enough depth to sit units in, cheap to draw.
    ground.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill(0x0c0a09);
    ground.rect(0, 230, VIRTUAL_WIDTH, VIRTUAL_HEIGHT - 230).fill(0x171310);
    ground.rect(0, 228, VIRTUAL_WIDTH, 2).fill(0x2a2018);
    this.backdrop.addChildAt(ground, 0);
  }

  /**
   * Fits the 960×540 design canvas inside whatever viewport it is handed.
   *
   * Without this the scene drew at its virtual size from the canvas origin — a
   * 960×540 rectangle in the corner of a 1440×900 window, with the champions
   * standing wherever that happened to put them. `Scene.resize` is optional and
   * nobody had noticed it was missing, because until the duplicate stage was
   * removed this screen was never visible at all.
   *
   * Contain rather than cover: a battle is a composition with two sides in it, and
   * cropping the edges off to fill the screen would push the flanking slots out of
   * view on a wide monitor.
   */
  resize(width: number, height: number): void {
    const scale = Math.min(width / VIRTUAL_WIDTH, height / VIRTUAL_HEIGHT);
    this.root.scale.set(scale);
    this.root.x = (width - VIRTUAL_WIDTH * scale) / 2;
    this.root.y = (height - VIRTUAL_HEIGHT * scale) / 2;
  }

  private key(ref: UnitRef): string {
    return `${ref.side}:${ref.slot}`;
  }

  /** Creates or updates every unit's visual to match the view. */
  async sync(view: PlaybackView): Promise<void> {
    const seen = new Set<string>();

    for (const unit of [...view.allies, ...view.enemies]) {
      const key = this.key(unit.ref);
      seen.add(key);
      let visual = this.units.get(key);
      if (!visual) {
        visual = this.createUnit(unit);
        this.units.set(key, visual);
        this.unitsLayer.addChild(visual.container);
        void this.attachSprite(visual, unit);
      }
      this.updateUnit(visual, unit, view);
    }

    // A wave transition replaces the enemy side wholesale.
    for (const [key, visual] of this.units) {
      if (seen.has(key)) continue;
      this.unitsLayer.removeChild(visual.container);
      visual.container.destroy({ children: true });
      this.units.delete(key);
    }

    this.syncFloaters(view);
    this.syncBanner(view);
  }

  private createUnit(unit: VisualUnit): UnitVisual {
    const container = new Container();
    const home = slotPosition(unit.ref.side, unit.ref.slot);
    container.position.set(home.x, home.y);

    const ring = new Graphics();
    const hpBar = new Graphics();
    const chips = new Container();
    chips.position.set(-26, 26);

    container.addChild(ring, hpBar, chips);
    return { container, sprite: null, baseTint: 0xffffff, hpBar, ring, chips, shake: 0, home };
  }

  /**
   * Puts something in the slot — and it is always something.
   *
   * This used to return when no frame loaded, which is how a fight becomes a turn order and
   * a set of health bars floating over an empty field. Any art problem at all reached the
   * player as an invisible battle: a release built without `pnpm assets`, a path the web
   * server does not hand out, a champion whose frames were never drawn. The fight itself was
   * running correctly the whole time, which is what made it so hard to see.
   *
   * So the ladder goes: the unit's own idle loop, then the shared silhouette, then a shape
   * drawn here. The last rung needs no network and no theme, so there is no state of the
   * world in which a unit is not on the board.
   */
  private async attachSprite(visual: UnitVisual, unit: VisualUnit): Promise<void> {
    const frames: Texture[] = await loadIdleFrames(this.artFor(unit.defKey));
    if (visual.container.destroyed) return;

    if (frames.length > 0) {
      const sprite = new AnimatedSprite(frames);
      sprite.anchor.set(0.5, 1);
      sprite.animationSpeed = 9 / 60; // The 9 fps the art was drawn at.
      sprite.play();
      // Enemies face the player's side.
      sprite.scale.x = unit.ref.side === 'enemy' ? -2 : 2;
      sprite.scale.y = 2;
      this.setBody(visual, sprite, 0xffffff);
      return;
    }

    const stand = await loadPlaceholderTexture();
    if (visual.container.destroyed) return;

    // The element rather than white: a silhouette has no colour of its own, and a field of
    // identical black figures is only marginally better than an empty one.
    const tint = ELEMENT_TINT[unit.element] ?? 0x9c9382;

    if (stand) {
      const sprite = new Sprite(stand);
      sprite.anchor.set(0.5, 1);
      // Matched to a real unit's drawn height (88px art at ×2) rather than to the
      // silhouette's own 1400px, so a stand-in stands the same size as a champion.
      const scale = STAND_IN_HEIGHT / (stand.height || STAND_IN_HEIGHT);
      sprite.scale.set(unit.ref.side === 'enemy' ? -scale : scale, scale);
      this.setBody(visual, sprite, tint);
      return;
    }

    this.setBody(visual, drawStandIn(), tint);
  }

  /** Puts a body under the ring and the bars, and records the colour it lives at. */
  private setBody(visual: UnitVisual, body: UnitBody, baseTint: number): void {
    visual.sprite = body;
    visual.baseTint = baseTint;
    body.tint = baseTint;
    visual.container.addChildAt(body, 0);
  }

  private updateUnit(visual: UnitVisual, unit: VisualUnit, view: PlaybackView): void {
    const acting = view.acting !== null && this.key(view.acting) === this.key(unit.ref);

    if (visual.sprite) {
      visual.sprite.alpha = unit.alive ? 1 : 0.25;
      // A fallen unit dims and desaturates rather than vanishing, so the slot still reads.
      visual.sprite.tint = unit.alive ? visual.baseTint : 0x4a443c;
    }

    // Health bar.
    const width = 52;
    const ratio = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
    visual.hpBar.clear();
    visual.hpBar.rect(-width / 2, 10, width, 6).fill(0x0c0a09);
    visual.hpBar
      .rect(-width / 2 + 1, 11, (width - 2) * ratio, 4)
      .fill(unit.ref.side === 'ally' ? 0x57b35c : 0xc8412f);

    // Active-turn ring.
    visual.ring.clear();
    if (acting && unit.alive) {
      visual.ring
        .ellipse(0, 4, 30, 10)
        .stroke({ width: 2, color: ELEMENT_TINT[unit.element] ?? 0xc2764a, alpha: 0.9 });
    }

    // Status chips: a coloured pip per effect, count above three.
    visual.chips.removeChildren();
    const chips = [...unit.buffs, ...unit.debuffs].slice(0, 6);
    chips.forEach((chip, index) => {
      const pip = new Graphics();
      pip.rect(index * 9, 0, 7, 7).fill(chip.kind === 'buff' ? 0xc2764a : 0xc8412f);
      visual.chips.addChild(pip);
    });

    if (unit.impulse) visual.shake = unit.impulse === 'crit' ? 12 : 7;
  }

  private syncFloaters(view: PlaybackView): void {
    for (const floater of view.floaters) {
      if (this.floaters.has(floater.id)) continue;

      const style = new TextStyle({
        fontFamily: 'monospace',
        fontSize: floater.crit ? 20 : 15,
        fontWeight: 'bold',
        fill: FLOATER_COLOUR[floater.kind],
        stroke: { color: 0x0c0a09, width: 3 },
      });
      const text = new Text({ text: floater.text, style });
      text.anchor.set(0.5, 1);

      const home = slotPosition(floater.ref.side, floater.ref.slot);
      text.position.set(home.x + (Math.random() - 0.5) * 18, home.y - 40);

      this.floaterLayer.addChild(text);
      this.floaters.set(floater.id, { text, life: FLOATER_LIFE, drift: 0.7 });
    }
  }

  private syncBanner(view: PlaybackView): void {
    if (!view.banner) return;
    if (this.banner) {
      this.bannerLayer.removeChild(this.banner.text);
      this.banner.text.destroy();
    }
    const style = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 34,
      fontWeight: 'bold',
      fill: view.banner.tone === 'defeat' ? 0xc8412f : 0xe6dccb,
      stroke: { color: 0x0c0a09, width: 5 },
    });
    const text = new Text({ text: view.banner.text, style });
    text.anchor.set(0.5);
    text.position.set(VIRTUAL_WIDTH / 2, 150);
    this.bannerLayer.addChild(text);
    this.banner = { text, life: 90 };
  }

  update(ticker: Ticker): void {
    const delta = ticker.deltaTime;

    // Drifting mist, so the battlefield is never completely still.
    this.mistOffset = (this.mistOffset + delta * 0.25) % (VIRTUAL_WIDTH + 200);
    this.mist.clear();
    for (let band = 0; band < 3; band += 1) {
      const y = 250 + band * 70;
      const x = ((this.mistOffset + band * 190) % (VIRTUAL_WIDTH + 200)) - 100;
      this.mist.ellipse(x, y, 150, 16).fill({ color: 0xc2764a, alpha: 0.035 });
    }

    for (const visual of this.units.values()) {
      if (visual.shake > 0) {
        visual.shake -= delta;
        const magnitude = Math.max(0, visual.shake) * 0.35;
        visual.container.position.set(
          visual.home.x + (Math.random() - 0.5) * magnitude * 2,
          visual.home.y + (Math.random() - 0.5) * magnitude,
        );
      } else {
        visual.container.position.set(visual.home.x, visual.home.y);
      }
    }

    for (const [id, floater] of this.floaters) {
      floater.life -= delta;
      floater.text.y -= floater.drift * delta;
      floater.text.alpha = Math.max(0, Math.min(1, floater.life / 20));
      if (floater.life <= 0) {
        this.floaterLayer.removeChild(floater.text);
        floater.text.destroy();
        this.floaters.delete(id);
      }
    }

    if (this.banner) {
      this.banner.life -= delta;
      this.banner.text.alpha = Math.max(0, Math.min(1, this.banner.life / 25));
      if (this.banner.life <= 0) {
        this.bannerLayer.removeChild(this.banner.text);
        this.banner.text.destroy();
        this.banner = null;
      }
    }
  }

  destroy(): void {
    this.root.destroy({ children: true });
    this.units.clear();
    this.floaters.clear();
    this.banner = null;
  }
}
