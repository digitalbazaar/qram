# qram
Cram arbitrarily large data into, e.g., multiple streaming QR-codes

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Contribute](#contribute)
- [Commercial Support](#commercial-support)
- [License](#license)

## Background

The primary purpose of this library is to allow arbitrarily large data to
be transmitted using QR codes. It uses [LT Codes][] to pack blocks of data
into packets for efficient delivery via a lossy medium (such as QR codes). The
means of delivery is decoupled from this library so that the data can be
transmitted using any means the programmer is capable to employ. However,
from here forward the examples and documentation focus on delivering the
data via QR codes.

QR-codes can be used to represent relatively small data (e.g., ~7k chars
or ~3k binary data). This library enables arbitrarily large data to be
transferred from one device to another using QR-codes. The term "arbitrarily"
is used loosely here as there will always be various other physical limitations
(e.g., RAM, time, etc.). Extremely large data can be broken into chunks before
being passed to this library, but, not only will transfer time will always be
a limiting factor, constructing a viable transfer system where there is little
to no feedback from the decoder would be challenging.

This README demonstrates how to setup an encoder and decoder for a stream of
QR-codes that can be displayed as a video to a QR-code scanner. The QR-codes
will be efficiently repeated until all of the data has been successfully read
by the scanner.

This project reuses some of the ideas from a similar project written
in Go, [TXQR][].

## Install

- Node.js 8.6+ required.

To install locally (for usage):

```
npm install qram
```

To install locally (for development):

```
git clone https://github.com/digitalbazaar/qram.git
cd qram
npm install
```

## Usage

### Transmitting data

```js
import {Encoder} from 'qram';
// user selected qr-code generator
import QRCode from 'qrcode';

// some data to encode (arbitrarily large)
const data = new Uint8Array([1, 2, 3]);

// create encoder that will produce packets of data for decoder(s)
const encoder = new Encoder({data});

// get a timer for managing frame rate
// TODO: add option to progressively reduce fps after internally calculated
// expected transfer interval
const timer = encoder.createTimer({fps: 30});

// get the stream of packets to efficiently deliver the data to decoder(s)
// stream will indefinitely generate packets to be decoded; stop reading
// from the stream once the decoder has received all of the data
const stream = await encoder.createReadableStream();

// create a function to display the packet as a qr-code
const textDecoder = new TextDecoder();
const canvas = document.querySelector('canvas');
const display = ({packet}) =>
  QRCode.toCanvas(canvas, textDecoder.decode(packet.data));

// keep reading and displaying the packets as qr-code images until the decoder
// has received the data
const reader = stream.getReader();
timer.start();
while(true) {
  // read the next packet
  const {value: packet, done} = await reader.read();
  if(done) {
    break;
  }

  // display the packet as a qr-code for scanning
  await display({packet});

  // manage your frame rate
  // Note: `timer` internally uses `requestAnimationFrame`, if available, to
  // prevent the promise returned from `nextFrame` from resolving until
  // `requestAnimationFrame` runs, preventing changes while the user is
  // not viewing the appropriate window/tab and preventing changes that
  // are faster than the browser itself can render
  await timer.nextFrame();
}

// ... somewhere out-of-band cancel the stream once the decoder has the data
stream.cancel();
```

### Receiving Data

Pick a qr-code reader engine (e.g., [jsQR][]) or use the
[Shape Detection API][]). Wrap your engine of choice in a simple driver API
that takes an image and returns the encoded data as a JavaScript string or
as a Uint8Array.

```js
import {Decoder} from 'qram';
// user selected reader
import jsQR from 'jsqr';

const decoder = new Decoder();

// get a video element to read images of qr-codes from
const video = document.querySelector('video');

// use `requestAnimationFrame` so that scanning will not happen unless the
// user has focused the window/tab displaying the qr-code stream
requestAnimationFrame(() => {
  // use qram helper to get image data
  const imageData = qram.getImageData(video);
  // use qr-code reader of choice to get Uint8Array or Uint8ClampedArray
  // representing the packet
  const {binaryData} = jsQr(imageData.data, imageData.width, imageData.height);
  // enqueue the packet data for decoding, ignoring any errors
  decoder.enqueue(binaryData).catch(() => {});
});

try {
  // result found
  const data = await decoder.decode();
} catch(e) {
  // failure to decode
  console.error(e);
}

// ... somewhere out-of-band you can cancel if desired
decoder.cancel();
```

## Commercial Support

Commercial support for this library is available upon request from
Digital Bazaar: support@digitalbazaar.com

## License

[New BSD License (3-clause)](LICENSE) © Digital Bazaar

[jsQR]: https://github.com/cozmo/jsQR
[Shape Detection API]: https://wicg.github.io/shape-detection-api/
[TXQR]: https://github.com/divan/txqr
[LT Codes]: https://en.wikipedia.org/wiki/Luby_transform_code
