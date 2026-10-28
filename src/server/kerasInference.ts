import fs from 'fs';
import path from 'path';
import { unzipSync } from 'fflate';
import * as hdf5 from 'jsfive';
import sharp from 'sharp';

interface Tensor3D {
  h: number;
  w: number;
  c: number;
  data: Float32Array;
}

type CompiledStep =
  | {
      kind: 'rescaling';
      scale: number;
      offset: number;
    }
  | {
      kind: 'conv2d';
      name: string;
      kh: number;
      kw: number;
      inC: number;
      outC: number;
      strideH: number;
      strideW: number;
      padding: 'valid' | 'same';
      activation: string;
      kernel: Float32Array;
      bias: Float32Array | null;
    }
  | {
      kind: 'maxpool2d';
      poolH: number;
      poolW: number;
      strideH: number;
      strideW: number;
      padding: 'valid' | 'same';
    }
  | {
      kind: 'global_avg_pool2d';
    }
  | {
      kind: 'flatten';
    }
  | {
      kind: 'dense';
      name: string;
      inUnits: number;
      outUnits: number;
      activation: string;
      kernel: Float32Array;
      bias: Float32Array | null;
    }
  | {
      kind: 'noop';
    };

export interface LoadedKerasCnn {
  modelFileName: string;
  resolvedModelPath: string;
  inputHeight: number;
  inputWidth: number;
  inputChannels: number;
  hasInternalRescaling: boolean;
  classes: string[];
  layerSummary: string[];
  steps: CompiledStep[];
  loadedMtimeMs: number;
}

export interface KerasHealthSummary {
  modelLoaded: boolean;
  modelVersion: string | null;
  modelPath: string | null;
  inputShape: [number, number, number];
  singleRescaling: boolean;
  classes: string[];
  error: string | null;
}

export interface KerasPredictionOutput {
  success: true;
  experimental: true;
  notice: string;
  blood_group: string;
  predicted_class: string;
  confidence: number;
  probabilities: Record<string, number>;
  model_version: string;
}

export class InvalidFingerprintImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidFingerprintImageError';
  }
}

interface Hdf5Node {
  keys?: string[];
  shape?: number[];
  value?: ArrayLike<number>;
  get: (key: string) => Hdf5Node | undefined;
}

interface KerasLayerEntry {
  class_name?: string;
  config?: Record<string, unknown>;
  build_config?: {
    input_shape?: Array<number | null>;
  };
}

let cachedModel: LoadedKerasCnn | null = null;
let cachedError: string | null = null;
let cachedAttemptMtime = -1;

function resolveModelPaths(projectRoot: string): {
  modelPath: string;
  classesPath: string;
} {
  const candidateDirs = [
    path.join(projectRoot, 'models'),
    path.join(projectRoot, 'backend', 'models'),
  ];

  for (const dir of candidateDirs) {
    const modelCandidate = path.join(dir, 'hemoscan_cnn.keras');
    const classesCandidate = path.join(dir, 'classes.json');
    if (fs.existsSync(modelCandidate) && fs.existsSync(classesCandidate)) {
      return {
        modelPath: modelCandidate,
        classesPath: classesCandidate,
      };
    }
  }

  for (const dir of candidateDirs) {
    const modelCandidate = path.join(dir, 'hemoscan_cnn.keras');
    if (fs.existsSync(modelCandidate)) {
      return {
        modelPath: modelCandidate,
        classesPath: path.join(dir, 'classes.json'),
      };
    }
  }

  const fallbackDir = path.join(projectRoot, 'backend', 'models');
  return {
    modelPath: path.join(fallbackDir, 'hemoscan_cnn.keras'),
    classesPath: path.join(fallbackDir, 'classes.json'),
  };
}

/**
 * Decodes uncompressed Windows DIB/BMP fingerprint images (1, 4, 8, 24, or 32-bit,
 * bottom-up or top-down) into an 8-bit 3-channel RGB buffer so .bmp fingerprint
 * datasets work seamlessly alongside PNG and JPEG scans.
 */
