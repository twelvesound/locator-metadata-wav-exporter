# Locator Metadata WAV Exporter

Ableton Live Extension that renders an Arrangement selection and writes WAV cue marker metadata from locators.

## Requirements

- Ableton Live Suite with Extensions SDK support.
- Ableton Extensions SDK `1.0.0-beta.0`.
- Node.js compatible with the Ableton Extensions CLI.

## Behavior

- Run from an AudioTrack Arrangement time selection.
- Uses the selected time range as the rendered WAV range.
- Writes every locator inside that range as a WAV cue marker.
- Writes each locator name into the WAV `LIST/adtl` labels.
- Writes the marker WAV to this extension's private storage folder.

## Use

1. Select an Arrangement range on an audio track.
2. Place locators inside the selected range.
3. Right-click the selected range on the audio track.
4. Choose `Export WAV With Locators`.

The Extension uses `renderPreFxAudio()`, so it renders the selected audio track pre-effects.
The exported file path is printed to the extension log.

## Output Location

The exported WAV is saved in the extension's private storage folder. This is a per-extension folder managed by Ableton Live, not the same folder as your Live Set, Downloads folder, or Desktop.

After exporting, check the extension log for a line like this:

```txt
Exported locator WAV: /path/to/render-locators.wav
```

That log line shows the exact file path to the rendered WAV.

## Setup

Download the Ableton Extensions SDK from Ableton and copy these two archives into `vendor/`:

- `ableton-extensions-sdk-1.0.0-beta.0.tgz`
- `ableton-extensions-cli-1.0.0-beta.0.tgz`

Then install dependencies:

```sh
npm install
```

## Development

```sh
npm run build
npm run package
```

The package command creates `locator-metadata-wav-exporter.ablx`.

## Notes

This repository does not redistribute the Ableton Extensions SDK archives. Get them from the official Ableton SDK download.
