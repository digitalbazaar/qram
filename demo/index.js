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
  _hide('progress');
  _show('video');
  _show('progress');

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
  _hide('progress');
  _show('canvas');
  _show('presenting');

  let fps = document.getElementById('fps').value;
  const blockSize = parseInt(document.getElementById('size').value, 10) || 400;
  const resistance = document.getElementById('resistance').value;

  if(fps !== 'auto') {
    fps = parseInt(fps, 10) || 30;
  } else {
    // rough decent estimate: do `blockCount` frames per second
    fps = Math.min(30, Math.ceil(state.size / blockSize));
  }

  const presentMsg =
    `Presenting @ ${fps} frames/second, block size is ${blockSize} bytes...`;
  document.getElementById('presenting').innerHTML = presentMsg;
  console.log(presentMsg);

  state.runEncoder = true;

  // generate fake data for presentation
  const data = new Uint8Array(state.size);
  crypto.getRandomValues(data);

  let version;
  const maxBlocksPerPacket = 50;
  // const maxPacketSize = Encoder.getMaxPacketSize({
  //   size: data.length,
  //   blockSize,
  //   maxBlocksPerPacket
  // });
  // console.log('maxPacketSize', maxPacketSize);

  if(blockSize <= 10) {
    if(resistance === 'H') {
      version = 16;
    } else {
      version = 14;
    }
  } else if(blockSize <= 50) {
    if(resistance === 'H') {
      version = 18;
    } else {
      version = 16;
    }
  } else if(blockSize <= 100) {
    if(resistance === 'H') {
      version = 19;
    } else {
      version = 17;
    }
  } else if(blockSize <= 200) {
    if(resistance === 'H') {
      version = 22;
    } else {
      version = 19;
    }
  } else if(blockSize <= 300) {
    if(resistance === 'H') {
      version = 25;
    } else {
      version = 22;
    }
  } else if(blockSize <= 400) {
    if(resistance === 'H') {
      version = 29;
    } else {
      version = 25;
    }
  }

  const encoder = new Encoder({data, blockSize, maxBlocksPerPacket});
  const timer = encoder.createTimer({fps});
  const canvas = document.getElementById('canvas');
  const stream = await encoder.createReadableStream();
  const reader = stream.getReader();
  timer.start();
  while(state.runEncoder) {
    const {value: packet} = await reader.read();
    const text = base64url.encode(packet.data);
    await QRCode.toCanvas(canvas, text, {
      version,
      mode: 'alphanumeric',
      errorCorrectionLevel: resistance
    });
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
  _hide('presenting');
  _show('progress');

  let source;
  if(state.enableCamera) {
    console.log('Decoding from camera...');
    // get a video element to read images of qr-codes from
    source = document.getElementById('video');
  } else if(state.runEncoder) {
    console.log('Decoding from canvas directly...');
    // get canvas element to read images of qr-codes from
    source = document.getElementById('canvas');
  } else {
    console.error('Receive aborted, not using camera or presenting locally.');
    return;
  }

  console.log('Scanning...');
  const decoder = state.decoder = new Decoder();

  // use `requestAnimationFrame` so that scanning will not happen unless the
  // user has focused the window/tab displaying the qr-code stream
  requestAnimationFrame(() => setTimeout(enqueue, 0));

  function enqueue() {
    // use qram helper to get image data
    const imageData = getImageData({source});

    // use qr-code reader of choice to get Uint8Array or Uint8ClampedArray
    // representing the packet
    const result = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });
    if(!result) {
      // no QR code found, try again on the next frame
      return requestAnimationFrame(() => setTimeout(enqueue, 0));
    }

    // enqueue the packet data for decoding, ignoring any non-cancel errors
    // and rescheduling until done or aborted
    const {data: text} = result;
    const data = base64url.decode(text);
    console.log(`Scanned ${data.length} bytes, parsing...`);
    decoder.enqueue(data)
      .then(progress => {
        if(!progress.done) {
          _updateProgress({progress});
          setTimeout(enqueue, 0);
        }
      })
      .catch(e => {
        if(e.name === 'AbortError') {
          return;
        }
        console.error(e);
        setTimeout(enqueue, 0);
      });
  }

  try {
    // result found
    const start = Date.now();
    const progress = await decoder.decode();
    _updateProgress({progress});
    const time = ((Date.now() - start) / 1000).toFixed(3);
    const {data} = progress;
    // console.log('decoded data', data);
    _finish({data, time});
  } catch(e) {
    // failure to decode
    console.error(e);
  }

  state.runEncoder = false;
  state.decoder = null;
}

function _updateProgress({progress}) {
  console.log('Progress', progress);
  const {
    blocks,
    receivedPackets,
    receivedBlocks,
    totalBlocks
  } = progress;
  console.log(`Decoded ${receivedBlocks}/${totalBlocks} blocks`);
  const packetsElement = document.getElementById('packets');
  packetsElement.innerHTML = `Received ${receivedPackets} packets`;
  const blocksElement = document.getElementById('blocks');
  blocksElement.innerHTML = `Decoded ${receivedBlocks}/${totalBlocks} blocks`;
  const blocksMapElement = document.getElementById('blocksmap');
  let blocksMapHTML = '';
  // block width without margin rounded down
  const blockWidth =
    Math.floor((500 - ((totalBlocks - 1) * 1/*px*/)) / totalBlocks);
  for(let i = 0; i < totalBlocks; ++i) {
    const cl = blocks.has(i) ? 'found' : 'missing';
    blocksMapHTML +=
      `<span class="${cl}" style="width: ${blockWidth}px">&nbsp;</span>\n`;
  }
  blocksMapElement.innerHTML = blocksMapHTML;
}

function _finish({data, time}) {
  const size = (data.length / 1024).toFixed(3);
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