function decodeBmpToRgbBuffer(buf: Buffer): {
  width: number;
  height: number;
  rgb: Buffer;
} {
  if (buf.length < 54 || buf[0] !== 0x42 || buf[1] !== 0x4d) {
    throw new InvalidFingerprintImageError('Invalid BMP header.');
  }

  const pixelArrayOffset = buf.readUInt32LE(10);
  const dibHeaderSize = buf.readUInt32LE(14);
  if (dibHeaderSize < 40 || buf.length < 14 + dibHeaderSize) {
    throw new InvalidFingerprintImageError('Unsupported BMP DIB header.');
  }

  const width = buf.readInt32LE(18);
  const rawHeight = buf.readInt32LE(22);
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  const planes = buf.readUInt16LE(26);
  const bitsPerPixel = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  const colorsUsed = buf.readUInt32LE(46);

  if (
    width <= 0 ||
    height <= 0 ||
    width > 8192 ||
    height > 8192 ||
    planes !== 1 ||
    (compression !== 0 && compression !== 3)
  ) {
    throw new InvalidFingerprintImageError('Unsupported or compressed BMP format.');
  }

  if (![1, 4, 8, 24, 32].includes(bitsPerPixel)) {
    throw new InvalidFingerprintImageError(`Unsupported BMP bit depth: ${bitsPerPixel}.`);
  }

  const rgb = Buffer.alloc(width * height * 3);
  const rowStride = Math.floor((bitsPerPixel * width + 31) / 32) * 4;
  if (pixelArrayOffset + rowStride * height > buf.length) {
    throw new InvalidFingerprintImageError('Truncated BMP image data.');
  }

  let paletteOffset = 14 + dibHeaderSize;
  const paletteEntries =
    bitsPerPixel <= 8
      ? colorsUsed > 0
        ? colorsUsed
        : 1 << bitsPerPixel
      : 0;

  if (bitsPerPixel <= 8 && paletteOffset + paletteEntries * 4 > pixelArrayOffset) {
    paletteOffset = Math.max(14 + 40, pixelArrayOffset - paletteEntries * 4);
  }

  let maskR = 0x00ff0000;
  let maskG = 0x0000ff00;
  let maskB = 0x000000ff;
  if (compression === 3 && bitsPerPixel === 32 && dibHeaderSize >= 52) {
    maskR = buf.readUInt32LE(54);
    maskG = buf.readUInt32LE(58);
    maskB = buf.readUInt32LE(62);
  }

  const extractChannelFromMask = (pixel32: number, mask: number): number => {
    if (mask === 0) return 0;
    let shift = 0;
    let m = mask;
    while ((m & 1) === 0 && shift < 32) {
      m >>>= 1;
      shift++;
    }
    const rawVal = (pixel32 >>> shift) & m;
    return m === 255 ? rawVal : Math.round((rawVal / m) * 255);
  };

  for (let y = 0; y < height; y++) {
    const srcRowIndex = topDown ? y : height - 1 - y;
    const srcRowStart = pixelArrayOffset + srcRowIndex * rowStride;
    const dstRowStart = y * width * 3;

    if (bitsPerPixel === 24) {
      for (let x = 0; x < width; x++) {
        const p = srcRowStart + x * 3;
        const d = dstRowStart + x * 3;
        rgb[d] = buf[p + 2];     // R
        rgb[d + 1] = buf[p + 1]; // G
        rgb[d + 2] = buf[p];     // B
      }
    } else if (bitsPerPixel === 32) {
      for (let x = 0; x < width; x++) {
        const p = srcRowStart + x * 4;
        const d = dstRowStart + x * 3;
        if (compression === 3) {
          const px = buf.readUInt32LE(p);
          rgb[d] = extractChannelFromMask(px, maskR);
          rgb[d + 1] = extractChannelFromMask(px, maskG);
          rgb[d + 2] = extractChannelFromMask(px, maskB);
        } else {
          rgb[d] = buf[p + 2];
          rgb[d + 1] = buf[p + 1];
          rgb[d + 2] = buf[p];
        }
      }
    } else if (bitsPerPixel === 8) {
      for (let x = 0; x < width; x++) {
        const idx = buf[srcRowStart + x];
        const d = dstRowStart + x * 3;
        const palPos = paletteOffset + idx * 4;
        if (idx < paletteEntries && palPos + 2 < buf.length) {
          rgb[d] = buf[palPos + 2];
          rgb[d + 1] = buf[palPos + 1];
          rgb[d + 2] = buf[palPos];
        } else {
          rgb[d] = idx;
          rgb[d + 1] = idx;
          rgb[d + 2] = idx;
        }
      }
    } else if (bitsPerPixel === 4) {
      for (let x = 0; x < width; x++) {
        const byteVal = buf[srcRowStart + (x >> 1)];
        const idx = (x & 1) === 0 ? byteVal >> 4 : byteVal & 0x0f;
        const d = dstRowStart + x * 3;
        const palPos = paletteOffset + idx * 4;
        rgb[d] = buf[palPos + 2];
        rgb[d + 1] = buf[palPos + 1];
        rgb[d + 2] = buf[palPos];
      }
    } else if (bitsPerPixel === 1) {
      for (let x = 0; x < width; x++) {
        const byteVal = buf[srcRowStart + (x >> 3)];
        const idx = (byteVal >> (7 - (x & 7))) & 1;
        const d = dstRowStart + x * 3;
        const palPos = paletteOffset + idx * 4;
        rgb[d] = buf[palPos + 2];
        rgb[d + 1] = buf[palPos + 1];
        rgb[d + 2] = buf[palPos];
      }
    }
  }

  return { width, height, rgb };
}

