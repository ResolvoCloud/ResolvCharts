// Minimal typings for the bench harness (jsdom/@types/node not installed).
declare module "jsdom" {
  export class JSDOM {
    constructor(html?: string);
    window: {
      document: Document;
      getComputedStyle: (el: Element) => CSSStyleDeclaration;
      HTMLCanvasElement: typeof HTMLCanvasElement;
    };
  }
}
