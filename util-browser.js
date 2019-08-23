/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
/* eslint-env browser */
'use strict';

let ReadableStream = self.ReadableStream;
import {ReadableStream as Readable} from 'web-streams-polyfill/ponyfill';
if(!ReadableStream) {
  ReadableStream = Readable;
}
export {ReadableStream};
