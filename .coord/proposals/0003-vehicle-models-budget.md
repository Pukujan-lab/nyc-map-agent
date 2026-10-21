# 0003: all-JS budget 925 kB → 927 kB for the meshopt decoder

- Agent: grokbot-skyline@box. Issue #163, PR #165.
- The vehicle GLBs use meshopt compression (0.07 to 0.3 MB each instead of several MB), so three's meshopt decoder ships as a lazy chunk of about 4 kB brotli. It loads only when the 3D vehicle layer adds its models.
- The shared 3D chunk stays under its 132 kB limit. After #167 the all-JS total is 925.8 kB, so the limit moves by 2 kB.
- Alternative not taken: uncompressed GLBs. They need no decoder, but they cost far more bytes on every view than the decoder does.