function readHdf5Dataset(root: Hdf5Node, datasetPath: string): { shape: number[]; data: Float32Array } {
  const segments = datasetPath.split('/').filter(Boolean);
  let current: Hdf5Node | undefined = root;
  for (const seg of segments) {
    if (!current || typeof current.get !== 'function') {
      throw new Error(`Missing HDF5 group while resolving ${datasetPath}`);
    }
    current = current.get(seg);
  }
  if (!current || !current.value) {
    throw new Error(`Missing HDF5 weight tensor at ${datasetPath}`);
  }
  const shape = Array.isArray(current.shape) ? current.shape.map(Number) : [];
  const data =
    current.value instanceof Float32Array
      ? current.value
      : Float32Array.from(current.value);
  return { shape, data };
}

function applyActivationInPlace(vec: Float32Array, activation: string): void {
  const act = (activation || 'linear').toLowerCase();
  if (act === 'linear' || act === 'none') {
    return;
  }
  if (act === 'relu') {
    for (let i = 0; i < vec.length; i++) {
      if (vec[i] < 0) vec[i] = 0;
    }
    return;
  }
  if (act === 'sigmoid') {
    for (let i = 0; i < vec.length; i++) {
      vec[i] = 1 / (1 + Math.exp(-vec[i]));
    }
    return;
  }
  if (act === 'softmax') {
    let maxVal = -Infinity;
    for (let i = 0; i < vec.length; i++) {
      if (vec[i] > maxVal) maxVal = vec[i];
    }
    let sumExp = 0;
    const exps = new Float64Array(vec.length);
    for (let i = 0; i < vec.length; i++) {
      const e = Math.exp(vec[i] - maxVal);
      exps[i] = e;
      sumExp += e;
    }
    for (let i = 0; i < vec.length; i++) {
      vec[i] = sumExp > 0 ? exps[i] / sumExp : 0;
    }
    return;
  }
  throw new Error(`Unsupported Keras activation '${activation}'`);
}

