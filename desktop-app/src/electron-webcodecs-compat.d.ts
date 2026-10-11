// Electron 44's TypeScript declarations refer to the WebCodecs VideoFrame
// interface. TypeScript 4.5 (used by Angular 13 in this project) does not
// yet provide VideoFrame in its DOM library declarations.
//
// This empty interface supplies the missing type name only: it does not
// polyfill VideoFrame or change any browser/runtime behavior.
// Remove this shim when upgrading to a TypeScript DOM library that defines it.
interface VideoFrame {}
