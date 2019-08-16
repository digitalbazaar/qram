/*!
 * Copyright (c) 2019 Digital Bazaar, Inc. All rights reserved.
 */
'use strict';

// Note:
// See: https://en.wikipedia.org/wiki/Luby_transform_code
// See: https://en.wikipedia.org/wiki/Soliton_distribution

const DEFAULT_FAILURE_PROBABILITY = 0.01;

export function idealSoliton({N}) {
  // P(d) = 0, (d = 0)
  // P(d) = 1 / N, (d = 1)
  // P(d) = k = 1 / (k * (k - 1)), (d = k)
  const p = [0, 1 / N];
  for(let k = 2; k < (N + 1); ++k) {
    p.push(1 / (k * (k - 1)));
  }
  return p;
}

export function robustSoliton({
  N, M = Math.ceil(N / 2), delta = DEFAULT_FAILURE_PROBABILITY
}) {
  // delta is the failure probability; the smaller this number the more packets
  // that will have to be transmitted

  // the ideal soliton has a mode (a spike) at 2, the robust soliton modifies
  // the ideal soliton by adding an additional spike at the value `M` and
  // slightly increasing the distribution for every value prior to `M` because
  // it tends to decrease the amount of data that must be transmitted when
  // using LT codes

  // `M` must be an integer <= `N`
  if(!(Number.isInteger(M) && M <= N)) {
    throw new Error('"M" must be an integer that is <= "N".');
  }

  const R = N / M;

  // modify ideal soliton distribution
  const p = idealSoliton({N});

  // t(i) = 1 / (i * M), (i = 1, 2, ..., m - 1),
  // t(i) = ln(R / FAILURE_PROBABILITY) / M, (i = M),
  // t(i) = 0, (i = m + 1, ..., n)
  for(let i = 1; i < M; ++i) {
    // increase distribution for early values before `M`
    p[i] += 1 / (i * M);
  }
  // add extra spike
  p[M] += Math.log(R / delta) / M;

  // standardize proabilities so they sum to 1
  const sum = p.reduce((total, x) => total + x);
  return p.map(x => x / sum);
}
