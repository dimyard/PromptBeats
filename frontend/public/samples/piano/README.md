# PromptBeats piano samples

`sampled_piano` is wired as an optional sample-based piano voice.

To enable real samples, place license-safe piano files here:

- `C3.mp3`
- `E3.mp3`
- `G3.mp3`
- `C4.mp3`
- `E4.mp3`
- `G4.mp3`
- `C5.mp3`

Then set the sample base URL before the app creates the player:

```html
<script>
  window.PROMPTBEATS_PIANO_SAMPLE_BASE_URL = "/samples/piano/";
</script>
```

If the base URL is not set, `sampled_piano` falls back to the built-in
`soft_piano` synth so existing songs remain playable and WAV export does not
depend on external assets.

Only commit samples with a clear permissive license.
