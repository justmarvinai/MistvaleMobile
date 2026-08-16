import {
  AnimatedSprite,
  Container,
  Graphics,
  Text,
  TextStyle,
  type Texture,
  type Ticker,
} from 'pixi.js';
import type { UnitRef } from '@mistvale/engine';
import type { Floater, PlaybackView, VisualUnit } from './playback';
import { loadIdleFrames } from './sprites';
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
  damage: 0xe8ddc4,
  heal: 0x57b35c,
  resist: 0x9aa3b5,
  shield: 0x7fd4c1,
  status: 0xe6a53c,
};

/** Where a slot sits, staggered so the back rank reads behind the front. */
function slotPosition(side: 'ally' | 'enemy', slot: number): { x: number; y: number } {
  const baseY = 300;
  const step = 46;
  const depth = 34;
  const y = baseY + slot * step * 0.55;
  const inset = 190 + slot * depth;
  return { x: side === 'ally' ? inset : VIRTUAL_WIDTH - inset, y };
}

interface UnitVisual {
  container: Container;
  sprite: AnimatedSprite | null;
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

export class BattleScene implements Scene {
  readonly root = new Container();

  private readonly backdrop = new Container();
  private readonly unitsLayer = new Container();
  private readonly floaterLayer = new Container();
  private readonly bannerLayer = new Container();

  private readonly units = new Map<string, UnitVisual>();
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
    ground.rect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT).fill(0x0b0e14);
    ground.rect(0, 230, VIRTUAL_WIDTH, VIRTUAL_HEIGHT - 230).fill(0x131a24);
    ground.rect(0, 228, VIRTUAL_WIDTH, 2).fill(0x1e2533);
    this.backdrop.addChildAt(ground, 0);
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
    return { container, sprite: null, hpBar, ring, chips, shake: 0, home };
  }

  private async attachSprite(visual: UnitVisual, unit: VisualUnit): Promise<void> {
    const frames: Texture[] = await loadIdleFrames(this.artFor(unit.defKey));
    if (frames.length === 0 || visual.container.destroyed) return;

    const sprite = new AnimatedSprite(frames);
    sprite.anchor.set(0.5, 1);
    sprite.animationSpeed = 9 / 60; // The 9 fps the art was drawn at.
    sprite.play();
    // Enemies face the player's side.
    sprite.scale.x = unit.ref.side === 'enemy' ? -2 : 2;
    sprite.scale.y = 2;
    visual.sprite = sprite;
    visual.container.addChildAt(sprite, 0);
  }

  private updateUnit(visual: UnitVisual, unit: VisualUnit, view: PlaybackView): void {
    const acting = view.acting !== null && this.key(view.acting) === this.key(unit.ref);

    if (visual.sprite) {
      visual.sprite.alpha = unit.alive ? 1 : 0.25;
      // A fallen unit dims and desaturates rather than vanishing, so the slot still reads.
      visual.sprite.tint = unit.alive ? 0xffffff : 0x53585f;
    }

    // Health bar.
    const width = 52;
    const ratio = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
    visual.hpBar.clear();
    visual.hpBar.rect(-width / 2, 10, width, 6).fill(0x0b0e14);
    visual.hpBar
      .rect(-width / 2 + 1, 11, (width - 2) * ratio, 4)
      .fill(unit.ref.side === 'ally' ? 0x57b35c : 0xd4503f);

    // Active-turn ring.
    visual.ring.clear();
    if (acting && unit.alive) {
      visual.ring
        .ellipse(0, 4, 30, 10)
        .stroke({ width: 2, color: ELEMENT_TINT[unit.element] ?? 0x7fd4c1, alpha: 0.9 });
    }

    // Status chips: a coloured pip per effect, count above three.
    visual.chips.removeChildren();
    const chips = [...unit.buffs, ...unit.debuffs].slice(0, 6);
    chips.forEach((chip, index) => {
      const pip = new Graphics();
      pip.rect(index * 9, 0, 7, 7).fill(chip.kind === 'buff' ? 0x7fd4c1 : 0xd4503f);
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
        stroke: { color: 0x0b0e14, width: 3 },
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
      fill: view.banner.tone === 'defeat' ? 0xd4503f : 0xe8ddc4,
      stroke: { color: 0x0b0e14, width: 5 },
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
      this.mist.ellipse(x, y, 150, 16).fill({ color: 0x7fd4c1, alpha: 0.035 });
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