function runConv2D(input: Tensor3D, step: Extract<CompiledStep, { kind: 'conv2d' }>): Tensor3D {
  const { h: inH, w: inW, c: inC, data: src } = input;
  const { kh, kw, outC, strideH, strideW, padding, activation, kernel, bias } = step;

  if (inC !== step.inC) {
    throw new Error(
      `Conv2D '${step.name}' expected ${step.inC} input channels, received ${inC}.`
    );
  }

  let outH: number;
  let outW: number;
  let padTop = 0;
  let padLeft = 0;

  if (padding === 'same') {
    outH = Math.ceil(inH / strideH);
    outW = Math.ceil(inW / strideW);
    const padAlongH = Math.max((outH - 1) * strideH + kh - inH, 0);
    const padAlongW = Math.max((outW - 1) * strideW + kw - inW, 0);
    padTop = Math.floor(padAlongH / 2);
    padLeft = Math.floor(padAlongW / 2);
  } else {
    outH = Math.floor((inH - kh) / strideH) + 1;
    outW = Math.floor((inW - kw) / strideW) + 1;
  }

  const out = new Float32Array(outH * outW * outC);
  const isRelu = activation.toLowerCase() === 'relu';

  for (let oy = 0; oy < outH; oy++) {
    const baseInY = oy * strideH - padTop;
    for (let ox = 0; ox < outW; ox++) {
      const baseInX = ox * strideW - padLeft;
      const outOffset = (oy * outW + ox) * outC;

      if (bias) {
        for (let oc = 0; oc < outC; oc++) {
          out[outOffset + oc] = bias[oc];
        }
      }

      for (let ky = 0; ky < kh; ky++) {
        const iy = baseInY + ky;
        if (iy < 0 || iy >= inH) continue;
        const inRowOffset = iy * inW * inC;
        const kRowOffset = ky * kw * inC * outC;

        for (let kx = 0; kx < kw; kx++) {
          const ix = baseInX + kx;
          if (ix < 0 || ix >= inW) continue;

          const inPixelOffset = inRowOffset + ix * inC;
          const kPixelOffset = kRowOffset + kx * inC * outC;

          for (let ic = 0; ic < inC; ic++) {
            const xVal = src[inPixelOffset + ic];
            if (xVal === 0) continue;
            const kChanOffset = kPixelOffset + ic * outC;
            for (let oc = 0; oc < outC; oc++) {
              out[outOffset + oc] += xVal * kernel[kChanOffset + oc];
            }
          }
        }
      }

      if (isRelu) {
        for (let oc = 0; oc < outC; oc++) {
          if (out[outOffset + oc] < 0) {
            out[outOffset + oc] = 0;
          }
        }
      }
    }
  }

  if (!isRelu && activation.toLowerCase() !== 'linear') {
    applyActivationInPlace(out, activation);
  }

  return { h: outH, w: outW, c: outC, data: out };
}

function runMaxPool2D(
  input: Tensor3D,
  step: Extract<CompiledStep, { kind: 'maxpool2d' }>
): Tensor3D {
  const { h: inH, w: inW, c, data: src } = input;
  const { poolH, poolW, strideH, strideW, padding } = step;

  let outH: number;
  let outW: number;
  let padTop = 0;
  let padLeft = 0;

  if (padding === 'same') {
    outH = Math.ceil(inH / strideH);
    outW = Math.ceil(inW / strideW);
    const padAlongH = Math.max((outH - 1) * strideH + poolH - inH, 0);
    const padAlongW = Math.max((outW - 1) * strideW + poolW - inW, 0);
    padTop = Math.floor(padAlongH / 2);
    padLeft = Math.floor(padAlongW / 2);
  } else {
    outH = Math.floor((inH - poolH) / strideH) + 1;
    outW = Math.floor((inW - poolW) / strideW) + 1;
  }

  const out = new Float32Array(outH * outW * c);
  out.fill(-Infinity);

  for (let oy = 0; oy < outH; oy++) {
    const baseY = oy * strideH - padTop;
    for (let ox = 0; ox < outW; ox++) {
      const baseX = ox * strideW - padLeft;
      const outOffset = (oy * outW + ox) * c;

      for (let py = 0; py < poolH; py++) {
        const iy = baseY + py;
        if (iy < 0 || iy >= inH) continue;
        for (let px = 0; px < poolW; px++) {
          const ix = baseX + px;
          if (ix < 0 || ix >= inW) continue;
          const inOffset = (iy * inW + ix) * c;
          for (let ch = 0; ch < c; ch++) {
            const v = src[inOffset + ch];
            if (v > out[outOffset + ch]) {
              out[outOffset + ch] = v;
            }
          }
        }
      }
    }
  }

  return { h: outH, w: outW, c, data: out };
}

function runGlobalAvgPool2D(input: Tensor3D): Float32Array {
  const { h, w, c, data: src } = input;
  const spatialCount = h * w;
  const sums = new Float64Array(c);

  for (let idx = 0; idx < spatialCount; idx++) {
    const offset = idx * c;
    for (let ch = 0; ch < c; ch++) {
      sums[ch] += src[offset + ch];
    }
  }

  const out = new Float32Array(c);
  for (let ch = 0; ch < c; ch++) {
    out[ch] = spatialCount > 0 ? sums[ch] / spatialCount : 0;
  }
  return out;
}

