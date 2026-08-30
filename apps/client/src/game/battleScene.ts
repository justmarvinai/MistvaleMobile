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
import { BURST_LIFT } from './playback';
import type { Effect, EffectKind, Floater, PlaybackView, VisualUnit } from './playback';
import { loadIdleFrames, loadPlaceholderTexture } from './sprites';
import { mirrored } from './facing';
import { UNIT_HEIGHT, slotPosition } from './formation';
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

/** Frames a body takes to fall, at Pixi's 60fps `deltaTime` of 1 per frame. */
const FALL_FRAMES = 30;

/**
 * Blends two packed RGB colours.
 *
 * Pixi's tint multiplies, so flashing by *setting* a colour would darken a body rather than
 * light it — the mix has to happen here, channel by channel, before it is handed over.
 */
function mixTint(base: number, towards: number, amount: number): number {
  const t = Math.max(0, Math.min(1, amount));
  const mix = (shift: number): number => {
    const a = (base >> shift) & 0xff;
    const b = (towards >> shift) & 0xff;
    return Math.round(a + (b - a) * t) & 0xff;
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/**
 * One frame of a burst: a ring that opens and fades.
 *
 * A cast blooms inward instead, which is what makes a wind-up read as gathering rather
 * than as another blow landing.
 */
function drawBurst(burst: Burst): void {
  const progress = 1 - burst.life / burst.total;
  const eased = burst.kind === 'cast' ? 1 - progress : progress;
  const radius = Math.max(1, burst.radius * (0.25 + eased * 0.75));
  const alpha = (1 - progress) * 0.85;

  burst.gfx.clear();
  // A faint disc under the ring. The field is nearly black and a two-pixel stroke on it is
  // a hairline — the fill is what makes the blow read at a glance, and it fades out first
  // so what is left at the end is the ring rather than a smear.
  burst.gfx
    .ellipse(burst.x, burst.y, radius, radius * 0.65)
    .fill({ color: burst.colour, alpha: alpha * 0.3 });
  burst.gfx
    .ellipse(burst.x, burst.y, radius, radius * 0.65)
    .stroke({ width: burst.kind === 'impact' ? 3 : 2, color: burst.colour, alpha });
  // A second, tighter ring on a heavy landing, so a crit reads as more than a bigger circle.
  if (burst.kind === 'impact' && burst.radius > 44) {
    burst.gfx
      .ellipse(burst.x, burst.y, radius * 0.55, radius * 0.35)
      .stroke({ width: 2, color: burst.colour, alpha: alpha * 0.8 });
  }
}

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
 * Where a slot sits — see `./formation`, which four things read and none of them is this.
 *
 * Re-exported rather than moved outright so the two overlays and the DOM battlefield keep
 * one import, and so the scene stays the place a reader looks for anything about drawing.
 */
export { UNIT_HEIGHT, UNIT_WIDTH, slotPosition } from './formation';

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
  /** Frames of lunge left, and how far toward the target it leans. */
  lunge: { life: number; total: number; dx: number; dy: number } | null;
  /** Frames of colour-flash left, and what colour. White for a hit, green for a heal. */
  flash: { life: number; total: number; colour: number } | null;
  /** Counts up while the unit is falling, so a death is a slump rather than a switch. */
  fall: number;
  /** Whether the body is standing, so a flash knows what colour to return to. */
  alive: boolean;
  /** Which way it faces, so it slumps away from the fight rather than into it. */
  mirrored: boolean;
  home: { x: number; y: number };
}

/**
 * A burst on the field: an expanding ring where a blow landed, a bloom where one was cast.
 *
 * Graphics rather than sprites because there is no effect art to draw from and inventing
 * icons is against the brief — a ring that opens and fades is honest geometry, costs
 * nothing to load and reads at every speed the ladder offers.
 */
interface Burst {
  gfx: Graphics;
  life: number;
  total: number;
  x: number;
  y: number;
  colour: number;
  /** Peak radius. A crit opens wider than a glancing blow. */
  radius: number;
  kind: EffectKind;
}

interface FloaterVisual {
  text: Text;
  life: number;
  drift: number;
}

const FLOATER_LIFE = 52;

/** How tall a stand-in stands: a champion's 88px art at ×2, so the two are interchangeable. */
/** A stand-in stands the same size a champion does — see `formation.UNIT_HEIGHT`. */
const STAND_IN_HEIGHT = UNIT_HEIGHT;

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
  /** Bursts already drawn, by effect id, so one beat is never played twice. */
  private readonly bursts = new Map<number, Burst>();
  /** Effect ids already spawned, so a re-applied view does not replay a beat. */
  private played = new Set<number>();
  private readonly effectLayer = new Container();

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
    // Effects sit above the bodies and below the numbers: a burst should read as landing
    // *on* the unit, and a damage number should never be hidden behind one.
    this.root.addChild(
      this.backdrop,
      this.unitsLayer,
      this.effectLayer,
      this.floaterLayer,
      this.bannerLayer,
    );
    this.drawBackdrop();
  }

  private drawBackdrop(): void {
    const ground = new Graphics();
    // A horizon band and a ground plate: enough depth to sit units in, cheap to draw.
    //
    // Drawn far wider than the design canvas on purpose. `resize` *contains* 960×540 inside
    // the viewport — the right choice for the composition, since cropping the flanks would
    // push the outer slots off a wide monitor — but it means the canvas is narrower than the
    // window, and a ground exactly 960 wide ended at the letterbox with black either side.
    // The floor is scenery, not composition: it runs past the edge in both directions so it
    // reaches the sides of any window the fight is watched in.
    const bleed = VIRTUAL_WIDTH;
    const wide = VIRTUAL_WIDTH + bleed * 2;
    ground.rect(-bleed, 0, wide, VIRTUAL_HEIGHT).fill(0x0c0a09);
    ground.rect(-bleed, 230, wide, VIRTUAL_HEIGHT - 230).fill(0x171310);
    ground.rect(-bleed, 228, wide, 2).fill(0x2a2018);
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

    this.syncEffects(view);
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
    return {
      container,
      sprite: null,
      baseTint: 0xffffff,
      hpBar,
      ring,
      chips,
      shake: 0,
      lunge: null,
      flash: null,
      fall: 0,
      alive: true,
      mirrored: false,
      home,
    };
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
    const art = this.artFor(unit.defKey);
    const flip = mirrored(art, unit.ref.side) ? -1 : 1;
    visual.mirrored = flip < 0;
    const frames: Texture[] = await loadIdleFrames(art);
    if (visual.container.destroyed) return;

    if (frames.length > 0) {
      const sprite = new AnimatedSprite(frames);
      sprite.anchor.set(0.5, 1);
      sprite.animationSpeed = 9 / 60; // The 9 fps the art was drawn at.
      sprite.play();
      // Turned to face the fight, by what the art is rather than by which side it is on.
      sprite.scale.x = 2 * flip;
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
      sprite.scale.set(scale * flip, scale);
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

    visual.alive = unit.alive;
    if (visual.sprite) {
      visual.sprite.alpha = unit.alive ? 1 : 0.25;
      // A fallen unit dims and desaturates rather than vanishing, so the slot still reads.
      // Skipped while a flash is playing: the flash owns the tint until it burns out, and
      // writing the resting colour here every frame would cancel it before it was seen.
      if (!visual.flash) visual.sprite.tint = unit.alive ? visual.baseTint : 0x4a443c;
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

    // What a beat looks like on the body itself. The shake is the weight of the blow, the
    // flash is what kind it was — one line each, because the fight has to read at ×4 as
    // well as at ×1 and anything subtler is invisible at speed.
    switch (unit.impulse) {
      case 'crit':
        visual.shake = 14;
        visual.flash = { life: 7, total: 7, colour: 0xfff1c4 };
        break;
      case 'hit':
        visual.shake = 8;
        visual.flash = { life: 5, total: 5, colour: 0xffd9c9 };
        break;
      // A glancing blow barely moves anybody: that *is* the information.
      case 'weak':
        visual.shake = 3;
        visual.flash = { life: 4, total: 4, colour: 0x8f8b79 };
        break;
      case 'heal':
        visual.flash = { life: 14, total: 14, colour: 0x57b35c };
        break;
      case 'shield':
        visual.flash = { life: 14, total: 14, colour: 0x3f8fd4 };
        break;
      case 'resist':
        visual.flash = { life: 10, total: 10, colour: 0xc9a227 };
        break;
      case 'death':
        visual.fall = 1;
        break;
      default:
        break;
    }
  }

  /**
   * Turns the view's effects into motion, once each.
   *
   * Keyed on the effect's id exactly as floaters are, so replaying the same view — which
   * happens on every animation frame — does not re-fire a beat that is already playing.
   */
  private syncEffects(view: PlaybackView): void {
    for (const effect of view.effects) {
      if (this.bursts.has(effect.id) || this.played.has(effect.id)) continue;
      this.played.add(effect.id);
      this.spawnEffect(effect);
    }
    // The set is bounded by the same trim the view gets, plus room for what is in flight.
    if (this.played.size > 64) {
      this.played = new Set([...this.played].slice(-32));
    }
  }

  private spawnEffect(effect: Effect): void {
    const target = this.units.get(this.key(effect.ref));
    if (!target) return;
    const colour = effect.element ? (ELEMENT_TINT[effect.element] ?? 0xc2764a) : 0xc2764a;

    switch (effect.kind) {
      case 'strike': {
        // The attacker leans a third of the way toward whoever it is hitting, and springs
        // back. A third rather than the whole distance: this is a swing, not a charge, and
        // a body that crosses the field would fight the formation the screen is teaching.
        const toward = effect.toward ? this.units.get(this.key(effect.toward)) : undefined;
        if (!toward) return;
        const dx = (toward.home.x - target.home.x) * 0.28;
        const dy = (toward.home.y - target.home.y) * 0.28;
        target.lunge = { life: 16, total: 16, dx, dy };
        return;
      }

      case 'impact': {
        const big = effect.crit === true;
        const weak = effect.quality === 'weak';
        this.addBurst(effect, {
          x: target.home.x,
          y: target.home.y - BURST_LIFT.impact,
          colour: big ? 0xfff1c4 : weak ? 0x8f8b79 : colour,
          radius: big ? 54 : weak ? 22 : 36,
          life: big ? 22 : 16,
        });
        return;
      }

      case 'cast':
        // A bloom at the caster's feet: the wind-up, so a skill is visibly *thrown* rather
        // than arriving as a number on somebody else.
        this.addBurst(effect, {
          x: target.home.x,
          y: target.home.y - BURST_LIFT.cast,
          colour,
          radius: 52,
          life: 20,
        });
        return;

      case 'heal':
        this.addBurst(effect, {
          x: target.home.x,
          y: target.home.y - BURST_LIFT.heal,
          colour: 0x57b35c,
          radius: 34,
          life: 22,
        });
        return;

      case 'shield':
        this.addBurst(effect, {
          x: target.home.x,
          y: target.home.y - BURST_LIFT.shield,
          colour: 0x3f8fd4,
          radius: 38,
          life: 22,
        });
        return;

      case 'resist': {
        // A sidestep away from whoever threw it — the one defensive move the engine's
        // events can honestly describe, since an attack in this game never misses.
        const from = effect.toward ? this.units.get(this.key(effect.toward)) : undefined;
        const away = from ? Math.sign(target.home.x - from.home.x) || 1 : 1;
        target.lunge = { life: 14, total: 14, dx: away * 14, dy: 0 };
        this.addBurst(effect, {
          x: target.home.x,
          y: target.home.y - BURST_LIFT.resist,
          colour: 0xc9a227,
          radius: 26,
          life: 16,
        });
        return;
      }

      case 'death':
        this.addBurst(effect, {
          x: target.home.x,
          y: target.home.y - BURST_LIFT.death,
          colour: 0x8f2f2f,
          radius: 46,
          life: 26,
        });
        return;

      default:
        return;
    }
  }

  private addBurst(
    effect: Effect,
    spec: { x: number; y: number; colour: number; radius: number; life: number },
  ): void {
    const gfx = new Graphics();
    this.effectLayer.addChild(gfx);
    this.bursts.set(effect.id, {
      gfx,
      life: spec.life,
      total: spec.life,
      x: spec.x,
      y: spec.y,
      colour: spec.colour,
      radius: spec.radius,
      kind: effect.kind,
    });
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
      // Position is the sum of two things: where a lunge has carried the body, and the
      // jitter of a hit landing on it. Composed rather than exclusive — a unit that is
      // struck mid-swing should shake where it stands, not snap home to do it.
      let x = visual.home.x;
      let y = visual.home.y;

      if (visual.lunge) {
        visual.lunge.life -= delta;
        if (visual.lunge.life <= 0) {
          visual.lunge = null;
        } else {
          // Out fast, back slow: `sin(pi * t)` peaks in the middle, which is a swing.
          const progress = 1 - visual.lunge.life / visual.lunge.total;
          const eased = Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));
          x += visual.lunge.dx * eased;
          y += visual.lunge.dy * eased;
        }
      }

      if (visual.shake > 0) {
        visual.shake -= delta;
        const magnitude = Math.max(0, visual.shake) * 0.35;
        x += (Math.random() - 0.5) * magnitude * 2;
        y += (Math.random() - 0.5) * magnitude;
      }

      visual.container.position.set(x, y);

      // The flash rides on the sprite's tint, so it survives whatever the body is.
      if (visual.flash && visual.sprite) {
        visual.flash.life -= delta;
        if (visual.flash.life <= 0) {
          visual.flash = null;
          visual.sprite.tint = visual.alive ? visual.baseTint : 0x4a443c;
        } else {
          // Capped short of the whole way: a body mixed *fully* into the flash colour is a
          // white silhouette rather than a champion being hit, and at ×1 that silhouette is
          // on screen long enough to read as the art having failed to load.
          const strength = (visual.flash.life / visual.flash.total) * 0.7;
          visual.sprite.tint = mixTint(
            visual.alive ? visual.baseTint : 0x4a443c,
            visual.flash.colour,
            strength,
          );
        }
      }

      // A death is a slump: the body leans and sinks over about half a second rather than
      // switching to its dimmed state between one frame and the next.
      if (visual.fall > 0 && visual.fall < FALL_FRAMES) {
        visual.fall += delta;
        const progress = Math.min(1, visual.fall / FALL_FRAMES);
        visual.container.rotation = progress * 0.35 * (visual.mirrored ? -1 : 1);
        visual.container.position.set(x, y + progress * 8);
      }
    }

    for (const [id, burst] of this.bursts) {
      burst.life -= delta;
      if (burst.life <= 0) {
        this.effectLayer.removeChild(burst.gfx);
        burst.gfx.destroy();
        this.bursts.delete(id);
        continue;
      }
      drawBurst(burst);
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
