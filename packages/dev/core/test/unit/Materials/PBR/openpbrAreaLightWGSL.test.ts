import { describe, expect, it } from "vitest";
import { ShaderStore } from "core/Engines/shaderStore";
import "core/ShadersWGSL/ShadersInclude/openpbrDirectLightingInit";
import "core/ShadersWGSL/ShadersInclude/openpbrDirectLighting";
import "core/Shaders/ShadersInclude/openpbrDirectLighting";

describe("OpenPBR area-light WGSL", () => {
    it("passes complete, correctly typed area-light arguments", () => {
        const include = ShaderStore.IncludesShadersStoreWGSL.openpbrDirectLightingInit;

        expect(include).toMatch(/computeAreaPreLightingInfo\(areaLightsLTC1Sampler,areaLightsLTC1SamplerSampler,areaLightsLTC2Sampler,areaLightsLTC2SamplerSampler,/);
        expect(include).toMatch(/fragmentInputs\.vPositionW,light\{X\}\.vLightData\.xyz,light\{X\}\.vLightWidth\.xyz,light\{X\}\.vLightHeight\.xyz,/);
    });

    it("passes colored reflectance vectors to area-light specular evaluation", () => {
        const wgsl = ShaderStore.IncludesShadersStoreWGSL.openpbrDirectLighting;
        const glsl = ShaderStore.IncludesShadersStore.openpbrDirectLighting;

        for (const include of [wgsl, glsl]) {
            expect(include).toContain("baseDielectricReflectance.coloredF0,baseDielectricReflectance.coloredF90");
            expect(include).toContain("baseConductorReflectance.coloredF0,baseConductorReflectance.coloredF90");
            expect(include).toContain("coatReflectance.coloredF0,coatReflectance.coloredF90");
            expect(include).not.toMatch(/computeAreaSpecularLighting\([^;]+Reflectance\.F0/);
        }
    });
});
