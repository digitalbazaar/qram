/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

export {RandomDegree} from './RandomDegree.js';
export {Decoder} from './Decoder.js';
export {Encoder} from './Encoder.js';

export function getImageData({source, canvas = null}) {
  if(!canvas && typeof document === 'undefined') {
    throw new Error('A "canvas" must be given if "document" is not defined.');
  }
  canvas = canvas || document.createElement('canvas');
  const width = source.width || source.videoWidth;
  const height = source.height || source.videoHeight;
  if(canvas.width !== width) {
    canvas.width = width;
  }
  if(canvas.height !== height) {
    canvas.height = height;
  }
  const context = canvas.getContext('2d', {alpha: false});
  // need crisp images for QR codes
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}
