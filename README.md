# proof-of-liveness

Allow core members to check in on-chain for proof-of-liveness

## on-chain deployment

- date: 2025.1.24
- deployer: evan.j
- compiler: soljson-v0.8.20+commit.a1b79de6.js
- compiler config: istanbul + optimization 200 runs

POPBadge.sol
- contract address: 0xCb1429da13cE40e75519148e796C6D58dD6b1a8E
- owner: not ownable

JVCore.sol
- deployment parameters: 2592000, 86400, 0xCb1429da13cE40e75519148e796C6D58dD6b1a8E
- contract address: 0x8d214415b9c5F5E4Cf4CbCfb4a5DEd47fb516392
- owner: evan.j (TODO: transfer ownership to core multi-sig)

## contributors

evan.j

## history

2025.1.10 initial version of contracts
