/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

import {robustSoliton} from './distributions.js';

export class RandomDegree {
  constructor({N, failureProbability} = {}) {
    if(!(Number.isInteger(N) && N > 0)) {
      throw new Error('"N" must be an integer > 0.');
    }
    const weights = robustSoliton({N, delta: failureProbability});
    this.totalWeight = 0;
    this.cumulativeWeights = [0];
    for(let i = 1; i <= N; ++i) {
      const weight = weights[i];
      this.totalWeight += weight;
      this.cumulativeWeights[i] = this.cumulativeWeights[i - 1] + weight;
    }
  }

  next() {
    const {cumulativeWeights, totalWeight} = this;
    const x = Math.random() * totalWeight;
    let i = 0;
    for(; i < cumulativeWeights.length - 1; ++i) {
      if(x < cumulativeWeights[i]) {
        return i;
      }
    }
    return i;
  }
}
