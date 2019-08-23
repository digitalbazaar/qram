/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {Packet} from './Packet.js';
import {sha256} from './hash.js';

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

    const {blocks, packets} = this;
    const packet = await Packet.parse({data});
    const {header} = packet;
    if(this.progress) {
      // check to see if packet matches current decoding data
      this._validatePacket(packet);
    } else {
      // start new decoding
      const {totalSize, blockSize, digest} = header;
      this.blockCount = Math.ceil(totalSize / blockSize);
      this.progress = {
        totalSize, blockSize, digest,
        totalBlocks: this.blockCount,
        receivedBlocks: 0, receivedPackets: 0,
        done: false
      };
      this.data = new Uint8Array(this.blockCount * blockSize);
    }

    const {progress} = this;
    progress.receivedPackets++;

    // Case 1: Packet has a single block...
    if(header.indexes.length === 1) {
      const [index] = header.indexes;
      if(blocks.has(index)) {
        // nothing new, return current progress
        return progress;
      }
      // new block!
      this._addBlock({index, block: packet.payload});

      // reduce any packets to blocks using new decoded block
      await this._reduce({newBlockIndexes: [index]});
      return progress;
    }

    // Case 2: Packet contains no blocks we haven't already decoded...

    // check if the packet contains any new blocks
    const existingBlocks = [];
    for(const index of header.indexes) {
      const block = blocks.get(index);
      if(block) {
        // block already decoded
        existingBlocks.push({index, block});
      }
    }
    if(existingBlocks.length === header.indexes.length) {
      // no new block indexes in the packet, drop it by returning early
      return progress;
    }

    // Case 3: Packet contains one new block that can be decoded...

    // subtract existing blocks from the packet, record any new block found
    for(const {index, block} of existingBlocks) {
      const result = packet.subtractBlock({index, block, data: this.data});
      // new block was decoded, track it, reduce other packets, and
      // return progress
      if(result) {
        this._addBlock(result);
        await this._reduce({newBlockIndexes: [result.index]});
        return progress;
      }
    }

    // Case 4: Packet contains more than one new block...

    // new packet has blocks remaining to be decoded, record it with
    // each of its remaining block indexes for later processing
    for(const index of header.indexes) {
      const packetSet = packets.get(index);
      if(packetSet) {
        packetSet.add(packet);
      } else {
        packets.set(index, new Set([packet]));
      }
    }

    // attempt to reduce packets to blocks using new packet
    await this._reduce({newBlockIndexes: []});

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
    this.data = this.progress = this.digest = null;
    this.blocks = this.packets = null;
  }

  _validatePacket(packet) {
    const {header} = packet;
    const {totalSize, blockSize, digest} = this.progress;
    if(!(totalSize === header.totalSize && blockSize === header.blockSize &&
      _areBuffersEqual(digest, header.digest))) {
      throw new Error('Packet does not match the currently decoding data.');
    }
  }

  async _reduce({newBlockIndexes}) {
    // subtract any new blocks from any other packets
    const {blocks, blockCount, packets, progress} = this;
    do {
      const tmp = newBlockIndexes;
      newBlockIndexes = [];
      while(tmp.length > 0) {
        if(blocks.size === blockCount) {
          // done!
          return this._finish();
        }
        // remove new block from every adjacent packet
        const index = tmp.shift();
        const packetSet = packets.get(index);
        if(packetSet) {
          for(const packet of packetSet) {
            if(packet.header.indexes.length === 1) {
              // packet already reduced to a single block, skip it
              continue;
            }
            this._reduceOne({packet, newBlockIndexes});
          }
          // clear packet set; block has been subtracted from all other packets
          packetSet.clear();
        }
      }

      if(newBlockIndexes.length === 0) {
        // every time packets received reaches `blockCount` threshold, run
        // a scan to see if we can decode a block via intersection, this
        // helps optimize low probability scenarios where enough single
        // blocks have not been received to decode yet
        if(progress.receivedPackets % blockCount === 0) {
          this._reduceByIntersection({newBlockIndexes});
        }
      }
    } while(newBlockIndexes.length > 0);
  }

  _reduceOne({packet, newBlockIndexes}) {
    const {blocks, data, packets} = this;
    const {header} = packet;
    const indexes = header.indexes.slice();
    for(const index of indexes) {
      const block = blocks.get(index);
      if(!block) {
        continue;
      }
      const result = packet.subtractBlock({index, block, data});
      // disassociate packet from subtracted block
      const packetSet = packets.get(index);
      if(packetSet) {
        packetSet.delete(packet);
      }
      // if a new block was produced, track it
      if(result && !blocks.has(result.index)) {
        // got a new block!
        this._addBlock(result);
        newBlockIndexes.push(result.index);
      }
    }
  }

  _reduceByIntersection({newBlockIndexes}) {
    // sort all packets by the number of blocks they encode
    let maxLength = 1;
    const lengthMap = new Map();
    const {blocks, data, packets} = this;
    for(const packetSet of packets.values()) {
      for(const packet of packetSet) {
        const {length} = packet.header.indexes;
        if(length > maxLength) {
          maxLength = length;
        }
        const entry = lengthMap.get(length);
        if(entry) {
          entry.add(packet);
        } else {
          lengthMap.set(length, new Set([packet]));
        }
      }
    }

    // find two packets with a difference of just one block; that block
    // can be decoded
    for(let i = maxLength; i > 1; --i) {
      const largerPacketSet = lengthMap.get(i);
      if(!largerPacketSet) {
        continue;
      }
      const smallerPacketSet = lengthMap.get(i - 1);
      if(!smallerPacketSet) {
        continue;
      }
      for(const larger of largerPacketSet) {
        for(const smaller of smallerPacketSet) {
          const targetIndex = _diffByOne(
            larger.header.indexes, smaller.header.indexes);
          if(targetIndex !== false && !blocks.has(targetIndex)) {
            const result = larger.subtractPacket(
              {packet: smaller, targetIndex, data});
            this._addBlock(result);
            newBlockIndexes.push(targetIndex);
          }
        }
      }
    }
  }

  _addBlock({index, block}) {
    // assumes `block` was already written directly to `data` via
    // a `subtract*` call on a packet
    const {blocks, progress} = this;
    blocks.set(index, block);
    progress.receivedBlocks++;
    return block;
  }

  async _finish() {
    const {progress, data} = this;
    const {totalSize} = progress;
    progress.done = true;

    // get final result and verify digest
    const result = new Uint8Array(data.buffer, data.byteOffset, totalSize);
    const digest = await sha256(result);
    if(!_areBuffersEqual(digest, progress.digest)) {
      const error = new Error('Decoding failed; checksum does not match.');
      error.name = 'AbortError';
      this._reject(error);
      this._reject = null;
      this.cancel();
      throw error;
    }

    // clear `_reject` to prevent throwing an AbortError in `cancel`
    this._reject = null;
    const {_resolve: resolve} = this;
    // reuse `cancel` to clear state
    this.cancel();
    resolve({...progress, data: result});
    return progress;
  }
}

function _diffByOne(larger, smaller) {
  // optimized by assuming `larger` and `smaller` are sorted
  let diff = false;
  for(let i = 0; i < smaller.length; ++i) {
    if(larger[i] !== smaller[i]) {
      if(diff !== false) {
        // more than one difference
        return false;
      }
      diff = larger[i];
    }
  }
  if(diff === false) {
    // last element is the only difference
    return larger[larger.length - 1];
  }
  return diff;
}

function _areBuffersEqual(buf1, buf2) {
  // does not need to be timing safe; does not need to check length as this
  // helper is only called after ensuring lengths match
  for(let i = 0; i < buf1.length; ++i) {
    if(buf1[i] !== buf2[i]) {
      return false;
    }
  }
  return true;
}
