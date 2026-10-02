Ours — custom / procedural pet slot
=====================================

Default: the built-in procedural cartoon pet (body, head, blinking eyes,
ears, wagging tail, squash-and-bounce hop) rendered in code — no external
asset required.

Optional: drop a GLB named pet.glb in this folder (same layout as the other
pet slots). If present, the game will load it with GLTFLoader and fall back
to the procedural pet on any load failure. Animations are auto-mapped by
clip name (Idle / Walk / Jump and common variants).

Licence: whatever you place here is your responsibility; keep a LICENSE.txt
alongside pet.glb describing the source and terms.
