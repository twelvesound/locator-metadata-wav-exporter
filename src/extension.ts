import {
  AudioTrack,
  DataModelObject,
  TakeLane,
  initialize,
  type ActivationContext,
  type ArrangementSelection,
} from "@ableton-extensions/sdk";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { addLocatorMetadataToWav, readWavInfo } from "./wav-locator-metadata.js";

const API_VERSION = "1.0.0";
const COMMAND_ID = "locator-metadata-wav-exporter.render";
const MENU_TITLE = "Export WAV With Locators";

function assertArrangementSelection(value: unknown): ArrangementSelection {
  const selection = value as ArrangementSelection;
  if (
    typeof selection?.time_selection_start !== "number" ||
    typeof selection?.time_selection_end !== "number" ||
    !Array.isArray(selection?.selected_lanes)
  ) {
    throw new Error("This command must be run from an Arrangement time selection.");
  }

  if (selection.time_selection_end <= selection.time_selection_start) {
    throw new Error("Select a non-empty Arrangement time range before running this command.");
  }

  return selection;
}

function getSelectedAudioTrack(context: ReturnType<typeof initialize>, selection: ArrangementSelection) {
  const objects = selection.selected_lanes.map((handle) =>
    context.getObjectFromHandle(handle, DataModelObject),
  );
  const audioTrack = objects.find((object): object is AudioTrack<"1.0.0"> => object instanceof AudioTrack);

  if (audioTrack) {
    return audioTrack;
  }

  const audioTakeLane = objects.find(
    (object): object is TakeLane<"1.0.0"> =>
      object instanceof TakeLane && object.parent instanceof AudioTrack,
  );

  if (audioTakeLane?.parent instanceof AudioTrack) {
    return audioTakeLane.parent;
  }

  throw new Error("Select an audio track or audio take lane.");
}

function getLocatorsInSelection(context: ReturnType<typeof initialize>, selection: ArrangementSelection) {
  const locatorsInSelection = context.application.song.cuePoints
    .filter(
      (cuePoint) =>
        cuePoint.time >= selection.time_selection_start &&
        cuePoint.time <= selection.time_selection_end,
    )
    .sort((a, b) => a.time - b.time);

  if (locatorsInSelection.length === 0) {
    throw new Error("Place at least one locator inside the selected render range.");
  }

  return locatorsInSelection;
}

function beatToSample(beat: number, renderStartBeat: number, tempo: number, sampleRate: number) {
  const secondsPerBeat = 60 / tempo;
  return Math.round((beat - renderStartBeat) * secondsPerBeat * sampleRate);
}

export function activate(activation: ActivationContext) {
  const context = initialize(activation, API_VERSION);

  context.commands.registerCommand(COMMAND_ID, async (arg: unknown) => {
    try {
      const selection = assertArrangementSelection(arg);
      const track = getSelectedAudioTrack(context, selection);
      const locators = getLocatorsInSelection(context, selection);

      const outputPath = await context.ui.withinProgressDialog(
        "Rendering WAV with locators...",
        { progress: 0 },
        async (update, signal) => {
          await update("Rendering audio...", 20);
          const renderedPath = await context.resources.renderPreFxAudio(
            track,
            selection.time_selection_start,
            selection.time_selection_end,
          );
          signal.throwIfAborted();

          await update("Writing locator metadata...", 65);
          const wavBuffer = await fs.readFile(renderedPath);
          const wavInfo = readWavInfo(wavBuffer);
          const locatorMetadata = locators.map((locator, index) => ({
            id: index + 1,
            sampleOffset: beatToSample(
              locator.time,
              selection.time_selection_start,
              context.application.song.tempo,
              wavInfo.sampleRate,
            ),
            name: locator.name || `Locator ${index + 1}`,
          }));
          const locatorWav = addLocatorMetadataToWav(wavBuffer, locatorMetadata);
          const outputName = `${track.name || "render"}-locators.wav`.replace(/[/:]/g, "-");
          const outputDirectory =
            context.environment.storageDirectory ?? context.environment.tempDirectory!;
          const outputPath = path.join(outputDirectory, outputName);
          await fs.writeFile(outputPath, locatorWav);
          await update("Done", 100);
          return outputPath;
        },
      );

      console.log(`Exported locator WAV: ${outputPath}`);
    } catch (error) {
      console.error(error);
    }
  });

  context.ui.registerContextMenuAction(
    "AudioTrack.ArrangementSelection",
    MENU_TITLE,
    COMMAND_ID,
  );
}
