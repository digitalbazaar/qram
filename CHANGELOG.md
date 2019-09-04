# qram ChangeLog

## 0.3.7 - 2019-09-04

### Fixed
- Handle case where decoding is canceled during packet parsing.

## 0.3.6 - 2019-09-04

### Changed
- Provide built in canvas cache for computing image data.

## 0.3.5 - 2019-09-04

### Added
- Add `setRate` API to Timer.

## 0.3.4 - 2019-08-27

### Added
- Expose blocks map in progress event.

## 0.3.3 - 2019-08-26

### Changed
- Decrease minimum header size.

### Added
- Add option to limit max blocks per header.
- Add `Encoder.getMaxPacketSize`.

## 0.3.2 - 2019-08-23

### Fixed
- Fix webpack alias.

## 0.3.1 - 2019-08-23

### Fixed
- Fix incorrect index when decoding.

## 0.3.0 - 2019-08-23

### Changed
- **BREAKING** Include full data hash in packet header.
- Remove isomorphic-webcrypto dependency.

## 0.2.1 - 2019-08-22

### Fixed
- Add webpack build.

## 0.2.0 - 2019-08-22

### Added
- Add initial implementation.

## 0.1.0 - 2019-08-14

### Added
- Add core files.

- See git history for changes previous to this release.