function runDense(
  vec: Float32Array,
  step: Extract<CompiledStep, { kind: 'dense' }>
): Float32Array {
  const { inUnits, outUnits, kernel, bias, activation, name } = step;
  if (vec.length !== inUnits) {
    throw new Error(`Dense '${name}' expected ${inUnits} features, received ${vec.length}.`);
  }

  const accum = new Float64Array(outUnits);
  if (bias) {
    for (let o = 0; o < outUnits; o++) {
      accum[o] = bias[o];
    }
  }

  for (let i = 0; i < inUnits; i++) {
    const x = vec[i];
    if (x === 0) continue;
    const kOffset = i * outUnits;
    for (let o = 0; o < outUnits; o++) {
      accum[o] += x * kernel[kOffset + o];
    }
  }

  const out = new Float32Array(outUnits);
  for (let o = 0; o < outUnits; o++) {
    out[o] = accum[o];
  }

  applyActivationInPlace(out, activation);
  return out;
}

export function loadOrGetKerasModel(projectRoot: string): {
  model: LoadedKerasCnn | null;
  error: string | null;
} {
  const { modelPath, classesPath } = resolveModelPaths(projectRoot);

  try {
    if (!fs.existsSync(modelPath)) {
      cachedModel = null;
      cachedError = `Model file not found: ${modelPath}`;
      return { model: null, error: cachedError };
    }
    if (!fs.existsSync(classesPath)) {
      cachedModel = null;
      cachedError = `Class file not found: ${classesPath}`;
      return { model: null, error: cachedError };
    }

    const modelStat = fs.statSync(modelPath);
    const classesStat = fs.statSync(classesPath);
    const combinedMtime = Math.max(modelStat.mtimeMs, classesStat.mtimeMs);

    if (cachedModel && cachedModel.loadedMtimeMs === combinedMtime) {
      return { model: cachedModel, error: null };
    }
    if (!cachedModel && cachedError && cachedAttemptMtime === combinedMtime) {
      return { model: null, error: cachedError };
    }
    cachedAttemptMtime = combinedMtime;

    const loadedClasses = JSON.parse(fs.readFileSync(classesPath, 'utf-8')) as unknown;
    const expectedClasses = ['A+', 'A-', 'AB+', 'AB-', 'B+', 'B-', 'O+', 'O-'];
    if (
      !Array.isArray(loadedClasses) ||
      loadedClasses.length !== expectedClasses.length ||
      loadedClasses.some((c, idx) => c !== expectedClasses[idx])
    ) {
      throw new Error('classes.json does not match the trained model class order.');
    }

    const zipBytes = new Uint8Array(fs.readFileSync(modelPath));
    const unzipped = unzipSync(zipBytes);
    const configBytes = unzipped['config.json'];
    const weightsBytes = unzipped['model.weights.h5'];

    if (!configBytes || !weightsBytes) {
      throw new Error('Invalid .keras archive: missing config.json or model.weights.h5.');
    }

    const configJson = JSON.parse(Buffer.from(configBytes).toString('utf-8')) as {
      class_name?: string;
      config?: { layers?: KerasLayerEntry[] };
    };

    const rawLayers = configJson.config?.layers;
    if (!Array.isArray(rawLayers) || rawLayers.length === 0) {
      throw new Error('Keras config.json contains no sequential layers.');
    }

    const h5Buffer = weightsBytes.buffer.slice(
      weightsBytes.byteOffset,
      weightsBytes.byteOffset + weightsBytes.byteLength
    );
    const h5File = new hdf5.File(h5Buffer, 'model.weights.h5') as unknown as Hdf5Node;

    let inputHeight = 224;
    let inputWidth = 224;
    let inputChannels = 3;
    let rescalingLayerCount = 0;
    let lastOutputUnits = -1;
    const steps: CompiledStep[] = [];
    const layerSummary: string[] = [];

    for (const layer of rawLayers) {
      const className = layer.class_name || '';
      const cfg = layer.config || {};
      const layerName = String(cfg.name || '');

      if (className === 'InputLayer') {
        const batchShape = Array.isArray(cfg.batch_shape)
          ? (cfg.batch_shape as Array<number | null>)
          : [];
        if (batchShape.length === 4) {
          inputHeight = Number(batchShape[1]);
          inputWidth = Number(batchShape[2]);
          inputChannels = Number(batchShape[3]);
        }
        layerSummary.push(`InputLayer(${inputHeight}x${inputWidth}x${inputChannels})`);
        continue;
      }

      if (className === 'Rescaling') {
        rescalingLayerCount += 1;
        const scale = typeof cfg.scale === 'number' ? cfg.scale : 1 / 255;
        const offset = typeof cfg.offset === 'number' ? cfg.offset : 0;
        steps.push({
          kind: 'rescaling',
          scale,
          offset,
        });
        layerSummary.push(`Rescaling(scale=${scale.toFixed(8)}, offset=${offset})`);
        continue;
      }

      if (className === 'Conv2D') {
        const kernelDataset = readHdf5Dataset(h5File, `/layers/${layerName}/vars/0`);
        const [kh, kw, inC, outC] = kernelDataset.shape;
        if (kernelDataset.data.length !== kh * kw * inC * outC) {
          throw new Error(`Conv2D '${layerName}' kernel size mismatch.`);
        }
        const useBias = cfg.use_bias !== false;
        const bias = useBias
          ? readHdf5Dataset(h5File, `/layers/${layerName}/vars/1`).data
          : null;
        if (bias && bias.length !== outC) {
          throw new Error(`Conv2D '${layerName}' bias size mismatch.`);
        }
        const strides = Array.isArray(cfg.strides) ? (cfg.strides as number[]) : [1, 1];
        const paddingRaw = String(cfg.padding || 'valid').toLowerCase();
        const activation = String(cfg.activation || 'linear');

        steps.push({
          kind: 'conv2d',
          name: layerName,
          kh,
          kw,
          inC,
          outC,
          strideH: Number(strides[0] || 1),
          strideW: Number(strides[1] || 1),
          padding: paddingRaw === 'same' ? 'same' : 'valid',
          activation,
          kernel: kernelDataset.data,
          bias,
        });
        layerSummary.push(`Conv2D(${layerName}: ${kh}x${kw}, ${inC}->${outC}, ${activation})`);
        continue;
      }

      if (className === 'MaxPooling2D') {
        const poolSize = Array.isArray(cfg.pool_size) ? (cfg.pool_size as number[]) : [2, 2];
        const strides = Array.isArray(cfg.strides) ? (cfg.strides as number[]) : poolSize;
        const paddingRaw = String(cfg.padding || 'valid').toLowerCase();
        steps.push({
          kind: 'maxpool2d',
          poolH: Number(poolSize[0] || 2),
          poolW: Number(poolSize[1] || 2),
          strideH: Number(strides[0] || 2),
          strideW: Number(strides[1] || 2),
          padding: paddingRaw === 'same' ? 'same' : 'valid',
        });
        layerSummary.push(`MaxPooling2D(${poolSize[0]}x${poolSize[1]})`);
        continue;
      }

      if (className === 'GlobalAveragePooling2D') {
        steps.push({ kind: 'global_avg_pool2d' });
        layerSummary.push('GlobalAveragePooling2D()');
        continue;
      }

      if (className === 'Flatten') {
        steps.push({ kind: 'flatten' });
        layerSummary.push('Flatten()');
        continue;
      }

      if (className === 'Dropout') {
        steps.push({ kind: 'noop' });
        layerSummary.push(`Dropout(${String(cfg.rate ?? 0)})`);
        continue;
      }

      if (className === 'Dense') {
        const kernelDataset = readHdf5Dataset(h5File, `/layers/${layerName}/vars/0`);
        const [inUnits, outUnits] = kernelDataset.shape;
        if (kernelDataset.data.length !== inUnits * outUnits) {
          throw new Error(`Dense '${layerName}' kernel size mismatch.`);
        }
        const useBias = cfg.use_bias !== false;
        const bias = useBias
          ? readHdf5Dataset(h5File, `/layers/${layerName}/vars/1`).data
          : null;
        if (bias && bias.length !== outUnits) {
          throw new Error(`Dense '${layerName}' bias size mismatch.`);
        }
        const activation = String(cfg.activation || 'linear');
        lastOutputUnits = outUnits;
        steps.push({
          kind: 'dense',
          name: layerName,
          inUnits,
          outUnits,
          activation,
          kernel: kernelDataset.data,
          bias,
        });
        layerSummary.push(`Dense(${layerName}: ${inUnits}->${outUnits}, ${activation})`);
        continue;
      }

      throw new Error(`Unsupported Keras layer '${className}' in ${path.basename(modelPath)}.`);
    }

    if (inputHeight !== 224 || inputWidth !== 224 || inputChannels !== 3) {
      throw new Error(
        `Unexpected model input shape: (${inputHeight}, ${inputWidth}, ${inputChannels})`
      );
    }

    if (lastOutputUnits !== loadedClasses.length) {
      throw new Error('Model output count does not match classes.json.');
    }

    cachedModel = {
      modelFileName: path.basename(modelPath),
      resolvedModelPath: path.relative(projectRoot, modelPath),
      inputHeight,
      inputWidth,
      inputChannels,
      hasInternalRescaling: rescalingLayerCount > 0,
      classes: loadedClasses as string[],
      layerSummary,
      steps,
      loadedMtimeMs: combinedMtime,
    };
    cachedError = null;

    return { model: cachedModel, error: null };
  } catch (err) {
    cachedModel = null;
    cachedError = err instanceof Error ? err.message : 'Failed to load Keras model.';
    return { model: null, error: cachedError };
  }
}

