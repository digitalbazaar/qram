const {Decoder, Encoder} = require('./index.js');
//const crypto = require('isomorphic-webcrypto');

(async () => {
  //const size = 1024 * 100;
  //const size = 1024 * 1024 * 10;
  const size = 1024 * 4;
  const data = new Uint8Array(size);
  //const data = new Uint8Array([1, 2, 3]);
  //crypto.getRandomValues(data);

  const encoder = new Encoder({data, blockSize: 1024});
  const timer = encoder.createTimer({fps: 30});

  let packetCount = 0;
  const decoder = new Decoder();
  let stop = false;
  decoder.decode().then(value => {
    //console.log('decoded, yay!', value);
    stop = true;
    console.log('total packets', packetCount);
  }).catch(e => console.error(e));

  const stream = await encoder.createReadableStream();
  const reader = stream.getReader();
  timer.start();
  while(!stop) {
    packetCount++;
    //console.log('packet', packetCount);
    const {value: packet} = await reader.read();
    //console.log('packet', packet.header);
    try {
      stop = await decoder.enqueue(packet.data);
    } catch(e) {
      e => console.error(e);
    }
    //console.log('awaiting timer...');
    //await timer.nextFrame();
    //console.log('timer done');
  }
})();

/*
const {RandomDegree} = require('./index.js');

const N = 10;

const random = new RandomDegree(N);

const results = new Array(N + 1);
for(let i = 0; i < results.length; ++i) {
  results[i] = 0;
}

const total = 10000000;
for(let i = 0; i < total; ++i) {
  results[random.next()]++;
}

for(let i = 0; i < results.length; ++i) {
  results[i] /= total;
}

console.log('results', results);
*/
