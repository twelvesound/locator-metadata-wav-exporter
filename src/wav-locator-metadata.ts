type RiffChunk = {
  id: string;
  data: any;
};

type WavInfo = {
  sampleRate: number;
  blockAlign: number;
  dataFrames: number;
};

export type LocatorMetadata = {
  id: number;
  sampleOffset: number;
  name: string;
};

function readAscii(buffer: any, start: number, end: number) {
  return buffer.toString("ascii", start, end);
}

function parseChunks(buffer: any) {
  if (readAscii(buffer, 0, 4) !== "RIFF" || readAscii(buffer, 8, 12) !== "WAVE") {
    throw new Error("The rendered file is not a RIFF/WAVE file.");
  }

  const chunks: RiffChunk[] = [];
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = readAscii(buffer, offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + size + (size % 2);

    if (dataOffset + size > buffer.length) {
      throw new Error(`Invalid WAV chunk size for ${id}.`);
    }

    chunks.push({ id, data: buffer.subarray(dataOffset, dataOffset + size) });
    offset = nextOffset;
  }

  return chunks;
}

function getWavInfo(chunks: RiffChunk[]): WavInfo {
  const fmt = chunks.find((chunk) => chunk.id === "fmt ");
  const data = chunks.find((chunk) => chunk.id === "data");

  if (!fmt || fmt.data.length < 16) {
    throw new Error("The WAV file does not contain a valid fmt chunk.");
  }

  if (!data) {
    throw new Error("The WAV file does not contain a data chunk.");
  }

  const sampleRate = fmt.data.readUInt32LE(4);
  const blockAlign = fmt.data.readUInt16LE(12);

  return {
    sampleRate,
    blockAlign,
    dataFrames: Math.floor(data.data.length / blockAlign),
  };
}

function writePaddedAscii(buffer: any, text: string, offset: number, length: number) {
  buffer.fill(0, offset, offset + length);
  buffer.write(text.slice(0, length), offset, "ascii");
}

function makeChunk(id: string, data: any) {
  const needsPad = data.length % 2;
  const chunk = Buffer.alloc(8 + data.length + needsPad);
  chunk.write(id, 0, "ascii");
  chunk.writeUInt32LE(data.length, 4);
  data.copy(chunk, 8);
  return chunk;
}

function makeCueChunk(locators: LocatorMetadata[]) {
  const data = Buffer.alloc(4 + 24 * locators.length);
  data.writeUInt32LE(locators.length, 0);

  locators.forEach((locator, index) => {
    const offset = 4 + 24 * index;
    data.writeUInt32LE(locator.id, offset);
    data.writeUInt32LE(locator.sampleOffset, offset + 4);
    data.write("data", offset + 8, "ascii");
    data.writeUInt32LE(0, offset + 12);
    data.writeUInt32LE(0, offset + 16);
    data.writeUInt32LE(locator.sampleOffset, offset + 20);
  });

  return makeChunk("cue ", data);
}

function makeLablSubchunk(cueId: number, text: string) {
  const textBytes = Buffer.from(`${text || `Locator ${cueId}`}\0`, "utf8");
  const data = Buffer.alloc(4 + textBytes.length);
  data.writeUInt32LE(cueId, 0);
  textBytes.copy(data, 4);
  return makeChunk("labl", data);
}

function makeListAdtlChunk(locators: LocatorMetadata[]) {
  const labels = locators.map((locator) => makeLablSubchunk(locator.id, locator.name));
  return makeChunk("LIST", Buffer.concat([Buffer.from("adtl", "ascii"), ...labels]));
}

function shouldDropChunk(chunk: RiffChunk) {
  if (chunk.id === "cue ") {
    return true;
  }

  return chunk.id === "LIST" && readAscii(chunk.data, 0, 4) === "adtl";
}

export function addLocatorMetadataToWav(wavBuffer: any, locators: LocatorMetadata[]) {
  const chunks = parseChunks(wavBuffer);
  const info = getWavInfo(chunks);

  if (locators.length === 0) {
    throw new Error("No locators were provided.");
  }

  locators.forEach((locator) => {
    if (locator.sampleOffset < 0 || locator.sampleOffset >= info.dataFrames) {
      throw new Error(`Locator "${locator.name}" is outside the rendered audio.`);
    }
  });

  const keptChunks = chunks.filter((chunk) => !shouldDropChunk(chunk));
  const outputChunks = [
    ...keptChunks.map((chunk) => makeChunk(chunk.id, chunk.data)),
    makeCueChunk(locators),
    makeListAdtlChunk(locators),
  ];
  const body = Buffer.concat(outputChunks);
  const output = Buffer.alloc(12 + body.length);

  writePaddedAscii(output, "RIFF", 0, 4);
  output.writeUInt32LE(4 + body.length, 4);
  writePaddedAscii(output, "WAVE", 8, 4);
  body.copy(output, 12);

  return output;
}

export function readWavInfo(wavBuffer: any) {
  return getWavInfo(parseChunks(wavBuffer));
}
