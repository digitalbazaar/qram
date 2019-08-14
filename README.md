# qram
Cram arbitrarily large data into multiple streaming QR-codes

## Table of Contents

- [Background](#background)
- [Install](#install)
- [Usage](#usage)
- [Contribute](#contribute)
- [Commercial Support](#commercial-support)
- [License](#license)

## Background

QR-codes can be used to represent relatively small data (e.g., ~7k chars
or ~3k binary data). This library enables the user to represent arbitrarily
large data using multiple QR-codes. This means that larger data can be
transferred from one device to another using QR-codes.

This library provides a mechanism for reading a stream of QR-codes that can be displayed as a video to a QR-code scanner. The QR-codes will be efficiently
repeated until all of the data has been successfully read by the scanner.

Of course, the larger the data, the longer it will take to transfer.

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

// some data to encode (arbitrarily large)
const data = new Uint8Array([1, 2, 3]);

// Note: Supported formats for the qr-codes include:
// `image`: will return an Image instance for each qr-code
// `url`: will return a data URL for each qr-code
const encoder = new Encoder({data, format: 'image'});

// TODO: consider allowing a different driver for generating the
// individual qr-codes
//const driver = data => (appropriate format)
//encoder.use(driver);

// get a timer for managing frame rate
// TODO: add option to progressively reduce fps after internally calculated
// expected transfer interval
const timer = encoder.getTimer({fps: 30});

// get a video stream that efficiently delivers the data as qr-codes; the
// stream will indefinitely generate qr-codes to be read by a scanner; stop
// reading from the stream once the scanner has received all of the data
const stream = await encoder.getReadableStream();

// keep reading and displaying the images until the scanning device has
// received the data
const reader = stream.getReader();
while(true) {
  // read the next value
  const {value, done} = await reader.read();
  if(done) {
    break;
  }

  // TODO: the value is an image, display it, e.g., draw on a Canvas

  // manage your frame rate
  // Note: `timer` internally uses `requestAnimationFrame`, if available, to
  // prevent the promise returned from `nextFrame` from resolving until
  // `requestAnimationFrame` runs, preventing changes while the user is
  // not viewing the appropriate window/tab and preventing changes that
  // are faster than the browser itself can render
  await timer.nextFrame();
}

// ... somewhere out-of-band cancel the stream once the receiver has the data
stream.cancel();
```

### Receiving Data

Pick a qr-code reader engine (e.g., [jsQR][]) or use the
[Shape Detection API][]). Wrap your engine of choice in a simple driver API
that takes an image and returns the encoded data as a JavaScript string or
as a Uint8Array.

```js
import {Decoder} from 'qram';

const decoder = new Decoder();

// use the selected driver
const driver = image => jsQr.read(image);
decoder.use(driver);

// get a video stream
const video = document.querySelector('video');

// use `requestAnimationFrame` so that scanning will not happen unless the
// user has focused the window/tab displaying the qr-code stream
requestAnimationFrame(() => decoder.enqueue(video));

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