export function getLocalKerasHealth(projectRoot: string): KerasHealthSummary {
  const { model, error } = loadOrGetKerasModel(projectRoot);
  return {
    modelLoaded: model !== null,
    modelVersion: model ? model.modelFileName : null,
    modelPath: model ? model.resolvedModelPath : null,
    inputShape: model
      ? [model.inputHeight, model.inputWidth, model.inputChannels]
      : [224, 224, 3],
    singleRescaling: true,
    classes: model ? model.classes : [],
    error,
  };
}

/**
 * Executes a forward pass on a raw Float32Array [224 * 224 * 3] RGB tensor in [0..255] range.
 * Exported so automated architectural verification tests can compare exact tensor math.
 */
export function runForwardPassFromRgb255Tensor(
  model: LoadedKerasCnn,
  rawRgb255: Float32Array
): Float32Array {
  if (rawRgb255.length !== model.inputHeight * model.inputWidth * model.inputChannels) {
    throw new Error(
      `Expected RGB tensor of length ${
        model.inputHeight * model.inputWidth * model.inputChannels
      }, got ${rawRgb255.length}.`
    );
  }

  let initialData: Float32Array;
  if (model.hasInternalRescaling) {
    // Model contains Rescaling(1./255) layer — pass [0..255] float32 so pixel rescaling occurs ONCE
    initialData = rawRgb255;
  } else {
    // Model has no Rescaling layer — rescale [0..255] -> [0..1] ONCE here
    initialData = new Float32Array(rawRgb255.length);
    for (let i = 0; i < rawRgb255.length; i++) {
      initialData[i] = rawRgb255[i] / 255.0;
    }
  }

  let spatial: Tensor3D | null = {
    h: model.inputHeight,
    w: model.inputWidth,
    c: model.inputChannels,
    data: initialData,
  };
  let vector: Float32Array | null = null;

  for (const step of model.steps) {
    if (step.kind === 'noop') continue;

    if (step.kind === 'rescaling') {
      if (!spatial) throw new Error('Rescaling expected 3D tensor.');
      const scaled: Float32Array = new Float32Array(spatial.data.length);
      for (let i = 0; i < spatial.data.length; i++) {
        scaled[i] = spatial.data[i] * step.scale + step.offset;
      }
      spatial = { ...spatial, data: scaled };
      continue;
    }

    if (step.kind === 'conv2d') {
      if (!spatial) throw new Error(`Conv2D '${step.name}' expected 3D tensor.`);
      spatial = runConv2D(spatial, step);
      continue;
    }

    if (step.kind === 'maxpool2d') {
      if (!spatial) throw new Error('MaxPooling2D expected 3D tensor.');
      spatial = runMaxPool2D(spatial, step);
      continue;
    }

    if (step.kind === 'global_avg_pool2d') {
      if (!spatial) throw new Error('GlobalAveragePooling2D expected 3D tensor.');
      vector = runGlobalAvgPool2D(spatial);
      spatial = null;
      continue;
    }

    if (step.kind === 'flatten') {
      if (!spatial) throw new Error('Flatten expected 3D tensor.');
      vector = spatial.data;
      spatial = null;
      continue;
    }

    if (step.kind === 'dense') {
      if (!vector) throw new Error(`Dense '${step.name}' expected 1D feature vector.`);
      vector = runDense(vector, step);
      continue;
    }
  }

  if (!vector || vector.length !== model.classes.length) {
    throw new Error('Model returned invalid prediction scores.');
  }

  return vector;
}

