/** Thrown by data-access code; the API wrapper turns it into a JSON response with this status. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
