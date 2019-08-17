/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import crypto from './crypto.js';

const VERSION = 0x01;
const MIN_PACKET_SIZE = 52; // (1 + 4 + 4 + 4 + 34 + 4 + 1)
const MH_SHA_256 = 0x12;
const SHA_256_LENGTH = 32;

export class Packet {
  constructor({header, payload, data} = {}) {
    this.header = header;
    this.payload = payload;
    this.data = data;
  }

  subtract({index, block}) {
    const {header, payload} = this;
    const idx = header.indexes.indexOf(index);
    if(idx === -1) {
      throw new Error(`Index "${index}" is not in this packet.`);
    }
    if(block.length !== header.blockSize) {
      throw new Error(
        `Block length (${block.length}) must match the length of the ` +
        `block size specified in the packet header (${header.blockSize}).`);
    }

    // subtract block
    header.indexes.splice(idx, 1);
    for(let i = 0; i < payload.length; ++i) {
      payload[i] ^= block[i];
    }

    // if a single block remains, return it
    if(header.indexes.length === 1) {
      return {index: header.indexes[0], block: payload};
    }
  }

  static async create({
    totalSize, blocks, indexes, blockSize, digestAlgorithm = {name: 'SHA-256'}
  }) {
    if(digestAlgorithm.name !== 'SHA-256') {
      throw Error(`Unsupported digest algorithm "${digestAlgorithm.name}".`);
    }

    // determine total packet size
    const digestSize = SHA_256_LENGTH;
    const headerSize =
      1 + // 1 byte version 0x01
      4 + // header size
      4 + // total size of the data
      4 + // uint32 # of blocks in the packet
      indexes.length * 4 + // uint32 for each block index, in order
      (2 + digestSize) + // multihash-encoded digest
      4; // uint32 of blockSize
    const packetSize = headerSize + blockSize;

    const data = new Uint8Array(packetSize);

    // create packet payload
    const payload = new Uint8Array(
      data.buffer, data.byteOffset + headerSize, blockSize);

    // xor blocks together to form packet payload
    for(let i = 0; i < blocks.length; ++i) {
      const block = blocks[i];
      for(let j = 0; j < blockSize; ++j) {
        payload[j] ^= block[j];
      }
    }

    // TODO: move to _encodeHeader()
    // create packet header
    const header = {
      version: VERSION,
      size: headerSize,
      totalSize,
      blockCount: blocks.length,
      indexes,
      digest: await Packet._digest(payload),
      blockSize
    };
    const hData = new Uint8Array(data.buffer, data.byteOffset, headerSize);
    const dv = new DataView(hData.buffer, hData.byteOffset, hData.length);
    let offset = 0;
    hData[offset] = header.version;
    dv.setUint32(offset += 1, header.size);
    dv.setUint32(offset += 4, header.totalSize);
    dv.setUint32(offset += 4, header.blockCount);
    header.indexes.forEach(i => dv.setUint32(offset += 4, i));
    hData.set(header.digest, offset += 4);
    dv.setUint32(offset += header.digest.length, blockSize);

    return new Packet({header, payload, data});
  }

  static async parse({data}) {
    if(!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) {
      throw new TypeError('"data" must be a Uint8Array or Uint8ClampedArray.');
    }
    if(data.length < MIN_PACKET_SIZE) {
      throw new Error(
        `Invalid packet size (${data.length}); packet must be at least ` +
        `${MIN_PACKET_SIZE} bytes.`);
    }

    // TODO: move to _parseHeader()
    // parse header
    let offset = 0;
    if(data[offset] !== VERSION) {
      // invalid version
      throw new Error('Invalid version.');
    }

    const header = {version: VERSION};
    const dv = new DataView(data.buffer, data.byteOffet, data.length);
    header.size = dv.getUint32(offset += 1);
    header.totalSize = dv.getUint32(offset += 4);
    header.blockCount = dv.getUint32(offset += 4);
    header.indexes = new Array(header.blockCount);
    for(let i = 0; i < header.blockCount; ++i) {
      header.indexes[i] = dv.getUint32(offset += 4);
    }
    const mh1 = dv.getUint8(offset += 4);
    const mh2 = dv.getUint8(offset += 1);
    if(!(mh1 === MH_SHA_256 && mh2 === SHA_256_LENGTH)) {
      throw Error(`Unsupported multihash codec "${mh1}".`);
    }
    header.digest = new Uint8Array(
      data.buffer, data.byteOffset + offset - 1, 2 + SHA_256_LENGTH);
    header.blockSize = dv.getUint32(offset += (1 + SHA_256_LENGTH));
    offset += 4;
    const headerSize = offset;

    // verify payload size
    if(header.blockSize !== (data.length - offset)) {
      throw new Error(
        `Block size (${header.blockSize}) does not match packet payload ` +
        `size (${data.length - offset}).`);
    }
    const payload = new Uint8Array(
      data.buffer, data.byteOffset + offset, header.blockSize);
    const packetSize = headerSize + payload.length;
    if(data.length !== packetSize) {
      throw new Error(`Invalid packet size; expected ${packetSize}.`);
    }

    // verify payload digest
    const digest = await Packet._digest(payload);
    // Note: constant time comparison not considered a requirement
    for(let i = 0; i < digest.length; ++i) {
      if(digest[i] !== header.digest[i]) {
        throw new Error('Packet checksum does not match.');
      }
    }

    return new Packet({header, payload, data});
  }

  static async _digest(data) {
    const digest = new Uint8Array(
      await crypto.subtle.digest({name: 'SHA-256'}, data));
    // format as multihash digest
    // sha2-256: 0x12, length: 32 (0x20), digest value
    const mh = new Uint8Array(2 + digest.length);
    mh[0] = MH_SHA_256;
    mh[1] = digest.length;
    mh.set(digest, 2);
    return mh;
  }
}