export async function decodeAndResizeFingerprintToRgb255(
  rawImageBytes: Buffer,
  targetWidth: number,
  targetHeight: number
): Promise<Float32Array> {
  if (!rawImageBytes || rawImageBytes.length < 16) {
    throw new InvalidFingerprintImageError('Invalid or unsupported image.');
  }

  try {
    let pipeline: ReturnType<typeof sharp>;

    if (rawImageBytes[0] === 0x42 && rawImageBytes[1] === 0x4d) {
      // Native BMP support (8-bit grayscale/indexed, 24-bit BGR, 32-bit BGRA)
      const decodedBmp = decodeBmpToRgbBuffer(rawImageBytes);
      pipeline = sharp(decodedBmp.rgb, {
        raw: {
          width: decodedBmp.width,
          height: decodedBmp.height,
          channels: 3,
        },
      });
    } else {
      const meta = await sharp(rawImageBytes, { failOn: 'error' }).metadata();
      if (!meta.width || !meta.height) {
        throw new InvalidFingerprintImageError('Invalid or unsupported image.');
      }
      pipeline = sharp(rawImageBytes, { failOn: 'error' }).toColorspace('srgb');
    }

    const { data, info } = await pipeline
      .resize(targetWidth, targetHeight, {
        fit: 'fill',
        kernel: sharp.kernel.cubic,
      })
      .raw({ depth: 'uchar' })
      .toBuffer({ resolveWithObject: true });

    const pixelCount = targetWidth * targetHeight;
    const ch = info.channels;
    if (data.length !== pixelCount * ch) {
      throw new InvalidFingerprintImageError('Unexpected decoded image buffer length.');
    }

    const rgbPixels = new Float32Array(pixelCount * 3);
    if (ch === 3) {
      for (let i = 0; i < pixelCount * 3; i++) {
        rgbPixels[i] = data[i];
      }
    } else if (ch === 4) {
      for (let p = 0; p < pixelCount; p++) {
        rgbPixels[p * 3] = data[p * 4];
        rgbPixels[p * 3 + 1] = data[p * 4 + 1];
        rgbPixels[p * 3 + 2] = data[p * 4 + 2];
      }
    } else if (ch === 1 || ch === 2) {
      for (let p = 0; p < pixelCount; p++) {
        const gray = data[p * ch];
        rgbPixels[p * 3] = gray;
        rgbPixels[p * 3 + 1] = gray;
        rgbPixels[p * 3 + 2] = gray;
      }
    } else {
      throw new InvalidFingerprintImageError('Invalid or unsupported image channel format.');
    }

    return rgbPixels;
  } catch (err) {
    if (err instanceof InvalidFingerprintImageError) {
      throw err;
    }
    throw new InvalidFingerprintImageError('Invalid or unsupported image.');
  }
}

