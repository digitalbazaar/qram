/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {Packet} from './Packet.js';

export class Decoder {
  constructor() {}

  async decode() {
    this.decoding = true;
    this.progress = this.data = null;
    this.packets = new Map();
    this.blocks = new Map();
    return new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  async enqueue(data) {
    if(!this.decoding) {
      // not decoding; abort
      const error = new Error('Decoding not started or canceled.');
      error.name = 'AbortError';
      throw error;
    }

    const {blocks} = this;
    const packet = await Packet.parse({data});
    const {header} = packet;
    if(this.progress) {
      // check to see if packet matches current decoding data
      this._validatePacket(packet);
    } else {
      // start new decoding
      const {totalSize, blockSize} = header;
      this.blockCount = Math.ceil(totalSize / blockSize);
      this.progress = {
        totalSize, blockSize, totalBlocks: this.blockCount,
        receivedBlocks: 0, receivedPackets: 0,
        done: false
      };
      this.data = new Uint8Array(this.blockCount * blockSize);
    }

    const {progress} = this;
    progress.receivedPackets++;

    // handle case where packet has a single block
    if(header.indexes.length === 1) {
      const [index] = header.indexes;
      if(blocks.has(index)) {
        // nothing new, return current progress
        return progress;
      }
      // new block!
      const block = this._addBlock({index, block: packet.payload});
      blocks.set(index, block);

      // reduce packets to blocks
      const newBlockIndexes = [index];
      this._reduce({newBlockIndexes});
      return progress;
    }

    // record packet
    let recorded = false;
    header.indexes.forEach(i => {
      if(blocks.has(i)) {
        return progress;
      }
      recorded = true;
      const packetSet = this.packets.get(i);
      if(packetSet) {
        packetSet.add(packet);
      } else {
        this.packets.set(i, new Set([packet]));
      }
    });

    if(recorded) {
      // go through packet and subtract out existing blocks
      const newBlockIndexes = [];
      this._reduceOne({packet, newBlockIndexes});

      // reduce packets to blocks
      this._reduce({newBlockIndexes});
    }

    return progress;
  }

  cancel() {
    this.decoding = false;
    if(this._reject) {
      const error = new Error('Decoding canceled.');
      error.name = 'AbortError';
      this._reject(error);
    }
    this._resolve = this._reject = null;
    this.data = this.progress = null;
    this.blocks = this.packets = null;
  }

  _validatePacket(packet) {
    const {header} = packet;
    const {totalSize, blockSize} = this.progress;
    if(!(totalSize === header.totalSize && blockSize === header.blockSize)) {
      throw new Error('Packet does not match the currently decoding data.');
    }
  }

  _reduce({newBlockIndexes}) {
    // subtract any new blocks from any other packets
    const {blocks, blockCount, packets} = this;
    while(newBlockIndexes.length > 0) {
      const tmp = newBlockIndexes;
      newBlockIndexes = [];
      while(tmp.length > 0) {
        if(blocks.size === blockCount) {
          // done!
          return this._finish();
        }
        // remove new block from every adjacent packet
        const packetSet = packets.get(tmp.shift());
        if(packetSet) {
          for(const packet of packetSet) {
            this._reduceOne({packet, newBlockIndexes});
          }
        }
      }
    }
  }

  _reduceOne({packet, newBlockIndexes}) {
    const {blocks, packets} = this;
    const {header} = packet;
    header.indexes.forEach(index => {
      const block = blocks.get(index);
      if(!block) {
        return;
      }
      const result = packet.subtract({index, block});
      const packetSet = packets.get(index);
      if(packetSet) {
        packetSet.delete(packet);
      }
      if(result && !blocks.has(result.index)) {
        // got a new block!
        this._addBlock(result);
        newBlockIndexes.push(result.index);
      }
    });
  }

  _addBlock({index, block}) {
    const {blocks, progress, data} = this;
    const {blockSize} = progress;
    const offset = index * blockSize;
    data.set(block, offset);
    block = new Uint8Array(data.buffer, data.byteOffset + offset, blockSize);
    blocks.set(index, block);
    progress.receivedBlocks++;
    return block;
  }

  _finish() {
    const {progress, data} = this;
    const {totalSize} = progress;
    progress.done = true;
    const result = new Uint8Array(data.buffer, data.byteOffset, totalSize);
    // clear `_reject` to prevent throwing an AbortError in `cancel`
    this._reject = null;
    const {_resolve: resolve} = this;
    // reuse `cancel` to clear state
    this.cancel();
    resolve({...progress, data: result});
    return progress;
  }
}
