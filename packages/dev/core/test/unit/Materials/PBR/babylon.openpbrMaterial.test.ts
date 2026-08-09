import { describe, it, expect, vi, beforeEach } from "vitest";
import { NullEngine } from "core/Engines/nullEngine";
import { type Engine } from "core/Engines/engine";
import { ShaderStore } from "core/Engines/shaderStore";
import { Material } from "core/Materials/material";
import { Color3 } from "core/Maths/math.color";
import { Vector2 } from "core/Maths/math.vector";
import { Mesh } from "core/Meshes/mesh";
import { SubMesh } from "core/Meshes/subMesh";
import { OpenPBRMaterial } from "core/Materials/PBR/openpbrMaterial";
import { ThinTexture } from "core/Materials/Textures/thinTexture";
import { Texture } from "core/Materials/Textures/texture";
import { Scene } from "core/scene";
import "core/Shaders/ShadersInclude/openpbrBaseLayerData";
import "core/ShadersWGSL/ShadersInclude/openpbrBaseLayerData";

class InspectableOpenPBRMaterial extends OpenPBRMaterial {
    public shouldUseAlphaFromBaseColorTexture(): boolean {
        return this._shouldUseAlphaFromBaseColorTexture();
    }
}

describe("OpenPBRMaterial", () => {
    let engine: Engine;
    let scene: Scene;

    beforeEach(() => {
        engine = new NullEngine({
            renderHeight: 256,
            renderWidth: 256,
            textureSize: 256,
            deterministicLockstep: false,
            lockstepMaxSteps: 1,
        });
        scene = new Scene(engine);
    });

    describe("SSS texture readiness blocking", () => {
        it("isReadyForSubMesh returns false when sssIrradianceTexture is assigned but not ready", () => {
            const material = new OpenPBRMaterial("mat", scene);
            material.subsurfaceWeight = 0.5;

            const mesh = new Mesh("testMesh", scene);
            mesh.subMeshes = [];
            mesh.material = material;
            // createBoundingBox=false avoids computing bounding info on a geometry-less mesh
            new SubMesh(0, 0, 0, 0, 0, mesh, undefined, false);

            const notReadyTexture = new ThinTexture(null);
            vi.spyOn(notReadyTexture, "isReady").mockReturnValue(false);
            const readyTexture = new ThinTexture(null);
            vi.spyOn(readyTexture, "isReady").mockReturnValue(true);

            // Assign textures before the first isReadyForSubMesh call so the
            // freshly-created MaterialDefines see them with _areTexturesDirty=true.
            material.sssIrradianceTexture = notReadyTexture;
            material.sssDepthTexture = readyTexture;

            expect(material.isReadyForSubMesh(mesh, mesh.subMeshes[0])).toBe(false);
        });

        it("isReadyForSubMesh returns false when sssDepthTexture is assigned but not ready", () => {
            const material = new OpenPBRMaterial("mat", scene);
            material.subsurfaceWeight = 0.5;

            const mesh = new Mesh("testMesh", scene);
            mesh.subMeshes = [];
            mesh.material = material;
            new SubMesh(0, 0, 0, 0, 0, mesh, undefined, false);

            const readyTexture = new ThinTexture(null);
            vi.spyOn(readyTexture, "isReady").mockReturnValue(true);
            const notReadyTexture = new ThinTexture(null);
            vi.spyOn(notReadyTexture, "isReady").mockReturnValue(false);

            material.sssIrradianceTexture = readyTexture;
            material.sssDepthTexture = notReadyTexture;

            expect(material.isReadyForSubMesh(mesh, mesh.subMeshes[0])).toBe(false);
        });

        it("scene.isReady() returns false while sssIrradianceTexture is not ready", () => {
            const material = new OpenPBRMaterial("mat", scene);
            material.subsurfaceWeight = 0.5;

            const mesh = new Mesh("testMesh", scene);
            mesh.subMeshes = [];
            mesh.material = material;
            new SubMesh(0, 0, 0, 0, 0, mesh, undefined, false);

            const notReadyTexture = new ThinTexture(null);
            vi.spyOn(notReadyTexture, "isReady").mockReturnValue(false);
            const readyTexture = new ThinTexture(null);
            vi.spyOn(readyTexture, "isReady").mockReturnValue(true);

            material.sssIrradianceTexture = notReadyTexture;
            material.sssDepthTexture = readyTexture;

            expect(scene.isReady()).toBe(false);
        });

        it("scene.isReady() returns false while sssDepthTexture is not ready", () => {
            const material = new OpenPBRMaterial("mat", scene);
            material.subsurfaceWeight = 0.5;

            const mesh = new Mesh("testMesh", scene);
            mesh.subMeshes = [];
            mesh.material = material;
            new SubMesh(0, 0, 0, 0, 0, mesh, undefined, false);

            const readyTexture = new ThinTexture(null);
            vi.spyOn(readyTexture, "isReady").mockReturnValue(true);
            const notReadyTexture = new ThinTexture(null);
            vi.spyOn(notReadyTexture, "isReady").mockReturnValue(false);

            material.sssIrradianceTexture = readyTexture;
            material.sssDepthTexture = notReadyTexture;

            expect(scene.isReady()).toBe(false);
        });

        it("scene.onReadyObservable does not fire while SSS textures are not ready", () => {
            const material = new OpenPBRMaterial("mat", scene);
            material.subsurfaceWeight = 0.5;

            const mesh = new Mesh("testMesh", scene);
            mesh.subMeshes = [];
            mesh.material = material;
            new SubMesh(0, 0, 0, 0, 0, mesh, undefined, false);

            const notReadyTexture = new ThinTexture(null);
            vi.spyOn(notReadyTexture, "isReady").mockReturnValue(false);

            material.sssIrradianceTexture = notReadyTexture;
            material.sssDepthTexture = notReadyTexture;

            const readyCallback = vi.fn();
            scene.onReadyObservable.add(readyCallback);

            // scene.isReady() is false so _checkIsReady would not notify the observable
            expect(scene.isReady()).toBe(false);
            expect(readyCallback).not.toHaveBeenCalled();
        });
    });

    describe("Per-frame uniform gating", () => {
        // The 5 subsurface-scattering uniforms are only read by the shader inside
        // `#ifdef SUBSURFACE_SLAB`, so the per-frame UBO update loop in
        // `bindForSubMesh` skips them when SSS is inactive. The skip is wired by
        // the `requiredDefine` field on the cached `_uniformsArray` entries; this
        // test asserts the wiring is in place. The actual per-frame skip is then
        // a plain inline check in `bindForSubMesh`:
        //   `if (uniform.requiredDefine !== undefined && !defines[uniform.requiredDefine]) continue;`
        // Driving that loop end-to-end from a unit test would require a real GPU
        // pipeline context, so we cover its runtime behavior via the playground
        // perf benchmark documented in the PR instead.
        it("tags SSS uniforms with requiredDefine = 'SUBSURFACE_SLAB' and leaves other uniforms ungated", () => {
            const material = new OpenPBRMaterial("mat", scene);
            const uniformsArray: { name: string; requiredDefine?: string }[] = (material as any)._uniformsArray;

            expect(uniformsArray.length).toBeGreaterThan(0);

            const sssUniformNames = ["vSubsurfaceWeight", "vSubsurfaceColor", "vSubsurfaceRadius", "vSubsurfaceRadiusScale", "vSubsurfaceScatterAnisotropy"];
            for (const name of sssUniformNames) {
                const uniform = uniformsArray.find((u) => u.name === name);
                expect(uniform, `expected uniform ${name} to be present`).toBeDefined();
                expect(uniform!.requiredDefine, `expected ${name} to be gated by SUBSURFACE_SLAB`).toBe("SUBSURFACE_SLAB");
            }

            // A representative non-SSS uniform must not be gated, otherwise we'd silently
            // stop pushing base-layer values to the UBO.
            const baseWeight = uniformsArray.find((u) => u.name === "vBaseWeight");
            expect(baseWeight, "expected vBaseWeight to be present").toBeDefined();
            expect(baseWeight!.requiredDefine).toBeUndefined();
        });

        it("caches firstLinkedKey on each Uniform so the per-frame loop avoids Object.keys allocation", () => {
            const material = new OpenPBRMaterial("mat", scene);
            const uniformsArray: { name: string; firstLinkedKey: string; linkedProperties: Record<string, unknown> }[] = (material as any)._uniformsArray;

            expect(uniformsArray.length).toBeGreaterThan(0);
            for (const uniform of uniformsArray) {
                expect(uniform.firstLinkedKey, `expected ${uniform.name} to have a cached firstLinkedKey`).not.toBe("");
                expect(uniform.linkedProperties[uniform.firstLinkedKey], `cached firstLinkedKey on ${uniform.name} must point to a real linked property`).toBeDefined();
            }
        });
    });

    describe("opacity composition", () => {
        it("uses base-color alpha together with a geometry-opacity texture", () => {
            const material = new InspectableOpenPBRMaterial("mat", scene);
            const baseColor = new ThinTexture(null);
            baseColor.hasAlpha = true;

            material.baseColorTexture = baseColor;
            material.geometryOpacityTexture = new ThinTexture(null);
            material._useAlphaFromBaseColorTexture = true;
            material.transparencyMode = Material.MATERIAL_ALPHABLEND;

            expect(material.shouldUseAlphaFromBaseColorTexture()).toBe(true);
        });

        it("requests alpha blending for base-color texture alpha", () => {
            const material = new InspectableOpenPBRMaterial("mat", scene);
            const baseColor = new ThinTexture(null);
            baseColor.hasAlpha = true;

            material.baseColorTexture = baseColor;
            material._useAlphaFromBaseColorTexture = true;
            material.transparencyMode = Material.MATERIAL_ALPHABLEND;

            expect(material.needAlphaBlending()).toBe(true);
        });

        it("multiplies every opacity source in both shader languages", () => {
            for (const include of [ShaderStore.IncludesShadersStore.openpbrBaseLayerData, ShaderStore.IncludesShadersStoreWGSL.openpbrBaseLayerData]) {
                expect(include).toContain("#if defined(BASE_COLOR) && defined(ALPHA_FROM_BASE_COLOR_TEXTURE)");
                expect(include).toContain("#if defined(GEOMETRY_OPACITY)");
                expect(include).not.toContain("#elif defined(GEOMETRY_OPACITY)");
                expect(include).not.toMatch(/alpha=(?:uniforms\.)?vBaseColor\.a/);
                expect(include).toMatch(/alpha\*=(?:uniforms\.)?vBaseColor\.a/);
            }
        });
    });

    describe("clone", () => {
        it("preserves representative OpenPBR inputs", () => {
            const material = new OpenPBRMaterial("mat", scene);
            material.baseColor = new Color3(0.2, 0.3, 0.4);
            material.specularRoughness = 0.61;
            material.specularRoughnessAnisotropy = 0.72;
            material.geometryTangent = new Vector2(0, 1);
            material.transmissionWeight = 0.43;
            material.subsurfaceWeight = 0.54;
            material.coatWeight = 0.65;
            material.fuzzWeight = 0.76;
            material.geometryThinWalled = 1;
            material.geometryOpacity = 0.87;
            material.emissionColor = new Color3(1.2, 0.4, 0.1);
            material.thinFilmWeight = 0.98;

            const clone = material.clone("clone");

            expect(clone.baseColor).toEqual(material.baseColor);
            expect(clone.specularRoughness).toBe(material.specularRoughness);
            expect(clone.specularRoughnessAnisotropy).toBe(material.specularRoughnessAnisotropy);
            expect(clone.geometryTangent).toEqual(material.geometryTangent);
            expect(clone.transmissionWeight).toBe(material.transmissionWeight);
            expect(clone.subsurfaceWeight).toBe(material.subsurfaceWeight);
            expect(clone.coatWeight).toBe(material.coatWeight);
            expect(clone.fuzzWeight).toBe(material.fuzzWeight);
            expect(clone.geometryThinWalled).toBe(material.geometryThinWalled);
            expect(clone.geometryOpacity).toBe(material.geometryOpacity);
            expect(clone.emissionColor).toEqual(material.emissionColor);
            expect(clone.thinFilmWeight).toBe(material.thinFilmWeight);
        });

        it("clones a shared OpenPBR texture only once by default", () => {
            const material = new OpenPBRMaterial("mat", scene);
            const texture = new Texture(null, scene);
            material.baseColorTexture = texture;
            material.geometryOpacityTexture = texture;

            const clone = material.clone("clone");

            expect(clone.baseColorTexture).not.toBe(texture);
            expect(clone.baseColorTexture).toBe(clone.geometryOpacityTexture);
        });
    });
});
