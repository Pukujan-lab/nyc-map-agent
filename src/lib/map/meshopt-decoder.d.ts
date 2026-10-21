/** three 0.134 ships the meshopt decoder without types; GLTFLoader only needs this shape. */
declare module "three/examples/jsm/libs/meshopt_decoder.module.js" {
  export const MeshoptDecoder: {
    supported: boolean;
    ready: Promise<void>;
    decodeGltfBuffer(target: Uint8Array, count: number, size: number, source: Uint8Array, mode: string, filter: string): void;
  };
}
