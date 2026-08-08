import { afterEach, describe, expect, it, vi } from "vitest";
import { WebGPUTextureManager } from "core/Engines/WebGPU/webgpuTextureManager";

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
});
