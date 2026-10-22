/** A bundled image: Metro turns the import into an asset id for `<Image source>`. */
declare module '*.png' {
  const asset: number;
  export default asset;
}
