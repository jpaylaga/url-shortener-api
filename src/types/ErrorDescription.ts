/** Safe log payload for a caught error: no command input, no item attributes. */
export default interface ErrorDescription {
  code?: string;
  message?: string;
  causeName?: string;
  causeMessage?: string;
  stack?: string;
}
