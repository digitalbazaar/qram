/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

export class Timer {
  constructor({fps = 60} = {}) {
    if(!(Number.isInteger(fps) && fps > 0)) {
      throw new TypeError('"fps" must be an integer > 0.');
    }
    this.fps = fps;
    this.timePerFrame = 1000 / this.fps;
    if(typeof requestAnimationFrame === 'function') {
      this._schedule = fn => requestAnimationFrame(fn);
    } else {
      this._schedule = (fn, wait = 0) => setTimeout(fn, wait);
    }
  }

  start() {
    this._update(Date.now());
  }

  async nextFrame() {
    const now = Date.now();
    if(now >= this.nextFrameTime) {
      this._update(now);
      return;
    }
    return this._waitUntil(this.nextFrameTime);
  }

  async _waitUntil(targetTime) {
    return new Promise(resolve => {
      this._schedule(() => this._resolveOrSchedule(resolve, targetTime));
    });
  }

  _update(now) {
    this.nextFrameTime = now + this.timePerFrame;
  }

  _resolveOrSchedule(resolve, targetTime) {
    const now = Date.now();
    if(now >= targetTime) {
      this._update(now);
      resolve();
    } else {
      const wait = targetTime - now;
      this._schedule(() => this._resolveOrSchedule(resolve, targetTime), wait);
    }
  }
}
