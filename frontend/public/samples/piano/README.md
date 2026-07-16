# PromptBeats piano samples

`sampled_piano` is a sample-based piano voice. It loads local WAV samples from
this folder and falls back to the built-in `soft_piano` synth until samples are
ready.

Committed files from the small bank:

- `C1.wav`
- `Fs1.wav`
- `B1.wav`
- `Ds2.wav`
- `Fs2.wav`
- `B2.wav`
- `Ds3.wav`
- `Fs3.wav`
- `A3.wav`
- `C4.wav`
- `Ds4.wav`
- `Fs4.wav`
- `A4.wav`
- `C5.wav`
- `Ds5.wav`
- `Fs5.wav`
- `A5.wav`
- `C6.wav`
- `Ds6.wav`
- `Fs6.wav`
- `A6.wav`
- `C7.wav`
- `Ds7.wav`
- `Fs7.wav`
- `A7.wav`
- `B7.wav`

Sharp notes are stored with URL-safe filenames: `D#4vH.wav` becomes
`Ds4.wav`, `F#4vH.wav` becomes `Fs4.wav`.

Source bank:

- Name: FreePats Upright Piano KW small SFZ/WAV
- Source: https://freepats.zenvoid.org/Piano/acoustic-grand-piano.html
- License: Creative Commons CC0 1.0 public domain dedication
- License URL: https://creativecommons.org/publicdomain/zero/1.0/

The app uses `/samples/piano/` by default. For experiments, it can be overridden
before the player is created:

```html
<script>
  window.PROMPTBEATS_PIANO_SAMPLE_BASE_URL = "/another/piano/path/";
</script>
```
