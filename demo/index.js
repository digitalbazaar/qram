/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

const {
  QRCode,
  'base64url-universal': base64url,
  jsQR,
  qram: {Decoder, Encoder, getImageData}
} = window;

document.addEventListener('DOMContentLoaded', () => {
  _on('present', 'click', present);
  _on('receive', 'click', receive);
  _on('camera', 'click', toggleCamera);
});

const state = {
  decoder: null,
  enableCamera: false,
  runEncoder: false,
  size: 1024 * 4,
};

async function toggleCamera() {
  console.log('toggle camera');
  const video = document.querySelector('video');

  if(state.enableCamera) {
    state.enableCamera = false;
    video.srcObject = null;
    return;
  }

  const constraints = {
    video: {width: {min: 500}, height: {min: 500}}
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = stream;
  } catch(e) {
    console.error('Failed to setup camera', e);
  }

  state.enableCamera = true;
}

async function present() {
  if(state.runEncoder) {
    console.log('presentation stopped');
    state.runEncoder = false;
    return;
  }
  console.log('presenting...');
  state.runEncoder = true;

  // generate fake data for presentation
  const data = new Uint8Array(state.size);
  crypto.getRandomValues(data);

  const encoder = new Encoder({data, blockSize: 600});
  const timer = encoder.createTimer({fps: 30});
  const canvas = document.getElementById('canvas');
  const stream = await encoder.createReadableStream();
  const reader = stream.getReader();
  timer.start();
  while(state.runEncoder) {
    const {value: packet} = await reader.read();
    const text = base64url.encode(packet.data);
    await QRCode.toCanvas(canvas, text);
    await timer.nextFrame();
  }
}

async function receive() {
  if(state.decoder) {
    console.log('receive canceled');
    state.decoder.cancel();
    state.decoder = null;
    return;
  }

  let source;
  if(state.enableCamera) {
    console.log('Decoding from camera...');
    // get a video element to read images of qr-codes from
    source = document.querySelector('video');
  } else {
    console.log('Decoding from canvas directly...');
    // get canvas element to read images of qr-codes from
    source = document.getElementById('canvas');
  }

  console.log('receiving...');
  const decoder = state.decoder = new Decoder();

  //const canvas = document.querySelector('canvas');

  // use `requestAnimationFrame` so that scanning will not happen unless the
  // user has focused the window/tab displaying the qr-code stream
  requestAnimationFrame(function enqueue() {
    // use qram helper to get image data
    const imageData = getImageData({source});

    // use qr-code reader of choice to get Uint8Array or Uint8ClampedArray
    // representing the packet
    const result = jsQR(imageData.data, imageData.width, imageData.height);
    if(!result) {
      // no QR code found, try again on the next frame
      return requestAnimationFrame(enqueue);
    }

    // enqueue the packet data for decoding, ignoring any non-cancel errors
    // and rescheduling until done or aborted
    const {data: text} = result;
    const data = base64url.decode(text);
    decoder.enqueue(data)
      .then(progress => {
        console.log('progress', progress);
        const {
          receivedPackets: packetCount,
          receivedBlocks: blocks,
          totalBlocks
        } = progress;
        console.log(
          `received packet ${packetCount}, ${data.length} bytes`);
        console.log(`decoded ${blocks}/${totalBlocks} blocks`);
        if(!progress.done) {
          requestAnimationFrame(enqueue);
        }
      })
      .catch(e => {
        if(e.name === 'AbortError') {
          return;
        }
        console.error(e);
        requestAnimationFrame(enqueue);
      });
  });

  try {
    // result found
    const start = Date.now();
    const {data} = await decoder.decode();
    // console.log('decoded data', data);
    const time = ((Date.now() - start) / 1000).toFixed(3);
    const size = (state.size / 1024).toFixed(3);
    console.log(`decoded ${size} KiB in time ${time} seconds`);
  } catch(e) {
    // failure to decode
    console.error(e);
  }

  state.runEncoder = false;
  state.decoder = null;
}

function _on(id, event, listener) {
  const element = document.getElementById(id);
  element.addEventListener(event, listener);
}