export async function predictWithLocalKerasModel(
  projectRoot: string,
  rawImageBytes: Buffer
): Promise<KerasPredictionOutput> {
  const { model, error } = loadOrGetKerasModel(projectRoot);
  if (!model) {
    throw new Error(error || 'Trained model is unavailable.');
  }

  const rgbPixels = await decodeAndResizeFingerprintToRgb255(
    rawImageBytes,
    model.inputWidth,
    model.inputHeight
  );

  const vector = runForwardPassFromRgb255Tensor(model, rgbPixels);

  let sumScores = 0;
  let maxIndex = 0;
  let maxScore = -Infinity;

  for (let i = 0; i < vector.length; i++) {
    const score = Number(vector[i]);
    if (!Number.isFinite(score) || score < 0) {
      throw new Error('Model returned invalid prediction scores.');
    }
    sumScores += score;
    if (score > maxScore) {
      maxScore = score;
      maxIndex = i;
    }
  }

  if (Math.abs(sumScores - 1.0) > 1e-3) {
    throw new Error('Model returned invalid prediction scores.');
  }

  const predictedClass = model.classes[maxIndex];
  const probabilities: Record<string, number> = {};
  for (let i = 0; i < model.classes.length; i++) {
    probabilities[model.classes[i]] = Number(vector[i]);
  }

  return {
    success: true,
    experimental: true,
    notice:
      'Experimental research prediction — fingerprint-based blood-group classification is not medically validated. Confirm blood group using a conventional clinical laboratory test.',
    blood_group: predictedClass,
    predicted_class: predictedClass,
    confidence: Number(vector[maxIndex]),
    probabilities,
    model_version: model.modelFileName,
  };
}
