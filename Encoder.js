/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {Packet} from './Packet.js';
import {RandomDegree} from './RandomDegree.js';
import {ReadableStream} from './util.js';
import {Timer} from './Timer.js';

export class Encoder {
  constructor({data, blockSize, failureProbability} = {}) {
    if(!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) {
      throw new TypeError('"data" must be a Uint8Array or Uint8ClampedArray.');
    }
    this.data = data;
    this.blockSize = blockSize;
    this.stream = null;
    this.blockCount = Math.ceil(this.data.length / blockSize);
    this.blocks = new Array(this.blockCount);
    this.random = new RandomDegree({N: this.blockCount, failureProbability});
  }

  createTimer({fps} = {}) {
    return new Timer({fps});
  }

  async createReadableStream() {
    const encoder = this;
    return new ReadableStream({
      async pull(controller) {
        // produce a packet and queue it for reading
        controller.enqueue(await encoder._nextPacket());
      }
    });
  }

  async _nextPacket() {
    const {blockCount, blockSize} = this;
    const degree = this.random.next();
    const indexes = [];
    for(let i = 0; i < degree; ++i) {
      let x;
      do {
        x = Math.floor(Math.random() * blockCount);
      } while(indexes.includes(x));
      indexes.push(x);
    }
    indexes.sort();

    const blocks = await Promise.all(
      indexes.map(async i => this._createBlock(i)));
    return Packet.create({
      totalSize: this.data.length, blocks, indexes, blockSize
    });
  }

  async _createBlock(index) {
    const {blocks, blockSize, data} = this;

    let block = blocks[index];
    if(block) {
      return block;
    }

    // determine unpadded size of block
    const start = index * blockSize;
    if((data.length - start) < blockSize) {
      // special case... copy last block that needs padding
      block = new Uint8Array(blockSize);
      const last = new Uint8Array(
        data.buffer, data.byteOffset + start, data.length - start);
      block.set(last);
    } else {
      // no copy necessary, just a view into the block
      block = new Uint8Array(data.buffer, data.byteOffset + start, blockSize);
    }

    return blocks[index] = block;
  }
}
