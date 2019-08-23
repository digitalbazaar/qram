/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {default as crypto} from 'isomorphic-webcrypto';
export default crypto;

export const MH_SHA_256 = 0x12;

export async function sha256(data) {
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
