import { afterEach, describe, expect, it, vi } from "vitest";
import { WebGPUTextureManager } from "core/Engines/WebGPU/webgpuTextureManager";
import * as WebGPUConstants from "core/Engines/WebGPU/webgpuConstants";
import { FromHalfFloat } from "core/Misc/halfFloat";

describe("WebGPUTextureManager", () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("does not compile the external-video pipeline during construction", () => {
        const prototype = WebGPUTextureManager.prototype as any;
        const getPipeline = vi.spyOn(prototype, "_getPipeline").mockReturnValue([{}, {}]);
        const getVideoPipeline = vi.spyOn(prototype, "_getVideoPipeline").mockReturnValue([{}, {}]);
        const device = {
            createSampler: vi.fn(() => ({})),
        } as unknown as GPUDevice;
        const bufferManager = {
            createBuffer: vi.fn(() => ({ underlyingResource: {} })),
        } as any;

        new WebGPUTextureManager({} as any, device, bufferManager, []);

        expect(getPipeline).toHaveBeenCalledOnce();
        expect(getVideoPipeline).not.toHaveBeenCalled();
    });

    it("uploads decoded ImageData to an RGBA16F texture", () => {
        const prototype = WebGPUTextureManager.prototype as any;
        vi.spyOn(prototype, "_getPipeline").mockReturnValue([{}, {}]);
        const writeTexture = vi.fn();
        const device = {
            createSampler: vi.fn(() => ({})),
            queue: { writeTexture },
        } as unknown as GPUDevice;
        const bufferManager = {
            createBuffer: vi.fn(() => ({ underlyingResource: {} })),
        } as any;
        const manager = new WebGPUTextureManager({} as any, device, bufferManager, []);
        const image = {
            width: 1,
            height: 1,
            data: new Uint8ClampedArray([0, 127, 255, 64]),
        } as ImageData;

        manager.updateTexture(image, {} as GPUTexture, 1, 1, 1, WebGPUConstants.TextureFormat.RGBA16Float);

        expect(writeTexture).toHaveBeenCalledOnce();
        const upload = writeTexture.mock.calls[0][1] as Uint8Array;
        expect(upload).toBeInstanceOf(Uint8Array);
        expect(upload.byteLength).toBe(8);
        const values = new Uint16Array(upload.buffer, upload.byteOffset, 4);
        expect(FromHalfFloat(values[0])).toBe(0);
        expect(FromHalfFloat(values[1])).toBeCloseTo(127 / 255, 3);
        expect(FromHalfFloat(values[2])).toBe(1);
        expect(FromHalfFloat(values[3])).toBeCloseTo(64 / 255, 3);
    });
});
