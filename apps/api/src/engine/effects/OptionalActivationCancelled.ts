type Params = { activation: { available: boolean } };

export class OptionalActivationCancelled extends Error {
  readonly activation: Params["activation"];

  constructor({ activation }: Params) {
    super("Optional activation cancelled before target commitment");
    this.activation = activation;
  }
}
