// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
import { FuiComponent, type BaseOptions } from '../core/component.ts';
import { h } from '../core/dom.ts';

export interface BattleControlsOptions extends BaseOptions {
  /** Start with auto-battle engaged. */
  auto?: boolean;
  /** Selectable speed multipliers. */
  speeds?: number[];
  /** Which multiplier is active initially. */
  speed?: number;
  /** Show the pause / resume button. */
  pausable?: boolean;
  /** Show the surrender / retreat button. */
  retreatable?: boolean;
  /** Locks the higher speeds behind a paywall or progression gate. */
  lockedSpeeds?: number[];
}

/**
 * The battle chrome every auto-RPG shares: auto-play toggle, a speed
 * multiplier cycle, pause and retreat.
 *
 * Emits `battle:auto`, `battle:speed`, `battle:pause` and `battle:retreat`.
 *
 *   const controls = new BattleControls({ speeds: [1, 2, 3], lockedSpeeds: [3] });
 *   controls.on<{ speed: number }>('battle:speed', ({ speed }) => engine.setSpeed(speed));
 */
export class BattleControls extends FuiComponent<BattleControlsOptions> {
  private autoBtn: HTMLButtonElement;
  private speedBtn: HTMLButtonElement;
  private speeds: number[];
  private speedIndex: number;
  private auto: boolean;
  private paused = false;

  constructor(opts: BattleControlsOptions = {}) {
    const root = h('div', { class: 'fui fui-battlectl' });
    super(root, opts);

    this.speeds = opts.speeds ?? [1, 2, 3];
    this.speedIndex = Math.max(0, this.speeds.indexOf(opts.speed ?? this.speeds[0]));
    this.auto = !!opts.auto;

    this.autoBtn = h('button', {
      class: 'fui-battlectl__btn fui-battlectl__auto',
      attrs: { type: 'button', 'aria-pressed': String(this.auto) },
    });
    this.autoBtn.appendChild(h('span', { class: 'fui-battlectl__glyph', attrs: { 'aria-hidden': 'true' } }));
    this.autoBtn.appendChild(h('span', { class: 'fui-battlectl__label', text: 'Auto' }));
    this.autoBtn.addEventListener('click', () => this.setAuto(!this.auto));
    root.appendChild(this.autoBtn);

    this.speedBtn = h('button', {
      class: 'fui-battlectl__btn fui-battlectl__speed',
      attrs: { type: 'button', 'aria-label': 'Battle speed' },
    });
    this.speedBtn.addEventListener('click', () => this.cycleSpeed());
    root.appendChild(this.speedBtn);

    if (opts.pausable !== false) {
      const pause = h('button', {
        class: 'fui-battlectl__btn fui-battlectl__pause',
        attrs: { type: 'button', 'aria-label': 'Pause' },
        text: '❚❚',
      });
      pause.addEventListener('click', () => {
        this.paused = !this.paused;
        pause.textContent = this.paused ? '▶' : '❚❚';
        pause.classList.toggle('is-on', this.paused);
        this.emit('battle:pause', this.paused);
      });
      root.appendChild(pause);
    }

    if (opts.retreatable) {
      const retreat = h('button', {
        class: 'fui-battlectl__btn fui-battlectl__retreat',
        attrs: { type: 'button' },
        text: 'Retreat',
      });
      retreat.addEventListener('click', () => this.emit('battle:retreat'));
      root.appendChild(retreat);
    }

    this.paintSpeed();
  }

  get isAuto(): boolean {
    return this.auto;
  }

  get currentSpeed(): number {
    return this.speeds[this.speedIndex];
  }

  setAuto(auto: boolean): this {
    this.auto = auto;
    this.autoBtn.classList.toggle('is-on', auto);
    this.autoBtn.setAttribute('aria-pressed', String(auto));
    this.emit('battle:auto', auto);
    return this;
  }

  /** Advance to the next unlocked multiplier, wrapping around. */
  cycleSpeed(): this {
    const locked = this.opts.lockedSpeeds ?? [];
    for (let step = 1; step <= this.speeds.length; step++) {
      const next = (this.speedIndex + step) % this.speeds.length;
      if (!locked.includes(this.speeds[next])) {
        this.speedIndex = next;
        this.paintSpeed();
        this.emit('battle:speed', { speed: this.currentSpeed });
        return this;
      }
    }
    return this;
  }

  private paintSpeed(): void {
    this.speedBtn.textContent = `×${this.currentSpeed}`;
    this.speedBtn.classList.toggle('is-on', this.currentSpeed > 1);
  }
}
