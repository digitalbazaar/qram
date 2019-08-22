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
  _clearProgress();
  _hide('video');
});

const state = {
  decoder: null,
  enableCamera: false,
  runEncoder: false,
  size: 1024 * 4,
};

async function toggleCamera() {
  const video = document.getElementById('video');

  if(state.enableCamera) {
    console.log('Camera turned off');
    state.enableCamera = false;
    video.srcObject = null;
    return;
  }

  if(state.runEncoder) {
    // turn off presentation
    present();
  }

  console.log('Camera turned on');
  _hide('canvas');
  _show('video');

  const constraints = {
    video: {
      width: {min: 500},
      height: {min: 500},
      facingMode: 'environment'
    }
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
    console.log('Presentation stopped');
    state.runEncoder = false;
    return;
  }

  // turn off camera
  if(state.enableCamera) {
    toggleCamera();
  }

  _hide('video');
  _show('canvas');

  const fps = parseInt(document.getElementById('fps').value, 10) || 30;
  const blockSize = parseInt(document.getElementById('size').value, 10) || 300;

  console.log(
    `Presenting @ ${fps} frames/second, block size is ${blockSize} bytes...`);

  state.runEncoder = true;

  // generate fake data for presentation
  const data = new Uint8Array(state.size);
  crypto.getRandomValues(data);

  const encoder = new Encoder({data, blockSize});
  const timer = encoder.createTimer({fps});
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
    console.log('Receive canceled');
    state.decoder.cancel();
    state.decoder = null;
    return;
  }

  _clearProgress();

  let source;
  if(state.enableCamera) {
    console.log('Decoding from camera...');
    // get a video element to read images of qr-codes from
    source = document.getElementById('video');
  } else if(state.runEndoder) {
    console.log('Decoding from canvas directly...');
    // get canvas element to read images of qr-codes from
    source = document.getElementById('canvas');
  } else {
    console.error('Receive aborted, not using camera or presenting locally.');
    return;
  }

  console.log('Receiving...');
  const decoder = state.decoder = new Decoder();

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
        _updateProgress({progress, data});
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
    _finish({data, time, size});
  } catch(e) {
    // failure to decode
    console.error(e);
  }

  state.runEncoder = false;
  state.decoder = null;
}

function _updateProgress({progress, data}) {
  console.log('progress', progress);
  const {
    receivedPackets: packetCount,
    receivedBlocks: blocks,
    totalBlocks
  } = progress;
  console.log(
    `received packet ${packetCount}, ${data.length} bytes`);
  console.log(`decoded ${blocks}/${totalBlocks} blocks`);
  const packetsElement = document.getElementById('packets');
  packetsElement.innerHTML =
    `Received packet ${packetCount}, ${data.length} bytes`;
  const blocksElement = document.getElementById('blocks');
  blocksElement.innerHTML = `Decoded ${blocks}/${totalBlocks} blocks`;
}

function _finish({data, time, size}) {
  const msg = `Decoded ${size} KiB in time ${time} seconds`;
  console.log(msg);
  const element = document.getElementById('finish');
  element.innerHTML = `Decoded ${size} KiB in time ${time} seconds`;
}

function _clearProgress() {
  const packets = document.getElementById('packets');
  packets.innerHTML = 'No packets received yet';
  const blocks = document.getElementById('blocks');
  blocks.innerHTML = 'No blocks decoded yet';
  const finish = document.getElementById('finish');
  finish.innerHTML = '';
}

function _on(id, event, listener) {
  const element = document.getElementById(id);
  element.addEventListener(event, listener);
}

function _show(id) {
  document.getElementById(id).style.display = 'block';
}

function _hide(id) {
  document.getElementById(id).style.display = 'none';
}
