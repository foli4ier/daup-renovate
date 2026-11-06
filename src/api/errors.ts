/** The live DAUP app did not answer. Do not tell the owner the work was sent. */
export class ServiceUnreachable extends Error {
  readonly code = "unreachable";

  constructor() {
    super("unreachable");
    this.name = "ServiceUnreachable";
  }
}
