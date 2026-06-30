# NEXUS Broadcast Transition

Prototype stinger transition for OBS browser/video usage.

## Preview

Open:

```text
apps/web/public/broadcast/transitions/nexus-stinger-preview.html
```

Transparent export mode:

```text
apps/web/public/broadcast/transitions/nexus-stinger-preview.html?alpha=1
```

Click the preview to replay the animation.

## Timing

- Duration: 1.12s
- Suggested OBS transition point: 600ms
- Motion type: diagonal cover wipe + NEXUS brand pop
- Export target: 1920x1080 WebM VP9 with alpha

## OBS

Use as a Stinger transition.

```text
Transition Type: Stinger
Transition Point: 600ms
Audio Monitoring: Off
```

## Render Notes

This repository does not currently include a renderer. To produce the final
OBS asset, capture the `?alpha=1` page at 1920x1080 and encode it as VP9
with alpha.

Recommended output path:

```text
apps/web/public/broadcast/transitions/nexus-stinger.webm
```
